import type { Address } from "./primitives.js";

/**
 * Transfer limits for a single directed route.
 *
 * Aggregate windows exist so a limit cannot be defeated by splitting one large
 * transfer into many small ones. All values are in the token's smallest unit on
 * the source chain.
 */
export interface RouteLimits {
  readonly maxPerTransaction: bigint;
  readonly maxHourly: bigint;
  readonly maxDaily: bigint;
}

/** Operational state of a route, chain, or token. */
export type OperationalStatus = "operational" | "degraded" | "paused" | "unavailable";

/**
 * A directed transfer path: one token, one source chain, one destination chain.
 *
 * Routes are directed. `ethereum -> ark` and `ark -> ethereum` are two separate
 * `BridgeRoute` records so that either direction can be paused or limited
 * independently.
 */
export interface BridgeRoute {
  /** `<sourceChain>:<destinationChain>:<tokenId>`, e.g. `ethereum:ark:ethereum-usdc`. */
  readonly id: string;

  readonly sourceChain: string;
  readonly destinationChain: string;

  readonly tokenId: string;

  /** Warp router on the source chain. `ZERO_ADDRESS` until deployed. */
  readonly sourceRouter: Address;
  /** Warp router on the destination chain. `ZERO_ADDRESS` until deployed. */
  readonly destinationRouter: Address;

  readonly enabled: boolean;

  readonly limits?: RouteLimits;
}

/** Remaining capacity for a route, as surfaced to the UI. */
export interface RouteCapacity {
  readonly routeId: string;
  readonly maxPerTransaction: bigint;
  readonly hourlyRemaining: bigint;
  readonly dailyRemaining: bigint;
  /** min(maxPerTransaction, hourlyRemaining, dailyRemaining). */
  readonly available: bigint;
}
