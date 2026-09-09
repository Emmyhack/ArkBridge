# Contributing

## Setup

```bash
git clone --recurse-submodules https://github.com/Emmyhack/ArkBridge.git
cd ArkBridge
pnpm install
cp .env.example .env
```

## Before you push

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:config
```

`pnpm validate:config` checks the registries against their structural invariants offline.
`pnpm check:chains` additionally reads each chain's live RPC endpoint and compares what the node
reports against what the registry claims — run it after touching a chain definition. It is not
in the pull request CI path because it depends on third-party endpoints; it runs nightly.

CI runs all of these plus `forge fmt --check`, the invariant and regression suites, a secret
scan, and a dependency audit.

## Working on contracts

```bash
cd packages/contracts
forge build
forge test
forge fmt
FOUNDRY_PROFILE=deep forge test   # long fuzz campaign, before a release
```

Warnings are errors here (`deny = "warnings"` in `foundry.toml`). That is deliberate: an
unchecked ERC20 return value in bridge code is a bug, not a style preference.

## Conventions

**Registries are the source of truth.** Adding a chain means adding a file under
`packages/chain-registry/src/chains/` and listing it in the relevant environment. It does not
mean touching the frontend. If a change requires editing React components to support a new
chain, the abstraction is wrong — fix the abstraction.

**Never assume `chainId == hyperlaneDomainId`.** They are separate fields for a reason. The EVM
chain id is a fact to read from the node (`cast chain-id`). The Hyperlane domain id is fixed at
Mailbox deployment and must be read back from it
(`cast call $MAILBOX "localDomain()(uint32)"`), not inferred from the chain id. `pnpm
check:chains` verifies both against the live network.

**Ark has two chain identifiers.** The Cosmos chain id (`arkdevnet_9000-1`) and the EVM chain id
(`9000`) name the same network. Only the EVM one belongs in the chain registry — it is what a
wallet switches to and what `eth_chainId` returns.

**Never treat a ticker as an identity.** Ethereum USDC and BNB Chain USDC are different assets.
Token ids carry their origin (`ethereum-usdc`) precisely so this cannot be gotten wrong by
accident.

**Never assume 18 decimals.** Routes are tested at 6→6, 6→18, 18→6, and 18→18. Where conversion
happens, rounding is documented and must not create value.

**Do not fork Hyperlane.** ArkBridge configures and integrates upstream contracts. Any
modification to upstream code must be minimal, documented, tested, reviewed, and version
pinned.

**Do not invent production values.** Mainnet addresses, monetary limits, and chain identifiers
come from verified deployments and reviewed configuration. A placeholder that looks real is
worse than an obvious `UNCONFIGURED`.

## Adding a chain

1. `packages/chain-registry/src/chains/<chain>.ts` — identity, RPC URLs, explorer, native
   currency. Chain id and Hyperlane domain id read from the live network, not guessed.
2. Add it to the relevant `src/environments/*.ts`.
3. Deploy or verify Hyperlane core, then the warp routes.
4. Write the deployment artifact to `deployments/<environment>/<chain>.json`.
5. Integration tests in both directions.
6. Security review.
7. Set `enabled: true`.

The frontend surfaces it automatically at step 7. Nothing in `apps/web` changes.

## Adding a security regression test

Any issue found — in review, in an audit, in production — gets a permanent test:

```
packages/contracts/test/regression/REG_00N_ShortName.t.sol
```

Name it for the issue, document what was wrong at the top, and assert the fixed behaviour.
These are never removed.

## Commits and pull requests

Explain what changed and why. For anything touching custody, routing, limits, or roles, say
what the failure mode would be if the change were wrong.
