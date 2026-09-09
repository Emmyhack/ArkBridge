"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useConnect, useSwitchChain, useWalletClient } from "wagmi";
import type { RouteCatalog, RouteSelection } from "@arkbridge/bridge-core";
import {
  flipSelection,
  formatAmount,
  normalizeError,
  presentFailure,
  selectableDestinationChains,
  selectableSourceChains,
  routeIdOf,
  selectableTokens,
  usableRoutes,
} from "@arkbridge/bridge-core";
import type { Hex } from "@arkbridge/types";
import type { ChainDeployment } from "@arkbridge/sdk";
import { ChainSelector } from "./ChainSelector";
import { TokenSelector } from "./TokenSelector";
import { RoutePanel } from "./RoutePanel";
import { TransferSummary } from "./TransferSummary";
import { selectionFromParams } from "../lib/deepLink";
import { RecipientField } from "./RecipientField";
import { CounterpartyField } from "./CounterpartyField";
import { LimitField } from "./LimitField";
import { ModeTabs, type Mode } from "./ModeTabs";
import { useBaseFee } from "../lib/useBaseFee";
import { useRouteHealth } from "../lib/useRouteHealth";
import { useChainTiming } from "../lib/useChainTiming";
import { armLimit, cancelLimit, isMet, type FeeLimit } from "../lib/limitOrders";
import { FeeSummary } from "./FeeSummary";
import { TransferReceipt } from "./TransferReceipt";
import { useArkBridge } from "../lib/useArkBridge";
import { recordTransfer } from "../lib/activityStore";
import { useBridgeState } from "../lib/useBridgeState";
import { deriveCta } from "../lib/ctaState";
import { useHydrated } from "../lib/useHydrated";
import styles from "./BridgeShell.module.css";

interface Submission {
  readonly sourceTxHash: Hex;
  readonly messageId?: Hex;
  readonly submittedAt: number;
  readonly amountLabel: string;
}

/**
 * The bridge card (§14).
 *
 * A single centred column, not a card with a panel beside it. The change is
 * structural, not cosmetic: a route summary sitting permanently to the right
 * competes for attention with the form even when it has nothing new to say,
 * and on the common path — pick asset, type amount, press the button — it says
 * nothing at all. It now lives behind a summary row that opens, which is where
 * secondary information belongs (§16, §35).
 *
 * SHAPE
 *
 *   toolbar          the mode this card is in, and a manual refresh
 *   pay / receive    two panels sharing one border, split by the flip control
 *   summary          one line of consequence, expanding to the full breakdown
 *   options          recipient override
 *   action           one full-width button
 *
 * The two panels share a container and a divider rather than being separate
 * cards. That is what makes the flip control legible: a button straddling the
 * seam between two halves of one object reads as "turn this over", where the
 * same button between two cards reads as an unrelated third thing.
 */
export function BridgeShell({
  catalog,
  deployments,
  chainCount,
}: {
  readonly catalog: RouteCatalog;
  readonly deployments: Record<string, ChainDeployment>;
  readonly chainCount: number;
}) {
  const { address, isConnected, chainId } = useAccount();
  const hydrated = useHydrated();
  const connectedAddress = hydrated ? address : undefined;
  const connected = hydrated && isConnected;
  const connectedChainId = hydrated ? chainId : undefined;
  const { switchChain } = useSwitchChain();
  const { connect, connectors } = useConnect();
  const { data: walletClient } = useWalletClient();
  const bridge = useArkBridge(catalog, deployments);

  const sources = useMemo(() => selectableSourceChains(catalog), [catalog]);
  const routes = useMemo(() => usableRoutes(catalog), [catalog]);

  const [selection, setSelection] = useState<RouteSelection | undefined>(() => {
    const first = routes[0];
    return first === undefined
      ? undefined
      : {
          sourceChain: first.sourceChain,
          destinationChain: first.destinationChain,
          tokenId: first.tokenId,
        };
  });
  const [amount, setAmount] = useState("");

  /*
   * Mode.
   *
   * Instant is the default because it is what most arrivals want and it is the
   * only mode that needs nothing configured. The other two add a precondition
   * to the same transfer — a fee ceiling, or a named recipient — and both are
   * enforced on the button rather than merely displayed.
   */
  const [mode, setMode] = useState<Mode>("instant");
  const [ceiling, setCeiling] = useState("");
  const [armed, setArmed] = useState<FeeLimit | undefined>();
  const [counterparty, setCounterparty] = useState<`0x${string}` | undefined>();
  const [recipient, setRecipient] = useState<`0x${string}` | undefined>();
  const [recipientInvalid, setRecipientInvalid] = useState(false);

  const searchParams = useSearchParams();

  // Deep link (§68). Validated against the registry, so a stale or hand-edited
  // link falls back to the default rather than producing an unusable form.
  useEffect(() => {
    const fromLink = selectionFromParams(catalog, new URLSearchParams(searchParams.toString()));
    if (fromLink !== undefined) setSelection(fromLink);
  }, [catalog, searchParams]);
  const [busy, setBusy] = useState<"approving" | "confirming" | "submitting" | undefined>();
  const [submission, setSubmission] = useState<Submission | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();

  if (selection === undefined) {
    return (
      <section className={styles.empty}>
        <h2 className={styles.emptyTitle}>No routes available</h2>
        <p className={styles.emptyBody}>
          {chainCount === 0
            ? "No chains are enabled in this environment yet."
            : "Chains are configured, but no asset has a deployed route through Ark yet."}
        </p>
      </section>
    );
  }

  // Narrowed above; bound to a const so the handlers below keep the narrowing.
  const active: RouteSelection = selection;

  const destinations = selectableDestinationChains(catalog, selection.sourceChain);
  const tokens = selectableTokens(catalog, selection.sourceChain, selection.destinationChain);
  const token = catalog.tokens[selection.tokenId];
  const sourceChain = catalog.chains[selection.sourceChain];
  const destinationChain = catalog.chains[selection.destinationChain];

  /**
   * Changing the source picks a destination and asset that actually exist for
   * it, rather than leaving an invalid pair on screen to be rejected later
   * (§25: prevent invalid combinations, do not explain them afterwards).
   */
  function changeSource(next: string) {
    const nextDestinations = selectableDestinationChains(catalog, next);
    const destination = nextDestinations[0];
    if (destination === undefined) return;
    const nextTokens = selectableTokens(catalog, next, destination.key);
    const nextToken = nextTokens[0];
    if (nextToken === undefined) return;
    setSelection({
      sourceChain: next,
      destinationChain: destination.key,
      tokenId: nextToken.id,
    });
  }

  /** Flip. The reverse is looked up, so this can never invent a pair (§24). */
  const flipped = flipSelection(catalog, selection);
  const canFlip = flipped !== undefined;

  function flip() {
    if (flipped !== undefined) setSelection(flipped);
    setActionError(undefined);
  }

  const effectiveRecipient = (mode === "direct" ? counterparty : recipient) ?? connectedAddress;
  const state = useBridgeState(
    bridge,
    catalog,
    selection,
    amount,
    connectedAddress,
    effectiveRecipient,
  );
  const baseCta = deriveCta({
    catalog,
    selection,
    state,
    connected,
    connectedChainId,
    amountInput: amount,
    busy,
  });

  const amountEntered = state.amount > 0n;

  // Limit mode needs only the current fee. Fetching hundreds of historical
  // blocks after removing the chart would waste RPC capacity.
  const fees = useBaseFee(catalog, active.sourceChain);

  // Both live. The card used to print "Operational" and "Estimated, varies" as
  // literals; neither was ever read from anything.
  const routeHealth = useRouteHealth(bridge, catalog, active);
  const timing = useChainTiming(catalog, active.sourceChain, active.destinationChain);
  const ceilingValue = Number.parseFloat(ceiling);
  const ceilingValid = Number.isFinite(ceilingValue) && ceilingValue > 0;
  const limitMet = armed !== undefined && isMet(armed, fees.current);

  /*
   * Mode preconditions, layered on top of the shared CTA state machine.
   *
   * They are applied here rather than inside `deriveCta` on purpose: that
   * function encodes the ordering of the *protocol's* states — wrong network
   * before approval before balance — and is tested for that ordering. A mode is
   * a UI concept sitting above it, and folding one into the other would mean
   * the tested ordering could be reshuffled by an unrelated interface change.
   *
   * A gate only ever disables. It cannot turn a disabled button on, so no gate
   * can talk the card past a real protocol-level blocker.
   */
  const gate = ((): { readonly label?: string; readonly hint: string } | undefined => {
    if (baseCta.disabled) return undefined;
    /*
     * Gates apply to the transfer itself and to nothing else.
     *
     * Without this line an armed limit relabelled "Connect Wallet" as "Waiting
     * for fee" and disabled it — the card would have told a disconnected user
     * to wait for a fee before letting them connect a wallet, which is a dead
     * end with no way out of it. `connect`, `switch` and `approve` are all
     * steps *towards* the transfer and must stay live regardless of mode.
     */
    if (baseCta.kind !== "bridge") return undefined;
    if (mode === "direct" && counterparty === undefined) {
      return {
        hint: `Enter the address that will receive on ${destinationChain?.name ?? "the destination network"}.`,
      };
    }
    if (mode !== "direct" && recipientInvalid) {
      return {
        hint: "Enter a valid destination address, or clear the field to use your connected wallet.",
      };
    }
    if (routeHealth.health === "unavailable") {
      return {
        label: "Route Unavailable",
        hint: routeHealth.reason ?? "This route is not accepting transfers right now.",
      };
    }
    if (mode === "limit" && armed !== undefined && !limitMet) {
      return {
        label: "Waiting for fee",
        hint:
          fees.current === undefined
            ? "Watching the source network's base fee."
            : `Base fee is ${fees.current.toFixed(3)} gwei; waiting for ${armed.ceilingGwei} gwei or below.`,
      };
    }
    return undefined;
  })();

  const cta =
    gate === undefined
      ? baseCta
      : {
          ...baseCta,
          disabled: true,
          ...(gate.label === undefined ? {} : { label: gate.label }),
          hint: gate.hint,
        };

  async function onCta() {
    setActionError(undefined);

    if (cta.kind === "switch") {
      const target = catalog.chains[active.sourceChain];
      if (target !== undefined) switchChain({ chainId: target.chainId });
      return;
    }
    if (cta.kind === "connect") {
      const connector = connectors[0];
      if (connector !== undefined) connect({ connector });
      return;
    }
    if (walletClient === undefined || address === undefined) return;

    const request = {
      sourceChain: active.sourceChain,
      destinationChain: active.destinationChain,
      token: active.tokenId,
      amount: state.amount,
      recipient: effectiveRecipient ?? address,
      account: address,
      walletClient,
    };

    try {
      if (cta.kind === "approve") {
        setBusy("approving");
        await bridge.approve(request);
        state.refresh();
        return;
      }
      if (cta.kind === "bridge") {
        setBusy("confirming");
        const result = await bridge.bridge(request);
        setBusy("submitting");
        // Recorded locally so Activity is populated immediately. The chain
        // remains the record; this only supplies context (amount, asset) that
        // a status read cannot provide.
        recordTransfer({
          id: result.sourceTransactionHash,
          wallet: address,
          recipient: effectiveRecipient ?? address,
          sourceChain: active.sourceChain,
          destinationChain: active.destinationChain,
          tokenId: active.tokenId,
          amount: state.amount.toString(),
          sourceTxHash: result.sourceTransactionHash,
          ...(result.messageId === undefined ? {} : { messageId: result.messageId }),
          status: "MESSAGE_DISPATCHED",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        setSubmission({
          sourceTxHash: result.sourceTransactionHash,
          ...(result.messageId === undefined ? {} : { messageId: result.messageId }),
          submittedAt: Date.now(),
          amountLabel: `${formatAmount(state.amount, state.decimals)} ${token?.symbol ?? ""}`,
        });
      }
    } catch (error) {
      // Every failure becomes one of the fourteen codes and is rendered with
      // wording a user can act on — never a raw revert string (§61).
      const presented = presentFailure(normalizeError(error).code);
      setActionError(`${presented.title}. ${presented.detail}`);
    } finally {
      setBusy(undefined);
    }
  }

  if (submission !== undefined) {
    return (
      <div className={styles.layout}>
        <TransferReceipt
          bridge={bridge}
          sourceTxHash={submission.sourceTxHash}
          {...(submission.messageId === undefined ? {} : { messageId: submission.messageId })}
          sourceChain={sourceChain}
          destinationChain={destinationChain}
          submittedAt={submission.submittedAt}
          amountLabel={submission.amountLabel}
          onReset={() => {
            setSubmission(undefined);
            setAmount("");
          }}
        />
      </div>
    );
  }

  const symbol = token?.symbol ?? "";
  const receiveLabel =
    state.quote !== undefined
      ? formatAmount(state.quote.estimatedReceived, state.decimals)
      : amountEntered
        ? amount
        : "0.00";

  return (
    <div className={styles.layout} data-picker-anchor>
      <section className={styles.card} aria-label="Bridge">
        <header className={styles.toolbar}>
          <ModeTabs
            mode={mode}
            onChange={(next) => {
              setMode(next);
              // A watch belongs to Limit mode. Leaving it armed while the user
              // is on another tab would silently gate a button they can no
              // longer see the reason for.
              if (next !== "limit" && armed !== undefined) {
                cancelLimit(armed.id);
                setArmed(undefined);
              }
              setActionError(undefined);
            }}
          />

          <button
            type="button"
            className={styles.tool}
            onClick={state.refresh}
            disabled={state.loading}
            aria-label="Refresh balances and quote"
            title="Refresh balances and quote"
          >
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
              <path
                d="M13.5 6.8A5.6 5.6 0 0 0 3.4 5M2.5 9.2A5.6 5.6 0 0 0 12.6 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M13.8 3.2v3.6h-3.6M2.2 12.8V9.2h3.6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </header>

        {/* Both sides share one bordered container, split by the flip control.
            See the note at the top of this file. */}
        <div className={styles.swapGroup}>
          <div className={styles.side}>
            <div className={styles.sideHead}>
              <span className={styles.label}>You pay</span>
              <ChainSelector
                label="Select source network"
                chains={sources}
                selected={sourceChain}
                onSelect={changeSource}
                variant="chip"
              />
              {state.balance === undefined ? (
                <span className={styles.balance} />
              ) : (
                <span className={styles.balance}>
                  Balance {formatAmount(state.balance, state.decimals)} {symbol}
                  <button
                    type="button"
                    className={styles.max}
                    onClick={() => {
                      setAmount(
                        formatAmount(state.balance ?? 0n, state.decimals).replace(/,/g, ""),
                      );
                    }}
                  >
                    MAX
                  </button>
                </span>
              )}
            </div>

            <div className={styles.amountRow}>
              <TokenSelector
                catalog={catalog}
                tokens={tokens}
                selected={token}
                destinationChain={selection.destinationChain}
                onSelect={(id) => {
                  setSelection({ ...selection, tokenId: id });
                }}
                variant="lead"
                sourceChains={sources}
                sourceChain={active.sourceChain}
                onSelectChain={changeSource}
              />
              <input
                className={styles.amount}
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Amount"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
              />
            </div>
          </div>

          <div className={styles.seam}>
            <button
              type="button"
              className={styles.switch}
              onClick={flip}
              disabled={!canFlip}
              aria-label="Switch direction"
              title={canFlip ? "Switch direction" : "This route has no reverse"}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
                <path
                  d="M5.5 2.5v11M5.5 13.5 3 11M5.5 13.5 8 11M10.5 13.5v-11M10.5 2.5 8 5M10.5 2.5 13 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className={styles.side}>
            <div className={styles.sideHead}>
              <span className={styles.label}>You receive</span>
              <ChainSelector
                label="Select destination network"
                chains={destinations}
                selected={destinationChain}
                onSelect={(key) => {
                  setSelection({ ...selection, destinationChain: key });
                }}
                variant="chip"
              />
            </div>

            <div className={styles.amountRow}>
              {/* Fixed, not choosable: a bridge moves an asset, it does not
                  swap one for another. Same control, same shape, no chevron. */}
              <TokenSelector
                catalog={catalog}
                tokens={tokens}
                selected={token}
                destinationChain={selection.destinationChain}
                onSelect={(id) => {
                  setSelection({ ...selection, tokenId: id });
                }}
                variant="lead"
                disabled
              />
              <output className={styles.receiveAmount} data-empty={!amountEntered}>
                {receiveLabel}
              </output>
            </div>

            {/* Origin is always shown for a bridged asset (§28). Never let a
                synthetic pass as issuer-native. */}
            {token !== undefined && token.canonicalChain !== selection.destinationChain ? (
              <p className={styles.origin}>
                Bridged via ArkBridge · Origin:{" "}
                {catalog.chains[token.canonicalChain]?.name ?? token.canonicalChain}
              </p>
            ) : null}
          </div>
        </div>

        {mode === "limit" ? (
          <LimitField
            value={ceiling}
            onChange={setCeiling}
            current={fees.current}
            unit="gwei"
            armed={armed !== undefined}
            met={limitMet}
            canArm={ceilingValid && amountEntered}
            onArm={() => {
              if (!ceilingValid) return;
              setArmed(
                armLimit({
                  sourceChain: active.sourceChain,
                  destinationChain: active.destinationChain,
                  tokenId: active.tokenId,
                  amount,
                  ceilingGwei: ceilingValue,
                }),
              );
            }}
            onCancel={() => {
              if (armed !== undefined) cancelLimit(armed.id);
              setArmed(undefined);
            }}
          />
        ) : null}

        <TransferSummary
          headline={
            amountEntered && token !== undefined
              ? `${receiveLabel} ${symbol} on ${destinationChain?.name ?? active.destinationChain}`
              : `${symbol} via ${destinationChain?.name ?? active.destinationChain}`
          }
          eta={
            timing.floorSeconds === undefined
              ? "Delivery varies"
              : `≥ ${timing.floorSeconds < 60 ? `${Math.round(timing.floorSeconds)}s` : `${Math.round(timing.floorSeconds / 60)}m`} + relay`
          }
          badge="1:1 backed"
        >
          {state.quote !== undefined && token !== undefined ? (
            <FeeSummary
              quote={state.quote}
              decimals={state.decimals}
              symbol={token.symbol}
              sourceChain={sourceChain}
            />
          ) : null}

          <RoutePanel
            catalog={catalog}
            sourceChain={sourceChain}
            destinationChain={destinationChain}
            tokenId={selection.tokenId}
            showDetails={amountEntered}
            route={catalog.routes[routeIdOf(selection)]}
            health={routeHealth}
            timing={timing}
            {...(state.quote === undefined ? {} : { quote: state.quote })}
            decimals={state.decimals}
          />
        </TransferSummary>

        <div className={styles.options}>
          {/*
            Direct replaces the optional recipient rather than adding to it.
            Showing both would put two different destination addresses on one
            form, and the resulting question — which one wins? — is not one a
            user should ever have to ask about an irreversible transfer.
          */}
          {mode === "direct" ? (
            <CounterpartyField
              destinationChainKey={active.destinationChain}
              destinationChainName={destinationChain?.name ?? active.destinationChain}
              value={counterparty}
              onChange={setCounterparty}
            />
          ) : (
            <RecipientField
              account={connectedAddress}
              value={recipient}
              onChange={setRecipient}
              onInvalidChange={setRecipientInvalid}
            />
          )}
        </div>

        <button
          type="button"
          className={styles.cta}
          disabled={cta.disabled}
          onClick={() => {
            void onCta();
          }}
        >
          {cta.label}
        </button>

        {cta.hint === undefined ? null : <p className={styles.hint}>{cta.hint}</p>}
        {actionError === undefined ? null : (
          <p className={styles.error} role="alert">
            {actionError}
          </p>
        )}
      </section>
    </div>
  );
}
