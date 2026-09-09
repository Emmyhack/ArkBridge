import type {
  BridgeRoute,
  BridgeToken,
  ChainConfig,
  Environment,
  TokenRepresentation,
} from "@arkbridge/types";
import { BridgeError, ZERO_ADDRESS } from "@arkbridge/types";

/**
 * Route selection and validation.
 *
 * Everything here operates on a `RouteCatalog` handed in by the caller rather
 * than on an imported global. That matters for two reasons:
 *
 *   - The static registries carry zero addresses until deployment artifacts are
 *     hydrated in. A function that imported them directly would report every
 *     route as unavailable, which is exactly the bug this shape prevents.
 *   - It keeps this package pure: no filesystem, no network, no environment.
 *     The SDK supplies hydrated data; tests supply fixtures.
 *
 * Nothing here branches on a chain name. Adding Base required no edit to this
 * file, which is the property spec §82 and §154 ask for.
 */
export interface RouteCatalog {
  readonly environment: Environment;
  readonly chains: Readonly<Record<string, ChainConfig>>;
  readonly tokens: Readonly<Record<string, BridgeToken>>;
  readonly routes: Readonly<Record<string, BridgeRoute>>;
}

export interface RouteSelection {
  readonly sourceChain: string;
  readonly destinationChain: string;
  readonly tokenId: string;
}

function representationDeployed(representation: TokenRepresentation | undefined): boolean {
  return (
    representation !== undefined &&
    representation.address !== ZERO_ADDRESS &&
    representation.router !== undefined &&
    representation.router !== ZERO_ADDRESS
  );
}

/** A route is usable only if it is enabled, deployed, and its asset likewise. */
export function isRouteUsable(catalog: RouteCatalog, route: BridgeRoute): boolean {
  if (!route.enabled) return false;
  if (route.sourceRouter === ZERO_ADDRESS || route.destinationRouter === ZERO_ADDRESS) return false;

  const token = catalog.tokens[route.tokenId];
  if (token === undefined || !token.enabled) return false;
  if (!representationDeployed(token.representations[route.sourceChain])) return false;
  if (!representationDeployed(token.representations[route.destinationChain])) return false;

  for (const key of [route.sourceChain, route.destinationChain]) {
    const chain = catalog.chains[key];
    if (chain === undefined || !chain.enabled) return false;
  }
  return true;
}

export function usableRoutes(catalog: RouteCatalog): readonly BridgeRoute[] {
  return Object.values(catalog.routes).filter((route) => isRouteUsable(catalog, route));
}

export function selectableSourceChains(catalog: RouteCatalog): readonly ChainConfig[] {
  const keys = new Set(usableRoutes(catalog).map((route) => route.sourceChain));
  return [...keys].flatMap((key) => {
    const chain = catalog.chains[key];
    return chain === undefined ? [] : [chain];
  });
}

/**
 * Destinations reachable from a source.
 *
 * Built from actual routes rather than "every chain except the source", so an
 * unsupported pair is never offered and then rejected — spec §25 asks the
 * selector to prevent invalid combinations, not to explain them afterwards.
 */
export function selectableDestinationChains(
  catalog: RouteCatalog,
  sourceChain: string,
): readonly ChainConfig[] {
  const keys = new Set(
    usableRoutes(catalog)
      .filter((route) => route.sourceChain === sourceChain)
      .map((route) => route.destinationChain),
  );
  return [...keys].flatMap((key) => {
    const chain = catalog.chains[key];
    return chain === undefined ? [] : [chain];
  });
}

export function selectableTokens(
  catalog: RouteCatalog,
  sourceChain: string,
  destinationChain: string,
): readonly BridgeToken[] {
  return usableRoutes(catalog)
    .filter(
      (route) => route.sourceChain === sourceChain && route.destinationChain === destinationChain,
    )
    .flatMap((route) => {
      const token = catalog.tokens[route.tokenId];
      return token === undefined ? [] : [token];
    });
}

export function routeIdOf(selection: RouteSelection): string {
  return `${selection.sourceChain}:${selection.destinationChain}:${selection.tokenId}`;
}

/**
 * Flip a selection.
 *
 * The reverse is looked up, never constructed. That is what stops the switcher
 * producing a pair ArkBridge does not serve: if no reverse route exists the
 * caller gets `undefined` rather than a broken selection.
 */
export function flipSelection(
  catalog: RouteCatalog,
  selection: RouteSelection,
): RouteSelection | undefined {
  if (catalog.routes[routeIdOf(selection)] === undefined) return undefined;

  const reversed: RouteSelection = {
    sourceChain: selection.destinationChain,
    destinationChain: selection.sourceChain,
    tokenId: selection.tokenId,
  };
  return catalog.routes[routeIdOf(reversed)] === undefined ? undefined : reversed;
}

/**
 * Resolve a selection to a usable route, or throw the specific reason.
 *
 * Order matters for the message a user sees: an unknown chain must not be
 * reported as an unsupported route, and an unsupported route must not be
 * reported as a paused one.
 */
export function resolveRoute(catalog: RouteCatalog, selection: RouteSelection): BridgeRoute {
  const { sourceChain, destinationChain, tokenId } = selection;

  for (const key of [sourceChain, destinationChain]) {
    const chain = catalog.chains[key];
    if (chain === undefined || !chain.enabled) {
      throw new BridgeError("UNSUPPORTED_CHAIN", `Chain "${key}" is not available.`, {
        chain: key,
      });
    }
  }

  const token = catalog.tokens[tokenId];
  if (token === undefined || !token.enabled) {
    throw new BridgeError("UNSUPPORTED_TOKEN", `Asset "${tokenId}" is not available.`, { tokenId });
  }

  const route = catalog.routes[routeIdOf(selection)];
  if (route === undefined) {
    throw new BridgeError(
      "UNSUPPORTED_ROUTE",
      `ArkBridge does not bridge ${tokenId} from ${sourceChain} to ${destinationChain}.`,
      { routeId: routeIdOf(selection) },
    );
  }

  if (!isRouteUsable(catalog, route)) {
    throw new BridgeError("ROUTE_PAUSED", `Route ${route.id} is not currently available.`, {
      routeId: route.id,
    });
  }

  return route;
}

/** Validate an amount against balance and route capacity, in that order. */
export function validateAmount(params: {
  readonly route: BridgeRoute;
  readonly amount: bigint;
  readonly balance: bigint;
  readonly capacity?: bigint;
}): void {
  const { route, amount, balance, capacity } = params;

  if (amount <= 0n) {
    throw new BridgeError("INSUFFICIENT_BALANCE", "Enter an amount greater than zero.", {
      routeId: route.id,
    });
  }
  if (amount > balance) {
    throw new BridgeError("INSUFFICIENT_BALANCE", "Amount exceeds your balance.", {
      routeId: route.id,
    });
  }
  // Checked before submission on purpose — spec §88: a user must not reach
  // wallet confirmation on a transfer the route is going to reject.
  if (capacity !== undefined && amount > capacity) {
    throw new BridgeError("LIMIT_EXCEEDED", "This transfer exceeds the current route limit.", {
      routeId: route.id,
      maxAvailable: capacity,
    });
  }
}

/** Throw unless the connected wallet is on the chain the transfer sends from. */
export function assertCorrectNetwork(
  catalog: RouteCatalog,
  sourceChain: string,
  connectedChainId: number | undefined,
): void {
  const chain = catalog.chains[sourceChain];
  if (chain === undefined) {
    throw new BridgeError("UNSUPPORTED_CHAIN", `Chain "${sourceChain}" is not available.`, {
      chain: sourceChain,
    });
  }
  if (connectedChainId !== chain.chainId) {
    throw new BridgeError("WRONG_NETWORK", `Switch your wallet to ${chain.name}.`, {
      requiredChain: sourceChain,
    });
  }
}
