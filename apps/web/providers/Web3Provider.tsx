"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
// Imported from @wagmi/core rather than the `wagmi/connectors` barrel: that
// barrel pulls in the Coinbase and Base account SDKs, whose optional
// dependencies do not resolve and break the build. Only the injected connector
// is needed here.
import { injected } from "@wagmi/core";
import { defineChain } from "viem";
import type { ChainConfig } from "@arkbridge/types";

/**
 * Wallet and data-fetching providers.
 *
 * Chains are derived from the registry rather than imported from wagmi/chains
 * (§82, §120). Ark is not in any upstream chain list, and hard-coding the
 * others would mean editing this file every time a chain is added — the exact
 * failure mode §154 names.
 */
export function Web3Provider({
  chains,
  children,
}: {
  readonly chains: readonly ChainConfig[];
  readonly children: ReactNode;
}) {
  const [config] = useState(() => {
    const viemChains = chains.map((chain) =>
      defineChain({
        id: chain.chainId,
        name: chain.descriptor === undefined ? chain.name : `${chain.name} ${chain.descriptor}`,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: { default: { http: [...chain.rpcUrls] } },
        ...(chain.explorerUrl === undefined
          ? {}
          : { blockExplorers: { default: { name: "Explorer", url: chain.explorerUrl } } }),
        testnet: chain.testnet,
      }),
    );

    const first = viemChains[0];
    if (first === undefined) throw new Error("No enabled chains to configure.");

    return createConfig({
      chains: [first, ...viemChains.slice(1)],
      // Injected only for now. WalletConnect is added the same way and needs a
      // project id; the app must not be coupled to one wallet vendor (§29).
      connectors: [injected()],
      transports: Object.fromEntries(viemChains.map((chain) => [chain.id, http()])),
      ssr: true,
    });
  });

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain reads are not free and the UI must not poll every chain
            // every second (§119). Balances and quotes go stale after 15s;
            // status polling sets its own interval where it needs to.
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
