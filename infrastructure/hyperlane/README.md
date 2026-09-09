# Hyperlane infrastructure

ArkBridge does not fork Hyperlane. It deploys and configures upstream contracts
via the pinned `@hyperlane-xyz/cli`.

```
registry/   Local chain metadata + deployed addresses for chains Hyperlane's
            canonical registry does not carry (currently: Ark).
core/       Core deployment configs, per chain.
warp/       Warp route configs, per asset per chain pair. (Phase 4)
ism/        ISM configuration. (Phase 3)
hooks/      Post-dispatch hooks, including gas payment.
agents/     Validator and relayer agent configuration. (Phase 3)
```

## Chain name mapping

Hyperlane registry names are lowercase and unpunctuated; ArkBridge chain keys
are hyphenated. They are not interchangeable:

| ArkBridge key | Hyperlane name |
| ------------- | -------------- |
| `ark-devnet`  | `arkdevnet`    |
| `sepolia`     | `sepolia`      |
| `bsc-testnet` | `bsctestnet`   |

Apply the mapping whenever a value crosses between the two registries.

## Existing deployments are not redeployed

Ethereum and BNB Smart Chain already have canonical Hyperlane core deployments.
ArkBridge uses them as-is and deploys core only on Ark.

| Chain      | Mailbox                                                           |
| ---------- | ----------------------------------------------------------------- |
| sepolia    | `0xfFAEF09B3cd11D9b20d1a19bECca54EEC2884766`                      |
| bsctestnet | `0xF9F6F5646F478d5ab4e20B0F910C92F1CCC9Cc6D`                      |
| arkdevnet  | deployed by ArkBridge — see `deployments/testnet/ark-devnet.json` |

## Commands

```bash
# Deploy core to Ark devnet
HYP_KEY=$DEPLOYER_PRIVATE_KEY pnpm exec hyperlane core deploy \
  --registry ./infrastructure/hyperlane/registry \
  --chain arkdevnet \
  --config ./infrastructure/hyperlane/core/arkdevnet.core-config.yaml \
  --yes

# Read back what was deployed
pnpm exec hyperlane core read --registry ./infrastructure/hyperlane/registry --chain arkdevnet
```
