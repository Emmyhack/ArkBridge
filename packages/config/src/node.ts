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

/**
 * Locate the workspace root.
 *
 * Normally this walks up from this module until it finds the
 * `pnpm-workspace.yaml`, which is correct for anything running inside a checkout
 * — scripts, tests, `next dev`.
 *
 * It is wrong for a deployed application. A production image contains the built
 * app and the deployment artifacts, not the workspace: there is no
 * `pnpm-workspace.yaml` to find, so the walk would run to `/` and throw. That
 * throw would happen on the first request that needed a contract address, not
 * at startup, so a container would come up healthy and then fail serving the
 * bridge — the worst possible shape for this failure.
 *
 * `ARKBRIDGE_REPO_ROOT` names the directory explicitly for exactly that case.
 * It is checked first and validated, so a typo in the deployment environment
 * fails loudly at the point of misconfiguration rather than resolving to
 * something that happens to exist.
 */
export function findRepoRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
  const configured = process.env["ARKBRIDGE_REPO_ROOT"];
  if (configured !== undefined && configured !== "") {
    const root = resolve(configured);
    if (!existsSync(root)) {
      throw new Error(
        `ARKBRIDGE_REPO_ROOT is set to "${configured}", which does not exist. ` +
          "It must point at a directory containing a `deployments/` directory.",
      );
    }
    return root;
  }

  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `Could not locate the workspace root above "${start}". ` +
          "If this is a deployed application rather than a checkout, set " +
          "ARKBRIDGE_REPO_ROOT to the directory holding `deployments/`.",
      );
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
