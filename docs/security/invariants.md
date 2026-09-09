# Security invariants

The properties ArkBridge must hold. Each is covered by tests under
`packages/contracts/test/` (unit, integration, and invariant) or, where the property is
structural rather than on-chain, by `packages/testing/`.

Status reflects the current build. Every invariant below is implemented and tested; the two
that depend on Hyperlane's deployed contracts rather than ArkBridge's own are covered by fork
tests against the live chains rather than against mocks.

| ID     | Invariant                                                               | Status   | Covered by                                                          |
| ------ | ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| INV-01 | Unsupported assets cannot bridge.                                       | **done** | `ArkBridgeGuard.t.sol::test_INV01_*`                                |
| INV-02 | Unsupported routes cannot bridge.                                       | **done** | `ArkBridgeGuard.t.sol::test_INV02_*`                                |
| INV-03 | Paused routes reject new transfer initiation.                           | **done** | `ArkBridgePauseController.t.sol`; verified live on Ark              |
| INV-04 | Unauthorised users cannot modify configuration.                         | **done** | role tests across all suites                                        |
| INV-05 | Unauthorised users cannot change limits.                                | **done** | `ArkBridgeRateLimiter.t.sol::test_onlyLimitManagerCanSetLimits`     |
| INV-06 | Messages cannot create duplicate credit.                                | **done** | `ForkInvariants.t.sol::test_INV06_*` replays a real delivery on Ark |
| INV-07 | Valid collateral is required for synthetic claims.                      | **done** | verified live both routes; `check-solvency.mjs`                     |
| INV-08 | Return transfer burns the correct synthetic amount.                     | **done** | verified live: burn 200 → release 200, balanced at rest             |
| INV-09 | Collateral cannot be released without an authenticated return transfer. | **done** | `ForkInvariants.t.sol::test_INV09_*` against the deployed router    |
| INV-10 | Decimal conversion cannot create value.                                 | **done** | `bridge-core.test.ts` — fuzzed across all decimal pairs 0–24        |
| INV-11 | Aggregate limits cannot be bypassed by splitting a transfer.            | **done** | stateful invariant, 2000 runs × 512,000 calls                       |
| INV-12 | Pause cannot be bypassed through another external entry point.          | **done** | `ArkBridgeGuard.t.sol::test_INV12_*`                                |
| INV-13 | One recipient cannot deny service to all users.                         | **done** | `GuardIntegration.t.sol::test_INV13_*`                              |
| INV-14 | Canonical token mappings cannot be silently replaced.                   | **done** | on-chain `test_INV14_*`; hydration guard off-chain                  |
| INV-15 | Incorrect origin domains cannot authorise release or mint.              | **done** | `testFuzz_INV15_*`; routing ISM rejects unknown origins             |

**Fifteen of fifteen enforced and tested.**

INV-06 and INV-09 were the last two marked partial, and for a real reason: both
are properties of Hyperlane's deployed Mailbox and router rather than of
ArkBridge's own gate, and a unit test against a mock would have verified the
mock. They are now covered by fork tests in `test/fork/ForkInvariants.t.sol`,
which run against the live chains at a real block.

**INV-06** replays an actual Sepolia → Ark delivery — captured in
`test/fork/delivered-message.json`, with the validator signatures really
produced for it. The test forks Ark one block _before_ that delivery, submits the
original calldata (which succeeds, proving the fixture is genuine rather than
fabricated), then submits the identical bytes again and requires the second
attempt to revert. Establishing the success first is what makes the failure
afterwards mean what it claims to: asserting only that a resubmission reverts
would pass equally well against calldata that was never valid to begin with.

**INV-09** exercises the release path on the deployed Sepolia collateral router.
A call from a non-Mailbox address is rejected; a call from the Mailbox carrying a
forged sender is rejected; a call naming an origin domain with no enrolled router
is rejected. A second test asserts the router names its own security module
rather than falling back to the Mailbox default — a router sitting on a
trusted-relayer ISM would pass every access check above and still release
collateral on one key's say-so.

Both skip rather than fail when `ARK_RPC_URL` / `SEPOLIA_RPC_URL` are absent, so
a contributor without devnet credentials still gets a green suite. Skips are
visible in the run output, so this cannot quietly degrade into a suite that
verifies nothing.

## Structural invariants (enforced today)

These hold at the configuration layer and are checked by `pnpm validate:config` and the tests
in `packages/testing/`. They are the reason a misconfiguration cannot reach the UI.

**Hub anchoring.** Every route has Ark at one end. `Ethereum <-> BNB Chain` is not expressible
in the registry, so it cannot be selected, quoted, or submitted. _(`ROUTE_NOT_HUB_ANCHORED`)_

**Configured before enabled.** A chain is never enabled while its EVM chain id, Hyperlane
domain id, or RPC set is unconfirmed. Enabling one is a hard error.
_(`CHAIN_ENABLED_UNCONFIGURED`)_

**Domain ids resolve uniquely.** No two chains share a Hyperlane domain id, so an inbound
message's origin resolves to exactly one chain or to nothing. This is the configuration-layer
half of INV-15. _(`DOMAIN_ID_DUPLICATE`)_

**Chain id and domain id are independent.** They are separate fields, looked up separately, and
neither is ever derived from the other. Hydration carries both through independently and rejects
an artifact that contradicts either.

**One backing chain per asset.** An asset has exactly one canonical or collateral
representation; every other representation is synthetic. Two chains cannot both claim to back
the same asset. _(`TOKEN_MULTIPLE_BACKING`)_

**Tickers are not identities.** Token ids carry their origin. Sepolia MockUSDC and BSC Testnet
MockUSDC are distinct assets with distinct ids and cannot be merged.
_(`TOKEN_ID_CONVENTION`)_

**Canonical mappings are not silently replaced.** A deployment artifact whose token address,
router, chain id, or domain id contradicts a known value fails loudly. This is the
configuration-layer half of INV-14.

**Every enabled route has a return path.** An inbound route without its reverse would strand
funds on the destination chain. _(`ROUTE_NO_REVERSE`)_

**Limits are ordered and positive.** `maxPerTransaction <= maxHourly <= maxDaily`, all above
zero. An unreachable per-transaction cap is a configuration bug.
_(`ROUTE_LIMIT_ORDER`, `ROUTE_LIMIT_NONPOSITIVE`)_

**Deployment does not enable.** Availability requires both a reviewed `enabled` flag and a
deployment. Deploying a route never turns it on.

**Production rejects mocks.** A mock asset in the production registry is a hard error, and
mock contracts carry an on-chain `IS_ARKBRIDGE_MOCK` marker so tooling can reject them by
behaviour rather than by name. _(`TOKEN_PROD_MOCK`)_

## Attack surfaces under review

Message replay. Invalid origin domain. Invalid remote router. Double mint. Double release.
Forged message assumptions. Decimal errors. Malicious ERC20 behaviour. Fee-on-transfer tokens.
Reentrancy. Rate-limit bypass. Pause bypass. Denial of service. Gas griefing. Admin compromise.
Validator compromise. Relayer downtime. RPC inconsistency. Chain reorganisation. Incorrect
token mapping. Proxy initialisation. Upgrade compromise.

## Solvency

For every collateral/synthetic asset:

```
authenticated synthetic claims  <=  valid backing collateral
```

Monitoring must account for in-flight messages. Comparing a collateral snapshot on one chain
against a supply snapshot on another, without accounting for value in transit between them,
reports insolvency that does not exist. `scripts/operations/check-solvency.ts` accounts for the
in-flight balance.

## Security review (Build Phase 17)

### Method

- Static analysis: `forge lint` across `src/`, clean.
- `deny = "warnings"` in `foundry.toml`, so an unchecked ERC20 return value is a
  build failure rather than a style note.
- Fuzzing: 512 runs per property in CI, 10,000 under the `deep` profile.
- Stateful invariants: 2,000 runs × 512,000 calls, zero failures.
- 90 Solidity tests, 179 TypeScript tests.
- Live verification of limits, pause isolation and solvency on three chains.

### Findings, all fixed and regression-tested

Every one was found by running the system rather than by reading it, and all
four share a shape: **a wrapper that did not faithfully impersonate what it
wrapped.**

**SEC-01 — ISM wrapper hid the inner module type.** `moduleType()` returned NULL,
so the relayer built no metadata and the inner multisig had nothing to verify.
Delivery reverted with no useful error while validators signed correctly.
_Regression:_ `test_moduleTypeDelegatesToInnerIsm`.

**SEC-02 — ISM wrapper omitted the routing interface.** Reporting `ROUTING` made
the relayer call `route(message)`, which the wrapper did not implement. A wrapper
must forward the whole interface implied by the type it reports.

**SEC-03 — Hook wrapper replaced the merkle tree. (Most severe.)** A router has
one hook slot, so installing the guard hook removed `merkleTreeHook`. Dispatches
kept succeeding while nothing was inserted into the tree; every message became
permanently unverifiable, with no error emitted anywhere. Two transfers were
stranded before the tree being frozen was noticed. On mainnet this would have
silently locked real collateral while the UI reported success.
_Regression:_ `test_forwardsToTheWrappedHook`, `test_forwardsUngatedTrafficToo`,
`test_doesNotForwardWhenTheGuardRejects`.

**SEC-04 — Wrapper assumed one Hyperlane version.** Sepolia's `merkleTreeHook`
predates `hookType()` and reverts on it; Ark's answers 3. ArkBridge spans chains
of different vintages, so informational delegations must degrade rather than
revert. _Regression:_ `test_toleratesAHookThatPredatesHookType`.

### Accepted risks (devnet only)

- **Three validators on one Docker host.** A 2-of-3 threshold means nothing when
  one machine holds all three keys. Production needs independent operators.
- **BSC Testnet trusts a 1-of-1 validator** whose key is shared with the Sepolia
  set ArkBridge replaced. Gated in the token registry so it cannot be enabled by
  accident.
- **EOA ownership of every role.** Mainnet requires multisig with timelocks;
  `assertNoEoaAdmin` exists so deployment tooling can enforce it.
- **No interchain gas paymaster.** Acceptable while ArkBridge runs the only
  relayer; before a public testnet, relayer funding becomes an unbounded
  liability without one.
- **`ArkBridgeRecoveryIsm` is deployed but installed nowhere.** It is a
  privileged override, narrowed to a single-use allowlist of pre-named message
  ids, and must be removed after any use — as it was.

### Not done

An **external audit (Phase 18)** and the **mainnet launch decision (Phase 20)**
require people, not code. Nothing in this repository should be read as a
substitute for either.
