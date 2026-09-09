# Deployments

Machine-readable deployment artifacts, one file per chain per environment:

```
deployments/<environment>/<chain>.json
```

`@arkbridge/config` reads these and folds the addresses into the static registries. Nothing
else — not the SDK, not the frontend, not a script — hard-codes an address.

Shape:

```json
{
  "environment": "testnet",
  "chain": "sepolia",
  "chainId": 11155111,
  "hyperlaneDomainId": 11155111,
  "contracts": { "mailbox": "0x...", "ism": "0x..." },
  "tokens": { "sepolia-mockusdc": { "token": "0x...", "router": "0x..." } },
  "deployer": "0x...",
  "block": 0,
  "timestamp": 0,
  "commit": "..."
}
```

Artifacts are validated on load. A malformed address, a non-positive chain id, or a value
contradicting the registry is a hard error rather than a silent overwrite.

`mainnet/` stays empty until a mainnet deployment actually exists. Production addresses are
never written speculatively.
