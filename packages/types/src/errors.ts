/**
 * Normalised failure causes.
 *
 * Every user-visible error resolves to exactly one of these so the UI can give
 * an actionable message instead of a generic "transaction failed".
 */
export type BridgeErrorCode =
  | "UNSUPPORTED_CHAIN"
  | "UNSUPPORTED_TOKEN"
  | "UNSUPPORTED_ROUTE"
  | "ROUTE_PAUSED"
  | "LIMIT_EXCEEDED"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_ALLOWANCE"
  | "WRONG_NETWORK"
  | "INVALID_RECIPIENT"
  | "USER_REJECTED"
  | "SOURCE_TX_REVERTED"
  | "RPC_UNAVAILABLE"
  | "MESSAGE_DELAYED"
  | "DESTINATION_TX_FAILED";

export const BRIDGE_ERROR_CODES = [
  "UNSUPPORTED_CHAIN",
  "UNSUPPORTED_TOKEN",
  "UNSUPPORTED_ROUTE",
  "ROUTE_PAUSED",
  "LIMIT_EXCEEDED",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_ALLOWANCE",
  "WRONG_NETWORK",
  "INVALID_RECIPIENT",
  "USER_REJECTED",
  "SOURCE_TX_REVERTED",
  "RPC_UNAVAILABLE",
  "MESSAGE_DELAYED",
  "DESTINATION_TX_FAILED",
] as const satisfies readonly BridgeErrorCode[];

/**
 * Codes that describe a condition after the user's funds have already left the
 * source chain. The UI must not present these as "your transfer failed, nothing
 * happened" — the source transfer stands and the transfer is recoverable or
 * still in progress.
 */
export const POST_COMMIT_ERROR_CODES = [
  "MESSAGE_DELAYED",
  "DESTINATION_TX_FAILED",
] as const satisfies readonly BridgeErrorCode[];

export function isPostCommitError(code: BridgeErrorCode): boolean {
  return (POST_COMMIT_ERROR_CODES as readonly BridgeErrorCode[]).includes(code);
}

export interface BridgeErrorContext {
  readonly chain?: string;
  readonly tokenId?: string;
  readonly routeId?: string;
  /** For LIMIT_EXCEEDED: the largest amount currently accepted, in base units. */
  readonly maxAvailable?: bigint;
  /** For WRONG_NETWORK: the chain key the wallet must switch to. */
  readonly requiredChain?: string;
  readonly cause?: unknown;
}

/** The single error type crossing the SDK boundary. */
export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly context: BridgeErrorContext;

  constructor(code: BridgeErrorCode, message: string, context: BridgeErrorContext = {}) {
    super(message, context.cause === undefined ? undefined : { cause: context.cause });
    this.name = "BridgeError";
    this.code = code;
    this.context = context;
  }

  /** True when the user's source funds are already committed. */
  get isPostCommit(): boolean {
    return isPostCommitError(this.code);
  }
}
