# Stranded messages from a checkpoint gap

A failure seen in production on the Sepolia → Ark route. Transfers were accepted
on the source chain, the collateral locked, and then never delivered. Nothing
reported a fault: the containers were healthy, the agents had gas, and the
balance monitor was green.

## What happened

1. **One RPC endpoint.** `sepolia` was configured with a single URL in
   `infrastructure/hyperlane/agents/agent-config.json`, where `basesepolia` had
   two. Base was unaffected throughout; Sepolia was not.

2. **The endpoint throttled `eth_getLogs`.** Hyperlane's sequence-aware cursor
   asks for a window of logs, and a throttled provider returns a partial answer.
   The cursor compares what it received against the sequences it expected,
   decides they do not match, and rewinds to its last good snapshot. Measured:
   **763 rewinds and 118 rate-limit errors in 25 minutes**, with no forward
   progress.

3. **The validators fell behind, then skipped.** They had signed contiguously to
   index **872427**. While stalled, the tree grew to **872639**. On recovery they
   resumed at the tip and signed 872639, leaving **872428–872638 unsigned —
   permanently**.

4. **Messages in that window cannot be delivered.** The relayer needs a quorum of
   validator signatures at the message's own leaf index. For a message in the
   gap no such signature exists or ever will, and the relayer retries forever:

   ```
   relayer::msg::metadata::multisig::base: Could not fetch metadata: Unable to
   reach quorum hyp_message=HyperlaneMessage { id: 0xb02af1e6…, nonce: 874006,
   origin: sepolia, destination: 9000 }
   ```

## The fix: re-index the validators

Wipe the validator index databases and restart. The validator rebuilds the
merkle tree from `INDEX_FROM` and, as it walks the history, writes a signed
checkpoint for **every** index it passes — the gap included.

This was first misdiagnosed. The log line `TipCheckpointSubmitter ... reached
correctness checkpoint` was read as "only the current chain tip is ever
signed", and an early poll showed the checkpoint count frozen at 471 while the
tree was still rebuilding. Both were wrong readings: the "tip" is the tip of
the *locally reconstructed* tree, which moves through history during a
backfill, and the count was frozen only because the reconstruction had not yet
reached the range in question. Left to run, the three validators went from
471 checkpoints (871958–872427, then 872639) to **872,728 checkpoints from
index 0**, and the stranded message delivered on its next relayer retry —
through the normal MESSAGE_ID_MULTISIG path, with the recovery ISM untouched.

Cost: re-indexing ~7 million Sepolia blocks took a few hours over two public
RPC endpoints. It is slow, not risky: nothing on-chain changes, no governance
action is involved, and every message in the gap becomes deliverable.

```
docker compose -f infrastructure/docker/docker-compose.agents.yml \
  rm -sf sepolia-validator-1 sepolia-validator-2 sepolia-validator-3
docker volume rm docker_sepolia-validator-{1,2,3}-data
docker compose -f infrastructure/docker/docker-compose.agents.yml \
  up -d sepolia-validator-1 sepolia-validator-2 sepolia-validator-3
```

Verify with `ls /checkpoints/sepolia-validator-1 | grep -c _with_id.json` inside
a validator container: the count must climb past the stranded index.

## Remedies

**For messages already stranded:** re-index, as above. `ArkBridgeRecoveryIsm`
remains the fallback for a message the validator set genuinely cannot sign — one
never inserted into the origin tree at all — but a checkpoint *gap* is not that
case, and reaching for a privileged override when a slow, safe re-index works
would be the wrong trade. It is single-use, keyed on
`keccak256(message)`, owner-authorised, and everything not explicitly allowlisted
falls through to `INNER_ISM.verify`. Using it is a governance action and should
be recorded as one.

**To prevent recurrence:** every chain the agents index needs at least two RPC
endpoints. This is enforced by `registry-invariants.test.ts` → *agent RPC
redundancy*, which fails CI for any chain with one endpoint unless it is listed
in `SINGLE_ENDPOINT_BY_DESIGN` with a stated reason.

## Detection

`scripts/operations/check-agent-progress.mjs` was written after this incident,
because the existing balance monitor could not see it. It reads the agents' own
logs for cursor rewinds and rate limits, and reports **rewinds per minute**
against the log window actually retained.

```
node scripts/operations/check-agent-progress.mjs 15m
```

Healthy agents sit at `0.0 rewinds/min`. During this incident the Sepolia
validators sat at `4.2`–`4.8`. Sustained rewinding above the threshold means a
cursor that is not advancing, and every minute it continues is another minute in
which a transfer can land in a window that will never be signed.
