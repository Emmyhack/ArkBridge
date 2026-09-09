"use client";

/**
 * Armed fee limits.
 *
 * WHAT THIS IS, PRECISELY
 *
 * A limit here is a *watch*, not an order. Nothing is signed, nothing is
 * escrowed, and no contract holds anything: the app watches the source chain's
 * base fee and tells you when it drops to the ceiling you set, at which point
 * you sign the transfer yourself.
 *
 * That distinction is not pedantry, it is the whole safety story, and the UI
 * states it in as many words. A real limit order needs either an on-chain order
 * book or an off-chain keeper holding a signed authorisation, and ArkBridge has
 * neither. Rendering something that *looked* like a resting order would mean a
 * user closing the tab believing a transfer would still fire. It would not.
 *
 * So: watches live in this browser, survive a reload, and stop when the tab
 * closes. Every one of those properties is stated on screen.
 */
const KEY = "arkbridge.limits.v1";

export interface FeeLimit {
  readonly id: string;
  readonly sourceChain: string;
  readonly destinationChain: string;
  readonly tokenId: string;
  /** The amount to send, as a decimal string exactly as typed. */
  readonly amount: string;
  /** Ceiling on the source chain's base fee, in gwei. */
  readonly ceilingGwei: number;
  readonly createdAt: number;
}

function read(): readonly FeeLimit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? [] : (JSON.parse(raw) as FeeLimit[]);
  } catch {
    return [];
  }
}

function write(next: readonly FeeLimit[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // See counterparties.ts: convenience storage, never correctness.
  }
}

export function listLimits(): readonly FeeLimit[] {
  return read();
}

export function armLimit(limit: Omit<FeeLimit, "id" | "createdAt">): FeeLimit {
  const entry: FeeLimit = {
    ...limit,
    // crypto.randomUUID is available in every browser this app supports; the
    // fallback keeps a private-mode or older embedded browser working.
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
  };
  write([entry, ...read()].slice(0, 20));
  return entry;
}

export function cancelLimit(id: string): void {
  write(read().filter((limit) => limit.id !== id));
}

/** A limit is met when the live base fee is at or below its ceiling. */
export function isMet(limit: FeeLimit, currentGwei: number | undefined): boolean {
  return currentGwei !== undefined && currentGwei <= limit.ceilingGwei;
}
