import type { TokenRegistry } from "../types.js";

/**
 * Production asset registry.
 *
 * Intentionally empty.
 *
 * A production asset requires, before it can be listed here: a confirmed
 * canonical address on its origin chain, a reviewed deployment of its warp
 * route, reviewed transfer limits drawn from production configuration, and a
 * token-policy review of its ERC20 behaviour (rebasing, fee-on-transfer,
 * blacklisting, hooks, non-standard decimals).
 *
 * Real addresses and real monetary limits are never written here speculatively.
 * They are added from verified deployment artifacts as part of the mainnet
 * launch process — see docs/deployments/mainnet.md.
 */
export const mainnetTokenRegistry: TokenRegistry = {
  environment: "mainnet",
  tokens: {},
  routes: {},
};
