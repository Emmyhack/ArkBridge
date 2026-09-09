import type { BridgeStatus, BridgeFailure } from "@arkbridge/types";
import type { TransferObservations } from "./observations.js";
import { SLOW_VERIFICATION_SECONDS } from "./observations.js";

export interface DerivedStatus {
  readonly status: BridgeStatus;
  readonly failure?: BridgeFailure;
  /** True when the transfer is progressing slower than expected but is fine. */
  readonly delayed: boolean;
}

/**
 * Derive a transfer's status from what has been observed.
 *
 * Pure, and deliberately ordered from the most conclusive evidence backwards.
 * Delivery is checked first because a delivered message is delivered regardless
 * of what any intermediate step looked like — a race between observations must
 * never walk a completed transfer backwards.
 */
export function deriveStatus(observations: TransferObservations): DerivedStatus {
  const o = observations;

  if (o.delivered === true) return { status: "DELIVERED", delayed: false };

  if (o.sourceMined === true && o.sourceSucceeded === false) {
    return {
      status: "FAILED",
      delayed: false,
      failure: {
        code: "SOURCE_TX_REVERTED",
        message: "The transaction reverted on the source network. No assets were moved.",
        stage: "SOURCE_PENDING",
      },
    };
  }

  if (o.destinationReverted === true) {
    return {
      status: "FAILED",
      delayed: false,
      failure: {
        // Distinct from SOURCE_TX_REVERTED on purpose: the user's funds HAVE
        // left the source chain here, so the UI must not say "nothing moved".
        code: "DESTINATION_TX_FAILED",
        message: "The source transfer confirmed, but delivery did not complete.",
        stage: "DESTINATION_PENDING",
      },
    };
  }

  if (o.sourceMined !== true) return { status: "SOURCE_PENDING", delayed: false };

  const confirmations = o.sourceConfirmations ?? 0;
  const required = o.sourceRequiredConfirmations ?? 1;
  if (confirmations < required) return { status: "SOURCE_PENDING", delayed: false };

  if (o.messageId === undefined) return { status: "SOURCE_CONFIRMED", delayed: false };

  // A dispatch that never entered the merkle tree can never be proved. Report
  // it rather than leaving the transfer to sit in "verifying" forever.
  if (o.insertedIntoTree === false) {
    return {
      status: "FAILED",
      delayed: false,
      failure: {
        code: "DESTINATION_TX_FAILED",
        message:
          "The transfer was dispatched but never entered the origin's merkle tree, so it cannot " +
          "be verified. This indicates a misconfigured dispatch hook and needs operator action.",
        stage: "MESSAGE_DISPATCHED",
      },
    };
  }

  const elapsed = o.secondsSinceSourceConfirmed ?? 0;
  const delayed = elapsed > SLOW_VERIFICATION_SECONDS;

  if (o.checkpointSigned === true) return { status: "READY_FOR_DELIVERY", delayed };
  if (o.insertedIntoTree === true) return { status: "AWAITING_VERIFICATION", delayed };
  return { status: "MESSAGE_DISPATCHED", delayed };
}

/**
 * Statuses never move backwards.
 *
 * Observations arrive out of order — a destination read can land before a
 * source read catches up. Without this, a user watching the UI would see a
 * transfer regress from "complete" to "confirming", which reads as a fault.
 */
const RANK: Readonly<Record<BridgeStatus, number>> = {
  AWAITING_APPROVAL: 0,
  APPROVING: 1,
  READY: 2,
  SOURCE_PENDING: 3,
  SOURCE_CONFIRMED: 4,
  MESSAGE_DISPATCHED: 5,
  AWAITING_VERIFICATION: 6,
  READY_FOR_DELIVERY: 7,
  DESTINATION_PENDING: 8,
  DELIVERED: 9,
  // Terminal, and reachable from anywhere. Ranked highest so a real failure is
  // never masked by a stale in-progress observation.
  FAILED: 10,
};

export function isRegression(previous: BridgeStatus, next: BridgeStatus): boolean {
  return RANK[next] < RANK[previous];
}

/** Advance a status, refusing to move it backwards. */
export function advanceStatus(previous: BridgeStatus, next: BridgeStatus): BridgeStatus {
  if (previous === "DELIVERED") return "DELIVERED";
  return isRegression(previous, next) ? previous : next;
}
