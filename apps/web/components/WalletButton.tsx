"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useHydrated } from "../lib/useHydrated";
import styles from "./WalletButton.module.css";

/** Shorten an address for display. Full value stays available on hover. */
function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Wallet connection (§29).
 *
 * Disconnected shows "Connect Wallet"; connected shows the address. The button
 * lives in the header on every page, because a user who lands on Activity or
 * Status should not have to go to Bridge to connect.
 */
export function WalletButton() {
  const { address, isConnected } = useAccount();
  const hydrated = useHydrated();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (hydrated && isConnected && address !== undefined) {
    return (
      <button
        type="button"
        className={styles.connected}
        onClick={() => {
          disconnect();
        }}
        title={address}
      >
        <span className={styles.dot} aria-hidden="true" />
        <span className="ark-mono">{shorten(address)}</span>
      </button>
    );
  }

  const connector = connectors[0];

  return (
    <button
      type="button"
      className={styles.connect}
      disabled={!hydrated || isPending || connector === undefined}
      onClick={() => {
        if (connector !== undefined) connect({ connector });
      }}
    >
      {hydrated && isPending ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
