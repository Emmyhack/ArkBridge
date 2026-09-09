import { Outfit, Inter, JetBrains_Mono } from "next/font/google";

/**
 * ArkBridge's typefaces.
 *
 * Self-hosted at build time by `next/font` — no runtime request to a font CDN,
 * so there is no third-party dependency in the critical path and no layout
 * shift while a webfont loads. Each carries a system fallback stack for the
 * case where the file fails entirely.
 *
 *   Outfit         Display and headings. A geometric grotesque: near-circular
 *                  bowls, flat terminals, an even colour at very large sizes.
 *                  It is the face that carries the marketing surface, where a
 *                  single line of type is 76px tall and any quirk in the
 *                  letterforms becomes the whole impression.
 *   Inter          Body and UI. Chosen for legibility at 13–16px, which is
 *                  where almost all of the *application* lives.
 *   JetBrains Mono Addresses, hashes and ids only (§55). Disambiguated 0/O and
 *                  1/l/I matter when a user is comparing an address character
 *                  by character before signing.
 *
 * The split is deliberate: display type sells, body type is read. Using one
 * face for both means either a landing page that reads as a dashboard or a
 * dashboard that reads as a poster.
 */
export const displayFont = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--ark-font-display-face",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--ark-font-body-face",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--ark-font-mono-face",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const fontVariables = `${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`;
