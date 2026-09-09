# ArkBridge

ArkBridge is Ark Constellation's cross-chain interoperability layer, enabling secure asset
transfers between Ark, Ethereum, and BNB Smart Chain using Hyperlane-powered messaging and
token routes.

## Topology

Ark is the hub. Every V1 route has Ark at one end:

```
Ethereum  <->  Ark Constellation  <->  BNB Smart Chain
```

`Ethereum <-> BNB Chain` is **not** a route ArkBridge offers. The route registry cannot express
one, so it never reaches the UI as a selectable option.

| Environment | Hub               | External chains                    |
| ----------- | ----------------- | ---------------------------------- |
| `local`     | Ark Local (31338) | Ethereum Local (31337)             |
| `testnet`   | Ark Devnet (9000) | Sepolia, Base Sepolia, BSC Testnet |
| `staging`   | Ark Devnet (9000) | Sepolia, BSC Testnet               |
| `mainnet`   | Ark               | Ethereum, BNB Smart Chain, Base    |

Base was added after Ethereum and BNB. Doing so touched a chain file, one line in
each environment that uses it, and a deployment artifact — no change to the SDK,
the frontend, or any selector logic, because options are derived from the
registry rather than enumerated in code. That is the property §149 asks for, and
adding Base is how it was actually tested rather than asserted.

### Ark Constellation Devnet

Ark is a Cosmos SDK chain with an EVM execution layer. ArkBridge talks to the EVM JSON-RPC
endpoint only; the CometBFT RPC and LCD are operational surfaces, not bridge surfaces.

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| EVM chain id    | `9000` — verified live via `eth_chainId`                         |
| Cosmos chain id | `arkdevnet_9000-1` — a different identifier for the same network |
| Native token    | KASH, 18 decimals                                                |
| RPC             | `https://evm.34.60.137.196.sslip.io`                             |
| WebSocket       | `wss://evm-ws.34.60.137.196.sslip.io`                            |
| Explorer        | `https://explorer.34.60.137.196.sslip.io` (Blockscout)           |
| Faucet          | `https://faucet.34.60.137.196.sslip.io/`                         |

Endpoints are devnet `sslip.io` hostnames and must move to an Ark-owned domain before a public
testnet. The legacy plaintext endpoints on the raw IP are deliberately absent from the registry:
bridge tooling should not fall back to an unauthenticated transport.

## Build status

Phases 0–17 are complete. The bridge moves real tokens across two external chains in
both directions, gated by ArkBridge's own safety layer, with a working frontend and
all fifteen security invariants under test.

| Phase  |                                                                    |                        |
| ------ | ------------------------------------------------------------------ | ---------------------- |
| 0–1    | Monorepo, registries                                               | done                   |
| 2      | Hyperlane core on Ark (domain `9000`)                              | done                   |
| 3      | ISM, validators, relayer — ArkBridge's own 2-of-3 both directions  | done                   |
| 4      | MockUSDC warp routes, round-tripped                                | done                   |
| 5      | Second external chain — **Base Sepolia** in place of BSC           | done                   |
| 6      | Safety layer: limits, pauses, roles — live on all three chains     | done                   |
| 7      | `@arkbridge/sdk` + `bridge-core` — performs real testnet transfers | done                   |
| 8      | Indexer status model                                               | done                   |
| 9–14   | Frontend: bridge, activity, transaction detail, tokens, status     | done                   |
| 15–16  | UX hardening, monitoring (solvency, agent balances)                | done                   |
| 17     | Security review — all 15 invariants tested, 2 via fork tests       | done                   |
| 18, 20 | External audit, mainnet launch                                     | needs external parties |

BSC Testnet remains defined but **gated**: its inbound ISM still trusts Hyperlane's 1-of-1
testnet validator, and the token registry prevents it being enabled by accident. Base was
added in its place after the BSC faucet proved inaccessible.

### Verify it yourself

```bash
pnpm validate:config                          # registry invariants, all environments
pnpm check:chains                             # registry vs. the live networks
node scripts/operations/check-solvency.mjs    # collateral vs. synthetic supply
node scripts/operations/check-agent-balances.mjs
pnpm --filter @arkbridge/contracts test       # 91 local tests
ARK_RPC_URL=… SEPOLIA_RPC_URL=… \
  forge test --match-path 'test/fork/*'       # INV-06/09 against the live chains
pnpm --filter @arkbridge/web dev              # the frontend, on :3000
```

## Requirements

- Node.js 20.11+ (this repo is developed on 26; see `.nvmrc`)
- pnpm 10+
- [Foundry](https://getfoundry.sh)

## Getting started

```bash
git clone --recurse-submodules https://github.com/Emmyhack/ArkBridge.git
cd ArkBridge
pnpm install
cp .env.example .env

pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:config   # registry invariants, all environments
pnpm check:chains      # registry vs. the live networks
```

If you cloned without `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

## Layout

```
apps/
  web/            Bridge frontend (Next.js)
  status/         Public infrastructure status
  docs/           Documentation site
packages/
  contracts/      Solidity: safety controls, registries, test assets (Foundry)
  sdk/            @arkbridge/sdk — the integration surface for other Ark apps
  bridge-core/    Framework-free bridge logic: routing, quoting, status mapping
  config/         Environment resolution, artifact hydration, registry validation
  chain-registry/ Chains, per environment
  token-registry/ Assets and directed routes, per environment
  indexer/        Transfer history and message status
  ui/             Shared components
  types/          Shared domain types
  testing/        Cross-package tests
infrastructure/   Hyperlane registry, core, warp routes, ISM, agents, monitoring
scripts/          Deployment, verification, token, and operations tooling
deployments/      Machine-readable deployment artifacts, per environment
configs/          Per-environment configuration
docs/             Architecture, security, operations, integration
```

## Configuration model

There is one source of truth for every address and identifier, and nothing duplicates it:

```
chain-registry  ──┐
token-registry  ──┼──>  @arkbridge/config  ──>  SDK, frontend, scripts
deployments/*.json ┘        (hydration)
```

The registries hold structure — which chains exist, which assets are canonical where, which
routes are permitted. Deployment artifacts hold addresses. `@arkbridge/config` folds one into
the other. Frontend code never hard-codes an address or a chain id.

Three properties are enforced rather than assumed:

- **A chain is never enabled while unconfigured.** Ark's EVM chain id and Hyperlane domain id
  are separate fields and neither is derived from the other. Both ship as the `UNCONFIGURED`
  sentinel and must be read from the live network.
- **Deployment does not enable anything.** Availability requires `enabled` (a reviewed decision)
  _and_ a deployment. A fresh deploy never switches a route on by itself.
- **Canonical mappings are not replaced silently.** An artifact that contradicts a known token
  address, chain id, or domain id is a hard error, not an overwrite.

Run `pnpm validate:config` to check every environment against the full invariant set.

## Current state

**Done — Phase 0 (monorepo) and Phase 1 (registries).**

- Workspace, Turborepo, TypeScript, ESLint, Prettier, Foundry, CI
- `@arkbridge/types`, `@arkbridge/chain-registry`, `@arkbridge/token-registry`,
  `@arkbridge/config`
- `MockUSDC` / `MockUSDT` / `MockWETH` with configurable decimals and a mock marker that
  production tooling rejects
- 82 TypeScript tests and 15 Solidity tests, all passing

`pnpm check:chains` verifies the registry against the live networks. Ark devnet, Sepolia, BSC
Testnet, Ethereum, and BNB Smart Chain all answer with the chain ids the registry claims.

**Blocked — Phases 2 onward.**

_One decision:_ Ark's **Hyperlane domain id**. Unlike the EVM chain id, this is not a value to
look up — Ark has no Hyperlane core deployment, so the domain does not exist until ArkBridge
deploys the Mailbox and picks one. It must be globally unique across Hyperlane. The convention
of reusing the EVM chain id would make it 9000, but that should be checked against
`@hyperlane-xyz/registry` rather than assumed: once deployed it is fixed in bytecode and trusted
by every remote router, so changing it later means redeploying and re-enrolling every route.

_Three credentials:_

| Needed                       | Blocks                         |
| ---------------------------- | ------------------------------ |
| Funded deployer key          | Phase 2: Hyperlane core on Ark |
| Validator keys (3, distinct) | Phase 3: multisig ISM          |
| Relayer key                  | Phase 3: message delivery      |

Fund a deployer from the faucet above. Once the Mailbox is deployed, set `hyperlaneDomainId` in
`packages/chain-registry/src/chains/ark.ts` and flip `enabled` — the routes that depend on Ark
become eligible automatically, and `pnpm validate:config` plus `pnpm check:chains` confirm it.

## Security

Bridges hold custody. See [SECURITY.md](SECURITY.md) for the disclosure process and
[docs/security/](docs/security/) for the threat model and invariants.

## License

MIT — see [LICENSE](LICENSE).
