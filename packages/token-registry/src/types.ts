import type { BridgeRoute, BridgeToken, Environment, TokenRepresentation } from "@arkbridge/types";
import { ZERO_ADDRESS } from "@arkbridge/types";

export type { BridgeToken, BridgeRoute, TokenRepresentation, RouteLimits } from "@arkbridge/types";

export interface TokenRegistry {
  readonly environment: Environment;
  readonly tokens: Readonly<Record<string, BridgeToken>>;
  readonly routes: Readonly<Record<string, BridgeRoute>>;
}

/** Build the conventional token id. Ticker alone is never an identity. */
export function tokenId(canonicalChain: string, symbol: string): string {
  return `${canonicalChain}-${symbol.toLowerCase()}`;
}

/** Build the conventional directed route id. */
export function routeId(sourceChain: string, destinationChain: string, token: string): string {
  return `${sourceChain}:${destinationChain}:${token}`;
}

/** A representation is deployed once it has a non-zero address and a router. */
export function isRepresentationDeployed(representation: TokenRepresentation): boolean {
  return (
    representation.address !== ZERO_ADDRESS &&
    representation.router !== undefined &&
    representation.router !== ZERO_ADDRESS
  );
}

/** A token is deployed once its canonical form and every representation exist. */
export function isTokenDeployed(token: BridgeToken): boolean {
  const representations = Object.values(token.representations);
  return (
    token.canonicalAddress !== ZERO_ADDRESS &&
    representations.length > 0 &&
    representations.every(isRepresentationDeployed)
  );
}

/** A route is deployed once both of its warp routers are known. */
export function isRouteDeployed(route: BridgeRoute): boolean {
  return route.sourceRouter !== ZERO_ADDRESS && route.destinationRouter !== ZERO_ADDRESS;
}
