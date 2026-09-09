import { ArkMark } from "../site/ArkMark";
import { Pill } from "./Pill";
import styles from "./StartHere.module.css";

export function StartHere() {
  return (
    <section className={styles.section}>
      <div className={styles.stage}>
        <ArkMark className={styles.backgroundLogo} />

        <div className={styles.content} data-reveal>
          <h2 className="ark-section-title">Make your first ArkBridge transfer</h2>
          <p className={styles.lead}>
            Connect an EVM wallet, choose an available route, review the quote, and track delivery
            on-chain. Non-mainnet environments use test assets only.
          </p>
          <Pill href="/bridge" variant="solid" size="lg">
            Open the bridge
          </Pill>
        </div>
      </div>
    </section>
  );
}
