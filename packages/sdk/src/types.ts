import type { Address, Hex } from "@arkbridge/types";
import type { RouteCatalog } from "@arkbridge/bridge-core";
import type { PublicClient, WalletClient } from "viem";

/**
 * Deployment addresses the SDK needs beyond what the registries carry.
 * Supplied by the caller (hydrated from deployment artifacts) so the SDK makes
 * no filesystem assumptions and works unchanged in a browser.
 */
export interface ChainDeployment {
  readonly mailbox: Address;
  /** ArkBridge guard, when the chain has one. Absent means no limits surfaced. */
  readonly guard?: Address;
  readonly rateLimiter?: Address;
}

export interface ArkBridgeConfig {
  readonly catalog: RouteCatalog;
  /** Per-chain deployment addresses, keyed by chain key. */
  readonly deployments: Readonly<Record<string, ChainDeployment>>;
  /**
   * Read clients, keyed by chain key. Supplied by the caller so the SDK never
   * decides which RPC to trust — the app owns that, and in a browser it is
   * usually the user's own provider.
   */
  readonly clients: Readonly<Record<string, PublicClient>>;
}

export interface QuoteRequest {
  readonly sourceChain: string;
  readonly destinationChain: string;
  /** Token id, e.g. `sepolia-mockusdc`. Never a bare symbol. */
  readonly token: string;
  readonly amount: bigint;
  readonly recipient: Address;
  /** Sender, used to read balance and allowance. */
  readonly account?: Address;
}

export interface BridgeRequest extends QuoteRequest {
  readonly account: Address;
  readonly walletClient: WalletClient;
}

export interface ApprovalState {
  readonly required: boolean;
  readonly current: bigint;
  readonly spender: Address;
  readonly token: Address;
}

export interface RouteAvailability {
  readonly routeId: string;
  readonly available: boolean;
  /** Present when unavailable, explaining why in user-facing terms. */
  readonly reason?: string;
  /** Largest transfer the route accepts right now, when a guard is deployed. */
  readonly capacity?: bigint;
}

export interface MessageStatus {
  readonly messageId: Hex;
  readonly delivered: boolean;
  readonly sourceChain: string;
  readonly destinationChain: string;
}
