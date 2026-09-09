import type { ChainRegistry } from "../types.js";
import { arkMainnet, baseMainnet, bscMainnet, ethereumMainnet } from "../chains/index.js";

/**
 * Production topology. Every chain here ships `enabled: false` and will stay
 * that way until its deployment exists, has been verified, and its route
 * configuration has been reviewed. Nothing on mainnet is enabled by default.
 */
export const mainnetChainRegistry: ChainRegistry = {
  environment: "mainnet",
  hubChainKey: arkMainnet.key,
  chains: {
    [arkMainnet.key]: arkMainnet,
    [ethereumMainnet.key]: ethereumMainnet,
    [bscMainnet.key]: bscMainnet,
    [baseMainnet.key]: baseMainnet,
  },
};
