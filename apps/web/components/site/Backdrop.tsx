import styles from "./Backdrop.module.css";

/**
 * The ambient background.
 *
 * A dark site with a flat background reads as a void; the eye has nothing to
 * anchor on and every section looks like the same rectangle. This lays down a
 * faint field of overlapping blocks in the accent hue, heavily blurred, so
 * there is depth behind the content without anything competing with it.
 *
 * Constraints it is built to:
 *
 *   - `position: fixed` and `pointer-events: none`, so it never affects layout,
 *     never intercepts a click, and does not repaint on scroll.
 *   - Opacities in the 3–7% range. Anything stronger and the blocks become
 *     shapes a reader tries to interpret rather than texture they ignore.
 *   - No animation. Moving backgrounds are excluded by §52/§59, and a drifting
 *     gradient behind a form where someone is entering an amount is exactly the
 *     kind of ambient motion that reads as instability.
 *
 * The blocks are rectangular rather than the usual soft circles on purpose:
 * squares and columns echo the block-and-chain vocabulary, and they read as
 * architecture rather than as lens flare.
 */
export function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.field}>
        <span className={styles.block} data-block="a" />
        <span className={styles.block} data-block="b" />
        <span className={styles.block} data-block="c" />
        <span className={styles.block} data-block="d" />
        <span className={styles.block} data-block="e" />
      </div>
      {/* The grid is what keeps it from reading as a smear: a very faint ruled
          field, masked to fade out before the edges of the viewport. */}
      <div className={styles.grid} />
      {/* Vignette last, so it darkens both the blocks and the grid and pulls
          attention back to the centre column where the content is. */}
      <div className={styles.vignette} />
    </div>
  );
}
