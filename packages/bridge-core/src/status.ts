import type { BridgeStatus } from "@arkbridge/types";

/**
 * User-facing labels for internal statuses.
 *
 * Raw enum names never reach a user (spec §41). The mapping lives here rather
 * than in a component so that the SDK, the activity feed and the status page
 * cannot drift into describing the same state three different ways.
 */
export interface StatusPresentation {
  /** Short label, e.g. "Confirming on Ethereum". */
  readonly label: string;
  /** One sentence of context, shown under the label. */
  readonly detail: string;
  /** Where the transfer sits in the stepper. */
  readonly stage: "approval" | "source" | "message" | "destination" | "done" | "attention";
  /**
   * True once the user's funds have irreversibly left the source chain.
   * A delay past this point is not a failure and must not be presented as one.
   */
  readonly sourceCommitted: boolean;
}

const PRESENTATION: Readonly<Record<BridgeStatus, StatusPresentation>> = {
  AWAITING_APPROVAL: {
    label: "Approval needed",
    detail: "Allow ArkBridge to move this asset before the transfer can start.",
    stage: "approval",
    sourceCommitted: false,
  },
  APPROVING: {
    label: "Approving",
    detail: "Waiting for the approval transaction to confirm.",
    stage: "approval",
    sourceCommitted: false,
  },
  READY: {
    label: "Ready to bridge",
    detail: "Everything is in place. Confirm the transfer in your wallet.",
    stage: "approval",
    sourceCommitted: false,
  },
  SOURCE_PENDING: {
    label: "Confirming",
    detail: "Your transfer is being confirmed on the source network.",
    stage: "source",
    sourceCommitted: false,
  },
  SOURCE_CONFIRMED: {
    label: "Source transaction confirmed",
    detail: "Your assets are locked. The transfer is now in progress.",
    stage: "source",
    sourceCommitted: true,
  },
  MESSAGE_DISPATCHED: {
    label: "Transfer message sent",
    detail: "The transfer has been handed to the interchain network.",
    stage: "message",
    sourceCommitted: true,
  },
  AWAITING_VERIFICATION: {
    label: "Verifying transfer",
    detail: "Validators are confirming the transfer. This is the slowest step.",
    stage: "message",
    sourceCommitted: true,
  },
  READY_FOR_DELIVERY: {
    label: "Verified",
    detail: "Verification is complete. Delivery is being submitted.",
    stage: "destination",
    sourceCommitted: true,
  },
  DESTINATION_PENDING: {
    label: "Completing",
    detail: "Finalising the transfer on the destination network.",
    stage: "destination",
    sourceCommitted: true,
  },
  DELIVERED: {
    label: "Transfer complete",
    detail: "Your assets have arrived.",
    stage: "done",
    sourceCommitted: true,
  },
  FAILED: {
    label: "Needs attention",
    // Deliberately not "Failed". FAILED covers both "your wallet rejected it,
    // nothing moved" and "your funds left the source chain and delivery is
    // stuck". Those need very different words, so the caller must consult the
    // failure record — see `presentFailure`.
    detail: "This transfer could not be completed. See the details below.",
    stage: "attention",
    sourceCommitted: false,
  },
};

export function presentStatus(status: BridgeStatus): StatusPresentation {
  return PRESENTATION[status];
}

/** Ordered stages for a progress stepper. */
export const TRANSFER_STAGES = [
  "Source transaction confirmed",
  "Assets locked",
  "Message dispatched",
  "Message verification",
  "Destination delivery",
  "Assets received",
] as const;

/** How far along the stepper a status sits, for rendering completed steps. */
export function stageIndex(status: BridgeStatus): number {
  switch (status) {
    case "AWAITING_APPROVAL":
    case "APPROVING":
    case "READY":
    case "SOURCE_PENDING":
      return -1;
    case "SOURCE_CONFIRMED":
      return 1;
    case "MESSAGE_DISPATCHED":
      return 2;
    case "AWAITING_VERIFICATION":
      return 3;
    case "READY_FOR_DELIVERY":
    case "DESTINATION_PENDING":
      return 4;
    case "DELIVERED":
      return 5;
    case "FAILED":
      return -1;
  }
}
