import type { TokenRegistry } from "../types.js";
import { buildMockRegistry } from "./build.js";

export const stagingTokenRegistry: TokenRegistry = buildMockRegistry({
  environment: "staging",
  hubChain: "ark-devnet",
  externalChains: ["sepolia", "bsc-testnet"],
  enabledSymbols: ["MockUSDC", "MockUSDT", "MockWETH"],
});
