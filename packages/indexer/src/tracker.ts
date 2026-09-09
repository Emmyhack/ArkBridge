import type { BridgeTransaction, BridgeStatus } from "@arkbridge/types";
import type { TransferObservations } from "./observations.js";
import { advanceStatus, deriveStatus } from "./status.js";
import type { TransferStore } from "./store.js";

/** Reads chain state for one transfer. Supplied by the caller. */
export type Observer = (transaction: BridgeTransaction) => Promise<TransferObservations>;

export interface TrackResult {
  readonly transaction: BridgeTransaction;
  readonly changed: boolean;
  readonly previousStatus: BridgeStatus;
}

/**
 * Advances a transfer's recorded status from fresh observations.
 *
 * The observer is injected so this is testable without a chain, and so the
 * indexer does not decide which RPC to trust.
 */
export async function track(
  store: TransferStore,
  observe: Observer,
  transaction: BridgeTransaction,
  now: number = Date.now(),
): Promise<TrackResult> {
  const observations = await observe(transaction);
  const derived = deriveStatus(observations);
  const previousStatus = transaction.status;
  const status = advanceStatus(previousStatus, derived.status);

  const changed =
    status !== previousStatus ||
    (observations.messageId !== undefined && transaction.messageId !== observations.messageId);

  if (!changed) return { transaction, changed: false, previousStatus };

  const updated: BridgeTransaction = {
    ...transaction,
    status,
    ...(observations.messageId === undefined ? {} : { messageId: observations.messageId }),
    // Only attach a failure when the derivation actually produced one AND the
    // status settled on FAILED. A stale observation must not stamp a failure
    // onto a transfer that has since progressed.
    ...(status === "FAILED" && derived.failure !== undefined ? { failure: derived.failure } : {}),
    updatedAt: now,
  };

  await store.put(updated);
  return { transaction: updated, changed: true, previousStatus };
}

/** Advance every non-terminal transfer once. */
export async function trackPending(
  store: TransferStore,
  observe: Observer,
  now: number = Date.now(),
): Promise<readonly TrackResult[]> {
  const pending = await store.pending();
  const results: TrackResult[] = [];
  for (const transaction of pending) {
    try {
      results.push(await track(store, observe, transaction, now));
    } catch {
      // One unreachable chain must not stall every other transfer's tracking.
      // The transfer stays pending and is retried on the next pass.
    }
  }
  return results;
}
