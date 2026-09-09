import "server-only";
import type { RouteCatalog } from "@arkbridge/bridge-core";
import type { Environment } from "@arkbridge/types";
import { loadRegistries, findRepoRoot } from "@arkbridge/config/node";

/**
 * Build the catalog the bridge UI renders from.
 *
 * Hydrated from deployment artifacts, not read straight from the registries.
 * The static registries carry zero addresses until a deployment fills them in,
 * so a catalog built from them reports every route as unusable and the UI shows
 * an empty state on a working bridge. That is exactly what happened on the
 * first build of this page.
 *
 * `server-only`: this touches the filesystem, so importing it from a client
 * component must fail at build time rather than at runtime in a browser.
 * Addresses are resolved on the server and passed down as props.
 */
export async function catalogFor(environment: Environment): Promise<RouteCatalog> {
  const { chains, tokens } = await loadRegistries(environment, findRepoRoot());
  return {
    environment,
    chains: chains.chains,
    tokens: tokens.tokens,
    routes: tokens.routes,
  };
}
