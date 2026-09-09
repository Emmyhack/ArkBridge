"use client";

import { useMemo } from "react";
import { createPublicClient, http, type PublicClient } from "viem";
import { ArkBridge, type ChainDeployment } from "@arkbridge/sdk";
import type { RouteCatalog } from "@arkbridge/bridge-core";

/**
 * Build an SDK client in the browser.
 *
 * Read clients are constructed from the registry's RPC URLs. The SDK does not
 * choose an RPC itself (spec §77 keeps it free of infrastructure decisions), so
 * the app makes that choice here — and can later swap in the user's own
 * provider without the SDK changing.
 */
export function useArkBridge(
  catalog: RouteCatalog,
  deployments: Record<string, ChainDeployment>,
): ArkBridge {
  return useMemo(() => {
    const clients: Record<string, PublicClient> = {};
    for (const [key, chain] of Object.entries(catalog.chains)) {
      const rpc = chain.rpcUrls[0];
      if (rpc === undefined || !chain.enabled) continue;
      clients[key] = createPublicClient({ transport: http(rpc) });
    }
    return new ArkBridge({ catalog, deployments, clients });
  }, [catalog, deployments]);
}
