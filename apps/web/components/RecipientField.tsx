"use client";

import { useState } from "react";
import { isAddress } from "viem";
import type { Address } from "@arkbridge/types";
import styles from "./RecipientField.module.css";

/**
 * Optional destination address (§65).
 *
 * Defaults to the connected wallet and stays collapsed, because sending
 * somewhere else is the rare case and putting it in the main flow invites
 * mistakes. Behind the disclosure, the address is validated as you type — an
 * invalid address must be caught here, not after the assets have moved.
 *
 * Deliberately no "same address on the destination chain" reassurance: the
 * recipient may be a contract that exists on one chain and not the other, and
 * ArkBridge cannot verify that for the user.
 */
export function RecipientField({
  account,
  value,
  onChange,
  onInvalidChange,
}: {
  readonly account: Address | undefined;
  readonly value: Address | undefined;
  readonly onChange: (recipient: Address | undefined) => void;
  readonly onInvalidChange: (invalid: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  const custom = value !== undefined && value !== account;
  const invalid = input.trim() !== "" && !isAddress(input.trim());

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {open ? "▾" : "▸"} Send to another wallet
        {custom && !open ? <span className={styles.badge}>custom</span> : null}
      </button>

      {open ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="recipient">
            Destination address
          </label>
          <input
            id="recipient"
            className={styles.input}
            spellCheck={false}
            autoComplete="off"
            placeholder={account ?? "0x…"}
            value={input}
            onChange={(event) => {
              const next = event.target.value;
              setInput(next);
              const trimmed = next.trim();
              onInvalidChange(trimmed !== "" && !isAddress(trimmed));
              if (trimmed === "") onChange(undefined);
              else if (isAddress(trimmed)) onChange(trimmed);
              else onChange(undefined);
            }}
            aria-invalid={invalid}
          />
          {invalid ? (
            <p className={styles.error} role="alert">
              That is not a valid address. Assets sent to an invalid address cannot be recovered.
            </p>
          ) : (
            <p className={styles.hint}>
              Leave empty to receive at your connected wallet. Check this address carefully — a
              transfer cannot be reversed.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
