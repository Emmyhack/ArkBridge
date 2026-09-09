import type { ChainConfig } from "@arkbridge/types";

/**
 * Ethereum.
 *
 * The RPC URLs are unauthenticated public endpoints, suitable for development
 * and as a fallback. Production traffic should run through a dedicated provider
 * configured per deployment — `pnpm check:chains` verifies whatever is listed
 * here still answers.
 *
 * Hyperlane domain ids below match the canonical Hyperlane registry entries for
 * these networks. `pnpm validate:registry` cross-checks them against
 * `@hyperlane-xyz/registry` so a drift is caught rather than assumed away.
 */

const ETH_NATIVE_CURRENCY = {
  name: "Ether",
  symbol: "ETH",
  decimals: 18,
} as const;

export const ethereumMainnet: ChainConfig = {
  key: "ethereum",
  name: "Ethereum",
  logo: "ethereum",
  chainId: 1,
  hyperlaneDomainId: 1,
  rpcUrls: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.drpc.org",
    "https://cloudflare-eth.com",
  ],
  explorerUrl: "https://etherscan.io",
  nativeCurrency: ETH_NATIVE_CURRENCY,
  testnet: false,
  isHub: false,
  enabled: false,
};

export const ethereumSepolia: ChainConfig = {
  key: "sepolia",
  name: "Ethereum",
  descriptor: "Sepolia testnet",
  logo: "ethereum",
  chainId: 11155111,
  hyperlaneDomainId: 11155111,
  rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.gateway.tenderly.co"],
  explorerUrl: "https://sepolia.etherscan.io",
  nativeCurrency: ETH_NATIVE_CURRENCY,
  testnet: true,
  isHub: false,
  enabled: true,
};

/** Local anvil node standing in for the external chain in the local harness. */
export const ethereumLocal: ChainConfig = {
  key: "ethereum-local",
  name: "Ethereum Local",
  descriptor: "Local devnet",
  logo: "ethereum",
  chainId: 31337,
  hyperlaneDomainId: 31337,
  rpcUrls: ["http://127.0.0.1:8545"],
  nativeCurrency: ETH_NATIVE_CURRENCY,
  testnet: true,
  isHub: false,
  enabled: true,
};
