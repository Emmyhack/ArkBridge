import styles from "./SupportButton.module.css";

/**
 * Persistent support affordance.
 *
 * Fixed bottom-right on every page. The justification for spending a permanent
 * corner of the viewport on it is specific to this product: when a bridge
 * transfer appears stuck, the user is looking at their own money and has no way
 * to tell whether they should wait or escalate. Making them hunt through a
 * footer for a support link at that moment is the worst possible time.
 *
 * It is a link to the issue tracker, not a chat widget — an honest one that
 * goes somewhere real, rather than a bubble implying staffed live support that
 * does not exist.
 */
export function SupportButton() {
  return (
    <a
      className={styles.button}
      href="https://github.com/Emmyhack/ArkBridge/issues/new"
      target="_blank"
      rel="noreferrer"
      aria-label="Get help with a transfer"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path
          d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2Zm16 0a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.label}>Get help</span>
    </a>
  );
}
