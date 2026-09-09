import styles from "./page.module.css";

export const metadata = {
  title: "FAQ",
  description: "Answers about ArkBridge assets, transfers, limits, security, and fees.",
};

/**
 * FAQ (§20).
 *
 * Answers the questions a user actually has when their money is mid-flight,
 * rather than marketing copy. Every answer here matches behaviour that is
 * implemented and tested — an FAQ that describes something the product does not
 * do is worse than no FAQ.
 */
const QUESTIONS = [
  {
    q: "Is the asset I receive the same as the one I sent?",
    a: "No, and ArkBridge never claims otherwise. What you receive on Ark is an ArkBridge-issued representation backed one-for-one by the original asset, which stays locked on its origin chain until you bridge back. The asset's origin is shown everywhere it appears.",
  },
  {
    q: "Why does my transfer say 'verifying' for several minutes?",
    a: "Cross-chain transfers are verified by validators watching the source chain, and that step is the slowest part. A transfer in this state has not failed — your source transaction completed and the assets are accounted for. If it takes unusually long, the interface says so explicitly rather than showing an error.",
  },
  {
    q: "What happens if something goes wrong after I've sent?",
    a: "Once your source transaction confirms, the transfer is recorded on-chain and may require operator attention if delivery stalls. Check the transfer status and source transaction first, then use the support link with your transaction hash or message ID. Do not submit a duplicate transfer while the original is still in progress.",
  },
  {
    q: "Why can't I bridge directly between Ethereum and BNB Chain?",
    a: "ArkBridge routes external liquidity through Ark. Every route has Ark at one end by design, so an external-to-external transfer is not something the product offers — and the interface will not let you construct one.",
  },
  {
    q: "Why is there a limit on how much I can transfer?",
    a: "Each route has a per-transaction cap plus hourly and daily allowances. Limits exist so that a problem cannot drain a route faster than a human can react to it. The remaining capacity is shown before you commit, so you are never asked to confirm a transfer that will be rejected.",
  },
  {
    q: "Can a transfer be paused?",
    a: "Yes. Routes can be paused individually, in either direction, without affecting other assets or chains. A paused route says so plainly — it is a deliberate action, not a fault, and your funds are unaffected.",
  },
  {
    q: "Who controls the bridge?",
    a: "Cross-chain messages are verified by the validator configuration assigned to each route. ArkBridge also separates configuration, rate-limit, and pause roles. Routes that do not meet the project's documented security requirements are gated and do not appear as transferable routes.",
  },
  {
    q: "What are the fees?",
    a: "Two, listed separately: the cost of delivering the message on the destination chain, and ArkBridge's own protocol fee. Where the protocol fee is zero, it is shown as zero rather than hidden.",
  },
] as const;

export default function FaqPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Frequently asked questions</h1>
      <dl className={styles.list}>
        {QUESTIONS.map((item) => (
          <div key={item.q} className={styles.item}>
            <dt className={styles.question}>{item.q}</dt>
            <dd className={styles.answer}>{item.a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
