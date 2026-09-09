import type { ReactNode } from "react";
import styles from "./OrbitVisual.module.css";

/**
 * The focal graphic beside a panel of copy.
 *
 * A glyph in a pool of light, ringed, with a few points scattered on and around
 * the ring and one point travelling it. It is doing two jobs: giving the eye
 * somewhere to land before it starts reading, and making the constellation
 * metaphor literal without spelling it out.
 *
 * The scattered dots are hand-placed, not random. Random placement here would
 * need a seeded generator to survive server rendering — an unseeded `Math.
 * random()` produces different coordinates on the server and the client, which
 * React reports as a hydration mismatch — and hand-placing six points is both
 * cheaper and better-composed than any generator would manage.
 */
const DOTS: readonly { readonly top: string; readonly left: string; readonly size: number }[] = [
  { top: "12%", left: "26%", size: 3 },
  { top: "30%", left: "8%", size: 2 },
  { top: "68%", left: "14%", size: 3 },
  { top: "86%", left: "44%", size: 2 },
  { top: "22%", left: "82%", size: 2 },
  { top: "74%", left: "88%", size: 3 },
];

export function OrbitVisual({ children }: { readonly children: ReactNode }) {
  return (
    <div className={styles.visual} aria-hidden="true">
      <div className={styles.glow} />
      <div className={styles.ring} />
      <div className={styles.orbit}>
        <span className={styles.satellite} />
      </div>
      <div className={styles.glyph}>{children}</div>
      {DOTS.map((dot) => (
        <span
          key={`${dot.top}-${dot.left}`}
          className={styles.dot}
          style={{ top: dot.top, left: dot.left, width: dot.size, height: dot.size }}
        />
      ))}
    </div>
  );
}
