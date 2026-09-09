import type { MenuIconName } from "./navigation";

/**
 * The menu glyph set.
 *
 * Drawn inline rather than shipped as an icon font or sprite: there are ten of
 * them, they are all one stroke weight, and inlining means they inherit
 * `currentColor` and need no second network request before the nav is usable.
 *
 * Every path is on a 24-unit grid with a 1.6 stroke, so they sit at a
 * consistent visual weight next to 15px type.
 */
const PATHS: Record<MenuIconName, string> = {
  // An arch: two piers and a span. The literal reading of "bridge".
  bridge: "M3 16v-2a9 9 0 0 1 18 0v2M8 16v4M16 16v4M3 20h18",
  activity: "M3 12h4l3 7 4-14 3 7h4",
  tokens: "M12 3 4 7v10l8 4 8-4V7Z M4 7l8 4 8-4M12 11v10",
  status: "M12 3a9 9 0 1 0 9 9M12 7v5l3 2",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z M19 3v18",
  shield: "M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6Z M9.5 12l1.8 1.8L15 10",
  question:
    "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z M9.4 9.2A2.7 2.7 0 0 1 14 11c0 1.8-2 2-2 3.4M12 17.2h.01",
  code: "m9 8-5 4 5 4M15 8l5 4-5 4M13.5 5l-3 14",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  route:
    "M6 4v10a4 4 0 0 0 4 4h4M6 4a2 2 0 1 0 0-.01Z M18 22a2 2 0 1 0 0-.01Z M18 18v-4a4 4 0 0 0-4-4h-4",
};

export function MenuIcon({ name }: { readonly name: MenuIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={PATHS[name]}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The disclosure chevron on a menu trigger. Rotates when its menu is open. */
export function Chevron({ className }: { readonly className?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...(className === undefined ? {} : { className })}
    >
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The "leaves this site" mark, on external links only. */
export function ExternalArrow() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="10"
      height="10"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
