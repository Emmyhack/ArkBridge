import { Skeleton } from "@arkbridge/ui";
import styles from "./BridgeShell.module.css";

/**
 * Placeholder matching the bridge card's shape (§60).
 *
 * Dimensioned to the real card so nothing shifts when it mounts. A spinner here
 * would tell the user less and move the layout more.
 *
 * It has to be kept in step with the card by hand, which is the cost of the
 * approach: this file previously drew the old two-column form — a card plus an
 * aside — and would have produced exactly the jump it exists to prevent. If the
 * card's structure changes, this changes with it.
 */
export function BridgeSkeleton() {
  return (
    <div className={styles.layout}>
      <section className={styles.card} aria-busy="true" aria-label="Loading bridge">
        <div className={styles.toolbar}>
          <Skeleton width="76px" height={20} />
          <Skeleton width="34px" height={34} />
        </div>

        <div className={styles.swapGroup}>
          <div className={styles.side}>
            <div className={styles.sideHead}>
              <Skeleton width="52px" height={12} />
              <Skeleton width="104px" height={30} />
            </div>
            <div className={styles.amountRow}>
              <Skeleton width="128px" height={38} />
              <Skeleton width="88px" height={30} />
            </div>
          </div>

          <div className={styles.seam} />

          <div className={styles.side}>
            <div className={styles.sideHead}>
              <Skeleton width="74px" height={12} />
              <Skeleton width="104px" height={30} />
            </div>
            <div className={styles.amountRow}>
              <Skeleton width="128px" height={38} />
              <Skeleton width="88px" height={30} />
            </div>
          </div>
        </div>

        <Skeleton width="100%" height={44} />
        <Skeleton width="100%" height={24} />
        <Skeleton width="100%" height={52} />
      </section>
    </div>
  );
}
