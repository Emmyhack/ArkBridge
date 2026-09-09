/**
 * Minimal hex primitives.
 *
 * Declared locally rather than imported from `viem` so that `@arkbridge/types`
 * stays dependency-free and safe to consume from contracts tooling, the
 * indexer, and the browser alike. These are structurally identical to viem's
 * `Address` / `Hex`, so values flow between the two without conversion.
 */
export type Hex = `0x${string}`;

/** A 20-byte EVM address in hex form. Case is not normalised by the type. */
export type Address = `0x${string}`;

/** Canonical zero address. Used as the "not yet deployed" sentinel. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const satisfies Address;

/**
 * Sentinel for a numeric registry field that has not been confirmed yet
 * (e.g. an Ark chain id or Hyperlane domain id that is still pending).
 *
 * Real chain ids and Hyperlane domain ids are positive, so `-1` can never
 * collide with a legitimate value.
 */
export const UNCONFIGURED = -1 as const;

export type Unconfigured = typeof UNCONFIGURED;
