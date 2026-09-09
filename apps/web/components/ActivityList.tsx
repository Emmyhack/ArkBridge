"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { formatAmount, presentStatus } from "@arkbridge/bridge-core";
import type { RouteCatalog } from "@arkbridge/bridge-core";
import type { BridgeStatus } from "@arkbridge/types";
import { listTransfers } from "../lib/activityStore";
import { useHydrated } from "../lib/useHydrated";
import styles from "./ActivityList.module.css";

type Filter = "all" | "processing" | "completed" | "failed";

/** Four filters, no more (§45). Chain and token filters are not worth V1. */
const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [
  { id: "all", label: "All" },
  { id: "processing", label: "Processing" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
];

function matches(filter: Filter, status: BridgeStatus): boolean {
  if (filter === "all") return true;
  if (filter === "completed") return status === "DELIVERED";
  if (filter === "failed") return status === "FAILED";
  return status !== "DELIVERED" && status !== "FAILED";
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Activity (§44).
 *
 * Rows, not a trading table. A user wants to know what moved, where, and
 * whether it arrived — not twelve columns of protocol detail.
 */
export function ActivityList({ catalog }: { readonly catalog: RouteCatalog }) {
  const { address, isConnected } = useAccount();
  const hydrated = useHydrated();
  const connectedAddress = hydrated ? address : undefined;
  const [filter, setFilter] = useState<Filter>("all");

  const transfers = useMemo(() => listTransfers(connectedAddress), [connectedAddress]);
  const visible = transfers.filter((t) => matches(filter, t.status));

  if (!hydrated || !isConnected) {
    return (
      <section className={styles.empty}>
        <h2 className={styles.emptyTitle}>Connect your wallet</h2>
        <p className={styles.emptyBody}>Your transfers will appear here once connected.</p>
      </section>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.filters} role="group" aria-label="Filter transfers">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter === option.id}
            className={styles.filter}
            data-active={filter === option.id}
            onClick={() => {
              setFilter(option.id);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <section className={styles.empty}>
          {/* §46: say what will appear here and give a way forward. */}
          <h2 className={styles.emptyTitle}>No bridge activity yet</h2>
          <p className={styles.emptyBody}>Your cross-chain transfers will appear here.</p>
          <Link href="/bridge" className={styles.cta}>
            Bridge assets
          </Link>
        </section>
      ) : (
        <ul className={styles.list}>
          {visible.map((transfer, index) => {
            const token = catalog.tokens[transfer.tokenId];
            const decimals =
              token?.representations[transfer.sourceChain]?.decimals ?? token?.decimals ?? 18;
            const presented = presentStatus(transfer.status);
            const source = catalog.chains[transfer.sourceChain]?.name ?? transfer.sourceChain;
            const destination =
              catalog.chains[transfer.destinationChain]?.name ?? transfer.destinationChain;

            const row = (
              <>
                <div className={styles.rowMain}>
                  <span className={styles.rowAmount}>
                    {formatAmount(BigInt(transfer.amount), decimals)} {token?.symbol ?? ""}
                  </span>
                  <span className={styles.rowRoute}>
                    {source} → {destination}
                  </span>
                </div>
                <div className={styles.rowMeta}>
                  <span className={styles.status} data-status={transfer.status}>
                    <span className={styles.dot} aria-hidden="true" />
                    {presented.label}
                  </span>
                  <span className={styles.time}>{relativeTime(transfer.createdAt)}</span>
                </div>
              </>
            );

            return (
              <li key={transfer.id} className={styles.row} data-reveal data-reveal-index={index}>
                {transfer.messageId === undefined ? (
                  row
                ) : (
                  <Link href={`/transaction/${transfer.messageId}`} className={styles.rowLink}>
                    {row}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
