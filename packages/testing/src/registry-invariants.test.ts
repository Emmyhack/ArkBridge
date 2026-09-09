import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENVIRONMENTS } from "@arkbridge/types";
import type { Environment } from "@arkbridge/types";
import {
  getAllChains,
  getChainByDomainId,
  getChainByEvmChainId,
  getChainRegistry,
  getEnabledChains,
  getHubChain,
  isChainConfigured,
} from "@arkbridge/chain-registry";
import {
  getAllRoutes,
  getAvailableDestinationChains,
  getAvailableRoutes,
  getAvailableSourceChains,
  getReverseRoute,
  getTokenRegistry,
  routeId,
} from "@arkbridge/token-registry";
import { validateRegistries } from "@arkbridge/config";

/**
 * These assert the properties every environment must hold regardless of what
 * is currently deployed. They are the guard against a registry edit quietly
 * making an invalid route expressible.
 */

describe("registry structural validation", () => {
  for (const environment of ENVIRONMENTS) {
    it(`${environment}: passes validation with no errors`, () => {
      const result = validateRegistries(
        getChainRegistry(environment),
        getTokenRegistry(environment),
      );
      const errors = result.issues.filter((issue) => issue.severity === "error");
      assert.deepEqual(
        errors.map((error) => `[${error.code}] ${error.subject}: ${error.message}`),
        [],
      );
      assert.equal(result.ok, true);
    });
  }
});

describe("hub routing rule", () => {
  for (const environment of ENVIRONMENTS) {
    it(`${environment}: every route has the hub chain at one end`, () => {
      const hub = getChainRegistry(environment).hubChainKey;
      for (const route of getAllRoutes(environment)) {
        assert.ok(
          route.sourceChain === hub || route.destinationChain === hub,
          `route ${route.id} touches neither end of hub "${hub}"`,
        );
      }
    });

    it(`${environment}: no external-to-external route exists`, () => {
      const hub = getChainRegistry(environment).hubChainKey;
      const external = getAllChains(environment)
        .map((chain) => chain.key)
        .filter((key) => key !== hub);

      for (const source of external) {
        for (const destination of external) {
          if (source === destination) continue;
          for (const token of Object.keys(getTokenRegistry(environment).tokens)) {
            assert.equal(
              getTokenRegistry(environment).routes[routeId(source, destination, token)],
              undefined,
              `${source} -> ${destination} must not be expressible`,
            );
          }
        }
      }
    });
  }
});

describe("direction switching", () => {
  for (const environment of ENVIRONMENTS) {
    it(`${environment}: flipping a route yields a defined reverse, never a new chain pair`, () => {
      for (const route of getAllRoutes(environment)) {
        const reverse = getReverseRoute(environment, route);
        if (reverse === undefined) continue;
        assert.equal(reverse.sourceChain, route.destinationChain);
        assert.equal(reverse.destinationChain, route.sourceChain);
        assert.equal(reverse.tokenId, route.tokenId);
      }
    });

    it(`${environment}: every enabled route has a reverse defined`, () => {
      for (const route of getAllRoutes(environment)) {
        if (!route.enabled) continue;
        assert.notEqual(
          getReverseRoute(environment, route),
          undefined,
          `enabled route ${route.id} has no return path`,
        );
      }
    });
  }
});

describe("chain identity", () => {
  for (const environment of ENVIRONMENTS) {
    it(`${environment}: a chain is never enabled while unconfigured`, () => {
      for (const chain of getAllChains(environment)) {
        if (!chain.enabled) continue;
        assert.ok(isChainConfigured(chain), `chain "${chain.key}" is enabled but unconfigured`);
      }
    });

    it(`${environment}: the UNCONFIGURED sentinel never resolves to a chain`, () => {
      // -1 is the sentinel for a value that has not been confirmed. If a lookup
      // ever matched it, an unconfigured chain would silently become live.
      assert.equal(getChainByEvmChainId(environment, -1), undefined);
      assert.equal(getChainByDomainId(environment, -1), undefined);
    });

    it(`${environment}: EVM chain id and Hyperlane domain id are looked up separately`, () => {
      for (const chain of getAllChains(environment)) {
        if (!isChainConfigured(chain)) continue;
        assert.equal(getChainByEvmChainId(environment, chain.chainId)?.key, chain.key);
        assert.equal(getChainByDomainId(environment, chain.hyperlaneDomainId)?.key, chain.key);
      }
    });

    it(`${environment}: the hub is defined and marked as such`, () => {
      const hub = getHubChain(environment);
      assert.equal(hub.isHub, true);
      assert.equal(hub.key, getChainRegistry(environment).hubChainKey);
    });

    it(`${environment}: enabled chains are a subset of all chains`, () => {
      const all = new Set(getAllChains(environment).map((chain) => chain.key));
      for (const chain of getEnabledChains(environment)) {
        assert.ok(all.has(chain.key));
      }
    });
  }
});

describe("canonical asset identity", () => {
  it("assets sharing a ticker across origins stay distinct", () => {
    // Deliberately not asserting a count. Chains get added, and a test that
    // pins the number would have to be edited every time — which is how the
    // property being tested quietly stops being checked.
    for (const environment of ENVIRONMENTS) {
      const bySymbol = new Map<string, { id: string; canonicalChain: string }[]>();
      for (const token of Object.values(getTokenRegistry(environment).tokens)) {
        const group = bySymbol.get(token.symbol) ?? [];
        group.push({ id: token.id, canonicalChain: token.canonicalChain });
        bySymbol.set(token.symbol, group);
      }

      for (const [symbol, group] of bySymbol) {
        if (group.length < 2) continue;
        const ids = new Set(group.map((t) => t.id));
        const chains = new Set(group.map((t) => t.canonicalChain));
        assert.equal(ids.size, group.length, `${environment}: "${symbol}" assets share an id`);
        assert.equal(
          chains.size,
          group.length,
          `${environment}: "${symbol}" assets share a canonical chain`,
        );
      }
    }
  });

  it("carries at least one ticker on more than one origin", () => {
    // Guards the test above from becoming vacuous: if every symbol were unique
    // the distinctness loop would pass while checking nothing.
    const symbols = Object.values(getTokenRegistry("testnet").tokens).map((t) => t.symbol);
    const duplicated = symbols.filter((s, i) => symbols.indexOf(s) !== i);
    assert.ok(duplicated.length > 0, "no same-ticker assets exist to test distinctness against");
  });

  it("each asset is backed by exactly one chain", () => {
    for (const environment of ENVIRONMENTS) {
      for (const token of Object.values(getTokenRegistry(environment).tokens)) {
        const backing = Object.entries(token.representations).filter(
          ([, representation]) => representation.type !== "synthetic",
        );
        assert.equal(backing.length, 1, `${token.id} has ${String(backing.length)} backing chains`);
        assert.equal(backing[0]?.[0], token.canonicalChain);
      }
    }
  });
});

describe("availability gating", () => {
  for (const environment of ENVIRONMENTS) {
    it(`${environment}: nothing is available before deployment artifacts exist`, () => {
      // The static registries carry zero-address routers. Availability requires
      // deployment, so an enabled-but-undeployed route is never selectable.
      assert.deepEqual(getAvailableRoutes(environment), []);
      assert.deepEqual(getAvailableSourceChains(environment), []);
    });

    it(`${environment}: destination chains are derived, never assumed`, () => {
      for (const source of getAvailableSourceChains(environment)) {
        const destinations = getAvailableDestinationChains(environment, source);
        assert.ok(destinations.length > 0);
      }
    });
  }
});

describe("KASH and WKASH", () => {
  it("are absent from every V1 registry", () => {
    for (const environment of ENVIRONMENTS) {
      for (const token of Object.values(getTokenRegistry(environment).tokens)) {
        assert.ok(
          !["KASH", "WKASH"].includes(token.symbol) || !token.enabled,
          `${token.id} is enabled but KASH/WKASH bridging is out of scope for V1`,
        );
      }
    }
  });
});

describe("production registry", () => {
  const production: Environment = "mainnet";

  it("contains no mock assets", () => {
    for (const token of Object.values(getTokenRegistry(production).tokens)) {
      assert.equal(token.isMock, false, `${token.id} is a mock`);
    }
  });

  it("enables nothing by default", () => {
    for (const chain of getAllChains(production)) {
      assert.equal(chain.enabled, false, `${chain.key} is enabled on mainnet by default`);
    }
    for (const route of getAllRoutes(production)) {
      assert.equal(route.enabled, false, `${route.id} is enabled on mainnet by default`);
    }
  });
});
