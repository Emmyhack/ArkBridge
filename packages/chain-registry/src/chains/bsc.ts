import type { ChainConfig } from "@arkbridge/types";

/** BNB Smart Chain. Domain ids are cross-checked by `pnpm validate:registry`. */

const BNB_NATIVE_CURRENCY = {
  name: "BNB",
  symbol: "BNB",
  decimals: 18,
} as const;

export const bscMainnet: ChainConfig = {
  key: "bsc",
  name: "BNB Smart Chain",
  logo: "bnb",
  chainId: 56,
  hyperlaneDomainId: 56,
  rpcUrls: ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"],
  explorerUrl: "https://bscscan.com",
  nativeCurrency: BNB_NATIVE_CURRENCY,
  testnet: false,
  isHub: false,
  enabled: false,
};

export const bscTestnet: ChainConfig = {
  key: "bsc-testnet",
  name: "BNB Smart Chain",
  descriptor: "Testnet",
  logo: "bnb",
  chainId: 97,
  hyperlaneDomainId: 97,
  rpcUrls: [
    "https://bsc-testnet-rpc.publicnode.com",
    "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  ],
  explorerUrl: "https://testnet.bscscan.com",
  nativeCurrency: BNB_NATIVE_CURRENCY,
  testnet: true,
  isHub: false,
  enabled: true,
};
