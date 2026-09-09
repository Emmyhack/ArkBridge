import type { BridgeRoute, BridgeToken, Environment } from "@arkbridge/types";
import type { TokenRegistry } from "./types.js";
import { isRouteDeployed, isTokenDeployed, routeId } from "./types.js";
import {
  localTokenRegistry,
  mainnetTokenRegistry,
  stagingTokenRegistry,
  testnetTokenRegistry,
} from "./environments/index.js";

export * from "./types.js";
export * from "./tokens/index.js";
export * from "./routes/index.js";
export * from "./environments/index.js";

const REGISTRIES: Readonly<Record<Environment, TokenRegistry>> = {
  local: localTokenRegistry,
  testnet: testnetTokenRegistry,
  staging: stagingTokenRegistry,
  mainnet: mainnetTokenRegistry,
};

export function getTokenRegistry(environment: Environment): TokenRegistry {
  return REGISTRIES[environment];
}

export function getAllTokens(environment: Environment): readonly BridgeToken[] {
  return Object.values(getTokenRegistry(environment).tokens);
}

export function getToken(environment: Environment, id: string): BridgeToken | undefined {
  return getTokenRegistry(environment).tokens[id];
}

export function getAllRoutes(environment: Environment): readonly BridgeRoute[] {
  return Object.values(getTokenRegistry(environment).routes);
}

export function getRoute(environment: Environment, id: string): BridgeRoute | undefined {
  return getTokenRegistry(environment).routes[id];
}

/**
 * Routes eligible to be offered: enabled, deployed, and carrying an asset that
 * is itself enabled and deployed. Chain and token selectors derive their
 * options from this, so a chain pair that carries no available route is never
 * presented as a choice.
 */
export function getAvailableRoutes(environment: Environment): readonly BridgeRoute[] {
  const registry = getTokenRegistry(environment);
  return Object.values(registry.routes).filter((route) => {
    if (!route.enabled || !isRouteDeployed(route)) return false;
    const token = registry.tokens[route.tokenId];
    return token !== undefined && token.enabled && isTokenDeployed(token);
  });
}

export function findRoute(
  environment: Environment,
  sourceChain: string,
  destinationChain: string,
  token: string,
): BridgeRoute | undefined {
  return getRoute(environment, routeId(sourceChain, destinationChain, token));
}

/** Source chains that have at least one available route. */
export function getAvailableSourceChains(environment: Environment): readonly string[] {
  return [...new Set(getAvailableRoutes(environment).map((route) => route.sourceChain))];
}

/** Destination chains reachable from `sourceChain`. */
export function getAvailableDestinationChains(
  environment: Environment,
  sourceChain: string,
): readonly string[] {
  return [
    ...new Set(
      getAvailableRoutes(environment)
        .filter((route) => route.sourceChain === sourceChain)
        .map((route) => route.destinationChain),
    ),
  ];
}

/** Assets that can actually move from `sourceChain` to `destinationChain`. */
export function getAvailableTokens(
  environment: Environment,
  sourceChain: string,
  destinationChain: string,
): readonly BridgeToken[] {
  const registry = getTokenRegistry(environment);
  return getAvailableRoutes(environment)
    .filter(
      (route) => route.sourceChain === sourceChain && route.destinationChain === destinationChain,
    )
    .flatMap((route) => {
      const token = registry.tokens[route.tokenId];
      return token === undefined ? [] : [token];
    });
}

/**
 * The reverse of a route, if one exists.
 *
 * The direction switcher uses this: flipping `ethereum -> ark` yields
 * `ark -> ethereum` and nothing else. It can never produce a chain pair that
 * has no route, because the reverse is looked up rather than constructed.
 */
export function getReverseRoute(
  environment: Environment,
  route: BridgeRoute,
): BridgeRoute | undefined {
  return findRoute(environment, route.destinationChain, route.sourceChain, route.tokenId);
}
