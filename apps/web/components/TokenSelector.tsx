"use client";

import { useState } from "react";
import { ChainMark, Dialog, SearchList, type SearchItem } from "@arkbridge/ui";
import { ChainGrid } from "./ChainGrid";
import { PanelSearch } from "./PanelSearch";
import type { RouteCatalog } from "@arkbridge/bridge-core";
import type { BridgeToken, ChainConfig } from "@arkbridge/types";
import styles from "./Selector.module.css";

/**
 * Asset selector (§27, §28).
 *
 * Every entry states where the asset came from. This is mandatory, not
 * decorative: two assets can share a ticker and be entirely different things
 * (Sepolia MockUSDC and Base MockUSDC are separate collateral pools), and a
 * synthetic must never be allowed to read as issuer-native.
 */
/** Addresses are compared character by character, so the middle is what gets
 *  elided — never the ends. */
function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function TokenSelector({
  catalog,
  tokens,
  selected,
  destinationChain,
  onSelect,
  variant = "pill",
  disabled = false,
  sourceChains,
  sourceChain,
  onSelectChain,
}: {
  readonly catalog: RouteCatalog;
  readonly tokens: readonly BridgeToken[];
  readonly selected: BridgeToken | undefined;
  readonly destinationChain: string;
  readonly onSelect: (id: string) => void;
  /**
   * `lead` puts the asset mark before the symbol and gives the trigger a
   * surface of its own, so it can sit at the head of an amount row as the
   * thing being counted. `pill` is the compact form.
   */
  readonly variant?: "pill" | "lead";
  /**
   * The receive side shows the same asset it cannot change — bridging does not
   * swap. Rendering it disabled rather than as plain text keeps both rows the
   * same shape, so the amounts stay on one optical line.
   */
  readonly disabled?: boolean;
  /**
   * The networks a transfer can start from, and the one selected.
   *
   * Choosing the asset and choosing the network it comes from is one decision,
   * not two — "MockUSDC" means nothing until you say which chain's MockUSDC.
   * The reference puts both in this panel and it is right to: splitting them
   * across two pickers makes the user hold the first choice in their head while
   * making the second.
   */
  readonly sourceChains?: readonly ChainConfig[] | undefined;
  readonly sourceChain?: string | undefined;
  readonly onSelectChain?: ((key: string) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items: SearchItem[] = tokens.map((token) => {
    const origin = catalog.chains[token.canonicalChain];
    const bridged = token.canonicalChain !== destinationChain;

    // The address on the chain the user is spending from — not the canonical
    // one — because that is the contract their wallet will interact with.
    const spendChain = sourceChain ?? token.canonicalChain;
    const address = token.representations[spendChain]?.address;
    const explorer = catalog.chains[spendChain]?.explorerUrl;

    return {
      id: token.id,
      terms: [
        token.symbol,
        token.name,
        token.id,
        origin?.name ?? token.canonicalChain,
        address ?? "",
      ],
      render: (
        <>
          <ChainMark chainKey={token.canonicalChain} label={token.symbol} logo={origin?.logo} />
          <span className={styles.optionText}>
            <span className={styles.optionName}>{token.name}</span>
            <span className={styles.optionMeta}>
              {token.symbol}
              {address === undefined ? null : (
                <>
                  {" "}
                  <span className={`${styles.optionAddress} ark-mono`}>
                    {shortenAddress(address)}
                  </span>
                  {explorer === undefined ? null : (
                    <span className={styles.optionLink} aria-hidden="true">
                      ↗
                    </span>
                  )}
                </>
              )}
            </span>
            <span className={styles.optionOrigin}>
              {bridged ? "Bridged via ArkBridge · " : ""}
              Origin: {origin?.name ?? token.canonicalChain}
            </span>
          </span>
        </>
      ),
    };
  });

  return (
    <>
      <button
        type="button"
        className={variant === "lead" ? styles.tokenLead : styles.tokenTrigger}
        onClick={() => {
          setOpen(true);
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label="Select asset"
      >
        {variant === "lead" && selected !== undefined ? (
          <ChainMark
            chainKey={selected.canonicalChain}
            label={selected.symbol}
            logo={catalog.chains[selected.canonicalChain]?.logo}
          />
        ) : null}
        {selected?.symbol ?? "Select"}
        {disabled ? null : (
          <span className={styles.chevron} aria-hidden="true">
            ▾
          </span>
        )}
      </button>

      <Dialog
        open={open}
        title="Select asset"
        onClose={() => {
          setOpen(false);
        }}
      >
        {sourceChains === undefined || onSelectChain === undefined ? null : (
          <>
            <PanelSearch
              value={query}
              onChange={setQuery}
              placeholder="Search by network name"
              label="Search networks"
            />
            <ChainGrid
              chains={
                query.trim() === ""
                  ? sourceChains
                  : sourceChains.filter((chain) =>
                      `${chain.name} ${chain.key}`
                        .toLowerCase()
                        .includes(query.trim().toLowerCase()),
                    )
              }
              selected={sourceChain}
              label="Pay from network"
              onSelect={(key) => {
                onSelectChain(key);
                setQuery("");
              }}
            />
            <hr className={styles.panelRule} />
          </>
        )}

        <SearchList
          items={items}
          placeholder="Search by name or paste address"
          emptyLabel="No assets available on this route."
          onSelect={(id) => {
            onSelect(id);
            setOpen(false);
            setQuery("");
          }}
        />
      </Dialog>
    </>
  );
}
