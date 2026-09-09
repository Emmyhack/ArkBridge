import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address } from "@arkbridge/types";
import { UNCONFIGURED, ZERO_ADDRESS } from "@arkbridge/types";
import { getChainRegistry } from "@arkbridge/chain-registry";
import { getTokenRegistry, isRouteDeployed, isTokenDeployed } from "@arkbridge/token-registry";
import type { DeploymentArtifact } from "@arkbridge/config";
import { hydrateRegistries, parseDeploymentArtifact, resolveEnvironment } from "@arkbridge/config";

const SEPOLIA_USDC = "0x1111111111111111111111111111111111111111" as Address;
const SEPOLIA_ROUTER = "0x2222222222222222222222222222222222222222" as Address;
const ARK_USDC = "0x3333333333333333333333333333333333333333" as Address;
const ARK_ROUTER = "0x4444444444444444444444444444444444444444" as Address;
const DEPLOYER = "0x5555555555555555555555555555555555555555" as Address;

function artifact(overrides: Partial<DeploymentArtifact> = {}): DeploymentArtifact {
  return {
    environment: "testnet",
    chain: "sepolia",
    chainId: 11155111,
    hyperlaneDomainId: 11155111,
    contracts: { mailbox: "0x6666666666666666666666666666666666666666" },
    tokens: { "sepolia-mockusdc": { token: SEPOLIA_USDC, router: SEPOLIA_ROUTER } },
    deployer: DEPLOYER,
    block: 1,
    timestamp: 1,
    ...overrides,
  };
}

/** Ark devnet as actually deployed: chain id 9000, Hyperlane domain 9000. */
const ARK_ARTIFACT: DeploymentArtifact = artifact({
  chain: "ark-devnet",
  chainId: 9000,
  hyperlaneDomainId: 9000,
  tokens: { "sepolia-mockusdc": { token: ARK_USDC, router: ARK_ROUTER } },
});

function hydrate(artifacts: readonly DeploymentArtifact[]) {
  return hydrateRegistries(getChainRegistry("testnet"), getTokenRegistry("testnet"), artifacts);
}

describe("deployment hydration", () => {
  it("fills addresses into tokens and both route directions", () => {
    const { tokens } = hydrate([artifact(), ARK_ARTIFACT]);

    const usdc = tokens.tokens["sepolia-mockusdc"];
    assert.equal(usdc?.canonicalAddress, SEPOLIA_USDC);
    assert.equal(usdc?.representations["sepolia"]?.address, SEPOLIA_USDC);
    assert.equal(usdc?.representations["ark-devnet"]?.address, ARK_USDC);
    assert.ok(usdc !== undefined && isTokenDeployed(usdc));

    const inbound = tokens.routes["sepolia:ark-devnet:sepolia-mockusdc"];
    assert.equal(inbound?.sourceRouter, SEPOLIA_ROUTER);
    assert.equal(inbound?.destinationRouter, ARK_ROUTER);

    // The reverse direction gets the same two routers, swapped — not copied.
    const outbound = tokens.routes["ark-devnet:sepolia:sepolia-mockusdc"];
    assert.equal(outbound?.sourceRouter, ARK_ROUTER);
    assert.equal(outbound?.destinationRouter, SEPOLIA_ROUTER);
    assert.ok(outbound !== undefined && isRouteDeployed(outbound));
  });

  it("carries a deployed chain's ids through unchanged", () => {
    const before = getChainRegistry("testnet").chains["ark-devnet"];
    assert.equal(before?.chainId, 9000);
    assert.equal(before?.hyperlaneDomainId, 9000);

    const { chains } = hydrate([ARK_ARTIFACT]);
    const ark = chains.chains["ark-devnet"];

    assert.equal(ark?.chainId, 9000);
    assert.equal(ark?.hyperlaneDomainId, 9000);
  });

  it("adopts still-pending ids from an artifact, carrying each independently", () => {
    // Mainnet's `ark` entry has neither id yet. The two are deliberately
    // different here: a domain id that came out equal to the chain id would
    // prove nothing about whether hydration conflates them.
    const before = getChainRegistry("mainnet").chains["ark"];
    assert.equal(before?.chainId, UNCONFIGURED);
    assert.equal(before?.hyperlaneDomainId, UNCONFIGURED);

    const { chains } = hydrateRegistries(getChainRegistry("mainnet"), getTokenRegistry("mainnet"), [
      artifact({
        environment: "mainnet",
        chain: "ark",
        chainId: 700_001,
        hyperlaneDomainId: 700_002,
        tokens: {},
      }),
    ]);

    assert.equal(chains.chains["ark"]?.chainId, 700_001);
    assert.equal(chains.chains["ark"]?.hyperlaneDomainId, 700_002);
  });

  it("rejects an artifact whose chain id contradicts the deployed Ark chain id", () => {
    assert.throws(
      () => hydrate([artifact({ chain: "ark-devnet", chainId: 9001 })]),
      /registry chainId 9000 disagrees with deployment artifact chainId 9001/,
    );
  });

  it("rejects an artifact whose domain id contradicts the deployed Ark domain id", () => {
    assert.throws(
      () => hydrate([artifact({ chain: "ark-devnet", chainId: 9000, hyperlaneDomainId: 9001 })]),
      /registry hyperlaneDomainId 9000 disagrees/,
    );
  });

  it("rejects an artifact whose chain id contradicts the registry", () => {
    assert.throws(
      () => hydrate([artifact({ chainId: 999 })]),
      /registry chainId 11155111 disagrees with deployment artifact chainId 999/,
    );
  });

  it("rejects an artifact whose domain id contradicts the registry", () => {
    assert.throws(
      () => hydrate([artifact({ hyperlaneDomainId: 999 })]),
      /registry hyperlaneDomainId 11155111 disagrees/,
    );
  });

  it("refuses to silently replace a canonical token mapping", () => {
    const first = hydrate([artifact()]);
    const replacement = artifact({
      tokens: {
        "sepolia-mockusdc": {
          token: "0x9999999999999999999999999999999999999999",
          router: SEPOLIA_ROUTER,
        },
      },
    });

    assert.throws(
      () => hydrateRegistries(first.chains, first.tokens, [replacement]),
      /Canonical mappings are not replaced silently/,
    );
  });

  it("rejects artifacts from a different environment", () => {
    assert.throws(() => hydrate([artifact({ environment: "mainnet" })]), /but the registry is/);
  });

  it("rejects two artifacts for the same chain", () => {
    assert.throws(() => hydrate([artifact(), artifact()]), /Duplicate deployment artifact/);
  });

  it("leaves undeployed entries at the zero sentinel", () => {
    const { tokens } = hydrate([]);
    const usdt = tokens.tokens["sepolia-mockusdt"];
    assert.equal(usdt?.canonicalAddress, ZERO_ADDRESS);
    assert.ok(usdt !== undefined && !isTokenDeployed(usdt));
  });

  it("does not enable anything by deploying it", () => {
    const before = getTokenRegistry("testnet").tokens["sepolia-mockusdt"]?.enabled;
    const after = hydrate([artifact(), ARK_ARTIFACT]).tokens.tokens["sepolia-mockusdt"]?.enabled;
    assert.equal(after, before);
    assert.equal(after, false);
  });
});

describe("deployment artifact parsing", () => {
  it("accepts a well-formed artifact", () => {
    const parsed = parseDeploymentArtifact(JSON.parse(JSON.stringify(artifact())), "test");
    assert.equal(parsed.chain, "sepolia");
  });

  it("rejects a malformed address rather than passing it through", () => {
    assert.throws(
      () => parseDeploymentArtifact({ ...artifact(), deployer: "0xdead" }, "test"),
      /"deployer" is not a valid address/,
    );
  });

  it("rejects a non-positive chain id", () => {
    assert.throws(
      () => parseDeploymentArtifact({ ...artifact(), chainId: 0 }, "test"),
      /"chainId" must be a positive integer/,
    );
  });
});

describe("environment resolution", () => {
  it("has no default", () => {
    assert.throws(() => resolveEnvironment(undefined), /ARKBRIDGE_ENV is not set/);
    assert.throws(() => resolveEnvironment("  "), /ARKBRIDGE_ENV is not set/);
  });

  it("rejects an unknown value instead of falling back", () => {
    assert.throws(() => resolveEnvironment("prod"), /is not a known environment/);
  });

  it("accepts each known environment", () => {
    assert.equal(resolveEnvironment("testnet"), "testnet");
    assert.equal(resolveEnvironment(" mainnet "), "mainnet");
  });
});
