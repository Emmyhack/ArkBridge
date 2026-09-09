import type { ChainRegistry } from "../types.js";
import { arkLocal, ethereumLocal } from "../chains/index.js";

/**
 * Local harness: one Ark-like EVM node and one external EVM node, both anvil.
 * Used to exercise the full lock -> message -> mint path before any public
 * testnet is involved.
 */
export const localChainRegistry: ChainRegistry = {
  environment: "local",
  hubChainKey: arkLocal.key,
  chains: {
    [arkLocal.key]: arkLocal,
    [ethereumLocal.key]: ethereumLocal,
  },
};
