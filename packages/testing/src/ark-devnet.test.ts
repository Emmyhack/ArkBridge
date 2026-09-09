import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENVIRONMENTS } from "@arkbridge/types";
import { arkDevnet, getAllChains, getChain, isChainConfigured } from "@arkbridge/chain-registry";
import { getAllRoutes, getAvailableRoutes } from "@arkbridge/token-registry";

/**
 * Ark devnet's identity, and the consequences of its Hyperlane domain id still
 * being undecided.
 */

describe("Ark devnet identity", () => {
  it("uses the EVM chain id, not the Cosmos chain id", () => {
    // Ark has two identifiers for one network: the Cosmos chain id
    // `arkdevnet_9000-1` and the EVM chain id 9000. Only the latter is
    // meaningful to a wallet, to eth_chainId, or to this registry.
    assert.equal(arkDevnet.chainId, 9000);
  });

  it("declares KASH with 18 decimals", () => {
    assert.equal(arkDevnet.nativeCurrency.symbol, "KASH");
    assert.equal(arkDevnet.nativeCurrency.decimals, 18);
  });

  it("lists only TLS endpoints", () => {
    // The devnet also serves plaintext endpoints on raw IPs. Bridge tooling
    // must never fall back to an unauthenticated transport, so they are not
    // listed and cannot be selected accidentally.
    for (const url of arkDevnet.rpcUrls) {
      assert.ok(url.startsWith("https://"), `plaintext RPC endpoint: ${url}`);
    }
    for (const url of arkDevnet.wsUrls ?? []) {
      assert.ok(url.startsWith("wss://"), `plaintext WebSocket endpoint: ${url}`);
    }
  });

  it("carries the explorer and faucet a test user needs", () => {
    assert.ok(arkDevnet.explorerUrl?.startsWith("https://"));
    assert.equal(arkDevnet.explorerApiKind, "blockscout");
    assert.ok(arkDevnet.faucetUrl?.startsWith("https://"));
  });
});

describe("Ark devnet Hyperlane domain", () => {
  it("is 9000, matching the deployed Mailbox", () => {
    // Decided at Phase 2 core deployment and asserted against
    // Mailbox.localDomain(). Fixed in bytecode; changing it would mean
    // redeploying core and re-enrolling every route.
    assert.equal(arkDevnet.hyperlaneDomainId, 9000);
  });

  it("equals the EVM chain id by choice, not by derivation", () => {
    // The two happen to coincide here. Nothing in the codebase derives one from
    // the other, and this assertion exists to document the coincidence rather
    // than to license the inference.
    assert.equal(arkDevnet.hyperlaneDomainId, arkDevnet.chainId);
  });

  it("fits uint32", () => {
    assert.ok(arkDevnet.hyperlaneDomainId > 0);
    assert.ok(arkDevnet.hyperlaneDomainId <= 4_294_967_295);
  });

  it("is fully configured and enabled", () => {
    assert.equal(isChainConfigured(arkDevnet), true);
    // Enabled only after both directions were secured by ArkBridge's own
    // validators and a MockUSDC round trip was verified on chain.
    assert.equal(arkDevnet.enabled, true);
  });

  it("enables Sepolia routes but not BSC routes", () => {
    const routes = getAllRoutes("testnet");
    assert.ok(routes.length > 0, "expected routes to be defined");

    const sepolia = routes.filter(
      (r) => r.id.includes("sepolia") && r.tokenId.endsWith("mockusdc"),
    );
    assert.ok(sepolia.length > 0);
    for (const route of sepolia) assert.equal(route.enabled, true, `${route.id} should be enabled`);

    for (const route of routes.filter((r) => r.id.includes("bsc"))) {
      assert.equal(route.enabled, false, `${route.id} is gated and must stay disabled`);
    }
  });

  it("still exposes nothing from the static registry alone", () => {
    // The static registry carries zero addresses; availability requires
    // deployment artifacts to be hydrated in. Enabling a route is not the same
    // as making it selectable.
    assert.deepEqual(getAvailableRoutes("testnet"), []);
  });
});

describe("RPC transport safety", () => {
  for (const environment of ENVIRONMENTS) {
    it(`${environment}: only local chains may use plaintext endpoints`, () => {
      for (const chain of getAllChains(environment)) {
        if (chain.rpcUrls.every((url) => url.startsWith("http://127.0.0.1"))) continue;
        for (const url of chain.rpcUrls) {
          assert.ok(url.startsWith("https://"), `${chain.key}: plaintext endpoint ${url}`);
        }
      }
    });
  }
});

describe("chain registry lookup", () => {
  it("resolves Ark devnet by key", () => {
    assert.equal(getChain("testnet", "ark-devnet")?.chainId, 9000);
  });

  it("resolves Ark devnet as an enabled chain", () => {
    assert.equal(getChain("testnet", "ark-devnet")?.enabled, true);
  });
});
