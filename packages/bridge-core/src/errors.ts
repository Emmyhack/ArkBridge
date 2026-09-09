import type { BridgeErrorCode, BridgeFailure } from "@arkbridge/types";
import { BridgeError, isPostCommitError } from "@arkbridge/types";

/**
 * A failure rendered for a user: what happened, whether their money moved, and
 * what to do next.
 *
 * Spec §61: errors must be actionable. "Transaction failed" tells a user
 * nothing and, worse, implies loss when usually nothing moved at all.
 */
export interface FailurePresentation {
  readonly title: string;
  readonly detail: string;
  /** What the user can do. Empty when the answer is genuinely "wait". */
  readonly action?: string;
  /**
   * Whether the user's funds already left the source chain. This decides the
   * whole tone: "nothing moved, try again" versus "your transfer is safe and
   * still in progress".
   */
  readonly fundsCommitted: boolean;
  /** True when this is a delay rather than a fault. */
  readonly isDelay: boolean;
}

const PRESENTATION: Readonly<Record<BridgeErrorCode, Omit<FailurePresentation, "fundsCommitted">>> =
  {
    UNSUPPORTED_CHAIN: {
      title: "Network not supported",
      detail: "ArkBridge does not currently bridge to or from this network.",
      action: "Choose a different network.",
      isDelay: false,
    },
    UNSUPPORTED_TOKEN: {
      title: "Asset not supported",
      detail: "This asset is not available on the selected route.",
      action: "Choose a different asset.",
      isDelay: false,
    },
    UNSUPPORTED_ROUTE: {
      title: "Route not available",
      detail: "ArkBridge does not offer a direct transfer between these two networks.",
      action: "Bridge through Ark instead.",
      isDelay: false,
    },
    ROUTE_PAUSED: {
      title: "Route temporarily unavailable",
      // A deliberate pause is not an error. Saying "something went wrong" here
      // would be both false and alarming (spec §90).
      detail: "This route has been paused. Your funds are unaffected.",
      action: "Try again later, or check the status page.",
      isDelay: false,
    },
    LIMIT_EXCEEDED: {
      title: "Transfer exceeds the current limit",
      detail: "This route has a cap on how much can move at once.",
      action: "Reduce the amount, or wait for capacity to refill.",
      isDelay: false,
    },
    INSUFFICIENT_BALANCE: {
      title: "Not enough balance",
      detail: "Your wallet does not hold enough of this asset.",
      action: "Reduce the amount.",
      isDelay: false,
    },
    INSUFFICIENT_ALLOWANCE: {
      title: "Approval needed",
      detail: "ArkBridge needs permission to move this asset.",
      action: "Approve the asset, then bridge.",
      isDelay: false,
    },
    WRONG_NETWORK: {
      title: "Wrong network",
      detail: "Your wallet is connected to a different network than the one you are sending from.",
      action: "Switch networks in your wallet.",
      isDelay: false,
    },
    INVALID_RECIPIENT: {
      title: "Invalid recipient",
      detail: "The destination address is not a valid address on that network.",
      action: "Check the address.",
      isDelay: false,
    },
    USER_REJECTED: {
      title: "Rejected in wallet",
      detail: "The transaction was rejected in your wallet. No assets were moved.",
      action: "Try again when ready.",
      isDelay: false,
    },
    SOURCE_TX_REVERTED: {
      title: "Transfer did not start",
      detail: "The transaction failed on the source network. No assets were moved.",
      action: "Try again.",
      isDelay: false,
    },
    RPC_UNAVAILABLE: {
      title: "Network unreachable",
      detail: "ArkBridge could not reach the network. This is usually temporary.",
      action: "Try again shortly.",
      isDelay: false,
    },
    MESSAGE_DELAYED: {
      title: "Still being verified",
      // Spec §63: a delay is not a failure, and must not be dressed as one.
      detail:
        "Your source transaction completed and the transfer is still being processed. " +
        "Cross-chain verification can take longer than usual.",
      isDelay: true,
    },
    DESTINATION_TX_FAILED: {
      title: "Delivery needs attention",
      // Spec §64: never a bare "Failed" here. The source transfer stands.
      detail:
        "Your source transfer confirmed, but delivery on the destination network did not " +
        "complete. Your funds are accounted for and the transfer can be retried.",
      action: "Contact support with your transfer ID if this persists.",
      isDelay: false,
    },
  };

export function presentFailure(code: BridgeErrorCode): FailurePresentation {
  return { ...PRESENTATION[code], fundsCommitted: isPostCommitError(code) };
}

export function presentBridgeFailure(failure: BridgeFailure): FailurePresentation {
  return presentFailure(failure.code);
}

/**
 * Normalise an unknown thrown value into a `BridgeError`.
 *
 * Wallet and RPC libraries throw wildly different shapes. Every one of them
 * ends up as one of the fourteen codes, because a UI cannot render "unknown"
 * usefully and a user cannot act on it.
 */
export function normalizeError(error: unknown): BridgeError {
  if (error instanceof BridgeError) return error;

  const message = extractMessage(error).toLowerCase();
  const code = extractCode(error);

  // EIP-1193 user rejection.
  if (code === 4001 || message.includes("user rejected") || message.includes("user denied")) {
    return new BridgeError("USER_REJECTED", "Transaction rejected in wallet", { cause: error });
  }
  if (message.includes("insufficient allowance") || message.includes("0xfb8f41b2")) {
    return new BridgeError("INSUFFICIENT_ALLOWANCE", "Token allowance too low", { cause: error });
  }
  if (message.includes("insufficient funds") || message.includes("exceeds balance")) {
    return new BridgeError("INSUFFICIENT_BALANCE", "Insufficient balance", { cause: error });
  }
  // ExceedsPerTransaction / ExceedsHourly / ExceedsDaily from the rate limiter.
  if (
    message.includes("0x9f6ddf1c") ||
    message.includes("exceedspertransaction") ||
    message.includes("exceedshourly") ||
    message.includes("exceedsdaily")
  ) {
    return new BridgeError("LIMIT_EXCEEDED", "Transfer exceeds the route limit", { cause: error });
  }
  // TransferPaused from the pause controller.
  if (message.includes("0xdc8e0445") || message.includes("transferpaused")) {
    return new BridgeError("ROUTE_PAUSED", "Route is paused", { cause: error });
  }
  if (message.includes("chain mismatch") || message.includes("wrong network")) {
    return new BridgeError("WRONG_NETWORK", "Wallet is on the wrong network", { cause: error });
  }
  if (
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("rate limit")
  ) {
    return new BridgeError("RPC_UNAVAILABLE", "Network unreachable", { cause: error });
  }
  if (message.includes("reverted") || message.includes("execution reverted")) {
    return new BridgeError("SOURCE_TX_REVERTED", "Transaction reverted", { cause: error });
  }

  return new BridgeError("RPC_UNAVAILABLE", extractMessage(error) || "Unknown error", {
    cause: error,
  });
}

function extractMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    // Wallet libraries nest the useful selector inside `cause`, but a cause is
    // often an object whose default stringification is "[object Object]".
    // Recurse instead, so a revert selector buried two levels down is still found.
    const cause = error.cause === undefined ? "" : extractMessage(error.cause);
    return `${error.message} ${cause}`;
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const parts = [record["message"], record["shortMessage"], record["details"], record["data"]];
    return parts.filter((p) => typeof p === "string").join(" ");
  }
  return "";
}

function extractCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as Record<string, unknown>)["code"];
  return typeof code === "number" ? code : undefined;
}
