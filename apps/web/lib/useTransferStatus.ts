"use client";

import { useQuery } from "@tanstack/react-query";
import type { ArkBridge } from "@arkbridge/sdk";
import type { BridgeStatus, Hex } from "@arkbridge/types";
import { deriveStatus, advanceStatus, SLOW_VERIFICATION_SECONDS } from "@arkbridge/indexer";

export interface TransferStatus {
  readonly status: BridgeStatus;
  /** Progressing slower than expected, but not a failure (§63). */
  readonly delayed: boolean;
  readonly secondsElapsed: number;
}

/**
 * Poll a submitted transfer through to delivery.
 *
 * Status is derived by the indexer's `deriveStatus` rather than computed here,
 * so the card, the activity feed and any backend describe the same transfer
 * identically. Duplicating this logic per surface is how three parts of a
 * product end up disagreeing about whether a transfer has arrived.
 */
export function useTransferStatus(
  bridge: ArkBridge,
  params: {
    readonly messageId: Hex | undefined;
    readonly sourceChain: string;
    readonly destinationChain: string;
    readonly submittedAt: number;
    readonly initialStatus: BridgeStatus;
  },
): TransferStatus {
  const { messageId, sourceChain, destinationChain, submittedAt, initialStatus } = params;

  const query = useQuery({
    queryKey: ["transfer-status", messageId, destinationChain],
    enabled: messageId !== undefined,
    // Cross-chain delivery takes minutes, not seconds. Polling every 12s is
    // responsive enough to feel live without hammering the destination RPC
    // (§119: do not poll every chain every second).
    refetchInterval: (query) => (query.state.data?.status === "DELIVERED" ? false : 12_000),
    queryFn: async () => {
      if (messageId === undefined) return null;
      const result = await bridge.getMessageStatus(messageId, sourceChain, destinationChain);
      const secondsElapsed = Math.floor((Date.now() - submittedAt) / 1000);

      const derived = deriveStatus({
        sourceMined: true,
        sourceSucceeded: true,
        sourceConfirmations: 1,
        sourceRequiredConfirmations: 1,
        messageId,
        insertedIntoTree: true,
        delivered: result.delivered,
        secondsSinceSourceConfirmed: secondsElapsed,
      });

      return { status: derived.status, delayed: derived.delayed, secondsElapsed };
    },
  });

  const data = query.data ?? undefined;
  const secondsElapsed = data?.secondsElapsed ?? Math.floor((Date.now() - submittedAt) / 1000);

  return {
    // Never walk backwards: a destination read racing a stale one must not make
    // a completed transfer look unfinished.
    status: advanceStatus(initialStatus, data?.status ?? initialStatus),
    delayed: data?.delayed ?? secondsElapsed > SLOW_VERIFICATION_SECONDS,
    secondsElapsed,
  };
}
