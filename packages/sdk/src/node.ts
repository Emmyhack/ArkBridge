import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, http } from "viem";
import type { PublicClient } from "viem";
import type { Environment } from "@arkbridge/types";
import { loadRegistries, findRepoRoot } from "@arkbridge/config/node";
import { ArkBridge } from "./client.js";
import type { ArkBridgeConfig, ChainDeployment } from "./types.js";

/**
 * Node-only convenience: build a client from the repo's deployment artifacts.
 *
 * Deliberately a separate entrypoint. The browser bundle must not reach for the
 * filesystem, so this cannot live in `index.ts` — an app imports `@arkbridge/sdk`
 * and supplies its own clients; scripts and tests import `@arkbridge/sdk/node`.
 */
export async function createArkBridgeFromArtifacts(
  environment: Environment,
  repoRoot: string = findRepoRoot(),
): Promise<ArkBridge> {
  const { chains, tokens } = await loadRegistries(environment, repoRoot);

  const clients: Record<string, PublicClient> = {};
  const deployments: Record<string, ChainDeployment> = {};

  for (const [key, chain] of Object.entries(chains.chains)) {
    const rpc = chain.rpcUrls[0];
    if (rpc === undefined || !chain.enabled) continue;
    clients[key] = createPublicClient({ transport: http(rpc) });

    try {
      const raw = await readFile(
        path.join(repoRoot, "deployments", environment, `${key}.json`),
        "utf8",
      );
      const artifact = JSON.parse(raw) as { contracts?: Record<string, string> };
      const contracts = artifact.contracts ?? {};
      const mailbox = contracts["mailbox"];
      if (mailbox === undefined) continue;
      deployments[key] = {
        mailbox: mailbox as ChainDeployment["mailbox"],
        ...(contracts["guard"] === undefined
          ? {}
          : { guard: contracts["guard"] as ChainDeployment["mailbox"] }),
        ...(contracts["rateLimiter"] === undefined
          ? {}
          : { rateLimiter: contracts["rateLimiter"] as ChainDeployment["mailbox"] }),
      };
    } catch {
      // No artifact for this chain yet. It stays in the catalog but has no
      // Mailbox, so status lookups against it will say so explicitly rather
      // than silently returning "not delivered".
    }
  }

  const config: ArkBridgeConfig = {
    catalog: {
      environment,
      chains: chains.chains,
      tokens: tokens.tokens,
      routes: tokens.routes,
    },
    deployments,
    clients,
  };
  return new ArkBridge(config);
}
