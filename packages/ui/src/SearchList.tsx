"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface SearchItem {
  readonly id: string;
  /** Everything the search should match against. */
  readonly terms: readonly string[];
  readonly render: ReactNode;
  readonly disabled?: boolean;
}

/**
 * A searchable, keyboard-navigable option list.
 *
 * Arrow keys move, Enter selects, and the active option is scrolled into view.
 * A list that can only be used with a mouse fails §118, and a chain selector is
 * the one control every user must operate before anything else works.
 */
export function SearchList({
  items,
  onSelect,
  placeholder,
  emptyLabel,
}: {
  readonly items: readonly SearchItem[];
  readonly onSelect: (id: string) => void;
  readonly placeholder: string;
  readonly emptyLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return items;
    return items.filter((item) => item.terms.some((term) => term.toLowerCase().includes(needle)));
  }, [items, query]);

  // Reset the highlight whenever the result set changes, so Enter never selects
  // something the user can no longer see.
  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({
      block: "nearest",
    });
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[active];
      if (item !== undefined && item.disabled !== true) onSelect(item.id);
    }
  }

  return (
    <div className="ark-search">
      <input
        className="ark-search__input"
        type="search"
        autoFocus
        value={query}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />

      {filtered.length === 0 ? (
        <p className="ark-search__empty">{emptyLabel}</p>
      ) : (
        <ul className="ark-search__list" ref={listRef} role="listbox">
          {filtered.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                data-active={index === active}
                disabled={item.disabled === true}
                className="ark-search__option"
                onMouseEnter={() => {
                  setActive(index);
                }}
                onClick={() => {
                  onSelect(item.id);
                }}
              >
                {item.render}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
