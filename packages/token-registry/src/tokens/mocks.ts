import type { BridgeToken } from "@arkbridge/types";
import { ZERO_ADDRESS } from "@arkbridge/types";

/**
 * Mock test assets.
 *
 * Addresses are `ZERO_ADDRESS` until the deploy scripts write a deployment
 * artifact; `@arkbridge/config` hydrates them from `deployments/<env>/`. A token
 * with a zero address is never deployed and never selectable.
 *
 * Every token here carries `isMock: true`. Production deployment and
 * configuration validation rejects any mock asset outright, so these can never
 * reach mainnet by accident.
 *
 * Note the deliberate duplication of tickers across origins: Sepolia MockUSDC
 * and BSC Testnet MockUSDC are two distinct assets with two distinct ids. They
 * are never merged on the strength of a shared symbol.
 */

interface MockSpec {
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
}

const MOCK_SPECS = [
  { symbol: "MockUSDC", name: "Mock USD Coin", decimals: 6 },
  { symbol: "MockUSDT", name: "Mock Tether USD", decimals: 6 },
  { symbol: "MockWETH", name: "Mock Wrapped Ether", decimals: 18 },
] as const satisfies readonly MockSpec[];

function defineMockToken(
  spec: MockSpec,
  canonicalChain: string,
  hubChain: string,
  enabled: boolean,
): BridgeToken {
  return {
    id: `${canonicalChain}-${spec.symbol.toLowerCase()}`,
    name: spec.name,
    symbol: spec.symbol,
    decimals: spec.decimals,
    canonicalChain,
    canonicalAddress: ZERO_ADDRESS,
    isMock: true,
    enabled,
    representations: {
      // Canonical issuance, locked behind the collateral router on its origin.
      [canonicalChain]: {
        address: ZERO_ADDRESS,
        type: "collateral",
        decimals: spec.decimals,
      },
      // ArkBridge-issued synthetic on the hub. Decimals deliberately match the
      // canonical decimals so no conversion arithmetic is involved on this route.
      [hubChain]: {
        address: ZERO_ADDRESS,
        type: "synthetic",
        decimals: spec.decimals,
      },
    },
  };
}

/**
 * Mock assets for one external chain.
 *
 * `enabledSymbols` names the subset that is eligible to be turned on — the
 * first end-to-end milestone is MockUSDC only, so USDT and WETH stay defined
 * but disabled until their routes have been exercised.
 */
export function defineMockTokens(
  canonicalChain: string,
  hubChain: string,
  enabledSymbols: readonly string[] = ["MockUSDC"],
): BridgeToken[] {
  return MOCK_SPECS.map((spec) =>
    defineMockToken(spec, canonicalChain, hubChain, enabledSymbols.includes(spec.symbol)),
  );
}

export { MOCK_SPECS };
