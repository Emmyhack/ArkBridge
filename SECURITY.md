# Security

ArkBridge holds custody of user assets. Collateral locked on Ethereum or BNB Smart Chain backs
synthetic representations on Ark; a flaw in that relationship is a loss of funds, not a bug.

## Reporting a vulnerability

Do not open a public issue.

Report privately through [GitHub's private vulnerability reporting](https://github.com/Emmyhack/ArkBridge/security/advisories/new).

Please include the affected contract or package, the conditions required, the impact, and a
proof of concept if you have one. We will acknowledge receipt and keep you updated on
remediation. Please give us a reasonable window to ship a fix before disclosing publicly.

## Scope

In scope:

- Contracts under `packages/contracts/src/`
- The configuration and registry layer (`packages/config`, `packages/chain-registry`,
  `packages/token-registry`) where a flaw would misroute funds
- Deployment and operations scripts under `scripts/`
- The SDK and frontend where a flaw would cause a user to sign something other than what was
  presented

Out of scope:

- Upstream Hyperlane contracts — report those to
  [Hyperlane](https://github.com/hyperlane-xyz/hyperlane-monorepo/security)
- Mock assets under `src/mocks/`, which are test-only and never deployed to production
- Third-party RPC provider availability

## Security model

ArkBridge does not implement its own cross-chain messaging. Message authenticity is Hyperlane's
responsibility: the Mailbox, the Interchain Security Module, and the validator set.

ArkBridge is responsible for everything around that:

- which assets may bridge, and which routes exist
- transfer limits, per transaction and in aggregate over time
- pause authority, at global, chain, route, and token granularity
- role separation and administrative control
- accurate presentation of what a user is actually signing

The relayer delivers messages. It is not a security authority: a compromised or absent relayer
delays transfers, it does not authorise them.

## Invariants

The properties the system must hold — replay resistance, solvency of collateral against
synthetic supply, limits that cannot be split around, pauses that cannot be bypassed — are
enumerated in [docs/security/invariants.md](docs/security/invariants.md) and covered by tests
under `packages/contracts/test/`.

Every security issue found gets a permanent regression test in
`packages/contracts/test/regression/`, named for the issue. They are never deleted.

## Production requirements

Before mainnet:

- No critical role held by a single EOA. Administration is multisig; high-risk changes are
  timelocked. Emergency pause may be immediate.
- External audit of a frozen commit, findings fixed, regression tests written, retested.
- Conservative initial route capacity, raised deliberately under monitoring.
- No mock asset, testnet RPC, placeholder address, or development key present in any production
  path. Deployment scripts reject all of these.
