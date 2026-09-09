import type { ChainRegistry } from "../types.js";
import { arkDevnet, bscTestnet, ethereumSepolia } from "../chains/index.js";

/**
 * Staging mirrors the testnet topology but points at a separate set of
 * deployments so release candidates can be exercised without disturbing the
 * shared devnet. Chain identities are the same; deployment artifacts are not.
 */
export const stagingChainRegistry: ChainRegistry = {
  environment: "staging",
  hubChainKey: arkDevnet.key,
  chains: {
    [arkDevnet.key]: arkDevnet,
    [ethereumSepolia.key]: ethereumSepolia,
    [bscTestnet.key]: bscTestnet,
  },
};
