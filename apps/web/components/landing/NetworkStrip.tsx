import { ChainMark } from "@arkbridge/ui";
import styles from "./NetworkStrip.module.css";

/**
 * The connected-networks strip.
 *
 * Each network shows the mark the chain registry gives it, so the strip and the
 * bridge card's selectors can never disagree about what a network looks like.
 * Ark Constellation gets its own mark here — it is the network, not the bridge,
 * and showing ArkBridge's logo against its name would say the two are the same
 * thing.
 *
 * The list is derived from the chain registry and the live route catalog, never
 * written by hand. A chain that is configured but carries no usable route is
 * shown greyed and labelled rather than hidden: hiding it would leave someone
 * who has heard the chain is coming with no way to tell whether it has arrived,
 * and listing it as live would be a straightforward lie.
 */
export type NetworkStatus = {
  readonly key: string;
  readonly name: string;
  readonly live: boolean;
  /** From the chain registry, so the strip cannot show a mark the selectors
   *  disagree with. */
  readonly logo?: "ark" | "ethereum" | "base" | "bnb" | undefined;
};

export function NetworkStrip({ networks }: { readonly networks: readonly NetworkStatus[] }) {
  if (networks.length === 0) return null;

  return (
    <section className={styles.strip} data-reveal aria-label="Connected networks">
      <p className={styles.caption}>Connected networks</p>
      <ul className={styles.list}>
        {networks.map((network) => (
          <li key={network.key} className={styles.item} data-enabled={network.live}>
            <ChainMark chainKey={network.key} label={network.name} logo={network.logo} />
            <span className={styles.name}>{network.name}</span>
            {network.live ? null : <span className={styles.pending}>soon</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
