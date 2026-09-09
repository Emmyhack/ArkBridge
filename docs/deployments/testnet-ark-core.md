# Ark Devnet — Hyperlane core (Build Phase 2)

Deployed 2026-09-04. Artifact: [`deployments/testnet/ark-devnet.json`](../../deployments/testnet/ark-devnet.json).

## Identity

|                     |                                                  |
| ------------------- | ------------------------------------------------ |
| Chain               | Ark Constellation Devnet                         |
| EVM chain id        | `9000`                                           |
| Hyperlane domain id | `9000`                                           |
| Hyperlane core      | `12.1.0` (read from `Mailbox.PACKAGE_VERSION()`) |
| Message format      | `3` (`Mailbox.VERSION()`)                        |
| Deployed with       | `@hyperlane-xyz/cli@44.0.2`                      |
| Deployer            | `0xF031363A7FDdaFDcea062adc7421353A95F16420`     |
| Blocks              | 207555 – 207597                                  |
| Gas                 | 26,436,377 (0.032175869625 KASH)                 |

## Domain id decision

`9000` was chosen to equal the EVM chain id. That equality is a decision, not a
derivation — nothing in this codebase infers one identifier from the other.

Three checks were run **before** deploying:

1. **uint32** — 9000 uses 14 of 32 bits.
2. **Uniqueness** — checked against all 348 chains in
   `@hyperlane-xyz/registry@26.1.0`. No chain claims domain 9000; none claims
   EVM chain id 9000 either. Evmos holds the adjacent 9001.
3. **Consistency** — `eth_chainId` on the live node returns `0x2328` (9000),
   matching `ARK_CHAIN_ID` and the chain registry.

After deployment, `Mailbox.localDomain()` returned `9000`, matching the
configured value exactly. `pnpm check:chains` re-runs that comparison against
the live chain on every invocation, so registry drift cannot go unnoticed.

The value is fixed in the Mailbox bytecode and will be trusted by every remote
router that enrols against it. Changing it means redeploying core and
re-enrolling every route.

## Deployed contracts

| Contract                                   | Address                                      |
| ------------------------------------------ | -------------------------------------------- |
| mailbox                                    | `0xe441256be7296Fc42d2597A54dcD42E2C70cCb68` |
| proxyAdmin                                 | `0x456e19EcB9919b9D6cBcFcC91ee25f95b1fC1742` |
| validatorAnnounce                          | `0x72bEd5A467DA40f97E6c0e2E1F0f75533F484b88` |
| merkleTreeHook (defaultHook)               | `0x454637b786478EB76aA93F8ad68101e90ba5d97D` |
| trustedRelayerIsm (defaultIsm)             | `0x0b3a574770C13Bf1c9eC45683E6e8A1796318206` |
| protocolFee (requiredHook)                 | `0x21D69525c16B537528815FD0A85acc0321515FF4` |
| interchainAccountRouter                    | `0x1D693876F102418BfA24b03bBE8cb0fB80AC260F` |
| quotedCalls                                | `0x44894bf41Ac04F0BF1323271e9818948c725d8ba` |
| testRecipient                              | `0x65c150152EbB78293DC63d83f989Af5ED9D30132` |
| staticMerkleRootMultisigIsmFactory         | `0x3aa0a621E24B1C0c6CB57238513FfDDD18eD6e9E` |
| staticMessageIdMultisigIsmFactory          | `0xbA73Ae96205Fa5bee35A659e148Cb1f4cA6Fa913` |
| staticAggregationIsmFactory                | `0x06d07042D3FC6E02b8AAad05cF28A8E31341b755` |
| staticAggregationHookFactory               | `0xBCf0DBe9E1001697477Cd1AfEc47FB8261fde6F0` |
| domainRoutingIsmFactory                    | `0x58Dd7282e9bE3de31080Cc7D4a70D2f144b35d33` |
| incrementalDomainRoutingIsmFactory         | `0x6DDF30F6bcaa7F5B24CB61Ee13fC1258FD7541C6` |
| staticMerkleRootWeightedMultisigIsmFactory | `0xAc5B6C70B66e8140C81a1f0856619068f12547A1` |
| staticMessageIdWeightedMultisigIsmFactory  | `0xdf938555b7457507bB4C4848CC565C016274E2d8` |

Per-contract creation transaction, block, and gas are in the artifact's
`contractDetails`.

## Generic message test (spec §130)

Before any token bridging, a generic message was dispatched and delivered
through Ark's core — loopback `arkdevnet → arkdevnet`, self-relayed:

|                          |                     |
| ------------------------ | ------------------- |
| Message id               | `0xececf2fb…aaab8c` |
| Delivery tx              | `0xd0272c8f…5d8c38` |
| Delivery time            | 12s                 |
| `Mailbox.nonce()` after  | 1                   |
| `Mailbox.delivered(id)`  | `true`              |
| `merkleTreeHook.count()` | 1                   |
| root                     | `0xa91b35bd…5101bc` |

The merkle tree is live, which is what Phase 3 validators sign checkpoints of.

## Default ISM: replaced in Phase 3a

Phase 2 deployed a **trustedRelayerIsm** — one EOA able to deliver any message.
That was a bootstrap placeholder and has since been replaced with a
`domainRoutingIsm` (`0xa3D9AAdD…5A1522`) verifying each inbound message against
the validator set for its origin chain.

The Phase 2 config is preserved at
`infrastructure/hyperlane/core/arkdevnet.core-config.phase2.yaml`.

See [validator-topology.md](../security/validator-topology.md) for what is and
is not secured, including the warning that both inbound validator sets are the
same single key.

## Known gaps

**No interchain gas paymaster — decided, not overlooked.** `requiredHook` is a
`protocolFee` set to zero, so `quoteDispatch` returns 0 and the self-funded
devnet relayer absorbs destination gas. Acceptable while ArkBridge operates the
only relayer. Before any public testnet an IGP must be added: without one, users
pay nothing for destination gas and relayer funding becomes an unbounded
liability.

**Source verification deferred.** The CLI's Blockscout verification failed
during deployment — it could not match its bundled build artifacts against the
explorer. Bytecode presence is verified on-chain at all addresses and the
deployed configuration is verified by `hyperlane core check` ("No violations
found"), so this is a readability gap, not a correctness one, on unmodified
upstream contracts. Required before mainnet, where it is a precondition of
external review.

**Ownership is a single EOA.** Devnet only. Mainnet requires multisig ownership
with timelocked high-risk changes — see [SECURITY.md](../../SECURITY.md).
