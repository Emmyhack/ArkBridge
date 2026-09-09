"use client";

import { useRef } from "react";
import styles from "./ModeTabs.module.css";

/**
 * The three ways to start a transfer.
 *
 *   Instant   Sign now, at whatever the network costs right now.
 *   Limit     Watch the source chain's base fee and sign when it falls to a
 *             ceiling you set.
 *   Direct    Send to a named counterparty on the destination chain, from a
 *             saved book rather than a retyped address.
 *
 * Every one of them ends in the same place — one transfer, one for one, through
 * the hub. They differ in *when* you sign and *who receives*, which is the only
 * axis a bridge actually has. There is no rate to trade against here, so a mode
 * that implied one would be theatre.
 *
 * Implemented as a real tablist: arrow keys move and wrap, Home and End jump to
 * the ends, and only the selected tab is in the tab order so Tab moves into the
 * form rather than through three buttons.
 */
export const MODES = [
  { id: "instant", label: "Instant" },
  { id: "limit", label: "Limit" },
  { id: "direct", label: "Direct" },
] as const;

export type Mode = (typeof MODES)[number]["id"];

export function ModeTabs({
  mode,
  onChange,
}: {
  readonly mode: Mode;
  readonly onChange: (mode: Mode) => void;
}) {
  const index = MODES.findIndex((m) => m.id === mode);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (to: number) => {
    const nextIndex = ((to % MODES.length) + MODES.length) % MODES.length;
    const next = MODES[nextIndex];
    if (next !== undefined) {
      onChange(next.id);
      tabs.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      className={styles.strip}
      role="tablist"
      aria-label="Transfer mode"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(index + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(index - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          move(0);
        } else if (event.key === "End") {
          event.preventDefault();
          move(MODES.length - 1);
        }
      }}
    >
      {MODES.map((item) => (
        <button
          key={item.id}
          ref={(node) => {
            tabs.current[item.id === "instant" ? 0 : item.id === "limit" ? 1 : 2] = node;
          }}
          type="button"
          role="tab"
          aria-selected={item.id === mode}
          tabIndex={item.id === mode ? 0 : -1}
          className={styles.tab}
          onClick={() => {
            onChange(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
