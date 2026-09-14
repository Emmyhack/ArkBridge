import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@arkbridge/config/node";
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

describe("agent RPC redundancy", () => {
  /*
   * Every chain the agents index needs more than one RPC endpoint.
   *
   * This is not a preference. Sepolia ran with a single endpoint while Base ran
   * with two, and the difference was not cosmetic: the single endpoint
   * rate-limited `eth_getLogs`, Hyperlane's sequence-aware cursor received
   * partial results, decided the returned sequences did not match the range it
   * asked for, and rewound to its last good snapshot — 763 times in 25 minutes,
   * never advancing.
   *
   * The cost was not a slow bridge. The validators fell 211 checkpoints behind,
   * and when they recovered they jumped straight to the tip, leaving indices
   * 872428-872638 permanently unsigned. Every message dispatched from Sepolia in
   * that window became undeliverable — collateral locked, no quorum reachable,
   * and no error surfaced anywhere until someone read the relayer logs.
   * Recovering it meant wiping all three validator databases and re-indexing
   * seven million blocks.
   *
   * One endpoint is a single point of failure for an entire route. This makes
   * adding a chain without redundancy fail in CI, rather than in production
   * months later as a transfer that never arrives.
   */
  const agentConfig = JSON.parse(
    readFileSync(join(findRepoRoot(), "infrastructure/hyperlane/agents/agent-config.json"), "utf8"),
  ) as { readonly chains: Record<string, { readonly rpcUrls?: readonly { http?: string }[] }> };

  /*
   * Chains that legitimately have one endpoint, and why.
   *
   * An exemption is a recorded decision, not an escape hatch: naming a chain
   * here says someone accepted the stall risk for a stated reason. Ark Devnet is
   * a single node with no public mirror, and its URL is supplied from the
   * environment at run time rather than from this file, so the entry here is a
   * placeholder the test cannot meaningfully count.
   */
  const SINGLE_ENDPOINT_BY_DESIGN: Record<string, string> = {
    arkdevnet: "single devnet node, no mirror; URL injected from ARK_RPC_URL at run time",
  };

  for (const [chain, config] of Object.entries(agentConfig.chains)) {
    const exemption = SINGLE_ENDPOINT_BY_DESIGN[chain];
    const urls = (config.rpcUrls ?? []).map((entry) => entry.http).filter((u) => u !== undefined);

    if (exemption !== undefined) {
      it(`${chain} is a documented single-endpoint chain`, () => {
        // Asserted so the exemption cannot outlive its reason: once a mirror
        // exists and a second URL is added, this fails and the entry is removed.
        assert.equal(
          urls.length,
          1,
          `${chain} now has ${urls.length} endpoints. Remove it from ` +
            "SINGLE_ENDPOINT_BY_DESIGN so it is held to the redundancy rule.",
        );
      });
      continue;
    }

    it(`${chain} has a fallback RPC endpoint`, () => {
      assert.ok(
        urls.length >= 2,
        `${chain} has ${urls.length} RPC endpoint(s). A single endpoint lets one ` +
          "rate limit stall the indexing cursor and silently strand transfers " +
          "with collateral already locked.",
      );
    });
  }
});
