import { Pill, QuietLink } from "./Pill";
import styles from "./Hero.module.css";

/**
 * The hero.
 *
 * One claim, one supporting sentence, one action. The headline is set in two
 * deliberate lines with an explicit break rather than left to wrap, because at
 * this size the break point is a design decision — wrapping naturally puts
 * "bridge" alone on line two at some viewport widths and reads as a mistake.
 *
 * WHAT IT DOES NOT SAY
 *
 * No volume figure, no TVL, no "$XXB bridged". Ark is a devnet; those numbers
 * would either be zero or invented, and a bridge that opens by overstating its
 * own scale has told you something true about how it will describe its risks.
 * The counters below are live facts about the network instead — how many
 * chains, how many routes, and what backs them.
 */
export function Hero({
  chainCount,
  routeCount,
  assetCount,
  networkNames,
}: {
  readonly chainCount: number;
  readonly routeCount: number;
  readonly assetCount: number;
  readonly networkNames: readonly string[];
}) {
  const coverage =
    networkNames.length > 0 ? networkNames.join(", ") : "configured ArkBridge networks";

  return (
    <section className={styles.hero}>
      <h1 className={`ark-hero ${styles.title}`}>
        <span className={styles.line}>Bridge assets securely</span>
        <span className={styles.line} data-line="2">
          into Ark
        </span>
      </h1>

      <p className={`ark-lead ${styles.lead}`}>
        Move supported assets across {coverage} through ArkBridge. Routes, token contracts, fees,
        limits, and transfer progress are made visible before and after you send.
      </p>

      <div className={styles.actions}>
        <Pill href="/bridge" variant="solid">
          Open the bridge
        </Pill>
        <Pill href="/faq">How it works</Pill>
      </div>

      <div className={styles.quiet}>
        <QuietLink href="/status">Live route status</QuietLink>
      </div>

      {/* Facts, not marketing. Each is derived from the route catalog at request
          time, so it cannot drift from what the bridge will actually let you
          do. */}
      <dl className={styles.stats} aria-label="Network coverage">
        {[
          { value: chainCount, label: chainCount === 1 ? "Network" : "Networks" },
          { value: routeCount, label: routeCount === 1 ? "Route" : "Routes" },
          { value: assetCount, label: assetCount === 1 ? "Asset" : "Assets" },
          { value: "1:1", label: "Backed" },
        ].map((stat, index) => (
          <div key={stat.label} className={styles.stat} data-reveal data-reveal-index={index}>
            <dt className={`${styles.statValue} ark-numeric`}>{stat.value}</dt>
            <dd className={styles.statLabel}>{stat.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
