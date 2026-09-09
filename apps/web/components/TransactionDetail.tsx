"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatAmount, presentStatus } from "@arkbridge/bridge-core";
import type { RouteCatalog } from "@arkbridge/bridge-core";
import type { BridgeTransaction, Hex } from "@arkbridge/types";
import type { ChainDeployment } from "@arkbridge/sdk";
import { useArkBridge } from "../lib/useArkBridge";
import { useTransferStatus } from "../lib/useTransferStatus";
import { findByMessageId } from "../lib/activityStore";
import styles from "./TransactionDetail.module.css";

/**
 * One transfer, in full (§43).
 *
 * Status is read from chain rather than from the local record, so this page is
 * correct even for a transfer this browser has never seen — the local store
 * only supplies the human context (amount, asset) that the chain does not.
 */
export function TransactionDetail({
  catalog,
  deployments,
  messageId,
}: {
  readonly catalog: RouteCatalog;
  readonly deployments: Record<string, ChainDeployment>;
  readonly messageId: string;
}) {
  const bridge = useArkBridge(catalog, deployments);
  const [record, setRecord] = useState<BridgeTransaction | undefined>();

  // localStorage is only available in the browser, so this cannot run during
  // render without breaking hydration.
  useEffect(() => {
    setRecord(findByMessageId(messageId as Hex));
  }, [messageId]);

  const sourceChain = record === undefined ? undefined : catalog.chains[record.sourceChain];
  const destinationChain =
    record === undefined ? undefined : catalog.chains[record.destinationChain];

  const { status, delayed, secondsElapsed } = useTransferStatus(bridge, {
    messageId: messageId as Hex,
    sourceChain: record?.sourceChain ?? "",
    destinationChain: record?.destinationChain ?? "",
    submittedAt: record?.createdAt ?? Date.now(),
    initialStatus: "MESSAGE_DISPATCHED",
  });

  const presented = presentStatus(status);
  const token = record === undefined ? undefined : catalog.tokens[record.tokenId];
  const decimals =
    token?.representations[record?.sourceChain ?? ""]?.decimals ?? token?.decimals ?? 18;

  return (
    <article className={styles.detail}>
      <Link href="/activity" className={styles.back}>
        ← Activity
      </Link>

      <header className={styles.head}>
        <h1 className={styles.title}>{presented.label}</h1>
        <p className={styles.subtitle}>{presented.detail}</p>
      </header>

      {delayed && status !== "DELIVERED" ? (
        <p className={styles.delay} role="status">
          Still being verified. Your source transaction completed and the transfer is still being
          processed — it has not failed. ({Math.floor(secondsElapsed / 60)} min elapsed)
        </p>
      ) : null}

      <dl className={styles.facts}>
        {record === undefined ? (
          <div className={styles.fact}>
            <dt>Transfer</dt>
            <dd>
              Not recorded in this browser. Status above is read from chain and is authoritative.
            </dd>
          </div>
        ) : (
          <>
            <div className={styles.fact}>
              <dt>Amount</dt>
              <dd>
                {formatAmount(BigInt(record.amount), decimals)} {token?.symbol ?? ""}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Route</dt>
              <dd>
                {sourceChain?.name ?? record.sourceChain} →{" "}
                {destinationChain?.name ?? record.destinationChain}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Recipient</dt>
              <dd className="ark-mono">{record.recipient}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Source transaction</dt>
              <dd className="ark-mono">
                {sourceChain?.explorerUrl === undefined ? (
                  record.sourceTxHash
                ) : (
                  <a
                    className={styles.link}
                    href={`${sourceChain.explorerUrl}/tx/${record.sourceTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {record.sourceTxHash}
                  </a>
                )}
              </dd>
            </div>
          </>
        )}
        <div className={styles.fact}>
          <dt>Message ID</dt>
          <dd className="ark-mono">{messageId}</dd>
        </div>
      </dl>
    </article>
  );
}
