"use client";

import { isAddress } from "viem";
import type { Address } from "@arkbridge/types";

/**
 * The counterparty book.
 *
 * Named destination addresses, saved locally so a user sending to the same
 * treasury or exchange deposit repeatedly does not retype a 42-character
 * address every time. Retyping is where the mistakes happen, and a bridge
 * transfer cannot be reversed.
 *
 * Stored per destination chain, not globally. The same address can be a
 * contract on one chain and nothing at all on another, so a book that offered
 * an address saved for Ethereum while you were sending to Ark would be
 * suggesting something it cannot vouch for.
 *
 * Local only, and deliberately so: an address book is a map of who someone
 * transacts with, which is not data this app should be shipping anywhere.
 */
const KEY = "arkbridge.counterparties.v1";

export interface Counterparty {
  readonly label: string;
  readonly address: Address;
  readonly chain: string;
  readonly savedAt: number;
}

type Stored = Record<string, readonly Counterparty[]>;

function read(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? {} : (JSON.parse(raw) as Stored);
  } catch {
    // Corrupt or unavailable storage must never break the form.
    return {};
  }
}

function write(next: Stored): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota or private mode. The book is a convenience; losing it costs a
    // retype, not a transfer.
  }
}

export function listCounterparties(chain: string): readonly Counterparty[] {
  return read()[chain] ?? [];
}

/**
 * Saves a counterparty, replacing any entry with the same address.
 *
 * Returns false for an address that does not validate rather than storing it —
 * a book that can hold a malformed address is a book that will one day hand one
 * back to the form.
 */
export function saveCounterparty(chain: string, label: string, address: string): boolean {
  const trimmed = address.trim();
  // `isAddress` is a type guard, so `trimmed` is a checked `0x${string}` below
  // rather than a string we have asserted about.
  if (!isAddress(trimmed)) return false;

  const all = read();
  const existing = all[chain] ?? [];
  const entry: Counterparty = {
    label: label.trim() === "" ? shorten(trimmed) : label.trim(),
    address: trimmed,
    chain,
    savedAt: Date.now(),
  };
  const next = [
    entry,
    ...existing.filter((c) => c.address.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, 50);
  write({ ...all, [chain]: next });
  return true;
}

export function removeCounterparty(chain: string, address: Address): void {
  const all = read();
  const existing = all[chain] ?? [];
  write({
    ...all,
    [chain]: existing.filter((c) => c.address.toLowerCase() !== address.toLowerCase()),
  });
}

export function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
