import type { BridgeToken } from "@arkbridge/types";
import { BridgeError } from "@arkbridge/types";

/**
 * Amount handling.
 *
 * All arithmetic is bigint. Amounts are base units end to end, and are only
 * turned into a decimal string at the moment of display — a float anywhere in
 * this path silently loses precision on values a bridge routinely carries.
 */

/** Parse a user-entered decimal string into base units. */
export function parseAmount(input: string, decimals: number): bigint {
  // Thousands separators are stripped rather than rejected: `formatAmount`
  // emits them, and users paste what they see. Refusing our own output would
  // be a round-trip that fails on the happy path.
  const trimmed = input.trim().replace(/,/g, "");
  if (trimmed === "") return 0n;

  if (!/^\d*\.?\d*$/.test(trimmed)) {
    throw new BridgeError("INSUFFICIENT_BALANCE", `"${input}" is not a valid amount.`);
  }

  const [whole = "", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    // Truncating here would silently send less than the user typed. Reject and
    // let the UI say so instead.
    throw new BridgeError(
      "INSUFFICIENT_BALANCE",
      `This asset supports at most ${String(decimals)} decimal places.`,
    );
  }

  const padded = fraction.padEnd(decimals, "0");
  return BigInt(`${whole === "" ? "0" : whole}${padded}`);
}

/** Format base units for display. */
export function formatAmount(
  amount: bigint,
  decimals: number,
  options: { readonly maxFractionDigits?: number } = {},
): string {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const unit = 10n ** BigInt(decimals);

  const whole = value / unit;
  const fraction = value % unit;

  let fractionStr = fraction.toString().padStart(decimals, "0");
  const max = options.maxFractionDigits;
  if (max !== undefined && fractionStr.length > max) {
    fractionStr = fractionStr.slice(0, max);
  }
  fractionStr = fractionStr.replace(/0+$/, "");

  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = negative ? "-" : "";
  return fractionStr === "" ? `${sign}${wholeStr}` : `${sign}${wholeStr}.${fractionStr}`;
}

/**
 * Convert an amount between representations with different decimals.
 *
 * INV-10: conversion must never create value. Scaling down truncates, and the
 * truncated remainder is reported rather than hidden — a caller that ignores it
 * is choosing to strand dust, but it cannot accidentally mint any.
 */
export interface ConversionResult {
  readonly amount: bigint;
  /** Base units lost to truncation, in source decimals. Always >= 0. */
  readonly remainder: bigint;
}

export function convertDecimals(
  amount: bigint,
  fromDecimals: number,
  toDecimals: number,
): ConversionResult {
  if (amount < 0n) {
    throw new BridgeError("INSUFFICIENT_BALANCE", "Amount must not be negative.");
  }
  if (fromDecimals === toDecimals) return { amount, remainder: 0n };

  if (toDecimals > fromDecimals) {
    // Scaling up is exact.
    return { amount: amount * 10n ** BigInt(toDecimals - fromDecimals), remainder: 0n };
  }

  const divisor = 10n ** BigInt(fromDecimals - toDecimals);
  const converted = amount / divisor;
  return { amount: converted, remainder: amount - converted * divisor };
}

/** Decimals of a token as it exists on a given chain. */
export function decimalsOn(token: BridgeToken, chainKey: string): number {
  const representation = token.representations[chainKey];
  if (representation === undefined) {
    throw new BridgeError(
      "UNSUPPORTED_TOKEN",
      `${token.id} has no representation on ${chainKey}.`,
      {
        tokenId: token.id,
        chain: chainKey,
      },
    );
  }
  return representation.decimals;
}
