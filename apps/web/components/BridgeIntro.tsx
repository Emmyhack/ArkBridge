import styles from "./BridgeIntro.module.css";

/**
 * Hero above the bridge card.
 *
 * The pattern taken from the Across reference (§11, §122) is the shape of the
 * page, not its look: a single clear statement of what this does, the form
 * immediately below it, and everything else deferred until the user scrolls.
 * A user arriving to move money should see the form, not a landing page.
 *
 * The stats below are deliberately about the network's state rather than
 * marketing totals — a devnet quoting "$39B bridged" would be a lie, and
 * quoting nothing is more honest than quoting something meaningless.
 */
export function BridgeIntro({
  chainCount,
  routeCount,
  assetCount,
}: {
  readonly chainCount: number;
  readonly routeCount: number;
  readonly assetCount: number;
}) {
  return (
    <header className={styles.intro}>
      <h1 className={`${styles.title} ark-rise`}>Move assets to and from Ark</h1>
      <p className={styles.subtitle}>
        Choose an available ArkBridge route, review its live fees and limits, then transfer.
      </p>

      <dl className={styles.stats} aria-label="Network coverage">
        {[
          { value: chainCount, label: chainCount === 1 ? "Network" : "Networks" },
          { value: routeCount, label: routeCount === 1 ? "Route" : "Routes" },
          { value: assetCount, label: assetCount === 1 ? "Asset" : "Assets" },
        ].map((stat, index) => (
          <div key={stat.label} className={styles.stat} data-reveal data-reveal-index={index}>
            <dt className={styles.statValue}>{stat.value}</dt>
            <dd className={styles.statLabel}>{stat.label}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
