/**
 * Lifecycle of a single bridge transfer.
 *
 * These are internal identifiers. They must never be rendered to a user —
 * map them through the presentation layer first.
 */
export type BridgeStatus =
  | "AWAITING_APPROVAL"
  | "APPROVING"
  | "READY"
  | "SOURCE_PENDING"
  | "SOURCE_CONFIRMED"
  | "MESSAGE_DISPATCHED"
  | "AWAITING_VERIFICATION"
  | "READY_FOR_DELIVERY"
  | "DESTINATION_PENDING"
  | "DELIVERED"
  | "FAILED";

export const BRIDGE_STATUSES = [
  "AWAITING_APPROVAL",
  "APPROVING",
  "READY",
  "SOURCE_PENDING",
  "SOURCE_CONFIRMED",
  "MESSAGE_DISPATCHED",
  "AWAITING_VERIFICATION",
  "READY_FOR_DELIVERY",
  "DESTINATION_PENDING",
  "DELIVERED",
  "FAILED",
] as const satisfies readonly BridgeStatus[];

/**
 * Statuses at which the transfer is finished and will not advance further.
 *
 * `FAILED` is terminal for the transfer as a whole. It does not by itself imply
 * the source transaction reverted — see `BridgeTransaction.failure`.
 */
export const TERMINAL_STATUSES = ["DELIVERED", "FAILED"] as const satisfies readonly BridgeStatus[];

export function isTerminalStatus(status: BridgeStatus): boolean {
  return (TERMINAL_STATUSES as readonly BridgeStatus[]).includes(status);
}

/**
 * True once the source chain has irreversibly accepted the transfer. Past this
 * point the user's assets have left the source chain and a delay must not be
 * presented as a failure.
 */
export function isSourceCommitted(status: BridgeStatus): boolean {
  switch (status) {
    case "AWAITING_APPROVAL":
    case "APPROVING":
    case "READY":
    case "SOURCE_PENDING":
      return false;
    case "SOURCE_CONFIRMED":
    case "MESSAGE_DISPATCHED":
    case "AWAITING_VERIFICATION":
    case "READY_FOR_DELIVERY":
    case "DESTINATION_PENDING":
    case "DELIVERED":
      return true;
    case "FAILED":
      // Indeterminate from the status alone; callers must consult the failure
      // record, which names the stage the transfer failed at.
      return false;
  }
}
