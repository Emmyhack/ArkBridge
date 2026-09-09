import type { ChainConfig, Environment } from "@arkbridge/types";
import type { ChainRegistry } from "./types.js";
import {
  localChainRegistry,
  mainnetChainRegistry,
  stagingChainRegistry,
  testnetChainRegistry,
} from "./environments/index.js";
import { isChainConfigured } from "./types.js";

export * from "./types.js";
export * from "./chains/index.js";
export * from "./environments/index.js";

const REGISTRIES: Readonly<Record<Environment, ChainRegistry>> = {
  local: localChainRegistry,
  testnet: testnetChainRegistry,
  staging: stagingChainRegistry,
  mainnet: mainnetChainRegistry,
};

export function getChainRegistry(environment: Environment): ChainRegistry {
  return REGISTRIES[environment];
}

/** Every chain defined for an environment, including disabled ones. */
export function getAllChains(environment: Environment): readonly ChainConfig[] {
  return Object.values(getChainRegistry(environment).chains);
}

/**
 * Chains that may be offered in the UI: enabled and fully configured.
 * Selectors must be driven from this, never from a hard-coded list.
 */
export function getEnabledChains(environment: Environment): readonly ChainConfig[] {
  return getAllChains(environment).filter((chain) => chain.enabled && isChainConfigured(chain));
}

export function getChain(environment: Environment, key: string): ChainConfig | undefined {
  return getChainRegistry(environment).chains[key];
}

/** The Ark network for an environment. Every V1 route has this at one end. */
export function getHubChain(environment: Environment): ChainConfig {
  const registry = getChainRegistry(environment);
  const hub = registry.chains[registry.hubChainKey];
  if (hub === undefined) {
    throw new Error(
      `Chain registry for "${environment}" names hub "${registry.hubChainKey}" but does not define it.`,
    );
  }
  return hub;
}

export function isHubChain(environment: Environment, key: string): boolean {
  return getChainRegistry(environment).hubChainKey === key;
}

/**
 * Look up a chain by EVM chain id — used to translate a connected wallet's
 * network into a registry entry. Unconfigured chains are skipped so the
 * `UNCONFIGURED` sentinel can never match.
 */
export function getChainByEvmChainId(
  environment: Environment,
  chainId: number,
): ChainConfig | undefined {
  return getAllChains(environment).find(
    (chain) => isChainConfigured(chain) && chain.chainId === chainId,
  );
}

/**
 * Look up a chain by Hyperlane domain id — used to resolve the origin of an
 * inbound message. A message whose origin domain does not resolve here is not
 * from a chain ArkBridge recognises and must be rejected, not guessed at.
 */
export function getChainByDomainId(
  environment: Environment,
  domainId: number,
): ChainConfig | undefined {
  return getAllChains(environment).find(
    (chain) => isChainConfigured(chain) && chain.hyperlaneDomainId === domainId,
  );
}

/** Primary RPC URL for a chain, or `undefined` when none is configured. */
export function getRpcUrl(chain: ChainConfig): string | undefined {
  return chain.rpcUrls[0];
}

export function explorerTxUrl(chain: ChainConfig, txHash: string): string | undefined {
  return chain.explorerUrl === undefined ? undefined : `${chain.explorerUrl}/tx/${txHash}`;
}

export function explorerAddressUrl(chain: ChainConfig, address: string): string | undefined {
  return chain.explorerUrl === undefined ? undefined : `${chain.explorerUrl}/address/${address}`;
}
