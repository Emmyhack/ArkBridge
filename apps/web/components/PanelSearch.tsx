"use client";

import { useId } from "react";

/**
 * The search field inside a picker panel.
 *
 * Deliberately a plain controlled input rather than part of `SearchList`. The
 * reference panel has *two* of them — one filtering networks, one filtering
 * assets — over two different result sets, and a search box welded to a list
 * cannot be used twice on one panel. Separating them also means the network
 * grid and the asset list can each render in their own shape.
 *
 * The magnifier is a background image on the input (see `.ark-search__input`),
 * not an element, so there is nothing extra in the accessibility tree for a
 * decoration.
 */
export function PanelSearch({
  value,
  onChange,
  placeholder,
  label,
  autoFocus = false,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly label: string;
  /**
   * Whether this field should hold focus when the panel opens.
   *
   * A modal `<dialog>` focuses its first focusable child unless something
   * declares `autofocus`, which here means the back arrow — so the panel opened
   * with a focus ring around the control that *leaves* it. The caret belongs in
   * whichever field the panel exists to filter.
   *
   * The asset panel has two search fields and passes `false` for the network
   * one, because `SearchList`'s own input already claims focus and the asset
   * list is what someone opening "Select asset" came to search.
   */
  readonly autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <>
      <label className="ark-visually-hidden" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ark-search__input"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        // Autofocus inside a modal panel the user explicitly opened is the one
        // case where moving focus is expected rather than disorienting — and
        // the panel is a focus trap, so it cannot strand anyone.
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </>
  );
}
