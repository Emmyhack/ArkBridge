# Scripts

```
deploy/      Contract and warp route deployment, per environment
verify/      Block explorer verification
bridge/      Manual transfer execution for testing and operations
tokens/      Test asset deployment and faucet management
hyperlane/   Core, ISM, and agent setup
operations/  Solvency checks, limit management, pause control, health reports
```

Every deployment writes a machine-readable artifact to `deployments/<environment>/<chain>.json`.
Addresses live there and nowhere else.

Production deployment scripts verify the target network, chain id, deployer, admin recipient,
RPC, configuration, and contract versions before doing anything, and reject mock tokens,
testnet RPCs, placeholder addresses, and known development keys.
