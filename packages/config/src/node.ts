import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Environment } from "@arkbridge/types";
import { getChainRegistry } from "@arkbridge/chain-registry";
import { getTokenRegistry } from "@arkbridge/token-registry";
import type { DeploymentArtifact } from "./artifacts.js";
import { parseDeploymentArtifact } from "./artifacts.js";
import type { HydratedRegistries } from "./hydrate.js";
import { hydrateRegistries } from "./hydrate.js";

/** Walk up from this module to the workspace root (the pnpm-workspace.yaml). */
export function findRepoRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`Could not locate the workspace root above "${start}".`);
    }
    current = parent;
  }
}

export function deploymentsDir(environment: Environment, repoRoot = findRepoRoot()): string {
  return join(repoRoot, "deployments", environment);
}

/**
 * Read every deployment artifact for an environment.
 *
 * A missing directory is not an error: before the first deployment there is
 * simply nothing to read, and the registries stay at their zero-address state.
 */
export async function loadDeploymentArtifacts(
  environment: Environment,
  repoRoot = findRepoRoot(),
): Promise<DeploymentArtifact[]> {
  const dir = deploymentsDir(environment, repoRoot);
  if (!existsSync(dir)) return [];

  const files = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();

  const artifacts: DeploymentArtifact[] = [];
  for (const file of files) {
    const path = join(dir, file);
    const raw = await readFile(path, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new Error(`${path}: not valid JSON.`, { cause });
    }
    artifacts.push(parseDeploymentArtifact(parsed, path));
  }
  return artifacts;
}

/** Static registries for an environment with deployment addresses folded in. */
export async function loadRegistries(
  environment: Environment,
  repoRoot = findRepoRoot(),
): Promise<HydratedRegistries> {
  const artifacts = await loadDeploymentArtifacts(environment, repoRoot);
  return hydrateRegistries(getChainRegistry(environment), getTokenRegistry(environment), artifacts);
}
