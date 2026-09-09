import type { ChainRegistry } from "../types.js";
import { arkDevnet, baseSepolia, bscTestnet, ethereumSepolia } from "../chains/index.js";

export const testnetChainRegistry: ChainRegistry = {
  environment: "testnet",
  hubChainKey: arkDevnet.key,
  chains: {
    [arkDevnet.key]: arkDevnet,
    [ethereumSepolia.key]: ethereumSepolia,
    [bscTestnet.key]: bscTestnet,
    [baseSepolia.key]: baseSepolia,
  },
};
