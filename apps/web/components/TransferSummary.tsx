"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import styles from "./TransferSummary.module.css";

/**
 * The consequence line, and everything behind it.
 *
 * One row the user always sees, carrying the facts that change a decision —
 * what arrives, and roughly when. Everything else is one click away: the fee
 * breakdown, the route, the capacity, the router addresses.
 *
 * WHY THIS REPLACED A PERMANENT PANEL
 *
 * The card previously showed a route panel beside it at all times. It was
 * accurate and almost always ignorable — on the common path the route is the
 * one the user already chose, and restating it competes with the form for
 * attention (§16, §35). Collapsing it costs a click for the minority who want
 * the detail and gives the majority a card they can read top to bottom.
 *
 * The row is a real disclosure, not a hover: `aria-expanded` on the trigger,
 * the panel referenced by `aria-controls`, and the content removed from the
 * tree when closed rather than hidden with CSS — a collapsed panel that still
 * holds focusable children is a keyboard trap that looks fine to a mouse.
 */
export function TransferSummary({
  headline,
  eta,
  badge,
  children,
}: {
  /** The number that matters: what lands on the other side. */
  readonly headline: ReactNode;
  /** Always an estimate, never a promise (§34). */
  readonly eta: string;
  /** A short standing fact about the route — backing, or its absence. */
  readonly badge?: string | undefined;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={styles.wrap} data-open={open}>
      <button
        type="button"
        className={styles.bar}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <span className={styles.lead}>
          {badge === undefined ? null : <span className={styles.badge}>{badge}</span>}
          <span className={styles.headline}>{headline}</span>
        </span>

        <span className={styles.trail}>
          <span className={styles.eta}>{eta}</span>
          <span className={styles.chevron} aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
              <path
                d="m4 6 4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      </button>

      {open ? (
        <div className={styles.panel} id={panelId}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
