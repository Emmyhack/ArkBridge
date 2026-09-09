"use client";

import { useQuery } from "@tanstack/react-query";
import type { ArkBridge } from "@arkbridge/sdk";
import type { RouteCatalog, RouteSelection } from "@arkbridge/bridge-core";
import { normalizeError, parseAmount, resolveRoute } from "@arkbridge/bridge-core";
import type { Address, BridgeQuote, BridgeError } from "@arkbridge/types";

export interface BridgeState {
  readonly decimals: number;
  readonly amount: bigint;
  readonly balance?: bigint;
  readonly capacity?: bigint;
  readonly quote?: BridgeQuote;
  readonly approvalRequired: boolean;
  readonly allowance?: bigint;
  readonly loading: boolean;
  readonly error?: BridgeError;
  /**
   * Re-read balance, allowance, capacity and the quote now.
   *
   * Both queries are already time-based (12s stale), which handles the common
   * case of a value drifting while the form sits open. This is for the case
   * time cannot fix: the user has just topped up in another tab, or an
   * approval landed elsewhere, and wants the card to catch up without
   * reloading the page and losing what they typed.
   */
  readonly refresh: () => void;
}

/**
 * Everything the bridge card needs to read, in one place.
 *
 * Balance, allowance and capacity are one query rather than three so the button
 * never renders a state assembled from reads taken at different moments — a
 * user seeing "Bridge" enabled against a stale balance is how you walk someone
 * into a reverting transaction.
 *
 * Quoting is separate because it depends on the amount and should not refetch
 * balance on every keystroke.
 */
export function useBridgeState(
  bridge: ArkBridge,
  catalog: RouteCatalog,
  selection: RouteSelection,
  amountInput: string,
  account: Address | undefined,
  recipient: Address | undefined,
): BridgeState {
  const token = catalog.tokens[selection.tokenId];
  const decimals = token?.representations[selection.sourceChain]?.decimals ?? token?.decimals ?? 18;

  let amount = 0n;
  let parseError: BridgeError | undefined;
  try {
    amount = parseAmount(amountInput, decimals);
  } catch (error) {
    parseError = normalizeError(error);
  }

  const accountState = useQuery({
    queryKey: ["bridge-account", selection.sourceChain, selection.tokenId, account],
    enabled: account !== undefined,
    // Balances move; 12s keeps them fresh without hammering the RPC (§119).
    staleTime: 12_000,
    queryFn: async () => {
      if (account === undefined) return null;
      const route = resolveRoute(catalog, selection);
      const [balance, capacity, approval] = await Promise.all([
        bridge.getBalance(route, account),
        bridge.getCapacity(route),
        bridge.getApproval({
          sourceChain: selection.sourceChain,
          destinationChain: selection.destinationChain,
          token: selection.tokenId,
          amount: 1n,
          recipient: account,
          account,
        }),
      ]);
      return { balance, capacity, allowance: approval.current, isSynthetic: !approval.required };
    },
  });

  const quoteState = useQuery({
    queryKey: [
      "bridge-quote",
      selection.sourceChain,
      selection.destinationChain,
      selection.tokenId,
      amount.toString(),
      account,
      recipient,
    ],
    enabled: account !== undefined && recipient !== undefined && amount > 0n,
    staleTime: 12_000,
    queryFn: () =>
      bridge.quote({
        sourceChain: selection.sourceChain,
        destinationChain: selection.destinationChain,
        token: selection.tokenId,
        amount,
        recipient: recipient as Address,
        // Deliberately omitted: quoting must not fail merely because the user
        // has typed more than they hold. The button reports that instead, with
        // a message they can act on.
      }),
  });

  const data = accountState.data ?? undefined;
  const allowance = data?.allowance;
  const approvalRequired =
    data !== undefined && !data.isSynthetic && amount > 0n && (allowance ?? 0n) < amount;

  const queryError = accountState.error ?? quoteState.error;

  return {
    decimals,
    amount,
    refresh: () => {
      void accountState.refetch();
      void quoteState.refetch();
    },
    ...(data?.balance === undefined ? {} : { balance: data.balance }),
    ...(data?.capacity === undefined ? {} : { capacity: data.capacity }),
    ...(quoteState.data === undefined ? {} : { quote: quoteState.data }),
    approvalRequired,
    ...(allowance === undefined ? {} : { allowance }),
    loading: accountState.isFetching || quoteState.isFetching,
    ...(parseError !== undefined
      ? { error: parseError }
      : queryError !== null && queryError !== undefined
        ? { error: normalizeError(queryError) }
        : {}),
  };
}
