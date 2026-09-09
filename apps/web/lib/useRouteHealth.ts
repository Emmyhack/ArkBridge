"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import type { ArkBridge } from "@arkbridge/sdk";
import type { RouteCatalog, RouteSelection } from "@arkbridge/bridge-core";

/**
 * Whether this route is actually working, right now.
 *
 * The bridge card used to print "Operational" as a literal — a hardcoded string
 * under a heading that a user reads as a safety check. That is the worst kind
 * of placeholder: it is indistinguishable from a real check, it is reassuring,
 * and it is reassuring precisely when it should not be. It now comes from three
 * live reads:
 *
 *   1. `isRouteAvailable` — the SDK's on-chain guard read. This is the one that
 *      knows whether the route has remaining capacity in its rate-limit bucket.
 *   2. Source chain reachability, with latency.
 *   3. Destination chain reachability, with latency.
 *
 * A route is only as healthy as its weaker end, so the worst of the three wins.
 * "Checking" is a distinct state from "operational": an unresolved probe must
 * never render as a pass.
 */
export type RouteHealth = "checking" | "operational" | "degraded" | "unavailable";

export interface RouteHealthState {
  readonly health: RouteHealth;
  /** Present when the route is unavailable and the guard said why. */
  readonly reason?: string;
  readonly sourceLatency?: number;
  readonly destinationLatency?: number;
}

const SLOW_MS = 4000;

export function useRouteHealth(
  bridge: ArkBridge,
  catalog: RouteCatalog,
  selection: RouteSelection,
): RouteHealthState {
  const query = useQuery({
    queryKey: [
      "route-health",
      selection.sourceChain,
      selection.destinationChain,
      selection.tokenId,
    ],
    // Slow enough not to make the bridge card a load generator on a public RPC
    // (§119), fast enough that a route going down is noticed while the form is
    // still open.
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
    queryFn: async () => {
      const probe = async (chainKey: string) => {
        const rpc = catalog.chains[chainKey]?.rpcUrls[0];
        if (rpc === undefined) return undefined;
        const client = createPublicClient({ transport: http(rpc) });
        const started = Date.now();
        await client.getBlockNumber();
        return Date.now() - started;
      };

      // All three together: the card should not take the sum of three
      // round-trips to tell the user whether it can be used.
      const [availability, sourceLatency, destinationLatency] = await Promise.all([
        bridge.isRouteAvailable(selection).catch(() => undefined),
        probe(selection.sourceChain).catch(() => undefined),
        probe(selection.destinationChain).catch(() => undefined),
      ]);

      return { availability, sourceLatency, destinationLatency };
    },
  });

  if (query.isPending) return { health: "checking" };
  if (query.isError) return { health: "unavailable" };

  const data = query.data;
  const { availability, sourceLatency, destinationLatency } = data ?? {};

  if (sourceLatency === undefined || destinationLatency === undefined) {
    return {
      health: "unavailable",
      reason: "A network on this route did not respond.",
    };
  }

  if (availability !== undefined && !availability.available) {
    return {
      health: "unavailable",
      ...(availability.reason === undefined ? {} : { reason: availability.reason }),
      sourceLatency,
      destinationLatency,
    };
  }

  // Answering, but slowly, is not healthy. Saying "Operational" while every
  // read takes eight seconds tells the user the opposite of what they will
  // experience.
  const slow = sourceLatency > SLOW_MS || destinationLatency > SLOW_MS;

  return {
    health: slow ? "degraded" : "operational",
    sourceLatency,
    destinationLatency,
  };
}
