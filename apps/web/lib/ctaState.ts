import { presentFailure, type RouteCatalog, type RouteSelection } from "@arkbridge/bridge-core";
import type { BridgeState } from "./useBridgeState";

export type CtaKind = "connect" | "switch" | "approve" | "bridge" | "blocked" | "busy";

export interface CtaState {
  readonly kind: CtaKind;
  readonly label: string;
  readonly disabled: boolean;
  /** Shown under the button when the CTA is blocked, explaining why. */
  readonly hint?: string;
}

/**
 * The button state machine (§31).
 *
 * The CTA must always name the next action. Ordering is the whole design here:
 * each condition is checked before the ones it would otherwise mask, so a user
 * is never told "Approve" when they are on the wrong network, or "Bridge" when
 * they cannot afford it.
 *
 * Pure, so the ordering is testable without a wallet or a chain.
 */
export function deriveCta(params: {
  readonly catalog: RouteCatalog;
  readonly selection: RouteSelection;
  readonly state: BridgeState;
  readonly connected: boolean;
  readonly connectedChainId: number | undefined;
  readonly amountInput: string;
  readonly busy?: "approving" | "confirming" | "submitting" | undefined;
}): CtaState {
  const { catalog, selection, state, connected, connectedChainId, amountInput, busy } = params;

  if (busy === "approving") return { kind: "busy", label: "Approving…", disabled: true };
  if (busy === "confirming") return { kind: "busy", label: "Confirm in Wallet", disabled: true };
  if (busy === "submitting") return { kind: "busy", label: "Submitting…", disabled: true };

  if (!connected) return { kind: "connect", label: "Connect Wallet", disabled: false };

  // Network before everything else: nothing downstream can be evaluated
  // meaningfully against the wrong chain, and no transaction may be submitted
  // from it (§30).
  const sourceChain = catalog.chains[selection.sourceChain];
  if (sourceChain === undefined) {
    return { kind: "blocked", label: "Select Network", disabled: true };
  }
  if (connectedChainId !== sourceChain.chainId) {
    return { kind: "switch", label: `Switch to ${sourceChain.name}`, disabled: false };
  }

  const token = catalog.tokens[selection.tokenId];
  if (token === undefined) return { kind: "blocked", label: "Select Token", disabled: true };

  if (amountInput.trim() === "" || state.amount === 0n) {
    return { kind: "blocked", label: "Enter Amount", disabled: true };
  }

  // A malformed amount is reported as itself, not as an empty field.
  if (state.error?.code === "INSUFFICIENT_BALANCE" && state.balance === undefined) {
    return {
      kind: "blocked",
      label: "Enter Amount",
      disabled: true,
      ...(state.error.message === undefined ? {} : { hint: state.error.message }),
    };
  }

  if (state.balance !== undefined && state.amount > state.balance) {
    return { kind: "blocked", label: "Insufficient Balance", disabled: true };
  }

  // Checked before submission, never after (§88): the user must not reach a
  // wallet confirmation for a transfer the route is going to reject.
  if (state.capacity !== undefined && state.amount > state.capacity) {
    return {
      kind: "blocked",
      label: "Route Limit Reached",
      disabled: true,
      hint: "This transfer exceeds the current route limit. Reduce the amount or try again later.",
    };
  }

  if (state.error?.code === "ROUTE_PAUSED") {
    return {
      kind: "blocked",
      label: "Route Unavailable",
      disabled: true,
      // A deliberate pause is not a fault and must never read as one (§90).
      hint: "This route is temporarily paused. Your funds are unaffected.",
    };
  }

  if (state.approvalRequired) {
    return { kind: "approve", label: `Approve ${token.symbol}`, disabled: false };
  }

  // A failed engine read must never fall through to an enabled transaction.
  // Approval remains available above because it is a preparatory wallet step;
  // bridging requires every current read to have succeeded.
  if (state.error !== undefined) {
    const failure = presentFailure(state.error.code);
    return {
      kind: "blocked",
      label: failure.title,
      disabled: true,
      hint: [failure.detail, failure.action].filter(Boolean).join(" "),
    };
  }

  if (state.loading && state.quote === undefined) {
    return { kind: "busy", label: "Fetching quote…", disabled: true };
  }

  return { kind: "bridge", label: "Bridge", disabled: false };
}
