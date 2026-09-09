import type { Address } from "./primitives.js";

/**
 * How a token exists on a particular chain.
 *
 * - `canonical`   the original issuance; the asset's source of truth
 * - `collateral`  canonical token locked behind a collateral router
 * - `synthetic`   an ArkBridge-issued representation backed by locked collateral
 */
export type RepresentationType = "canonical" | "collateral" | "synthetic";

export interface TokenRepresentation {
  readonly address: Address;
  readonly type: RepresentationType;
  /**
   * Decimals of this representation on this chain. Present because a
   * representation is not required to match its canonical decimals; when it
   * does not, conversion rounding is documented at the route level.
   */
  readonly decimals: number;
  /** The Hyperlane warp router that owns this representation, once deployed. */
  readonly router?: Address;
}

/**
 * A bridgeable asset, identified by its canonical origin.
 *
 * `id` is `<canonicalChain>-<symbol lowercased>` by convention, e.g.
 * `ethereum-usdc`. Two assets sharing a ticker on different origin chains are
 * two different `BridgeToken`s and must never be merged. `symbol` alone is
 * never an identity.
 */
export interface BridgeToken {
  readonly id: string;

  readonly name: string;
  readonly symbol: string;
  /** Decimals of the canonical issuance. */
  readonly decimals: number;

  /** Chain key of the canonical issuance. */
  readonly canonicalChain: string;
  /** Address of the canonical issuance on `canonicalChain`. */
  readonly canonicalAddress: Address;

  /** Optional logo URI; the UI falls back to a generated mark when absent. */
  readonly logoUri?: string;

  /**
   * Per-chain representations, keyed by chain key. The entry for
   * `canonicalChain` is the canonical or collateral form; every other entry is
   * a synthetic representation issued by ArkBridge.
   */
  readonly representations: Readonly<Record<string, TokenRepresentation>>;

  /** True for mock/test assets. Production deployment scripts reject these. */
  readonly isMock: boolean;

  readonly enabled: boolean;
}
