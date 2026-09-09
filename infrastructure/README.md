# Infrastructure

Hyperlane deployment configuration and agent operations. These are not Node packages and are
deliberately outside the pnpm workspace.

```
hyperlane/
  registry/   Chain metadata in Hyperlane registry format
  core/       Mailbox and core deployment config
  warp/       Warp route config, per asset per chain pair
  ism/        Interchain Security Module configuration
  hooks/      Post-dispatch hooks, including gas payment
  agents/     Agent configuration
validators/   Validator configuration. Each validator uses a distinct key — never shared.
relayer/      Relayer configuration and gas funding
monitoring/   Alerting on delivery, backlog, checkpoint age, balances, solvency, limits
docker/       Local harness and agent images
```

ArkBridge does not fork Hyperlane. Ark requires its own core deployment; Ethereum and BNB Smart
Chain already have deployments and are not redeployed onto.
