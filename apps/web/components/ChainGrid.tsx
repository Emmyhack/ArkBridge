"use client";

import { ChainMark } from "@arkbridge/ui";
import type { ChainConfig } from "@arkbridge/types";
import styles from "./ChainGrid.module.css";

/**
 * The network picker, as a grid of chips.
 *
 * A grid rather than a list, because networks are a small closed set that a
 * user recognises by mark rather than reads by name — three columns of chips
 * can be scanned at a glance where a vertical list has to be read line by line.
 * It is also what the reference does, and it is right for the same reason.
 *
 * Each chip is tinted with its own brand colour at low alpha. That is not
 * decoration: the tint plus the mark is what makes a chip identifiable before
 * the label is read, which is the entire advantage a grid has over a list. The
 * tint is derived from the registry's `logo` field, so a chain added to the
 * registry gets a chip without anything here changing.
 */
const BRAND: Record<string, string> = {
  ethereum: "#627eea",
  base: "#0052ff",
  bnb: "#f3ba2f",
};

export function ChainGrid({
  chains,
  selected,
  onSelect,
  label,
}: {
  readonly chains: readonly ChainConfig[];
  readonly selected: string | undefined;
  readonly onSelect: (key: string) => void;
  readonly label: string;
}) {
  if (chains.length === 0) return null;

  return (
    <ul className={styles.grid} aria-label={label}>
      {chains.map((chain) => {
        // Ark has no third-party brand colour to borrow, so it takes the
        // interface's own accent — which is correct: it is the hub, not a guest.
        const tint = chain.logo === undefined ? undefined : BRAND[chain.logo];
        return (
          <li key={chain.key}>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={chain.key === selected}
              style={tint === undefined ? undefined : { ["--chip-tint" as string]: tint }}
              onClick={() => {
                onSelect(chain.key);
              }}
            >
              <ChainMark chainKey={chain.key} label={chain.name} logo={chain.logo} />
              <span className={styles.name}>{chain.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
