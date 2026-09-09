import { Eyebrow } from "./Pill";
import { ArkMark } from "../site/ArkMark";
import styles from "./Borderless.module.css";

/**
 * The architecture section.
 *
 * Copy on the left, the globe on the right, and four facts along the bottom of
 * the copy column. The four facts are the load-bearing part: they are the
 * properties an informed reader will want confirmed before trusting a bridge,
 * stated as bare terms rather than sentences, so someone who already knows what
 * "token bucket" means can stop reading here.
 */
const FACTS: readonly { readonly term: string; readonly gloss: string }[] = [
  { term: "Hub and spoke", gloss: "Topology" },
  { term: "Multisig quorum", gloss: "Verification" },
  { term: "Token bucket", gloss: "Rate limits" },
  { term: "One to one", gloss: "Collateral" },
];

export function Borderless() {
  return (
    <section className={styles.section}>
      <div className={styles.copy} data-reveal>
        <Eyebrow>ArkBridge architecture</Eyebrow>

        <h2 className="ark-section-title">Ark at the center of every route</h2>

        <p className={styles.prose}>
          Every route runs through Ark as the hub. External chains never bridge to each other
          directly — a transfer from Ethereum to BNB Chain is two legs through Ark, not one
          unaudited path between them. That constraint is enforced in the router, not left to
          convention, which is what keeps the number of routes to verify linear in the number of
          chains instead of quadratic.
        </p>

        <dl className={styles.facts}>
          {FACTS.map((fact, index) => (
            <div key={fact.term} className={styles.fact} data-reveal data-reveal-index={index}>
              <dt className={styles.term}>{fact.term}</dt>
              <dd className={styles.gloss}>{fact.gloss}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={styles.figure} data-reveal>
        <div className={styles.logo} role="img" aria-label="ArkBridge logo">
          <ArkMark className={styles.logoMark} />
          <span className={styles.logoType}>ArkBridge</span>
        </div>
      </div>
    </section>
  );
}
