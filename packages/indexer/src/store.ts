import type { BridgeTransaction, BridgeStatus, Address, Hex } from "@arkbridge/types";

/**
 * Storage for indexed transfers.
 *
 * An interface rather than a database, because the indexer is a read model and
 * the choice of store is an operational one (spec §99 suggests PostgreSQL). The
 * in-memory implementation below is what the tests and local development use.
 *
 * ## This is never an authority
 *
 * Nothing here authorises anything (spec §98). An indexer that is wrong, stale,
 * or entirely absent degrades the activity feed; it cannot move funds, mint a
 * synthetic, or release collateral. Bridge safety lives on-chain, which is why
 * this interface has no write path that any contract consults.
 */
export interface TransferStore {
  put(transaction: BridgeTransaction): Promise<void>;
  get(id: string): Promise<BridgeTransaction | undefined>;
  byWallet(wallet: Address, options?: ListOptions): Promise<readonly BridgeTransaction[]>;
  byMessageId(messageId: Hex): Promise<BridgeTransaction | undefined>;
  /** Transfers that are not yet terminal, for the tracker to poll. */
  pending(): Promise<readonly BridgeTransaction[]>;
}

export interface ListOptions {
  readonly status?: readonly BridgeStatus[];
  readonly limit?: number;
}

const TERMINAL: readonly BridgeStatus[] = ["DELIVERED", "FAILED"];

export class InMemoryTransferStore implements TransferStore {
  private readonly byId = new Map<string, BridgeTransaction>();

  put(transaction: BridgeTransaction): Promise<void> {
    this.byId.set(transaction.id, transaction);
    return Promise.resolve();
  }

  get(id: string): Promise<BridgeTransaction | undefined> {
    return Promise.resolve(this.byId.get(id));
  }

  byWallet(wallet: Address, options: ListOptions = {}): Promise<readonly BridgeTransaction[]> {
    const lower = wallet.toLowerCase();
    let results = [...this.byId.values()].filter((t) => t.wallet.toLowerCase() === lower);

    if (options.status !== undefined) {
      const wanted = new Set(options.status);
      results = results.filter((t) => wanted.has(t.status));
    }
    // Newest first: an activity feed is read from the top.
    results.sort((a, b) => b.createdAt - a.createdAt);

    return Promise.resolve(options.limit === undefined ? results : results.slice(0, options.limit));
  }

  byMessageId(messageId: Hex): Promise<BridgeTransaction | undefined> {
    const lower = messageId.toLowerCase();
    return Promise.resolve(
      [...this.byId.values()].find((t) => t.messageId?.toLowerCase() === lower),
    );
  }

  pending(): Promise<readonly BridgeTransaction[]> {
    return Promise.resolve([...this.byId.values()].filter((t) => !TERMINAL.includes(t.status)));
  }
}
