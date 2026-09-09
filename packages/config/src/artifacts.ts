import type { Address, Environment, Hex } from "@arkbridge/types";

/**
 * The machine-readable record every deployment writes.
 *
 * One file per chain per environment, at `deployments/<environment>/<chain>.json`.
 * These are the source of truth for addresses; nothing else hard-codes them.
 */
export interface DeploymentArtifact {
  readonly environment: Environment;
  /** Chain key as used by the chain registry, e.g. "sepolia". */
  readonly chain: string;
  readonly chainId: number;
  readonly hyperlaneDomainId: number;

  /** Hyperlane core and ArkBridge contracts on this chain. */
  readonly contracts: Readonly<Record<string, Address>>;

  /**
   * Token deployments on this chain, keyed by token id. `token` is the ERC20
   * itself; `router` is the warp route that owns it.
   */
  readonly tokens?: Readonly<Record<string, { readonly token: Address; readonly router: Address }>>;

  /**
   * Per-contract deployment provenance: which transaction created it, in which
   * block, and what it cost. Recorded so a deployment can be audited after the
   * fact without re-deriving it from explorer state.
   */
  readonly contractDetails?: Readonly<
    Record<
      string,
      {
        readonly address: Address;
        readonly deploymentTx?: Hex;
        readonly block?: number;
        readonly gasUsed?: number;
      }
    >
  >;

  /**
   * Versions of the Hyperlane software this deployment was produced by and
   * runs. `packageVersion` and `messageVersion` are read back from the deployed
   * Mailbox, not taken from the deploying tool — the chain is the authority on
   * what is actually deployed.
   */
  readonly hyperlane?: {
    /** Mailbox.PACKAGE_VERSION() */
    readonly packageVersion?: string;
    /** Mailbox.VERSION() — the wire format version of dispatched messages. */
    readonly messageVersion?: number;
    /** The @hyperlane-xyz/cli version that performed the deployment. */
    readonly cliVersion?: string;
    /** The @hyperlane-xyz/registry version used for the domain conflict check. */
    readonly registryVersion?: string;
  };

  /**
   * Per-origin inbound security: which validator set authorises messages
   * arriving from a given chain, and at what threshold.
   */
  readonly phase3?: {
    readonly status?: string;
    readonly defaultIsmChange?: {
      readonly from?: string;
      readonly to?: string;
      readonly tx?: Hex;
      readonly block?: number;
    };
    readonly inboundSecurity?: Readonly<
      Record<
        string,
        | string
        | {
            readonly domain?: number;
            readonly ism?: string;
            readonly validators?: readonly Address[];
            readonly threshold?: number;
          }
      >
    >;
    readonly outboundSecurity?: {
      readonly status?: string;
      readonly ismOnSepolia?: Address;
      readonly validators?: {
        readonly set?: readonly Address[];
        readonly threshold?: number;
        readonly announcedOn?: Address;
        readonly storageLocations?: readonly string[];
        readonly warning?: string;
      };
      readonly endToEndTest?: {
        readonly note?: string;
        readonly dispatchTxArk?: Hex;
        readonly messageId?: Hex;
        readonly recipientOnSepolia?: Address;
        readonly sepoliaMailboxDelivered?: boolean;
        readonly recipientIsmUsed?: Address;
        readonly handledCount?: number;
        readonly lastOrigin?: number;
        readonly lastMessage?: string;
      };
    };
    readonly inboundStatus?: {
      readonly configured?: boolean;
      readonly working?: boolean;
      readonly ism?: Address;
      readonly validators?: readonly Address[];
      readonly threshold?: number;
      readonly migratedFrom?: string;
      readonly endToEndTest?: {
        readonly note?: string;
        readonly dispatchTxSepolia?: Hex;
        readonly sepoliaBlock?: number;
        readonly recipientOnArk?: Address;
        readonly lastData?: string;
        readonly routingIsmModuleForSepolia?: Address;
      };
      readonly operationalNote?: string;
      readonly blocker?: string;
      readonly testMessageId?: Hex;
      readonly remedy?: string;
    };
    readonly bscTestnetStatus?: string;
    readonly recipientIsmFinding?: string;
  };

  /** Evidence that the deployment was checked, not merely performed. */
  readonly verification?: Readonly<Record<string, unknown>>;

  /** Decisions and known gaps recorded alongside the deployment. */
  readonly notes?: Readonly<Record<string, unknown>>;

  readonly deployer: Address;
  readonly block: number;
  /** Unix seconds. */
  readonly timestamp: number;
  /** Commit the deployment was built from. */
  readonly commit?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Validate an artifact read from disk.
 *
 * Deployment artifacts are trusted to place addresses into the registry, so
 * they are checked structurally rather than cast. A malformed artifact fails
 * here instead of surfacing as an inexplicable zero address later.
 */
export function parseDeploymentArtifact(value: unknown, source: string): DeploymentArtifact {
  if (!isRecord(value)) {
    throw new Error(`${source}: deployment artifact must be a JSON object.`);
  }

  const { environment, chain, chainId, hyperlaneDomainId, contracts, deployer, block, timestamp } =
    value;

  if (typeof environment !== "string") throw new Error(`${source}: missing "environment".`);
  if (typeof chain !== "string") throw new Error(`${source}: missing "chain".`);
  if (typeof chainId !== "number" || !Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`${source}: "chainId" must be a positive integer.`);
  }
  if (
    typeof hyperlaneDomainId !== "number" ||
    !Number.isInteger(hyperlaneDomainId) ||
    hyperlaneDomainId <= 0
  ) {
    throw new Error(`${source}: "hyperlaneDomainId" must be a positive integer.`);
  }
  if (!isRecord(contracts)) throw new Error(`${source}: missing "contracts".`);
  for (const [name, address] of Object.entries(contracts)) {
    if (!isAddress(address)) {
      throw new Error(`${source}: contracts.${name} is not a valid address.`);
    }
  }
  if (!isAddress(deployer)) throw new Error(`${source}: "deployer" is not a valid address.`);
  if (typeof block !== "number") throw new Error(`${source}: missing "block".`);
  if (typeof timestamp !== "number") throw new Error(`${source}: missing "timestamp".`);

  const tokens: Record<string, { token: Address; router: Address }> = {};
  if (value["tokens"] !== undefined) {
    if (!isRecord(value["tokens"])) throw new Error(`${source}: "tokens" must be an object.`);
    for (const [id, entry] of Object.entries(value["tokens"])) {
      if (!isRecord(entry) || !isAddress(entry["token"]) || !isAddress(entry["router"])) {
        throw new Error(`${source}: tokens.${id} must be { token, router } addresses.`);
      }
      tokens[id] = { token: entry["token"], router: entry["router"] };
    }
  }

  return {
    ...(isRecord(value["phase3"]) ? { phase3: value["phase3"] } : {}),
    ...(isRecord(value["verification"]) ? { verification: value["verification"] } : {}),
    ...(isRecord(value["notes"]) ? { notes: value["notes"] } : {}),
    ...(isRecord(value["contractDetails"])
      ? {
          contractDetails: value["contractDetails"] as NonNullable<
            DeploymentArtifact["contractDetails"]
          >,
        }
      : {}),
    ...(isRecord(value["hyperlane"]) ? { hyperlane: value["hyperlane"] } : {}),
    environment: environment as Environment,
    chain,
    chainId,
    hyperlaneDomainId,
    contracts: contracts as Record<string, Address>,
    tokens,
    deployer,
    block,
    timestamp,
    ...(typeof value["commit"] === "string" ? { commit: value["commit"] } : {}),
  };
}
