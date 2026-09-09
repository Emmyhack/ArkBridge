"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Highlights a value when it changes.
 *
 * Quotes update as the user types or as capacity refreshes, and a number that
 * silently swaps is easy to miss — particularly the "you receive" figure, which
 * is the one a user is actually deciding on.
 *
 * The highlight is a background flash rather than a size or position change, so
 * nothing reflows. Motion that moves the thing you are reading is worse than no
 * motion at all.
 */
export function AnimatedValue({
  value,
  children,
}: {
  /** Changing this triggers the highlight. */
  readonly value: string;
  readonly children: ReactNode;
}) {
  const [flashing, setFlashing] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;

    // Skip the very first render: arriving at a value is not a change to it.
    setFlashing(true);
    const timer = window.setTimeout(() => {
      setFlashing(false);
    }, 320);
    return () => {
      window.clearTimeout(timer);
    };
  }, [value]);

  return <span className={flashing ? "ark-flash" : undefined}>{children}</span>;
}
