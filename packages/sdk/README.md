# @arkbridge/sdk

The integration surface for ArkBridge. Other Ark applications import this rather than
integrating bridge contracts directly.

Not yet implemented — Phase 7. Frontend integration does not begin until this can perform real
testnet transfers.

Planned surface:

```ts
const bridge = new ArkBridge({ environment: "testnet" });

bridge.getChains();
bridge.getSupportedTokens();
bridge.getSupportedRoutes();

bridge.quote({ sourceChain, destinationChain, token, amount, recipient });
bridge.approve(...);
bridge.bridge(...);

bridge.getTransaction(id);
bridge.getMessageStatus(messageId);

bridge.getLimits(routeId);
bridge.getFees(routeId);
bridge.isRouteAvailable(routeId);
```

The browser SDK never receives a raw private key. It signs through a wallet client. Operational
scripts that do hold keys are a separate path and never share code that could leak one into a
bundle.
