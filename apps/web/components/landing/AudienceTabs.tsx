"use client";

import { useId, useRef, useState } from "react";
import { MenuIcon } from "../site/MenuIcon";
import { AUDIENCES } from "./audiences";
import { OrbitVisual } from "./OrbitVisual";
import { Pill } from "./Pill";
import styles from "./AudienceTabs.module.css";

/**
 * Audience tabs.
 *
 * The tab strip is joined to the panel below it: the selected tab's fill covers
 * the panel's top border, so the two read as one continuous shape with a notch
 * rather than as a row of buttons above a box. That is the reason the panel
 * takes an opaque fill while most surfaces on this page are translucent — the
 * trick only works if the tab can paint over a border, and you cannot paint
 * over anything with 60% alpha.
 *
 * KEYBOARD BEHAVIOUR
 *
 * Implemented to the tabs pattern rather than left as a row of buttons: arrow
 * keys move between tabs and wrap at the ends, Home and End jump to either end,
 * and only the selected tab is in the tab order (`tabIndex -1` on the rest) so
 * Tab moves *past* the strip into the panel instead of walking through six
 * buttons. Selection follows focus, which is correct when switching costs
 * nothing — there is no request behind these panels.
 */
export function AudienceTabs() {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const stripRef = useRef<HTMLDivElement | null>(null);

  const select = (index: number) => {
    const count = AUDIENCES.length;
    // Modulo with the length added first so -1 wraps to the last tab rather
    // than producing a negative index.
    const next = ((index % count) + count) % count;
    setActive(next);
    const tabs = stripRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    tabs?.[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        select(active + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        select(active - 1);
        break;
      case "Home":
        event.preventDefault();
        select(0);
        break;
      case "End":
        event.preventDefault();
        select(AUDIENCES.length - 1);
        break;
      default:
        break;
    }
  };

  const current = AUDIENCES[active] ?? AUDIENCES[0];
  if (current === undefined) return null;

  return (
    <section className={styles.section} data-reveal>
      <div
        className={styles.strip}
        role="tablist"
        aria-label="Who the bridge is for"
        ref={stripRef}
        onKeyDown={onKeyDown}
      >
        {AUDIENCES.map((audience, index) => (
          <button
            key={audience.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${audience.id}`}
            aria-selected={index === active}
            aria-controls={`${baseId}-panel-${audience.id}`}
            tabIndex={index === active ? 0 : -1}
            className={styles.tab}
            onClick={() => setActive(index)}
          >
            {audience.tab}
          </button>
        ))}
      </div>

      <div
        className={styles.panel}
        role="tabpanel"
        id={`${baseId}-panel-${current.id}`}
        aria-labelledby={`${baseId}-tab-${current.id}`}
        tabIndex={0}
      >
        {/* Keying on the audience id remounts the contents when the tab
            changes, which is what restarts the entry animation. Without the
            key React would reuse the nodes and the panel would swap text with
            no transition at all. */}
        <div key={current.id} className={`${styles.body} ark-panel-in`}>
          <div className={styles.figure}>
            <OrbitVisual>
              <MenuIcon name={current.icon} />
            </OrbitVisual>
          </div>

          <div className={styles.copy}>
            <h2 className={`ark-section-title ${styles.title}`}>{current.title}</h2>
            <p className={styles.claim}>
              <span className="ark-lead-in">{current.lead}</span>
            </p>
            <p className={styles.prose}>{current.body}</p>
            <div className={styles.action}>
              <Pill href={current.href} external={current.href.startsWith("http")}>
                {current.cta}
              </Pill>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
