"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A picker panel.
 *
 * Still a native `<dialog>`, because the platform already implements the parts
 * that are easy to get wrong and expensive to get wrong: focus trapping,
 * inertness of the page behind, Escape to close, and a top layer that avoids
 * z-index fights. A user who cannot escape a modal, or whose screen reader
 * keeps reading the page behind it, cannot use the bridge at all (§118).
 *
 * WHY IT IS NOT CENTRED
 *
 * It used to open as a 440px box in the middle of the screen. The reference
 * behaves differently and better: the picker takes the exact width and position
 * of the form it belongs to, so choosing an asset reads as the card turning
 * over rather than as a separate window arriving on top of it. The form does
 * not jump, and the eye does not have to travel.
 *
 * Reconciling that with the top layer takes one measurement. A modal `<dialog>`
 * is painted in the top layer, where it is positioned against the viewport
 * rather than any ancestor — so on open it walks up its own DOM tree (which is
 * preserved, even though painting is not) to the nearest `[data-picker-anchor]`
 * and pins itself to that element's viewport rect. Native behaviour, anchored
 * placement.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [frame, setFrame] = useState<{ left: number; top: number; width: number } | undefined>();

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    if (open && !element.open) {
      const anchor = element.closest("[data-picker-anchor]");
      if (anchor !== null) {
        const box = anchor.getBoundingClientRect();
        setFrame({ left: box.left, top: box.top, width: box.width });
      }
      element.showModal();
      return;
    }

    if (!open && element.open) {
      // Close after the exit animation rather than immediately, or the panel
      // vanishes and the backdrop lingers. Checked because a user who asked for
      // reduced motion gets no exit animation to wait for.
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        element.close();
        return;
      }
      element.setAttribute("data-closing", "true");
      const timer = window.setTimeout(() => {
        element.removeAttribute("data-closing");
        element.close();
      }, 140);
      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [open]);

  // The anchor moves when the page scrolls; the panel is fixed, so it must
  // follow. Only while open, and passive because it never blocks the scroll.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      // Read the ref into a local first: `ref.current?.closest()` widens the
      // result to include `undefined`, which then cannot be narrowed with a
      // `=== null` check alone.
      const element = ref.current;
      if (element === null) return;
      const anchor = element.closest("[data-picker-anchor]");
      if (anchor === null) return;
      const box = anchor.getBoundingClientRect();
      setFrame({ left: box.left, top: box.top, width: box.width });
    };
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ark-dialog"
      aria-label={title}
      data-anchored={frame !== undefined}
      style={
        frame === undefined
          ? undefined
          : {
              left: `${frame.left}px`,
              top: `${frame.top}px`,
              width: `${frame.width}px`,
            }
      }
      onClose={onClose}
      // Clicking the backdrop closes. The check compares against the dialog
      // itself: clicks inside the content bubble up with a different target.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="ark-dialog__panel">
        <header className="ark-dialog__head">
          {/* Back, not close. The panel replaced the form rather than covering
              it, so the action that dismisses it is a return to what was
              there — and an arrow says that where an ✕ would not. */}
          <button type="button" className="ark-dialog__back" onClick={onClose} aria-label="Back">
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
              <path
                d="M12 4 6 10l6 6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h2 className="ark-dialog__title">{title}</h2>
        </header>
        {children}
      </div>
    </dialog>
  );
}
