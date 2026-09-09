import type { Hex } from "@arkbridge/types";

/**
 * What the indexer can actually observe about a transfer, chain by chain.
 *
 * Every field is a fact read from a node, not an inference. Status is derived
 * from these (see `deriveStatus`), which keeps the derivation a pure function —
 * testable without a chain, and impossible to drift from what was observed.
 */
export interface TransferObservations {
  /** Source transaction is in a block. */
  readonly sourceMined?: boolean;
  /** Source transaction succeeded. `false` means it reverted. */
  readonly sourceSucceeded?: boolean;
  /** Confirmations on the source chain. */
  readonly sourceConfirmations?: number;
  /** Confirmations the source chain requires before it is considered settled. */
  readonly sourceRequiredConfirmations?: number;
  /** Message id, once the dispatch log has been read. */
  readonly messageId?: Hex;
  /**
   * The message has been inserted into the origin's merkle tree.
   *
   * Tracked separately from dispatch because they can diverge: a misconfigured
   * hook lets a dispatch succeed without inserting, and the transfer then
   * becomes permanently unverifiable. That happened on this devnet, so it is
   * observed rather than assumed.
   */
  readonly insertedIntoTree?: boolean;
  /** Validators have signed a checkpoint covering this message's index. */
  readonly checkpointSigned?: boolean;
  /** Destination Mailbox reports the message delivered. */
  readonly delivered?: boolean;
  /** Destination delivery transaction reverted. */
  readonly destinationReverted?: boolean;
  /** Seconds since the source transaction confirmed. */
  readonly secondsSinceSourceConfirmed?: number;
}

/**
 * How long verification may take before the UI says so.
 *
 * Not a failure threshold — a transfer past this is still in progress and must
 * be described that way (spec §63). This only decides when to stop saying
 * "verifying" and start saying "taking longer than usual".
 */
export const SLOW_VERIFICATION_SECONDS = 900;
