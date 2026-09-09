import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Environment, Address } from "@arkbridge/types";
import type { ChainDeployment } from "@arkbridge/sdk";
import { findRepoRoot } from "@arkbridge/config/node";

/**
 * Contract addresses the SDK needs, read from deployment artifacts.
 *
 * Resolved on the server and passed to the client as plain data. The browser
 * cannot read the filesystem, and hard-coding addresses in the bundle would
 * mean editing the frontend every time something is redeployed — the exact
 * failure §120 and §154 warn about.
 */
export async function deploymentsFor(
  environment: Environment,
  chainKeys: readonly string[],
): Promise<Record<string, ChainDeployment>> {
  const root = findRepoRoot();
  const deployments: Record<string, ChainDeployment> = {};

  for (const key of chainKeys) {
    try {
      const raw = await readFile(
        path.join(root, "deployments", environment, `${key}.json`),
        "utf8",
      );
      const artifact = JSON.parse(raw) as { contracts?: Record<string, string> };
      const contracts = artifact.contracts ?? {};
      const mailbox = contracts["mailbox"];
      if (mailbox === undefined) continue;

      deployments[key] = {
        mailbox: mailbox as Address,
        ...(contracts["guard"] === undefined ? {} : { guard: contracts["guard"] as Address }),
        ...(contracts["rateLimiter"] === undefined
          ? {}
          : { rateLimiter: contracts["rateLimiter"] as Address }),
      };
    } catch {
      // No artifact for this chain yet. It stays selectable only if its routes
      // are deployed, and status lookups against it will say so explicitly
      // rather than silently reporting "not delivered".
    }
  }
  return deployments;
}
