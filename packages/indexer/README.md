# @arkbridge/indexer

Transfer history and message status for the activity feed and status page.

## It is a read model, never an authority

Nothing here authorises anything (spec §98). An indexer that is wrong, stale, or
entirely absent degrades the UI; it cannot move funds, mint a synthetic, or
release collateral. Bridge safety lives on-chain — no contract consults this.

No private keys are stored.

## Status is derived, not asserted

`deriveStatus` is a pure function of `TransferObservations` — facts read from a
node, never inferences. That makes it testable without a chain and impossible to
drift from what was actually observed.

Two properties carry the weight:

**Delivery is conclusive.** Checked first, so a race between a destination read
and a lagging source read can never walk a completed transfer backwards.

**Status never regresses.** Observations arrive out of order. Without
`advanceStatus`, a user watching the UI would see a transfer go from "complete"
back to "confirming", which reads as a fault. `FAILED` outranks everything except
`DELIVERED`, so a real failure is never masked by a stale in-progress read.

## Two failures that look alike and are not

`SOURCE_TX_REVERTED` means nothing moved. `DESTINATION_TX_FAILED` means the
user's funds already left the source chain. Presenting the second with the
first's wording ("no assets were moved") would be false at the worst possible
moment, so they are separate codes with separate copy.

## Tree insertion is observed, not assumed

`insertedIntoTree` is tracked separately from dispatch because the two can
diverge: a misconfigured hook lets a dispatch succeed without inserting, and the
transfer becomes permanently unverifiable. That happened on this devnet — two
transfers were stranded that way — so the indexer reports it as a failure
needing operator action rather than leaving the transfer in "verifying" forever.

## Storage

`TransferStore` is an interface; `InMemoryTransferStore` backs tests and local
development. PostgreSQL is the intended production store (spec §99).
