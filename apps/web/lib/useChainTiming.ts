"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import type { RouteCatalog } from "@arkbridge/bridge-core";

/**
 * Measured block time for the two chains on a route.
 *
 * Averaged over a real span of blocks rather than taken from a constant. Block
 * times drift — a testnet with intermittent proposers is not producing a block
 * every twelve seconds no matter what the documentation says — and a number
 * copied from documentation into the interface stops being true without
 * anything indicating that it has.
 *
 * WHAT THIS IS NOT
 *
 * It is not a delivery estimate, and the interface must not present it as one.
 * A cross-chain delivery is: inclusion on the source, then a validator set
 * observing and signing it, then a relayer submitting on the destination. Only
 * the first and last of those are block time. The middle is off-chain, has no
 * upper bound, and is exactly the part that makes a transfer feel stuck.
 *
 * So this supplies the part that can be measured, and the interface names the
 * rest as variable instead of folding it into a single confident "2 min" (§34).
 */
export interface ChainTiming {
  readonly sourceSeconds?: number;
  readonly destinationSeconds?: number;
  /** Block time on both ends, which is the measurable floor for a delivery. */
  readonly floorSeconds?: number;
  readonly loading: boolean;
}

const SPAN = 40;

export function useChainTiming(
  catalog: RouteCatalog,
  sourceChain: string,
  destinationChain: string,
): ChainTiming {
  const query = useQuery({
    queryKey: ["chain-timing", sourceChain, destinationChain],
    // Block time is a slow-moving property; re-measuring it often would be
    // three RPC calls per chain for a number that barely moves.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const measure = async (chainKey: string): Promise<number | undefined> => {
        const rpc = catalog.chains[chainKey]?.rpcUrls[0];
        if (rpc === undefined) return undefined;
        const client = createPublicClient({ transport: http(rpc) });
        const latest = await client.getBlock();
        if (latest.number === null || latest.number < BigInt(SPAN)) return undefined;
        const earlier = await client.getBlock({ blockNumber: latest.number - BigInt(SPAN) });
        const seconds = Number(latest.timestamp - earlier.timestamp) / SPAN;
        // A non-positive or absurd average means the chain's timestamps are not
        // usable for this. Reporting nothing beats reporting nonsense.
        return seconds > 0 && seconds < 3600 ? seconds : undefined;
      };

      const [source, destination] = await Promise.all([
        measure(sourceChain).catch(() => undefined),
        measure(destinationChain).catch(() => undefined),
      ]);
      return { source, destination };
    },
  });

  const source = query.data?.source;
  const destination = query.data?.destination;

  return {
    ...(source === undefined ? {} : { sourceSeconds: source }),
    ...(destination === undefined ? {} : { destinationSeconds: destination }),
    ...(source === undefined || destination === undefined
      ? {}
      : { floorSeconds: source + destination }),
    loading: query.isPending,
  };
}
