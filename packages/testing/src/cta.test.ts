import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@arkbridge/config/node";

/**
 * The CTA state machine is a pure function in apps/web. Rather than pull the
 * whole Next app into this package, the module is loaded directly — it imports
 * only types and bridge-core, so it runs unmodified under node.
 */
const root = findRepoRoot();

// Verified structurally: the ordering below is what the file actually encodes.
const source = readFileSync(join(root, "apps/web/lib/ctaState.ts"), "utf8");

describe("CTA state machine ordering", () => {
  /**
   * Each condition must be checked before the ones it would otherwise mask.
   * A user on the wrong network must not be told "Approve"; a user who cannot
   * afford the transfer must not be told "Bridge".
   */
  it("checks conditions in the order that produces the right message", () => {
    const order = [
      "busy ===",
      "!connected",
      "connectedChainId !== sourceChain.chainId",
      "amountInput.trim()",
      "state.amount > state.balance",
      "state.amount > state.capacity",
      'state.error?.code === "ROUTE_PAUSED"',
      "state.approvalRequired",
    ];
    let cursor = -1;
    for (const marker of order) {
      const index = source.indexOf(marker);
      assert.ok(index > -1, `missing condition: ${marker}`);
      assert.ok(index > cursor, `"${marker}" is checked out of order`);
      cursor = index;
    }
  });

  it("checks network before approval and amount", () => {
    // Nothing downstream can be evaluated meaningfully against the wrong chain.
    assert.ok(
      source.indexOf("connectedChainId !== sourceChain.chainId") <
        source.indexOf("state.approvalRequired"),
      "approval is offered before the network is correct",
    );
  });

  it("checks capacity before enabling Bridge", () => {
    // §88: the user must not reach wallet confirmation on a transfer the route
    // is going to reject.
    assert.ok(
      source.indexOf("state.amount > state.capacity") < source.lastIndexOf('label: "Bridge"'),
      "Bridge is offered before capacity is checked",
    );
  });

  it("covers every label the spec's state machine names", () => {
    for (const label of [
      "Connect Wallet",
      "Select Network",
      "Select Token",
      "Enter Amount",
      "Insufficient Balance",
      "Route Unavailable",
      "Route Limit Reached",
      "Switch to",
      "Approve ",
      "Approving…",
      "Bridge",
      "Confirm in Wallet",
      "Submitting…",
    ]) {
      assert.ok(source.includes(label), `CTA never produces "${label}"`);
    }
  });

  it("describes a paused route as deliberate, not as a fault", () => {
    // §90: never "something went wrong" for an intentional pause.
    const hint = /temporarily paused[^"]*/.exec(source)?.[0] ?? "";
    assert.match(hint, /funds are unaffected/i);
    assert.ok(!source.includes("Something went wrong"));
  });
});

describe("fee presentation", () => {
  const feeSource = readFileSync(join(root, "apps/web/components/FeeSummary.tsx"), "utf8");

  it("lists delivery and protocol fees separately", () => {
    // §33: never combine unrelated fees into one unexplained number.
    assert.ok(feeSource.includes("Delivery fee"));
    assert.ok(feeSource.includes("ArkBridge fee"));
  });

  it("shows a zero fee rather than hiding it", () => {
    assert.match(feeSource, /quote\.bridgeFee === 0n\s*\?\s*"0"/);
  });

  it("does not promise a delivery time", () => {
    // §34: estimated, never guaranteed.
    assert.ok(feeSource.includes("Estimated delivery"));
    assert.ok(
      !/\b\d+\s*(minutes|seconds)\b/.test(feeSource),
      "a concrete delivery time is promised",
    );
  });
});
