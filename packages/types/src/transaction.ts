import type { Address, Hex } from "./primitives.js";
import type { BridgeErrorCode } from "./errors.js";
import type { BridgeStatus } from "./status.js";

/** A quote for a prospective transfer. All amounts are in base units. */
export interface BridgeQuote {
  readonly sourceChain: string;
  readonly destinationChain: string;

  /** Token id (e.g. `ethereum-usdc`), never a bare symbol. */
  readonly token: string;

  readonly amount: bigint;
  readonly estimatedReceived: bigint;

  /** ArkBridge protocol fee, in the transferred token's base units. */
  readonly bridgeFee: bigint;
  /** Hyperlane interchain gas payment, in the source chain's native currency. */
  readonly interchainFee: bigint;

  readonly routeId: string;

  /** Remaining route capacity at quote time, in source token base units. */
  readonly limitRemaining?: bigint;

  /**
   * Rough delivery estimate in seconds, when historical data supports one.
   * Absent means "unknown" — render "Estimated delivery" without a number
   * rather than inventing one.
   */
  readonly estimatedDeliverySeconds?: number;
}

/** Result of submitting a transfer. */
export interface BridgeSubmission {
  readonly sourceTransactionHash: Hex;
  /** Known once the dispatch log has been read from the source receipt. */
  readonly messageId?: Hex;
  readonly routeId: string;
}

export interface BridgeFailure {
  readonly code: BridgeErrorCode;
  readonly message: string;
  /** The stage the transfer was at when it failed. */
  readonly stage: BridgeStatus;
}

/** A transfer as tracked by the indexer and rendered in Activity. */
export interface BridgeTransaction {
  readonly id: string;
  readonly wallet: Address;
  readonly recipient: Address;

  readonly sourceChain: string;
  readonly destinationChain: string;

  readonly tokenId: string;
  /** Base-unit amount, serialised as a decimal string (JSON has no bigint). */
  readonly amount: string;
  /** Base-unit amount actually delivered; set once `DELIVERED`. */
  readonly receivedAmount?: string;

  readonly sourceTxHash: Hex;
  readonly destinationTxHash?: Hex;

  readonly messageId?: Hex;

  readonly status: BridgeStatus;
  readonly failure?: BridgeFailure;

  /** Unix milliseconds. */
  readonly createdAt: number;
  readonly updatedAt: number;
}
