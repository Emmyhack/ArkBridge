import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BridgeError } from "@arkbridge/types";
import {
  convertDecimals,
  flipSelection,
  formatAmount,
  normalizeError,
  parseAmount,
  presentFailure,
  presentStatus,
  resolveRoute,
  selectableDestinationChains,
  selectableSourceChains,
  stageIndex,
  validateAmount,
} from "@arkbridge/bridge-core";
import { BRIDGE_STATUSES, BRIDGE_ERROR_CODES } from "@arkbridge/types";
import type { RouteCatalog } from "@arkbridge/bridge-core";
import { loadRegistries } from "@arkbridge/config/node";
import { findRepoRoot } from "@arkbridge/config/node";

/**
 * A catalog built from real deployment artifacts — the same data the SDK will
 * hand to bridge-core. Using the static registries here would report every
 * route as unavailable, since they carry zero addresses until hydration.
 */
const { chains, tokens } = await loadRegistries("testnet", findRepoRoot());
const catalog: RouteCatalog = {
  environment: "testnet",
  chains: chains.chains,
  tokens: tokens.tokens,
  routes: tokens.routes,
};

describe("amount parsing and formatting", () => {
  it("round-trips through base units", () => {
    for (const [input, decimals] of [
      ["1000", 6],
      ["0.000001", 6],
      ["1234.5678", 6],
      ["0", 18],
    ] as const) {
      const parsed = parseAmount(input, decimals);
      assert.equal(parseAmount(formatAmount(parsed, decimals), decimals), parsed, input);
    }
  });

  it("rejects more precision than the asset has", () => {
    // Truncating would silently send less than the user typed.
    assert.throws(() => parseAmount("1.0000001", 6), BridgeError);
  });

  it("rejects non-numeric input", () => {
    assert.throws(() => parseAmount("1e6", 6), BridgeError);
    assert.throws(() => parseAmount("abc", 6), BridgeError);
  });

  it("groups thousands for display", () => {
    assert.equal(formatAmount(1_234_567_000_000n, 6), "1,234,567");
    assert.equal(formatAmount(1_000_000n, 6), "1");
  });
});

describe("INV-10 — decimal conversion cannot create value", () => {
  it("scaling up is exact", () => {
    const { amount, remainder } = convertDecimals(1_000_000n, 6, 18);
    assert.equal(amount, 1_000_000_000_000_000_000n);
    assert.equal(remainder, 0n);
  });

  it("scaling down truncates and reports the remainder", () => {
    const { amount, remainder } = convertDecimals(1_234_567_890_123_456_789n, 18, 6);
    assert.equal(amount, 1_234_567n);
    assert.equal(remainder, 890_123_456_789n);
  });

  it("never returns more value than it was given, at any scale", () => {
    // The property that matters: converting down then back up can only lose.
    for (let from = 0; from <= 24; from++) {
      for (let to = 0; to <= 24; to++) {
        for (const raw of [0n, 1n, 999n, 10n ** 12n, 12_345_678_901_234_567n]) {
          const { amount, remainder } = convertDecimals(raw, from, to);
          const back = convertDecimals(amount, to, from).amount;
          assert.ok(back <= raw, `${raw} ${from}->${to}->${from} grew to ${back}`);
          assert.ok(remainder >= 0n);
          if (to >= from) assert.equal(remainder, 0n, "scaling up must lose nothing");
        }
      }
    }
  });

  it("conserves value exactly: converted + remainder reconstructs the input", () => {
    for (const [raw, from, to] of [
      [1_234_567_890_123_456_789n, 18, 6],
      [999_999n, 6, 2],
      [1n, 18, 0],
    ] as const) {
      const { amount, remainder } = convertDecimals(raw, from, to);
      const divisor = 10n ** BigInt(from - to);
      assert.equal(amount * divisor + remainder, raw);
    }
  });
});

describe("status presentation", () => {
  it("covers every status and never leaks an enum name", () => {
    for (const status of BRIDGE_STATUSES) {
      const p = presentStatus(status);
      assert.ok(p.label.length > 0, status);
      assert.ok(!p.label.includes("_"), `${status}: label looks like an enum name`);
      assert.ok(!/^[A-Z_]+$/.test(p.label), `${status}: label is shouting`);
    }
  });

  it("marks source commitment correctly", () => {
    assert.equal(presentStatus("SOURCE_PENDING").sourceCommitted, false);
    assert.equal(presentStatus("SOURCE_CONFIRMED").sourceCommitted, true);
    assert.equal(presentStatus("AWAITING_VERIFICATION").sourceCommitted, true);
  });

  it("does not call a delayed transfer failed", () => {
    // A user whose funds are mid-flight must not be told the transfer failed.
    assert.ok(!presentStatus("AWAITING_VERIFICATION").label.toLowerCase().includes("fail"));
    assert.ok(!presentFailure("MESSAGE_DELAYED").title.toLowerCase().includes("fail"));
    assert.equal(presentFailure("MESSAGE_DELAYED").isDelay, true);
  });

  it("orders the stepper monotonically along the happy path", () => {
    const path = [
      "SOURCE_CONFIRMED",
      "MESSAGE_DISPATCHED",
      "AWAITING_VERIFICATION",
      "DESTINATION_PENDING",
      "DELIVERED",
    ] as const;
    const indices = path.map(stageIndex);
    for (let i = 1; i < indices.length; i++) {
      const current = indices[i] ?? -1;
      const previous = indices[i - 1] ?? -1;
      assert.ok(current > previous, `${String(path[i])} did not advance`);
    }
  });
});

describe("failure presentation", () => {
  it("covers every error code with something actionable", () => {
    for (const code of BRIDGE_ERROR_CODES) {
      const p = presentFailure(code);
      assert.ok(p.title.length > 0, code);
      assert.ok(p.detail.length > 20, `${code}: detail is too thin to act on`);
    }
  });

  it("says nothing moved when nothing moved", () => {
    for (const code of ["USER_REJECTED", "SOURCE_TX_REVERTED"] as const) {
      assert.equal(presentFailure(code).fundsCommitted, false);
      assert.match(presentFailure(code).detail, /no assets were moved/i);
    }
  });

  it("says funds are safe when they are already committed", () => {
    for (const code of ["MESSAGE_DELAYED", "DESTINATION_TX_FAILED"] as const) {
      assert.equal(presentFailure(code).fundsCommitted, true);
    }
  });

  it("does not describe a deliberate pause as an error", () => {
    const p = presentFailure("ROUTE_PAUSED");
    assert.match(p.detail, /funds are unaffected/i);
    assert.ok(!p.detail.toLowerCase().includes("went wrong"));
  });
});

describe("error normalisation", () => {
  it("maps wallet rejection", () => {
    assert.equal(normalizeError({ code: 4001, message: "User rejected" }).code, "USER_REJECTED");
    assert.equal(normalizeError(new Error("User denied transaction")).code, "USER_REJECTED");
  });

  it("maps the guard's on-chain revert selectors", () => {
    // These are the actual selectors the deployed contracts revert with.
    assert.equal(
      normalizeError(new Error('reverted data: "0x9f6ddf1c..."')).code,
      "LIMIT_EXCEEDED",
    );
    assert.equal(normalizeError(new Error('reverted data: "0xdc8e0445..."')).code, "ROUTE_PAUSED");
    assert.equal(
      normalizeError(new Error('reverted data: "0xfb8f41b2..."')).code,
      "INSUFFICIENT_ALLOWANCE",
    );
  });

  it("maps transport failures", () => {
    assert.equal(normalizeError(new Error("fetch failed")).code, "RPC_UNAVAILABLE");
    assert.equal(normalizeError(new Error("Received rate limit")).code, "RPC_UNAVAILABLE");
  });

  it("passes a BridgeError through unchanged", () => {
    const original = new BridgeError("ROUTE_PAUSED", "paused");
    assert.equal(normalizeError(original), original);
  });

  it("always yields a usable code, never 'unknown'", () => {
    for (const weird of [null, undefined, 42, "boom", {}, new Error("")]) {
      const normalized = normalizeError(weird);
      assert.ok(BRIDGE_ERROR_CODES.includes(normalized.code));
    }
  });
});

describe("route selection", () => {
  it("offers only chains that actually have a route", () => {
    const sources = selectableSourceChains(catalog).map((c) => c.key);
    assert.ok(sources.includes("ark-devnet"));
    assert.ok(sources.includes("sepolia"));
    // BSC is gated, so it must not be offered even though the chain is enabled.
    assert.ok(!sources.includes("bsc-testnet"), "gated chain was offered as a source");
  });

  it("never offers an external-to-external destination", () => {
    for (const source of ["sepolia", "base-sepolia"]) {
      const destinations = selectableDestinationChains(catalog, source).map((c) => c.key);
      assert.deepEqual(destinations, ["ark-devnet"], `${source} reached a non-hub destination`);
    }
  });

  it("flips a selection to its defined reverse, never a constructed one", () => {
    const flipped = flipSelection(catalog, {
      sourceChain: "sepolia",
      destinationChain: "ark-devnet",
      tokenId: "sepolia-mockusdc",
    });
    assert.deepEqual(flipped, {
      sourceChain: "ark-devnet",
      destinationChain: "sepolia",
      tokenId: "sepolia-mockusdc",
    });
  });

  it("returns undefined rather than inventing a route when flipping an unknown one", () => {
    assert.equal(
      flipSelection(catalog, {
        sourceChain: "sepolia",
        destinationChain: "base-sepolia",
        tokenId: "sepolia-mockusdc",
      }),
      undefined,
    );
  });

  it("reports the specific reason a selection is unusable", () => {
    assert.throws(
      () =>
        resolveRoute(catalog, {
          sourceChain: "sepolia",
          destinationChain: "base-sepolia",
          tokenId: "sepolia-mockusdc",
        }),
      (e: unknown) => e instanceof BridgeError && e.code === "UNSUPPORTED_ROUTE",
    );
    assert.throws(
      () =>
        resolveRoute(catalog, {
          sourceChain: "sepolia",
          destinationChain: "ark-devnet",
          tokenId: "sepolia-nonexistent",
        }),
      (e: unknown) => e instanceof BridgeError && e.code === "UNSUPPORTED_TOKEN",
    );
  });
});

describe("amount validation", () => {
  const route = catalog.routes["sepolia:ark-devnet:sepolia-mockusdc"];

  it("rejects an amount above capacity before submission", () => {
    // Spec §88: the user must not reach wallet confirmation on a transfer the
    // route will reject.
    assert.ok(route !== undefined);
    assert.throws(
      () => validateAmount({ route, amount: 2_000n, balance: 10_000n, capacity: 1_000n }),
      (e: unknown) =>
        e instanceof BridgeError &&
        e.code === "LIMIT_EXCEEDED" &&
        e.context.maxAvailable === 1_000n,
    );
  });

  it("reports insufficient balance before capacity", () => {
    assert.ok(route !== undefined);
    assert.throws(
      () => validateAmount({ route, amount: 5_000n, balance: 100n, capacity: 1_000n }),
      (e: unknown) => e instanceof BridgeError && e.code === "INSUFFICIENT_BALANCE",
    );
  });

  it("accepts an amount within both", () => {
    assert.ok(route !== undefined);
    validateAmount({ route, amount: 500n, balance: 10_000n, capacity: 1_000n });
  });
});
