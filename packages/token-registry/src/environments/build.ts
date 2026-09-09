import type { BridgeRoute, BridgeToken, Environment } from "@arkbridge/types";
import { getChain } from "@arkbridge/chain-registry";
import type { TokenRegistry } from "../types.js";
import { defineHubRoutePair, testLimits } from "../routes/index.js";
import { defineMockTokens } from "../tokens/index.js";

function index<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of items) {
    if (out[item.id] !== undefined) {
      throw new Error(`Duplicate registry id "${item.id}".`);
    }
    out[item.id] = item;
  }
  return out;
}

export interface MockRegistryOptions {
  readonly environment: Environment;
  readonly hubChain: string;
  /** External chains, each contributing its own distinct set of mock assets. */
  readonly externalChains: readonly string[];
  readonly enabledSymbols?: readonly string[];
  /**
   * External chains whose assets stay disabled regardless of `enabledSymbols`,
   * with the reason recorded. Use this when a chain is reachable but its
   * inbound security is not yet acceptable — a route that exists and is
   * deployed must not become selectable just because the hub was enabled.
   */
  readonly gatedChains?: Readonly<Record<string, string>>;
}

/**
 * Compose a test-environment registry: mock assets on every external chain,
 * each paired with a synthetic on the hub, plus the two directed routes that
 * carry it.
 */
export function buildMockRegistry(options: MockRegistryOptions): TokenRegistry {
  const enabledSymbols = options.enabledSymbols ?? ["MockUSDC"];

  const tokens: BridgeToken[] = [];
  const routes: BridgeRoute[] = [];

  // A route can be no more enabled than the chains at its ends. Ark's devnet
  // and mainnet entries stay disabled until their chain id and Hyperlane domain
  // id are confirmed, and every route touching them is disabled with them —
  // rather than being enabled against a chain that cannot yet be resolved.
  const hubEnabled = getChain(options.environment, options.hubChain)?.enabled ?? false;

  for (const externalChain of options.externalChains) {
    const externalEnabled = getChain(options.environment, externalChain)?.enabled ?? false;
    const gateReason = options.gatedChains?.[externalChain];
    const chainsEnabled = hubEnabled && externalEnabled && gateReason === undefined;

    for (const token of defineMockTokens(
      externalChain,
      options.hubChain,
      gateReason === undefined ? enabledSymbols : [],
    )) {
      tokens.push(token);
      routes.push(
        ...defineHubRoutePair({
          token,
          externalChain,
          hubChain: options.hubChain,
          inboundLimits: testLimits(token.decimals),
          outboundLimits: testLimits(token.decimals),
          // A route is only eligible once its asset and both of its chains
          // are; deployment state gates it further at selection time.
          enabled: token.enabled && chainsEnabled,
        }),
      );
    }
  }

  return {
    environment: options.environment,
    tokens: index(tokens),
    routes: index(routes),
  };
}
