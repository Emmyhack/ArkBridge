"use client";

import { useEffect } from "react";
import styles from "./error.module.css";

/**
 * Route-level error boundary.
 *
 * A bridge that renders a blank page on an unexpected error is worse than one
 * that renders an error, because a user mid-transfer cannot tell whether their
 * funds moved. This says explicitly that a display failure is not a transfer
 * failure, and points at the record that is authoritative.
 */
export default function Error({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.wrap} role="alert">
      <h1 className={styles.title}>Something failed to load</h1>
      <p className={styles.body}>
        This is a problem displaying the page, not with any transfer. Nothing has been sent or
        changed as a result of this error. Any transfer already in progress continues on-chain and
        is unaffected.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.retry} onClick={reset}>
          Try again
        </button>
        <a className={styles.secondary} href="/activity">
          View your transfers
        </a>
      </div>
      {error.digest === undefined ? null : (
        <p className={styles.digest}>
          Reference: <span className="ark-mono">{error.digest}</span>
        </p>
      )}
    </div>
  );
}
