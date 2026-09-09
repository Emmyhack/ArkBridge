"use client";

import { useEffect } from "react";

/**
 * Reveal elements as they enter the viewport.
 *
 * Uses IntersectionObserver rather than scroll offsets, so it costs nothing on
 * the scroll thread and content a user scrolls straight past does not animate
 * late and draw the eye backwards.
 *
 * Two deliberate details:
 *
 *   - The hidden initial state is applied by JS (`data-reveal-ready`), never by
 *     the stylesheet alone. If JS fails or is still loading, every element
 *     stays visible — content that only appears with working JS is a content
 *     failure, not a motion one.
 *   - Elements are unobserved once revealed. A reveal is a one-time arrival,
 *     not something that replays whenever the user scrolls back.
 */
export function useReveal(): void {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (nodes.length === 0) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    document.documentElement.setAttribute("data-reveal-ready", "true");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          // Stagger within a group so a row of cards arrives in sequence rather
          // than as one block. Capped, so a long list never crawls.
          const index = Number(element.dataset["revealIndex"] ?? 0);
          element.style.transitionDelay = `${Math.min(index, 6) * 60}ms`;
          element.dataset["revealed"] = "true";
          observer.unobserve(element);
        }
      },
      // Trigger slightly before the element is fully on screen, so it finishes
      // settling as it comes into view rather than starting once it is there.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );

    for (const node of nodes) observer.observe(node);

    return () => {
      observer.disconnect();
      document.documentElement.removeAttribute("data-reveal-ready");
    };
  }, []);
}
