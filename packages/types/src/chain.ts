/**
 * A chain as ArkBridge knows it.
 *
 * `key` is the stable identifier used everywhere else (route ids, token
 * representations, deployment artifact filenames, deep links). It is per
 * environment-instance, not per chain family: `ethereum` and `sepolia` are
 * distinct keys, as are `ark` and `ark-devnet`.
 */
export interface ChainConfig {
  /** Stable slug, e.g. "ethereum", "sepolia", "ark", "ark-devnet". */
  readonly key: string;

  /** Human-facing name shown in the chain selector, e.g. "Ark Constellation". */
  readonly name: string;

  /**
   * Optional short descriptor rendered under the name in the selector
   * ("Native network", "Testnet"). Never render the chain id there.
   */
  readonly descriptor?: string;

  /** Brand mark rendered by shared selectors. */
  readonly logo?: "ark" | "ethereum" | "base" | "bnb";

  /**
   * EVM chain id. Holds the `UNCONFIGURED` sentinel (-1) until the value has
   * been confirmed against the live network. Compare against `UNCONFIGURED`
   * rather than testing for a falsy value: chain id 0 is not meaningful, but
   * neither is it the sentinel.
   */
  readonly chainId: number;

  /**
   * Hyperlane domain id.
   *
   * This is deliberately a separate field from `chainId`. Hyperlane domain ids
   * happen to equal the EVM chain id on many networks, but that is a
   * coincidence of configuration, not a rule. Never derive one from the other.
   */
  readonly hyperlaneDomainId: number;

  /** At least one RPC URL. Order is preference order. */
  readonly rpcUrls: readonly string[];

  /**
   * WebSocket endpoints, where the chain offers them. Used by the indexer for
   * log subscriptions; the frontend polls over HTTP and does not need these.
   */
  readonly wsUrls?: readonly string[];

  /** Block explorer base URL, no trailing slash. */
  readonly explorerUrl?: string;

  /**
   * Explorer API base URL, for contract verification. Blockscout and Etherscan
   * expose different API shapes, so `explorerApiKind` names which one.
   */
  readonly explorerApiUrl?: string;
  readonly explorerApiKind?: "etherscan" | "blockscout";

  /** Testnet faucet, surfaced in the UI when a user has no gas on a test chain. */
  readonly faucetUrl?: string;

  readonly nativeCurrency: {
    readonly name: string;
    readonly symbol: string;
    readonly decimals: number;
  };

  /** True when this chain family is a test network. */
  readonly testnet: boolean;

  /** True when this chain is the ArkBridge hub (Ark Constellation). */
  readonly isHub: boolean;

  /**
   * Whether the chain is offered in the UI. A chain must be fully configured
   * before it may be enabled — see `isChainConfigured`.
   */
  readonly enabled: boolean;
}
