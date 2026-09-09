import type { TokenRegistry } from "../types.js";
import { buildMockRegistry } from "./build.js";

/**
 * Testnet.
 *
 * MockUSDC on Sepolia is live: the warp route is deployed and a round trip
 * (lock -> mint, burn -> release) has been verified on chain. MockUSDT and
 * MockWETH stay disabled until their routes are exercised the same way.
 *
 * BSC Testnet is gated entirely. Its assets and routes are defined but cannot
 * be enabled, because Ark's inbound ISM for BSC still trusts Hyperlane's 1-of-1
 * testnet validator — and that single key is shared with the Sepolia set that
 * was deliberately replaced for exactly this reason. Gating it here means the
 * BSC route cannot become selectable as a side effect of enabling the hub or of
 * deploying its warp route; the gate has to be removed on purpose, after the
 * ISM is migrated. See docs/security/validator-topology.md.
 */
export const testnetTokenRegistry: TokenRegistry = buildMockRegistry({
  environment: "testnet",
  hubChain: "ark-devnet",
  externalChains: ["sepolia", "bsc-testnet", "base-sepolia"],
  enabledSymbols: ["MockUSDC"],
  gatedChains: {
    "bsc-testnet":
      "Ark's inbound ISM for domain 97 still trusts Hyperlane's 1-of-1 validator, whose key is " +
      "shared with the Sepolia set ArkBridge replaced. Migrate BSC to ArkBridge validators before " +
      "removing this gate.",
  },
});
