import type { TokenRegistry } from "../types.js";
import { buildMockRegistry } from "./build.js";

export const localTokenRegistry: TokenRegistry = buildMockRegistry({
  environment: "local",
  hubChain: "ark-local",
  externalChains: ["ethereum-local"],
  enabledSymbols: ["MockUSDC", "MockUSDT", "MockWETH"],
});
