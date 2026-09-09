"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import type { RouteCatalog } from "@arkbridge/bridge-core";

const WEI_PER_GWEI = 1e9;

/** The current source-chain base fee used by the optional fee watch. */
export function useBaseFee(catalog: RouteCatalog, chainKey: string) {
  const rpc = catalog.chains[chainKey]?.rpcUrls[0];
  const query = useQuery({
    queryKey: ["base-fee", chainKey, rpc],
    enabled: rpc !== undefined,
    refetchInterval: 12_000,
    staleTime: 10_000,
    retry: 1,
    queryFn: async () => {
      if (rpc === undefined) throw new Error("No RPC configured");
      const block = await createPublicClient({ transport: http(rpc) }).getBlock();
      if (block.baseFeePerGas === null) throw new Error("Base fee unavailable");
      return Number(block.baseFeePerGas) / WEI_PER_GWEI;
    },
  });

  return {
    current: query.data,
    loading: query.isPending || query.isFetching,
    unavailable: query.isError || rpc === undefined,
  };
}
