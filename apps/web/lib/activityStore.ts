"use client";

import type { BridgeTransaction, Address, Hex } from "@arkbridge/types";

/**
 * Local record of this wallet's transfers.
 *
 * Deliberately client-side for now. The indexer (§98) is the eventual source of
 * truth and is the only thing that can show a transfer initiated on another
 * device — but it is a read model, and until one is deployed a user should
 * still be able to see what they just did rather than an empty page.
 *
 * Scoped per wallet so switching accounts does not show someone else's history.
 */
const KEY = "arkbridge.activity.v1";

interface Stored {
  readonly [wallet: string]: readonly BridgeTransaction[];
}

function read(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? {} : (JSON.parse(raw) as Stored);
  } catch {
    // Corrupt or unavailable storage must not break the page.
    return {};
  }
}

export function recordTransfer(transaction: BridgeTransaction): void {
  if (typeof window === "undefined") return;
  const all = read();
  const wallet = transaction.wallet.toLowerCase();
  const existing = all[wallet] ?? [];
  const next = [transaction, ...existing.filter((t) => t.id !== transaction.id)].slice(0, 100);
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...all, [wallet]: next }));
  } catch {
    // Quota or private mode. History is a convenience, never a correctness
    // requirement — the chain remains the record.
  }
}

export function listTransfers(wallet: Address | undefined): readonly BridgeTransaction[] {
  if (wallet === undefined) return [];
  return read()[wallet.toLowerCase()] ?? [];
}

export function findByMessageId(messageId: Hex): BridgeTransaction | undefined {
  const all = read();
  for (const list of Object.values(all)) {
    const match = list.find((t) => t.messageId?.toLowerCase() === messageId.toLowerCase());
    if (match !== undefined) return match;
  }
  return undefined;
}
