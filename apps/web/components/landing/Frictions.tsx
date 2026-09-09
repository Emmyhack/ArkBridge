"use client";

import { useEffect, useRef, useState } from "react";
import { MenuIcon } from "../site/MenuIcon";
import { Pill } from "./Pill";
import {
  connectorPath,
  FRICTIONS,
  GRID_HEIGHT,
  GRID_WIDTH,
  TILES,
  type Tile,
} from "./frictionGrid";
import styles from "./Frictions.module.css";

/**
 * Scroll-led friction story.
 *
 * A field of dormant capability tiles on the left; on the right, a rotating
 * claim about one friction the bridge removes. Changing slide lights two tiles
 * and draws the connector between them, so the abstract claim on the right
 * always points at something concrete on the left.
 *
 * AUTO-ADVANCE, AND WHEN NOT TO
 *
 * It advances on its own because a carousel nobody touches shows one slide and
 * wastes the other three. But auto-advance is hostile in three specific
 * situations, and all three are handled:
 *
 *   - While the pointer is over it, or focus is inside it. Content moving out
 *     from under someone who is reading it is the classic carousel failure.
 *   - After any manual selection. Taking over again a few seconds after
 *     someone chose a slide is worse than never advancing.
 *   - Under `prefers-reduced-motion`. Unattended movement is exactly what that
 *     preference is asking to be spared.
 */
export function Frictions() {
  const [active, setActive] = useState(0);
  const cardsRef = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const cards = cardsRef.current.filter((card): card is HTMLElement => card !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible === undefined) return;
        const index = Number((visible.target as HTMLElement).dataset.index);
        if (Number.isInteger(index)) setActive(index);
      },
      { rootMargin: "-32% 0px -32% 0px", threshold: [0.15, 0.35, 0.6, 0.85] },
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);

  const current = FRICTIONS[active] ?? FRICTIONS[0];
  if (current === undefined) return null;

  const byId = (id: string): Tile | undefined => TILES.find((tile) => tile.id === id);
  const [fromId, toId] = current.lit;
  const from = byId(fromId);
  const to = byId(toId);
  const path = from !== undefined && to !== undefined ? connectorPath(from, to) : null;

  return (
    <section className={styles.section}>
      <h2 className={`ark-section-title ${styles.title}`} data-reveal>
        Remove every reason to hesitate
      </h2>

      <div className={styles.layout}>
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.grid}>
            <svg
              className={styles.connector}
              viewBox={`0 0 ${GRID_WIDTH} ${GRID_HEIGHT}`}
              fill="none"
              role="presentation"
            >
              {path === null ? null : (
                /* Keyed on the slide so the draw-on animation restarts each time
                 the path changes; without the key React patches the `d`
                 attribute in place and the line simply teleports. */
                <path key={current.id} d={path} className={styles.connectorPath} />
              )}
            </svg>

            {TILES.map((tile) => {
              const lit = current.lit.includes(tile.id);
              return (
                <div
                  key={tile.id}
                  className={styles.tile}
                  data-lit={lit}
                  style={{ gridColumn: tile.col + 1, gridRow: tile.row + 1 }}
                >
                  <MenuIcon name={tile.icon} />
                  {/* The label appears only on a lit tile. Labelling all twelve
                    would turn the field into a list to be read, when it is
                    meant to be scenery until the copy points at part of it. */}
                  {lit ? <span className={styles.tileLabel}>{tile.label}</span> : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.panel}>
          {FRICTIONS.map((friction, index) => (
            <article
              key={friction.id}
              ref={(node) => {
                cardsRef.current[index] = node;
              }}
              className={styles.copy}
              data-active={index === active}
              data-index={index}
            >
              <p className={styles.step} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowIcon} aria-hidden="true">
                  <MenuIcon name={friction.icon} />
                </span>
                {friction.eyebrow}
              </p>
              <p className={styles.claim}>
                <span className="ark-lead-in">{friction.lead}</span> {friction.body}
              </p>
              <div className={styles.action}>
                <Pill href="/bridge" variant="solid">
                  Start a transfer
                </Pill>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
