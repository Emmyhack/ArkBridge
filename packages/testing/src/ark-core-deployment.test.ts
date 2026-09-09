import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { arkDevnet } from "@arkbridge/chain-registry";
import { getAllRoutes } from "@arkbridge/token-registry";
import { parseDeploymentArtifact } from "@arkbridge/config";
import { findRepoRoot } from "@arkbridge/config/node";
import { join } from "node:path";

/**
 * Build Phase 2: the Ark Hyperlane core deployment.
 *
 * These pin the deployment's identity so a later registry or artifact edit
 * cannot silently repoint Ark at a different core. The live counterpart is
 * `pnpm check:chains`, which reads `localDomain()` off the deployed Mailbox;
 * this file checks the recorded state offline.
 */

const artifact = parseDeploymentArtifact(
  JSON.parse(readFileSync(join(findRepoRoot(), "deployments/testnet/ark-devnet.json"), "utf8")),
  "deployments/testnet/ark-devnet.json",
);

describe("Ark core deployment artifact", () => {
  it("is for the environment and chain it claims", () => {
    assert.equal(artifact.environment, "testnet");
    assert.equal(artifact.chain, "ark-devnet");
  });

  it("agrees with the chain registry on both identifiers", () => {
    assert.equal(artifact.chainId, arkDevnet.chainId, "chain id");
    assert.equal(artifact.hyperlaneDomainId, arkDevnet.hyperlaneDomainId, "domain id");
  });

  it("records the domain id that was asserted against Mailbox.localDomain()", () => {
    assert.equal(artifact.hyperlaneDomainId, 9000);
  });

  it("carries every core contract the bridge will need", () => {
    for (const name of [
      "mailbox",
      "proxyAdmin",
      "validatorAnnounce",
      "merkleTreeHook",
      "trustedRelayerIsm",
      "protocolFee",
      "staticMerkleRootMultisigIsmFactory",
      "staticMessageIdMultisigIsmFactory",
      "staticAggregationIsmFactory",
      "domainRoutingIsmFactory",
    ]) {
      const address = artifact.contracts[name];
      assert.ok(address !== undefined, `missing contract: ${name}`);
      assert.match(address, /^0x[0-9a-fA-F]{40}$/, `${name} is not an address`);
    }
  });

  it("records deployment provenance for every contract", () => {
    for (const [name, address] of Object.entries(artifact.contracts)) {
      const detail = artifact.contractDetails?.[name];
      assert.ok(detail !== undefined, `no provenance for ${name}`);
      assert.equal(detail.address, address, `${name} address disagrees with provenance`);
      assert.match(detail.deploymentTx ?? "", /^0x[0-9a-fA-F]{64}$/, `${name} deployment tx`);
      assert.ok((detail.block ?? 0) > 0, `${name} block`);
    }
  });

  it("records the Hyperlane version read back from the chain", () => {
    // Read from Mailbox.PACKAGE_VERSION(), not from the deploying tool: the
    // chain is the authority on what is actually deployed.
    assert.equal(artifact.hyperlane?.packageVersion, "12.1.0");
    assert.equal(artifact.hyperlane?.messageVersion, 3);
  });

  it("has no duplicate addresses across contracts", () => {
    const seen = new Map<string, string>();
    for (const [name, address] of Object.entries(artifact.contracts)) {
      const key = address.toLowerCase();
      const prior = seen.get(key);
      assert.equal(prior, undefined, `${name} shares an address with ${prior ?? ""}`);
      seen.set(key, name);
    }
  });
});

/** `inboundSecurity` mixes per-origin records with free prose; take only records. */
function origin(name: string) {
  const entry = artifact.phase3?.inboundSecurity?.[name];
  return typeof entry === "string" ? undefined : entry;
}

describe("Phase 3a — inbound message security", () => {
  it("replaced the bootstrap trustedRelayerIsm with a domain routing ISM", () => {
    const change = artifact.phase3?.defaultIsmChange;
    assert.match(String(change?.from), /trustedRelayerIsm/);
    assert.match(String(change?.to), /domainRoutingIsm/);
  });

  it("secures every inbound origin ArkBridge accepts", () => {
    assert.equal(origin("sepolia")?.domain, 11155111);
    assert.equal(origin("bsctestnet")?.domain, 97);
    for (const name of ["sepolia", "bsctestnet"]) {
      const entry = origin(name);
      assert.ok((entry?.validators?.length ?? 0) >= 1, `${name} has no validators`);
      assert.ok((entry?.threshold ?? 0) >= 1, `${name} has no threshold`);
    }
  });

  it("records that both inbound sets are the same single key", () => {
    // Not a passing grade — a pinned fact. Hyperlane's Sepolia and BSC Testnet
    // sets are both 1-of-1 on the same validator, so one key compromise forges
    // both origins. Acceptable on devnet; this assertion is what makes the risk
    // visible if anyone promotes this config unchanged.
    assert.deepEqual(origin("sepolia")?.validators, origin("bsctestnet")?.validators);
    assert.equal(origin("sepolia")?.threshold, 1);
  });
});

describe("Phase 3b — outbound message security", () => {
  const outbound = artifact.phase3?.outboundSecurity;

  it("is live and verified end to end", () => {
    assert.equal(outbound?.status, "LIVE AND VERIFIED");
  });

  it("uses three distinct validators at a real threshold", () => {
    const set = outbound?.validators?.set ?? [];
    assert.equal(set.length, 3);
    assert.equal(new Set(set.map((v) => v.toLowerCase())).size, 3, "validators are not distinct");
    assert.equal(outbound?.validators?.threshold, 2, "threshold must be 2-of-3");
    assert.ok(
      !set.map((v) => v.toLowerCase()).includes(artifact.deployer.toLowerCase()),
      "a validator reuses the deployer key",
    );
  });

  it("gives each validator its own checkpoint storage location", () => {
    // All three announcing one path is not a cosmetic problem: the relayer
    // resolves the announced string in its own filesystem, so identical paths
    // mean it reads one directory three times and can never reach quorum.
    const locations = outbound?.validators?.storageLocations ?? [];
    assert.equal(locations.length, 3);
    assert.equal(new Set(locations).size, 3, "validators share a storage location");
  });

  it("proves the Ark -> Sepolia path actually delivered", () => {
    const test = outbound?.endToEndTest;
    assert.equal(test?.sepoliaMailboxDelivered, true);
    assert.equal(test?.handledCount, 1);
    assert.equal(test?.lastOrigin, 9000, "message did not originate on Ark");
  });

  it("verified against ArkBridge's own ISM, not a default", () => {
    // If the recipient had fallen through to Sepolia's default ISM, delivery
    // would prove nothing about ArkBridge's validator set.
    assert.equal(outbound?.endToEndTest?.recipientIsmUsed, outbound?.ismOnSepolia);
  });

  it("records that one host holding three keys is not a threshold", () => {
    assert.match(String(outbound?.validators?.warning), /one machine holds all three keys/);
  });
});

describe("Phase 3 — inbound message security", () => {
  const inbound = artifact.phase3?.inboundStatus;

  it("is configured and working", () => {
    assert.equal(inbound?.configured, true);
    assert.equal(inbound?.working, true);
  });

  it("uses ArkBridge's own validators, not Hyperlane's 1-of-1 set", () => {
    assert.equal(inbound?.threshold, 2);
    assert.equal(inbound?.validators?.length, 3);
    assert.ok(
      !(inbound?.validators ?? []).some(
        (v) => v.toLowerCase() === "0x3c659e0fe8d01b80d7828b421630085777346e7c",
      ),
      "still trusting Hyperlane's shared single testnet key",
    );
  });

  it("routes Sepolia origin at the ISM the end-to-end test exercised", () => {
    assert.equal(inbound?.endToEndTest?.routingIsmModuleForSepolia, inbound?.ism);
  });
});

describe("Enabling the hub does not un-gate BSC", () => {
  it("records that BSC Testnet still trusts the shared single key", () => {
    assert.match(String(artifact.phase3?.bscTestnetStatus), /1-of-1/);
  });

  it("has the hub enabled", () => {
    assert.equal(arkDevnet.enabled, true);
  });

  it("keeps every BSC route disabled anyway", () => {
    // The whole point of gating BSC in the token registry rather than relying
    // on the hub being off: enabling Ark must not make an unsafe route
    // selectable, and neither must deploying its warp route later.
    for (const route of getAllRoutes("testnet")) {
      if (!route.id.includes("bsc")) continue;
      assert.equal(route.enabled, false, `${route.id} became enabled`);
    }
  });

  it("records that a recipient ISM overrides the Mailbox default", () => {
    // The trap Phase 4 must not fall into: warp routes specify their own ISM,
    // so replacing the Mailbox default does not secure them.
    assert.match(String(artifact.phase3?.recipientIsmFinding), /OVERRIDES the Mailbox default/);
  });
});
