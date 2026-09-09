"use client";

import { presentStatus } from "@arkbridge/bridge-core";
import { TRANSFER_STAGES, stageIndex } from "@arkbridge/bridge-core";
import type { BridgeStatus, ChainConfig, Hex } from "@arkbridge/types";
import type { ArkBridge } from "@arkbridge/sdk";
import { useTransferStatus } from "../lib/useTransferStatus";
import styles from "./TransferReceipt.module.css";

/**
 * Post-submission progress (§38, §39).
 *
 * A cross-chain transfer is never one indefinite spinner. Six named stages,
 * driven by polled on-chain state, so a user can see which step they are on and
 * that something is still happening.
 *
 * Labels come from `presentStatus`, so this card, the activity feed and the SDK
 * cannot end up describing the same state three different ways (§41).
 */
export function TransferReceipt({
  bridge,
  sourceTxHash,
  messageId,
  sourceChain,
  destinationChain,
  submittedAt,
  amountLabel,
  onReset,
}: {
  readonly bridge: ArkBridge;
  readonly sourceTxHash: Hex;
  readonly messageId?: Hex;
  readonly sourceChain: ChainConfig | undefined;
  readonly destinationChain: ChainConfig | undefined;
  readonly submittedAt: number;
  readonly amountLabel: string;
  readonly onReset: () => void;
}) {
  const initial: BridgeStatus = messageId === undefined ? "SOURCE_CONFIRMED" : "MESSAGE_DISPATCHED";

  const { status, delayed, secondsElapsed } = useTransferStatus(bridge, {
    messageId,
    sourceChain: sourceChain?.key ?? "",
    destinationChain: destinationChain?.key ?? "",
    submittedAt,
    initialStatus: initial,
  });

  const presented = presentStatus(status);
  const reached = stageIndex(status);
  const done = status === "DELIVERED";

  const explorerTx =
    sourceChain?.explorerUrl === undefined
      ? undefined
      : `${sourceChain.explorerUrl}/tx/${sourceTxHash}`;

  return (
    <section className={styles.receipt} aria-live="polite">
      <header className={styles.head}>
        <h2 className={styles.title}>{done ? "Transfer complete" : presented.label}</h2>
        <p className={styles.amount}>
          {amountLabel} · {sourceChain?.name ?? "—"} → {destinationChain?.name ?? "—"}
        </p>
      </header>

      <p className={styles.detail}>{presented.detail}</p>

      {/*
        A delay is not a failure (§63). The source transaction has completed and
        the transfer is still being processed — say exactly that, rather than
        letting a slow verification read as something having gone wrong.
      */}
      {delayed && !done ? (
        <p className={styles.delay} role="status">
          This is taking longer than usual. Your source transaction has completed and the transfer
          is still being verified — it has not failed. ({Math.floor(secondsElapsed / 60)} min
          elapsed)
        </p>
      ) : null}

      <ol className={styles.steps}>
        {TRANSFER_STAGES.map((stage, index) => {
          const state = index < reached ? "done" : index === reached ? "active" : "pending";
          return (
            <li key={stage} className={styles.step} data-state={state}>
              {/* Icon plus text, never colour alone (§50, §118). */}
              <span className={styles.marker} aria-hidden="true">
                {state === "done" ? "●" : state === "active" ? "◐" : "○"}
              </span>
              <span>{stage}</span>
              <span className="ark-visually-hidden">
                {state === "done" ? " complete" : state === "active" ? " in progress" : " pending"}
              </span>
            </li>
          );
        })}
      </ol>

      <dl className={styles.meta}>
        <div className={styles.metaRow}>
          <dt>Source transaction</dt>
          <dd className="ark-mono">
            {explorerTx === undefined ? (
              `${sourceTxHash.slice(0, 12)}…`
            ) : (
              <a href={explorerTx} target="_blank" rel="noreferrer" className={styles.link}>
                {sourceTxHash.slice(0, 12)}…
              </a>
            )}
          </dd>
        </div>
        {messageId === undefined ? null : (
          <div className={styles.metaRow}>
            <dt>Message ID</dt>
            <dd className="ark-mono">{messageId.slice(0, 12)}…</dd>
          </div>
        )}
      </dl>

      <button type="button" className={styles.again} onClick={onReset}>
        {done ? "Bridge again" : "Start another transfer"}
      </button>
    </section>
  );
}
