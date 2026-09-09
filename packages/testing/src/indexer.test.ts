import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, BridgeTransaction, Hex } from "@arkbridge/types";
import { BRIDGE_STATUSES } from "@arkbridge/types";
import {
  InMemoryTransferStore,
  advanceStatus,
  deriveStatus,
  isRegression,
  track,
  trackPending,
} from "@arkbridge/indexer";
import type { TransferObservations } from "@arkbridge/indexer";
import { presentStatus } from "@arkbridge/bridge-core";

const WALLET = "0xF031363A7FDdaFDcea062adc7421353A95F16420" as Address;
const MSG = "0xb73866cfff342580e2de11a84c9e36d82c4ea7287f86f0d966becf90fa0eee96" as Hex;

function tx(overrides: Partial<BridgeTransaction> = {}): BridgeTransaction {
  return {
    id: "t1",
    wallet: WALLET,
    recipient: WALLET,
    sourceChain: "base-sepolia",
    destinationChain: "ark-devnet",
    tokenId: "base-sepolia-mockusdc",
    amount: "10000000",
    sourceTxHash: "0x1234",
    status: "SOURCE_PENDING",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("status derivation", () => {
  it("walks the happy path in order", () => {
    const steps: [TransferObservations, string][] = [
      [{}, "SOURCE_PENDING"],
      [
        { sourceMined: true, sourceConfirmations: 0, sourceRequiredConfirmations: 2 },
        "SOURCE_PENDING",
      ],
      [
        {
          sourceMined: true,
          sourceSucceeded: true,
          sourceConfirmations: 2,
          sourceRequiredConfirmations: 2,
        },
        "SOURCE_CONFIRMED",
      ],
      [
        {
          sourceMined: true,
          sourceSucceeded: true,
          sourceConfirmations: 2,
          sourceRequiredConfirmations: 2,
          messageId: MSG,
        },
        "MESSAGE_DISPATCHED",
      ],
      [
        {
          sourceMined: true,
          sourceSucceeded: true,
          sourceConfirmations: 2,
          sourceRequiredConfirmations: 2,
          messageId: MSG,
          insertedIntoTree: true,
        },
        "AWAITING_VERIFICATION",
      ],
      [
        {
          sourceMined: true,
          sourceSucceeded: true,
          sourceConfirmations: 2,
          sourceRequiredConfirmations: 2,
          messageId: MSG,
          insertedIntoTree: true,
          checkpointSigned: true,
        },
        "READY_FOR_DELIVERY",
      ],
      [{ delivered: true }, "DELIVERED"],
    ];
    for (const [observations, expected] of steps) {
      assert.equal(deriveStatus(observations).status, expected, JSON.stringify(observations));
    }
  });

  it("treats delivery as conclusive whatever else is observed", () => {
    // A race between reads must never walk a completed transfer backwards.
    assert.equal(
      deriveStatus({ delivered: true, sourceMined: false, destinationReverted: true }).status,
      "DELIVERED",
    );
  });

  it("distinguishes a source revert from a destination failure", () => {
    const source = deriveStatus({ sourceMined: true, sourceSucceeded: false });
    assert.equal(source.failure?.code, "SOURCE_TX_REVERTED");

    const destination = deriveStatus({ destinationReverted: true });
    // Funds HAVE left the source chain here, so this must not reuse the code
    // whose message says "no assets were moved".
    assert.equal(destination.failure?.code, "DESTINATION_TX_FAILED");
    assert.notEqual(source.failure?.code, destination.failure?.code);
  });

  it("reports a dispatch that never entered the merkle tree", () => {
    // The devnet bug: a misconfigured hook let dispatches succeed without
    // inserting, leaving transfers permanently unverifiable. Sitting in
    // "verifying" forever would hide that; it needs operator action.
    const derived = deriveStatus({
      sourceMined: true,
      sourceSucceeded: true,
      sourceConfirmations: 5,
      sourceRequiredConfirmations: 1,
      messageId: MSG,
      insertedIntoTree: false,
    });
    assert.equal(derived.status, "FAILED");
    assert.match(String(derived.failure?.message), /merkle tree/i);
    assert.match(String(derived.failure?.message), /operator action/i);
  });

  it("flags a slow transfer as delayed without calling it failed", () => {
    const base = {
      sourceMined: true,
      sourceSucceeded: true,
      sourceConfirmations: 5,
      sourceRequiredConfirmations: 1,
      messageId: MSG,
      insertedIntoTree: true,
    } as const;

    assert.equal(deriveStatus({ ...base, secondsSinceSourceConfirmed: 60 }).delayed, false);

    const slow = deriveStatus({ ...base, secondsSinceSourceConfirmed: 5000 });
    assert.equal(slow.delayed, true);
    assert.equal(slow.status, "AWAITING_VERIFICATION", "a delay is not a failure");
    assert.ok(!presentStatus(slow.status).label.toLowerCase().includes("fail"));
  });
});

describe("status never regresses", () => {
  it("refuses to move backwards", () => {
    assert.equal(advanceStatus("DELIVERED", "SOURCE_PENDING"), "DELIVERED");
    assert.equal(
      advanceStatus("AWAITING_VERIFICATION", "SOURCE_CONFIRMED"),
      "AWAITING_VERIFICATION",
    );
    assert.equal(
      advanceStatus("SOURCE_CONFIRMED", "AWAITING_VERIFICATION"),
      "AWAITING_VERIFICATION",
    );
  });

  it("keeps DELIVERED terminal even against a failure observation", () => {
    assert.equal(advanceStatus("DELIVERED", "FAILED"), "DELIVERED");
  });

  it("lets a failure interrupt any in-progress status", () => {
    for (const status of BRIDGE_STATUSES) {
      if (status === "DELIVERED" || status === "FAILED") continue;
      assert.equal(advanceStatus(status, "FAILED"), "FAILED", status);
    }
  });

  it("ranks every status, so no pair is undefined", () => {
    for (const a of BRIDGE_STATUSES) {
      for (const b of BRIDGE_STATUSES) {
        assert.equal(typeof isRegression(a, b), "boolean");
      }
    }
  });
});

describe("tracker", () => {
  it("persists an advance and reports the change", async () => {
    const store = new InMemoryTransferStore();
    await store.put(tx());

    const result = await track(
      store,
      () =>
        Promise.resolve({
          sourceMined: true,
          sourceSucceeded: true,
          sourceConfirmations: 3,
          sourceRequiredConfirmations: 1,
          messageId: MSG,
        }),
      tx(),
      2000,
    );

    assert.equal(result.changed, true);
    assert.equal(result.previousStatus, "SOURCE_PENDING");
    assert.equal(result.transaction.status, "MESSAGE_DISPATCHED");
    assert.equal(result.transaction.messageId, MSG);
    assert.equal((await store.get("t1"))?.status, "MESSAGE_DISPATCHED");
  });

  it("reports no change when nothing moved", async () => {
    const store = new InMemoryTransferStore();
    const existing = tx({ status: "SOURCE_PENDING" });
    await store.put(existing);

    const result = await track(store, () => Promise.resolve({}), existing, 2000);
    assert.equal(result.changed, false);
    assert.equal(result.transaction.updatedAt, 1000, "updatedAt moved despite no change");
  });

  it("keeps polling other transfers when one chain is unreachable", async () => {
    const store = new InMemoryTransferStore();
    await store.put(tx({ id: "bad" }));
    await store.put(tx({ id: "good" }));

    const results = await trackPending(
      store,
      (t) =>
        t.id === "bad"
          ? Promise.reject(new Error("RPC down"))
          : Promise.resolve({ delivered: true }),
      3000,
    );

    assert.equal(results.length, 1, "a failing observer stalled the whole pass");
    assert.equal((await store.get("good"))?.status, "DELIVERED");
    assert.equal(
      (await store.get("bad"))?.status,
      "SOURCE_PENDING",
      "failed transfer should stay pending",
    );
  });
});

describe("store", () => {
  it("returns a wallet's transfers newest first", async () => {
    const store = new InMemoryTransferStore();
    await store.put(tx({ id: "old", createdAt: 100 }));
    await store.put(tx({ id: "new", createdAt: 900 }));

    const list = await store.byWallet(WALLET);
    assert.deepEqual(
      list.map((t) => t.id),
      ["new", "old"],
    );
  });

  it("filters by status and matches wallet case-insensitively", async () => {
    const store = new InMemoryTransferStore();
    await store.put(tx({ id: "a", status: "DELIVERED" }));
    await store.put(tx({ id: "b", status: "SOURCE_PENDING" }));

    const delivered = await store.byWallet(WALLET.toLowerCase() as Address, {
      status: ["DELIVERED"],
    });
    assert.deepEqual(
      delivered.map((t) => t.id),
      ["a"],
    );
  });

  it("excludes terminal transfers from pending", async () => {
    const store = new InMemoryTransferStore();
    await store.put(tx({ id: "a", status: "DELIVERED" }));
    await store.put(tx({ id: "b", status: "FAILED" }));
    await store.put(tx({ id: "c", status: "AWAITING_VERIFICATION" }));

    assert.deepEqual(
      (await store.pending()).map((t) => t.id),
      ["c"],
    );
  });

  it("finds a transfer by message id", async () => {
    const store = new InMemoryTransferStore();
    await store.put(tx({ messageId: MSG }));
    assert.equal((await store.byMessageId(MSG.toUpperCase() as Hex))?.id, "t1");
  });
});
