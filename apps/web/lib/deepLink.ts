import type { RouteCatalog, RouteSelection } from "@arkbridge/bridge-core";
import { usableRoutes } from "@arkbridge/bridge-core";

/**
 * Deep links (§68, §69).
 *
 * `/bridge?from=sepolia&to=ark-devnet&token=sepolia-mockusdc`
 *
 * This is how another Ark application hands a user to ArkBridge with the route
 * already chosen — ArkSwap noticing "no USDC on Ark" and linking straight to
 * the transfer that fixes it, rather than dropping the user on a blank form.
 *
 * Every parameter is validated against the registry. A link is untrusted input:
 * an unknown chain, a disabled asset, or a pair with no route resolves to
 * `undefined` and the caller falls back to its default, rather than putting the
 * form into a state that cannot be submitted.
 */
export function selectionFromParams(
  catalog: RouteCatalog,
  params: URLSearchParams,
): RouteSelection | undefined {
  const from = params.get("from");
  const to = params.get("to");
  // `inputToken` accepted as an alias: §68 shows both spellings, and a link
  // that silently does nothing is worse than accepting either.
  const token = params.get("token") ?? params.get("inputToken");

  if (from === null || to === null || token === null) return undefined;

  const candidate: RouteSelection = {
    sourceChain: from,
    destinationChain: to,
    tokenId: token,
  };

  const usable = usableRoutes(catalog).some(
    (route) =>
      route.sourceChain === candidate.sourceChain &&
      route.destinationChain === candidate.destinationChain &&
      route.tokenId === candidate.tokenId,
  );

  return usable ? candidate : undefined;
}

/** Build a deep link for a selection, for other Ark apps to link to. */
export function paramsFromSelection(selection: RouteSelection): string {
  return new URLSearchParams({
    from: selection.sourceChain,
    to: selection.destinationChain,
    token: selection.tokenId,
  }).toString();
}
