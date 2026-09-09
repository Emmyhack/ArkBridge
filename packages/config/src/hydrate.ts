import type { BridgeRoute, BridgeToken, ChainConfig, TokenRepresentation } from "@arkbridge/types";
import { UNCONFIGURED, ZERO_ADDRESS } from "@arkbridge/types";
import type { ChainRegistry } from "@arkbridge/chain-registry";
import type { TokenRegistry } from "@arkbridge/token-registry";
import { routeId } from "@arkbridge/token-registry";
import type { DeploymentArtifact } from "./artifacts.js";

export interface HydratedRegistries {
  readonly chains: ChainRegistry;
  readonly tokens: TokenRegistry;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Fold deployment artifacts into the static registries.
 *
 * Rules:
 *
 *  - An `UNCONFIGURED` chain id or domain id is adopted from the artifact.
 *  - A configured value that disagrees with the artifact is a hard error. A
 *    silent overwrite here would repoint a live route at a different chain.
 *  - A token or router address already set to something other than the zero
 *    sentinel and disagreeing with the artifact is likewise a hard error:
 *    canonical mappings are never silently replaced (INV-14).
 *
 * Hydration only fills in addresses. It never enables anything — `enabled`
 * comes from the reviewed registry, and availability additionally requires
 * deployment, so a fresh deployment does not switch a route on by itself.
 */
export function hydrateRegistries(
  chains: ChainRegistry,
  tokens: TokenRegistry,
  artifacts: readonly DeploymentArtifact[],
): HydratedRegistries {
  const byChain = new Map<string, DeploymentArtifact>();
  for (const artifact of artifacts) {
    if (artifact.environment !== chains.environment) {
      throw new Error(
        `Deployment artifact for chain "${artifact.chain}" is for environment ` +
          `"${artifact.environment}" but the registry is "${chains.environment}".`,
      );
    }
    if (byChain.has(artifact.chain)) {
      throw new Error(`Duplicate deployment artifact for chain "${artifact.chain}".`);
    }
    byChain.set(artifact.chain, artifact);
  }

  const hydratedChains: Record<string, ChainConfig> = {};
  for (const [key, chain] of Object.entries(chains.chains)) {
    const artifact = byChain.get(key);
    if (artifact === undefined) {
      hydratedChains[key] = chain;
      continue;
    }
    if (chain.chainId !== UNCONFIGURED && chain.chainId !== artifact.chainId) {
      throw new Error(
        `Chain "${key}": registry chainId ${String(chain.chainId)} disagrees with deployment ` +
          `artifact chainId ${String(artifact.chainId)}. Resolve this before proceeding.`,
      );
    }
    if (
      chain.hyperlaneDomainId !== UNCONFIGURED &&
      chain.hyperlaneDomainId !== artifact.hyperlaneDomainId
    ) {
      throw new Error(
        `Chain "${key}": registry hyperlaneDomainId ${String(chain.hyperlaneDomainId)} disagrees ` +
          `with deployment artifact ${String(artifact.hyperlaneDomainId)}. Resolve this before proceeding.`,
      );
    }
    hydratedChains[key] = {
      ...chain,
      chainId: artifact.chainId,
      hyperlaneDomainId: artifact.hyperlaneDomainId,
    };
  }

  const hydratedTokens: Record<string, BridgeToken> = {};
  for (const [id, token] of Object.entries(tokens.tokens)) {
    const representations: Record<string, TokenRepresentation> = {};
    for (const [chainKey, representation] of Object.entries(token.representations)) {
      const deployed = byChain.get(chainKey)?.tokens?.[id];
      if (deployed === undefined) {
        representations[chainKey] = representation;
        continue;
      }
      if (
        representation.address !== ZERO_ADDRESS &&
        !sameAddress(representation.address, deployed.token)
      ) {
        throw new Error(
          `Token "${id}" on "${chainKey}": registry address ${representation.address} disagrees ` +
            `with deployment artifact ${deployed.token}. Canonical mappings are not replaced silently.`,
        );
      }
      if (
        representation.router !== undefined &&
        representation.router !== ZERO_ADDRESS &&
        !sameAddress(representation.router, deployed.router)
      ) {
        throw new Error(
          `Token "${id}" on "${chainKey}": registry router ${representation.router} disagrees ` +
            `with deployment artifact ${deployed.router}.`,
        );
      }
      representations[chainKey] = {
        ...representation,
        address: deployed.token,
        router: deployed.router,
      };
    }

    const canonical = representations[token.canonicalChain];
    hydratedTokens[id] = {
      ...token,
      canonicalAddress: canonical?.address ?? token.canonicalAddress,
      representations,
    };
  }

  const hydratedRoutes: Record<string, BridgeRoute> = {};
  for (const [id, route] of Object.entries(tokens.routes)) {
    const source = hydratedTokens[route.tokenId]?.representations[route.sourceChain];
    const destination = hydratedTokens[route.tokenId]?.representations[route.destinationChain];
    hydratedRoutes[id] = {
      ...route,
      sourceRouter: source?.router ?? route.sourceRouter,
      destinationRouter: destination?.router ?? route.destinationRouter,
    };
    if (id !== routeId(route.sourceChain, route.destinationChain, route.tokenId)) {
      throw new Error(
        `Route "${id}" does not match its own source/destination/token. Registry ids are derived, not written by hand.`,
      );
    }
  }

  return {
    chains: { ...chains, chains: hydratedChains },
    tokens: { ...tokens, tokens: hydratedTokens, routes: hydratedRoutes },
  };
}
