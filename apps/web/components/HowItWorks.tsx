import styles from "./HowItWorks.module.css";

/**
 * Below-the-fold explanation, revealed on scroll.
 *
 * Progressive disclosure taken from the reference pattern: the form is the
 * page, and this exists for the user who scrolls because they want to know what
 * actually happens to their money. It describes the real mechanism — lock,
 * verify, mint — rather than reassuring adjectives.
 */
const STEPS = [
  {
    title: "Your assets are locked, not sent",
    body: "The asset you bridge stays on its origin chain, locked in a contract. Nothing is transferred to a third party, and nothing is wrapped by anyone other than ArkBridge.",
  },
  {
    title: "Validators verify the transfer",
    body: "A validator set watching the origin chain signs the transfer, and the destination verifies those signatures before anything is minted. This is the slowest step, and the one that makes the transfer safe.",
  },
  {
    title: "A backed representation is issued",
    body: "You receive an ArkBridge representation on Ark, backed one-for-one by the locked collateral. Bridging back burns it and releases the original.",
  },
] as const;

export function HowItWorks() {
  return (
    <section className={styles.section} aria-labelledby="how-it-works">
      <h2 id="how-it-works" className={styles.heading} data-reveal>
        What happens to your assets
      </h2>

      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.title} className={styles.step} data-reveal data-reveal-index={index}>
            <span className={styles.number} aria-hidden="true">
              {index + 1}
            </span>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.stepBody}>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
