"use client";

import { useReveal } from "@arkbridge/ui";

/**
 * Activates scroll reveals for the page.
 *
 * A component rather than a hook call in the layout, because the layout is a
 * server component and this needs the browser.
 */
export function RevealProvider() {
  useReveal();
  return null;
}
