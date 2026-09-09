# @arkbridge/contracts

Solidity for ArkBridge. Foundry.

```
src/
  bridge/      Warp route integration and ArkBridge-specific transfer logic
  security/    Rate limiting, pause control, registries, roles
  interfaces/  Public interfaces
  libraries/   Shared logic
  mocks/       Test assets. Never deployed to production.
test/
  unit/        Single-contract behaviour
  integration/ Multi-contract and cross-chain flows
  invariant/   Stateful property tests
  regression/  One permanent test per security issue ever found
  fork/        Against live network state
script/        Deployment and operations
```

## Commands

```bash
forge build
forge test
forge fmt
FOUNDRY_PROFILE=deep forge test    # 10k fuzz runs, 2k invariant runs
```

## Safety layer

```
ArkBridgeRoles            Role definitions, split by blast radius
ArkBridgeRateLimiter      Per-route limits: per-transaction, hourly, daily
ArkBridgePauseController  Pause at global / chain / token / route scope
ArkBridgeGuard            The single gate every transfer passes through
```

**Limits are token buckets, not fixed windows.** A fixed window lets an attacker
move 2x across a boundary — x at 10:59, x at 11:00 — which defeats the point of
having an hourly limit. Each window refills linearly instead, so across any
rolling period a route moves at most its capacity. That is INV-11, and it is
verified by a stateful invariant run over 512,000 calls.

**Pausing and unpausing are separate roles.** Hitting stop in an emergency should
be easy; deciding the danger has passed is a different judgement and should not
come bundled with it.

**The guard is the only entry point.** It holds the sole role permitted to
consume rate-limit capacity, so there is no second door that skips the pause
check. Checks run before consumption, so a rejected transfer cannot burn a
route's allowance — otherwise triggering doomed transfers would be a free denial
of service.

**Not yet wired into the deployed warp route.** `HypERC20Collateral` has no hook
for an external guard, so integration means a router variant that calls
`authorizeTransfer` on both paths. Until then the live route enforces no
ArkBridge limits or pauses — see docs/security/invariants.md.

## Hyperlane

ArkBridge does not fork Hyperlane. It configures and integrates the upstream Mailbox, Warp
Routes, ISMs, and hooks. Any modification to upstream code must be minimal, documented, tested,
reviewed, and version pinned.

## Mock assets

`MockUSDC` (6 decimals), `MockUSDT` (6), and `MockWETH` (18) exist so routes can be exercised
at more than one decimal precision. Decimals are constructor-supplied and bounded at
`MAX_DECIMALS = 36` — the default faucet limit is `1_000_000 * 10**decimals`, which overflows
uint256 well before uint8 runs out, so an implausible value is rejected rather than reverting
with a panic.

Every mock exposes `IS_ARKBRIDGE_MOCK`. Deployment tooling reads that marker to refuse a
production deployment referencing a mock, which is stronger than matching on contract names.

## Warnings are errors

`deny = "warnings"` in `foundry.toml`. An unchecked ERC20 return value in bridge code is a bug.
