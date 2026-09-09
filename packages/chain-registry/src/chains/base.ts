import type { ChainConfig } from "@arkbridge/types";

/**
 * Base.
 *
 * Added after Ethereum and BNB Smart Chain, and deliberately without touching
 * anything outside this package: a chain file, an entry in the environment that
 * uses it, and a deployment artifact. Selectors derive their options from the
 * registry, so nothing in the frontend or SDK needs to know Base exists.
 *
 * Base is an OP-stack L2 settling to Ethereum. Two consequences that matter:
 *
 *   - Gas is roughly two orders of magnitude cheaper than Sepolia, so the
 *     interchain gas accounting that dominates on L1 is close to noise here.
 *   - Finality is inherited from L1. Sequencer-confirmed blocks are fast but not
 *     final until the batch settles, which is why `reorgPeriod` below is not 1.
 */

const ETH_NATIVE_CURRENCY = {
  name: "Ether",
  symbol: "ETH",
  decimals: 18,
} as const;

export const baseMainnet: ChainConfig = {
  key: "base",
  name: "Base",
  logo: "base",
  chainId: 8453,
  hyperlaneDomainId: 8453,
  rpcUrls: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
  explorerUrl: "https://basescan.org",
  explorerApiUrl: "https://api.basescan.org",
  explorerApiKind: "etherscan",
  nativeCurrency: ETH_NATIVE_CURRENCY,
  testnet: false,
  isHub: false,
  enabled: false,
};

/**
 * Base Sepolia.
 *
 * Chain id and Hyperlane domain both 84532, confirmed against
 * `@hyperlane-xyz/registry@26.1.0` and `eth_chainId` on the live node. Hyperlane
 * already operates core here (Mailbox `0x6966b0E5...2039`), so ArkBridge
 * deploys warp routes only — it does not redeploy core on a chain that has one.
 */
export const baseSepolia: ChainConfig = {
  key: "base-sepolia",
  name: "Base",
  descriptor: "Sepolia testnet",
  logo: "base",
  chainId: 84532,
  hyperlaneDomainId: 84532,
  rpcUrls: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"],
  explorerUrl: "https://sepolia.basescan.org",
  explorerApiUrl: "https://api-sepolia.basescan.org",
  explorerApiKind: "etherscan",
  nativeCurrency: ETH_NATIVE_CURRENCY,
  testnet: true,
  isHub: false,
  enabled: true,
};
