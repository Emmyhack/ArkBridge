"use client";

import { useState } from "react";
import { ChainMark, Dialog } from "@arkbridge/ui";
import type { ChainConfig } from "@arkbridge/types";
import { ChainGrid } from "./ChainGrid";
import { PanelSearch } from "./PanelSearch";
import styles from "./Selector.module.css";

/**
 * Chain selector (§26).
 *
 * Shows the chain's name and its descriptor ("Devnet", "Sepolia testnet"), and
 * deliberately does NOT show chain ids — a user picking a network does not
 * think in numbers, and §26 says to keep them out of the normal selector. The
 * ids remain available under Advanced details for people who need them.
 *
 * Only chains that actually have a route are offered, so an unsupported pair
 * cannot be constructed and then rejected (§25).
 */
export function ChainSelector({
  label,
  chains,
  selected,
  onSelect,
  variant = "row",
}: {
  readonly label: string;
  readonly chains: readonly ChainConfig[];
  readonly selected: ChainConfig | undefined;
  readonly onSelect: (key: string) => void;
  /**
   * `row` fills the width and shows the descriptor on a second line. `chip` is
   * the compact form that sits in a panel header beside "You pay", where the
   * amount row below is the thing that should carry the visual weight.
   *
   * The options list is identical in both — only the trigger changes. A
   * compact trigger that also compacted the *choosing* would be the wrong
   * trade: the descriptor is how someone tells Sepolia from mainnet.
   */
  readonly variant?: "row" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  /*
   * Filtering matches the name, the descriptor and the registry key.
   *
   * The key matters: someone who has read the config or followed a deep link
   * knows this network as "ark-devnet" long before they know it as "Ark
   * Constellation", and a search that only matched display names fails them.
   */
  const needle = query.trim().toLowerCase();
  const matches =
    needle === ""
      ? chains
      : chains.filter((chain) =>
          [chain.name, chain.descriptor ?? "", chain.key].join(" ").toLowerCase().includes(needle),
        );

  return (
    <>
      <button
        type="button"
        className={variant === "chip" ? styles.chipTrigger : styles.trigger}
        onClick={() => {
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={label}
      >
        {selected === undefined ? (
          <span className={styles.optionName}>Select network</span>
        ) : (
          <>
            <ChainMark chainKey={selected.key} label={selected.name} logo={selected.logo} />
            <span className={styles.optionText}>
              <span className={styles.optionName}>{selected.name}</span>
              {/* The descriptor is dropped from the chip, not hidden by CSS:
                  "Sepolia testnet" under a 13px chip label wraps the header. It
                  is still on every option in the list, which is where the
                  choice is actually made. */}
              {variant === "chip" || selected.descriptor === undefined ? null : (
                <span className={styles.optionMeta}>{selected.descriptor}</span>
              )}
            </span>
          </>
        )}
        <span className={styles.chevron} aria-hidden="true">
          ▾
        </span>
      </button>

      <Dialog
        open={open}
        title={label}
        onClose={() => {
          setOpen(false);
        }}
      >
        <PanelSearch
          value={query}
          onChange={setQuery}
          placeholder="Search by network name"
          label="Search networks"
          autoFocus
        />
        {matches.length === 0 ? (
          <p className="ark-search__empty">No networks match that search.</p>
        ) : (
          <ChainGrid
            chains={matches}
            selected={selected?.key}
            label="Networks"
            onSelect={(key) => {
              onSelect(key);
              setOpen(false);
              setQuery("");
            }}
          />
        )}
      </Dialog>
    </>
  );
}
