"use client";

import { useEffect, useRef, useState } from "react";
import { isAddress } from "viem";
import type { Address } from "@arkbridge/types";
import {
  listCounterparties,
  removeCounterparty,
  saveCounterparty,
  shorten,
  type Counterparty,
} from "../lib/counterparties";
import styles from "./CounterpartyField.module.css";

/**
 * The destination address, and the book of ones already used.
 *
 * Direct mode makes the recipient a required, first-class field rather than
 * something behind a disclosure. That is the point of the mode: you are sending
 * to someone else, so the address is the subject, not an override.
 *
 * The field is labelled with the destination chain by name — "Address on Ark
 * Constellation", never just "Address". The same 42 characters can be a
 * multisig on one chain and unclaimed space on another, and a transfer to an
 * address that does not exist on the receiving side is unrecoverable. Naming
 * the chain in the label is the cheapest possible guard against that.
 *
 * Validation runs as you type and blocks the transfer, rather than reporting
 * afterwards. There is no afterwards.
 */
export function CounterpartyField({
  destinationChainKey,
  destinationChainName,
  value,
  onChange,
}: {
  readonly destinationChainKey: string;
  readonly destinationChainName: string;
  readonly value: Address | undefined;
  readonly onChange: (address: Address | undefined) => void;
}) {
  const [input, setInput] = useState(value ?? "");
  const [label, setLabel] = useState("");
  const [book, setBook] = useState<readonly Counterparty[]>([]);
  const [bookOpen, setBookOpen] = useState(false);

  // Read on mount and whenever the destination changes: the book is per chain,
  // and localStorage cannot be read during render on the server.
  useEffect(() => {
    setBook(listCounterparties(destinationChainKey));
  }, [destinationChainKey]);

  /*
   * The parent passes a fresh `onChange` on every render, so depending on it
   * directly would re-run the effect below on every keystroke and clear the
   * field as it was being typed into. Holding it in a ref lets the effect
   * depend only on what actually changed — the destination — while still
   * calling the current callback. The alternative, suppressing the dependency
   * warning, hides the same hazard rather than removing it.
   */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Switching destination invalidates a chosen address — it was chosen for a
  // different chain, where it may be a contract that does not exist here.
  // Clearing is the safe direction.
  useEffect(() => {
    setInput("");
    onChangeRef.current(undefined);
  }, [destinationChainKey]);

  const trimmed = input.trim();
  const invalid = trimmed !== "" && !isAddress(trimmed);
  const valid = trimmed !== "" && !invalid;

  const commit = (next: string) => {
    setInput(next);
    const clean = next.trim();
    onChange(isAddress(clean) ? clean : undefined);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <label className={styles.label} htmlFor="counterparty-address">
          Address on {destinationChainName}
          <span className={styles.required} aria-hidden="true">
            {" "}
            *
          </span>
        </label>

        <button
          type="button"
          className={styles.bookToggle}
          aria-expanded={bookOpen}
          onClick={() => {
            setBookOpen((open) => !open);
          }}
        >
          Counterparty book
          <span className={styles.count}>{book.length}</span>
        </button>
      </div>

      <input
        id="counterparty-address"
        className={styles.input}
        placeholder="0x…"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={invalid ? "counterparty-error" : undefined}
        value={input}
        onChange={(event) => {
          commit(event.target.value);
        }}
      />

      {invalid ? (
        <p className={styles.error} id="counterparty-error" role="alert">
          That is not a valid address. Check it character by character — a transfer cannot be
          reversed.
        </p>
      ) : null}

      {valid ? (
        <div className={styles.save}>
          <input
            className={styles.labelInput}
            placeholder="Name this address (optional)"
            aria-label="Counterparty name"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => {
              if (saveCounterparty(destinationChainKey, label, trimmed)) {
                setBook(listCounterparties(destinationChainKey));
                setLabel("");
              }
            }}
          >
            Save
          </button>
        </div>
      ) : null}

      {bookOpen ? (
        book.length === 0 ? (
          <p className={styles.empty}>
            No saved addresses for {destinationChainName} yet. Enter one above and save it.
          </p>
        ) : (
          <ul className={styles.list}>
            {book.map((entry) => (
              <li key={entry.address} className={styles.entry}>
                <button
                  type="button"
                  className={styles.pick}
                  onClick={() => {
                    commit(entry.address);
                    setBookOpen(false);
                  }}
                >
                  <span className={styles.entryLabel}>{entry.label}</span>
                  <span className={`${styles.entryAddress} ark-mono`}>
                    {shorten(entry.address)}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${entry.label}`}
                  onClick={() => {
                    removeCounterparty(destinationChainKey, entry.address);
                    setBook(listCounterparties(destinationChainKey));
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
