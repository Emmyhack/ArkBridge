import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Pill.module.css";

/**
 * The call-to-action pill.
 *
 * Two variants and no more. `solid` is the one action a section wants you to
 * take; `outline` is everything else. The discipline matters more than the
 * styling — a section with two solid pills has, in effect, no primary action
 * (§13), so the type system here only ever lets a section make one thing loud
 * because the author has to consciously pick `solid`.
 */
export function Pill({
  href,
  children,
  variant = "outline",
  external = false,
  size = "md",
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly variant?: "solid" | "outline";
  readonly external?: boolean;
  readonly size?: "md" | "lg";
}) {
  const className = `${styles.pill} ${variant === "solid" ? styles.solid : styles.outline} ${
    size === "lg" ? styles.large : ""
  }`;

  if (external) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

/**
 * The dotted tertiary link, with a trailing corner arrow.
 *
 * A third rung below the two pills, for the destination that is worth offering
 * but not worth a button. The underline is dotted rather than solid so it reads
 * as clearly subordinate to the pills above it while still being obviously a
 * link — which a bare coloured word is not.
 */
export function QuietLink({
  href,
  children,
  external = false,
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly external?: boolean;
}) {
  const body = (
    <>
      {children}
      <svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true">
        <path
          d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </>
  );

  if (external) {
    return (
      <a className={styles.quiet} href={href} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }
  return (
    <Link className={styles.quiet} href={href}>
      {body}
    </Link>
  );
}

/**
 * The small labelled marker that introduces a section.
 *
 * Icon plus a short bold phrase, above the section title. It exists so a
 * section title can stay a plain statement — "Cross without noticing" — while
 * the eyebrow carries the categorisation that would otherwise bloat it.
 */
export function Eyebrow({
  children,
  icon,
}: {
  readonly children: ReactNode;
  readonly icon?: ReactNode;
}) {
  return (
    <p className={styles.eyebrow}>
      {icon === undefined ? (
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden="true">
          <path
            d="M6.5 2.5h-4v4M9.5 13.5h4v-4M2.5 2.5l4.5 4.5M13.5 13.5 9 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        icon
      )}
      {children}
    </p>
  );
}
