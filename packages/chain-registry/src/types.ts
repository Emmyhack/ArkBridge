import type { ChainConfig, Environment } from "@arkbridge/types";
import { UNCONFIGURED } from "@arkbridge/types";

export type { ChainConfig } from "@arkbridge/types";

/** The set of chains available in one environment, keyed by chain key. */
export interface ChainRegistry {
  readonly environment: Environment;
  readonly chains: Readonly<Record<string, ChainConfig>>;
  /** The hub chain key for this environment (always an Ark network). */
  readonly hubChainKey: string;
}

/**
 * A chain is configured once every value that must be confirmed against a live
 * deployment has been filled in. Until then the chain may exist in the registry
 * for documentation purposes but must not be enabled.
 */
export function isChainConfigured(chain: ChainConfig): boolean {
  return (
    chain.chainId !== UNCONFIGURED &&
    chain.chainId > 0 &&
    chain.hyperlaneDomainId !== UNCONFIGURED &&
    chain.hyperlaneDomainId > 0 &&
    chain.rpcUrls.length > 0 &&
    chain.rpcUrls.every((url) => url.length > 0)
  );
}

/**
 * Throw unless every value that must be confirmed against a live deployment has
 * been. Call this before using a chain's ids for anything consequential — an
 * RPC connection, a domain comparison, a deployment.
 */
export function assertChainConfigured(chain: ChainConfig): ChainConfig {
  if (!isChainConfigured(chain)) {
    throw new Error(
      `Chain "${chain.key}" is not fully configured: chainId=${String(chain.chainId)}, ` +
        `hyperlaneDomainId=${String(chain.hyperlaneDomainId)}, rpcUrls=${String(chain.rpcUrls.length)}. ` +
        `Fill in the pending values before enabling this chain.`,
    );
  }
  return chain;
}
