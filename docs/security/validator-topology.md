# Validator topology

Which validators secure which direction, and why. This is the decision that
determines what a message arriving on either side of the bridge actually proves.

## Validators are per-origin-chain

A validator watches one chain's Mailbox and signs checkpoints of the merkle tree
its `merkleTreeHook` maintains. The ISM that consumes those signatures lives on
the **destination** chain and is configured per origin domain.

So each direction is secured independently:

| Route             | ISM lives on | Validators must watch | Who runs them                             |
| ----------------- | ------------ | --------------------- | ----------------------------------------- |
| Sepolia → Ark     | Ark          | Sepolia               | Hyperlane (existing)                      |
| BSC Testnet → Ark | Ark          | BSC Testnet           | Hyperlane (existing)                      |
| Ark → Sepolia     | Sepolia      | **Ark**               | **ArkBridge — nobody else validates Ark** |
| Ark → BSC Testnet | BSC Testnet  | **Ark**               | **ArkBridge**                             |

Ark is a new chain. No third party watches it, so ArkBridge must operate that
validator set. Sepolia and BSC Testnet already have Hyperlane validator sets, so
the inbound direction can reuse them.

## Inbound: configured (devnet posture)

Ark's Mailbox `defaultIsm` is a `domainRoutingIsm` at
`0xa3D9AAdD4fDfD51a1F6C784e422c19347e5A1522`, routing:

| Origin     | Domain   | ISM                    | Validators         | Threshold |
| ---------- | -------- | ---------------------- | ------------------ | --------- |
| sepolia    | 11155111 | `messageIdMultisigIsm` | `0x3c659E0F…46e7c` | 1 of 1    |
| bsctestnet | 97       | `messageIdMultisigIsm` | `0x3c659E0F…46e7c` | 1 of 1    |

Any origin domain not listed **reverts** — including Ark's own 9000. An
unregistered origin cannot authorise anything, which is INV-15 enforced at the
ISM layer rather than left to application code.

### ⚠ Both sets are one key, and it is the same key

These validator addresses were read off the live chains — Sepolia's set from BSC
Testnet's ISM tree, BSC Testnet's from Sepolia's — not copied from
documentation. Both resolve to the same single Abacus Works validator at a
threshold of 1.

The consequence is concrete: **compromise of that one key forges messages from
both Sepolia and BSC Testnet into Ark.** Once warp routes exist, that is minting
unbacked synthetic assets on every inbound route.

This is normal for Hyperlane's public testnets and is an accepted devnet risk. It
is recorded here because it must not survive contact with mainnet, where the
inbound sets must be independently operated at a real threshold — either
Hyperlane's production sets (which are genuinely multi-party) or ArkBridge's own.

## Outbound: live and proven (Ark → Sepolia)

Three ArkBridge validators watch Ark, announced on
`0x72bEd5A467DA40f97E6c0e2E1F0f75533F484b88`, each publishing to its own
storage location. A 2-of-3 `messageIdMultisigIsm` over them is deployed on
Sepolia at `0xfA35acC54E20d883f0c0eA4dB4B31F7cd01aEbBd`.

Verified end to end: a message dispatched on Ark
(`0xfa6d0e17…5cf53b`) was signed by the validators, relayed, and delivered on
Sepolia — `Mailbox.delivered() = true`, recipient `handledCount = 1`,
`lastOrigin = 9000`. Critically, `Mailbox.recipientIsm()` resolved to
ArkBridge's ISM, so delivery proves ArkBridge's own validator set verified it,
not Hyperlane's default.

Ark → BSC Testnet is the same pattern, pending BNB to deploy the ISM there.

### Recipients opt in — the Mailbox default is not enough

ArkBridge cannot change Sepolia's default ISM; Abacus Works owns it. Instead a
recipient returns ArkBridge's ISM from `interchainSecurityModule()`, which
**overrides** the default for messages addressed to it.

This cuts both ways, and it bit us: after replacing Ark's default ISM, Ark's
`testRecipient` still pointed at the Phase 2 `trustedRelayerIsm` and remained
forgeable by a single EOA until explicitly zeroed. Warp routes use the same
mechanism, so **every Phase 4 router's ISM must be asserted on-chain rather than
assumed to inherit the default.**

## Inbound: configured, not working

The routing ISM on Ark is deployed and correct, but no Sepolia-originated
message has been delivered. The relayer reports **"Unable to reach quorum"**:
Hyperlane's Sepolia validator publishes checkpoints to
`gs://hyperlane-testnet4-validator-0/`, and our relayer cannot resolve that
layout to fetch signatures.

Inbound liveness therefore depends on infrastructure ArkBridge neither operates
nor can repair — which is the same dependency that makes the 1-of-1 single-key
exposure above unacceptable long term. The remedy resolves both at once: run
ArkBridge validators for Sepolia and BSC Testnet as well, and repoint Ark's
routing ISM at them. The pattern is proven and the infrastructure exists; it is
three more validator containers with `originChainName: sepolia`.

## Agent keys

Funded (10 KASH each), all four distinct from each other and from the deployer:

| Role        | Address                                      |
| ----------- | -------------------------------------------- |
| validator 1 | `0xf3BbAECB73b04dCDd0c3F8bC92bd2ccE86ff9Eb4` |
| validator 2 | `0xb328A0B31016eE317f946a52cc2c19543f09a89A` |
| validator 3 | `0xdcB422af44b896C9Cbdb61B820157e2dCd4C87D8` |
| relayer     | `0x65cc144Ea86D839A9Ba1F89326dcE31F9C89B8CE` |

Agents run via `infrastructure/docker/docker-compose.agents.yml`
(`gcr.io/abacus-labs-dev/hyperlane-agent:agents-v2.0.0`, native arm64).

### Storage locations must differ per validator

Each validator announces its storage path on-chain, and the relayer resolves
that exact string **inside its own container**. Three validators announcing
`file:///data/checkpoints` means the relayer reads one directory three times and
can never reach quorum — which is precisely how the first attempt failed. Each
now writes to `/checkpoints/validator-N` on a volume every container mounts at
the same path.

### One host is not a threshold

Three validator processes on one Docker host is a test topology, not a security
model: one compromised machine holds all three keys, and one daemon can stop all
three processes. Production requires independent operators on independent
infrastructure, publishing to S3 or GCS rather than a shared filesystem.

## Until both directions work

`ark-devnet` stays `enabled: false`, and every route through it stays disabled.
Outbound is proven; inbound does not currently deliver. Half a bridge is not a
bridge — assets that can leave Ark but cannot reliably arrive are as broken as
the reverse.
