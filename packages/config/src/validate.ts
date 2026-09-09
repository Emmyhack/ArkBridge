import type { Environment } from "@arkbridge/types";
import { UNCONFIGURED, ZERO_ADDRESS, isProductionEnvironment } from "@arkbridge/types";
import type { ChainRegistry } from "@arkbridge/chain-registry";
import { isChainConfigured } from "@arkbridge/chain-registry";
import type { TokenRegistry } from "@arkbridge/token-registry";
import { isRouteDeployed, isTokenDeployed, routeId, tokenId } from "@arkbridge/token-registry";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  readonly severity: IssueSeverity;
  /** Stable code so CI output can be grepped and issues suppressed deliberately. */
  readonly code: string;
  readonly subject: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly environment: Environment;
  readonly issues: readonly ValidationIssue[];
  readonly ok: boolean;
}

class IssueCollector {
  readonly issues: ValidationIssue[] = [];

  error(code: string, subject: string, message: string): void {
    this.issues.push({ severity: "error", code, subject, message });
  }

  warn(code: string, subject: string, message: string): void {
    this.issues.push({ severity: "warning", code, subject, message });
  }
}

function validateChains(chains: ChainRegistry, issues: IssueCollector): void {
  const entries = Object.entries(chains.chains);

  if (chains.chains[chains.hubChainKey] === undefined) {
    issues.error(
      "CHAIN_HUB_MISSING",
      chains.hubChainKey,
      `Registry names hub "${chains.hubChainKey}" but does not define it.`,
    );
  }

  const hubs = entries.filter(([, chain]) => chain.isHub);
  if (hubs.length !== 1) {
    issues.error(
      "CHAIN_HUB_COUNT",
      chains.environment,
      `Expected exactly one hub chain, found ${String(hubs.length)}: ${hubs.map(([key]) => key).join(", ")}.`,
    );
  } else if (hubs[0] !== undefined && hubs[0][0] !== chains.hubChainKey) {
    issues.error(
      "CHAIN_HUB_MISMATCH",
      hubs[0][0],
      `Chain is marked isHub but the registry hub key is "${chains.hubChainKey}".`,
    );
  }

  const seenChainIds = new Map<number, string>();
  const seenDomainIds = new Map<number, string>();

  for (const [key, chain] of entries) {
    if (key !== chain.key) {
      issues.error(
        "CHAIN_KEY_MISMATCH",
        key,
        `Registry key does not match chain.key "${chain.key}".`,
      );
    }

    // A chain may exist unconfigured for documentation, but must never be
    // enabled in that state — an enabled chain with an UNCONFIGURED domain id
    // would let the UI offer a route that cannot resolve its own origin.
    if (chain.enabled && !isChainConfigured(chain)) {
      issues.error(
        "CHAIN_ENABLED_UNCONFIGURED",
        key,
        `Chain is enabled but not fully configured (chainId=${String(chain.chainId)}, ` +
          `hyperlaneDomainId=${String(chain.hyperlaneDomainId)}, rpcUrls=${String(chain.rpcUrls.length)}).`,
      );
    }

    if (chain.chainId !== UNCONFIGURED) {
      const existing = seenChainIds.get(chain.chainId);
      if (existing !== undefined) {
        issues.error(
          "CHAIN_ID_DUPLICATE",
          key,
          `EVM chain id ${String(chain.chainId)} is already used by "${existing}".`,
        );
      }
      seenChainIds.set(chain.chainId, key);
    }

    if (chain.hyperlaneDomainId !== UNCONFIGURED) {
      const existing = seenDomainIds.get(chain.hyperlaneDomainId);
      if (existing !== undefined) {
        issues.error(
          "DOMAIN_ID_DUPLICATE",
          key,
          `Hyperlane domain id ${String(chain.hyperlaneDomainId)} is already used by "${existing}". ` +
            `Origin domains must resolve to exactly one chain.`,
        );
      }
      seenDomainIds.set(chain.hyperlaneDomainId, key);
    }

    if (chain.nativeCurrency.decimals !== 18) {
      issues.warn(
        "CHAIN_NATIVE_DECIMALS",
        key,
        `Native currency has ${String(chain.nativeCurrency.decimals)} decimals, not 18. ` +
          `Confirm interchain gas quoting handles this.`,
      );
    }

    if (isProductionEnvironment(chains.environment)) {
      if (chain.testnet) {
        issues.error(
          "CHAIN_PROD_TESTNET",
          key,
          `Testnet chain present in the production registry.`,
        );
      }
    }

    // Production requirements that only bind once the chain is actually live.
    // A placeholder entry for a chain that has not launched is legitimate;
    // enabling one is caught by CHAIN_ENABLED_UNCONFIGURED above.
    if (isProductionEnvironment(chains.environment) && chain.enabled) {
      if (!isChainConfigured(chain)) {
        issues.error("CHAIN_PROD_UNCONFIGURED", key, `Production chain is not fully configured.`);
      }
      if (chain.explorerUrl === undefined) {
        issues.error(
          "CHAIN_PROD_NO_EXPLORER",
          key,
          `Production chain has no explorer URL; users cannot verify their own transfers.`,
        );
      }
      for (const url of chain.rpcUrls) {
        if (url.startsWith("http://")) {
          issues.error("CHAIN_PROD_INSECURE_RPC", key, `Production RPC URL is plaintext: ${url}`);
        }
      }
    }
  }
}

function validateTokens(
  chains: ChainRegistry,
  tokens: TokenRegistry,
  issues: IssueCollector,
): void {
  for (const [id, token] of Object.entries(tokens.tokens)) {
    if (id !== token.id) {
      issues.error("TOKEN_KEY_MISMATCH", id, `Registry key does not match token.id "${token.id}".`);
    }

    const expectedId = tokenId(token.canonicalChain, token.symbol);
    if (token.id !== expectedId) {
      issues.error(
        "TOKEN_ID_CONVENTION",
        id,
        `Token id should be "${expectedId}" (canonical chain + symbol). An id that does not ` +
          `name its origin invites two different assets being treated as one.`,
      );
    }

    if (chains.chains[token.canonicalChain] === undefined) {
      issues.error(
        "TOKEN_CANONICAL_CHAIN_UNKNOWN",
        id,
        `Canonical chain "${token.canonicalChain}" is not in the chain registry.`,
      );
    }

    const canonical = token.representations[token.canonicalChain];
    if (canonical === undefined) {
      issues.error(
        "TOKEN_NO_CANONICAL_REPRESENTATION",
        id,
        `No representation on canonical chain "${token.canonicalChain}".`,
      );
    } else if (canonical.type === "synthetic") {
      issues.error(
        "TOKEN_CANONICAL_IS_SYNTHETIC",
        id,
        `Representation on the canonical chain is marked synthetic. The origin holds the ` +
          `canonical or collateral form by definition.`,
      );
    }

    const backing = Object.entries(token.representations).filter(
      ([, representation]) => representation.type !== "synthetic",
    );
    if (backing.length > 1) {
      issues.error(
        "TOKEN_MULTIPLE_BACKING",
        id,
        `Token has ${String(backing.length)} non-synthetic representations (${backing
          .map(([chain]) => chain)
          .join(", ")}). Exactly one chain backs an asset.`,
      );
    }

    for (const [chainKey, representation] of Object.entries(token.representations)) {
      if (chains.chains[chainKey] === undefined) {
        issues.error(
          "TOKEN_REPRESENTATION_CHAIN_UNKNOWN",
          `${id}@${chainKey}`,
          `Representation is on chain "${chainKey}", which is not in the chain registry.`,
        );
      }
      if (representation.decimals < 0 || representation.decimals > 36) {
        issues.error(
          "TOKEN_DECIMALS_RANGE",
          `${id}@${chainKey}`,
          `Implausible decimals: ${String(representation.decimals)}.`,
        );
      }
      if (representation.decimals !== token.decimals) {
        // Not an error — cross-decimal routes are supported — but the rounding
        // behaviour must be documented and tested for this route specifically.
        issues.warn(
          "TOKEN_DECIMAL_MISMATCH",
          `${id}@${chainKey}`,
          `Representation has ${String(representation.decimals)} decimals against a canonical ` +
            `${String(token.decimals)}. Conversion rounding must be documented and covered by tests.`,
        );
      }
    }

    if (token.enabled && !isTokenDeployed(token)) {
      issues.warn(
        "TOKEN_ENABLED_NOT_DEPLOYED",
        id,
        `Token is enabled but not fully deployed; it will not be selectable until deployment ` +
          `artifacts supply its addresses.`,
      );
    }

    if (isProductionEnvironment(tokens.environment)) {
      if (token.isMock) {
        issues.error(
          "TOKEN_PROD_MOCK",
          id,
          `Mock asset present in the production registry. Mocks never reach mainnet.`,
        );
      }
      if (token.enabled && !isTokenDeployed(token)) {
        issues.error(
          "TOKEN_PROD_ENABLED_NOT_DEPLOYED",
          id,
          `Enabled production token is not deployed.`,
        );
      }
    }
  }
}

function validateRoutes(
  chains: ChainRegistry,
  tokens: TokenRegistry,
  issues: IssueCollector,
): void {
  const hub = chains.hubChainKey;

  for (const [id, route] of Object.entries(tokens.routes)) {
    if (id !== route.id) {
      issues.error("ROUTE_KEY_MISMATCH", id, `Registry key does not match route.id "${route.id}".`);
    }

    const expectedId = routeId(route.sourceChain, route.destinationChain, route.tokenId);
    if (route.id !== expectedId) {
      issues.error("ROUTE_ID_CONVENTION", id, `Route id should be "${expectedId}".`);
    }

    if (route.sourceChain === route.destinationChain) {
      issues.error("ROUTE_SELF", id, `Source and destination are the same chain.`);
    }

    // Hub routing rule: Ark sits at one end of every V1 route. An
    // external-to-external path is not something the product offers, so it must
    // not be expressible in the registry either.
    if (route.sourceChain !== hub && route.destinationChain !== hub) {
      issues.error(
        "ROUTE_NOT_HUB_ANCHORED",
        id,
        `Neither end is the hub chain "${hub}". ArkBridge V1 routes external liquidity through ` +
          `Ark; it does not offer external-to-external transfers.`,
      );
    }

    for (const chainKey of [route.sourceChain, route.destinationChain]) {
      if (chains.chains[chainKey] === undefined) {
        issues.error(
          "ROUTE_CHAIN_UNKNOWN",
          id,
          `Chain "${chainKey}" is not in the chain registry.`,
        );
      }
    }

    const token = tokens.tokens[route.tokenId];
    if (token === undefined) {
      issues.error(
        "ROUTE_TOKEN_UNKNOWN",
        id,
        `Token "${route.tokenId}" is not in the token registry.`,
      );
    } else {
      for (const chainKey of [route.sourceChain, route.destinationChain]) {
        if (token.representations[chainKey] === undefined) {
          issues.error(
            "ROUTE_NO_REPRESENTATION",
            id,
            `Token "${token.id}" has no representation on "${chainKey}".`,
          );
        }
      }
      if (route.enabled && !token.enabled) {
        issues.error(
          "ROUTE_ENABLED_TOKEN_DISABLED",
          id,
          `Route is enabled but its token "${token.id}" is disabled.`,
        );
      }
    }

    if (route.enabled) {
      for (const chainKey of [route.sourceChain, route.destinationChain]) {
        const chain = chains.chains[chainKey];
        if (chain !== undefined && !chain.enabled) {
          issues.error(
            "ROUTE_ENABLED_CHAIN_DISABLED",
            id,
            `Route is enabled but chain "${chainKey}" is disabled.`,
          );
        }
      }

      // Both directions must exist so the direction switcher always has
      // something to flip to, and so a user is never able to move an asset onto
      // a chain it cannot leave.
      const reverseId = routeId(route.destinationChain, route.sourceChain, route.tokenId);
      if (tokens.routes[reverseId] === undefined) {
        issues.error(
          "ROUTE_NO_REVERSE",
          id,
          `No reverse route "${reverseId}". An enabled inbound route without a return path ` +
            `strands user funds on the destination chain.`,
        );
      }
    }

    const { limits } = route;
    if (limits !== undefined) {
      if (limits.maxPerTransaction <= 0n || limits.maxHourly <= 0n || limits.maxDaily <= 0n) {
        issues.error("ROUTE_LIMIT_NONPOSITIVE", id, `All route limits must be greater than zero.`);
      }
      if (limits.maxPerTransaction > limits.maxHourly) {
        issues.error(
          "ROUTE_LIMIT_ORDER",
          id,
          `maxPerTransaction (${limits.maxPerTransaction.toString()}) exceeds maxHourly ` +
            `(${limits.maxHourly.toString()}), so the per-transaction cap is unreachable.`,
        );
      }
      if (limits.maxHourly > limits.maxDaily) {
        issues.error(
          "ROUTE_LIMIT_ORDER",
          id,
          `maxHourly (${limits.maxHourly.toString()}) exceeds maxDaily (${limits.maxDaily.toString()}).`,
        );
      }
    } else if (route.enabled) {
      issues.warn(
        "ROUTE_NO_LIMITS",
        id,
        `Enabled route has no limits. Uncapped capacity is only appropriate in local development.`,
      );
    }

    if (route.enabled && !isRouteDeployed(route)) {
      issues.warn(
        "ROUTE_ENABLED_NOT_DEPLOYED",
        id,
        `Route is enabled but its routers are not deployed; it will not be selectable yet.`,
      );
    }

    if (isProductionEnvironment(tokens.environment)) {
      if (limits === undefined) {
        issues.error(
          "ROUTE_PROD_NO_LIMITS",
          id,
          `Production routes must carry explicit reviewed limits. Launch with conservative ` +
            `capacity and raise it deliberately.`,
        );
      }
      if (route.enabled && !isRouteDeployed(route)) {
        issues.error(
          "ROUTE_PROD_ENABLED_NOT_DEPLOYED",
          id,
          `Enabled production route has a zero router address (source=${route.sourceRouter}, ` +
            `destination=${route.destinationRouter}).`,
        );
      }
      if (route.sourceRouter !== ZERO_ADDRESS && route.sourceRouter === route.destinationRouter) {
        issues.error(
          "ROUTE_PROD_SAME_ROUTER",
          id,
          `Source and destination routers are the same address across two chains.`,
        );
      }
    }
  }
}

/**
 * Check a registry pair against every structural invariant ArkBridge relies on.
 *
 * Run in CI for every environment. Errors fail the build; warnings describe
 * states that are legitimate mid-build (a route defined before its deployment
 * exists) but are promoted to errors in production environments.
 */
export function validateRegistries(chains: ChainRegistry, tokens: TokenRegistry): ValidationResult {
  const issues = new IssueCollector();

  if (chains.environment !== tokens.environment) {
    issues.error(
      "ENVIRONMENT_MISMATCH",
      chains.environment,
      `Chain registry is "${chains.environment}" but token registry is "${tokens.environment}".`,
    );
  }

  validateChains(chains, issues);
  validateTokens(chains, tokens, issues);
  validateRoutes(chains, tokens, issues);

  return {
    environment: chains.environment,
    issues: issues.issues,
    ok: !issues.issues.some((issue) => issue.severity === "error"),
  };
}
