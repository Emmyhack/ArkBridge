#!/usr/bin/env node
/**
 * Is every route's inbound verification actually able to verify?
 *
 * WHY THIS EXISTS
 *
 * A relayer calls `moduleType()` on the destination's ISM to decide what proof
 * to build. An ISM that reports NULL tells the relayer "no proof needed", so the
 * relayer submits empty metadata, and `verify()` reverts. The transfer is
 * accepted on the source chain, the collateral locks, and the delivery fails
 * forever in gas estimation. Nothing surfaces: the contracts are deployed, the
 * addresses are right, the agents are healthy.
 *
 * This shipped to Base Sepolia and survived undetected because the route was
 * only ever tested in one direction. `moduleType()` lives on the *destination*
 * ISM, so Base -> Ark exercised Ark's ISM and passed, while Ark -> Base was
 * broken from the day it was deployed. The Sepolia and Ark deployments carried
 * the fix; Base, added later, carried an older build of the same contract.
 *
 * Two properties are checked per chain, both read live from the chain rather
 * than from an artifact, because the artifact is what was *intended*:
 *
 *   1. The router's configured ISM reports a usable moduleType — never NULL.
 *   2. A guard ISM delegates that type from its inner ISM rather than
 *      answering for itself, which is what makes (1) stay true after the inner
 *      ISM is swapped.
 *
 *   node scripts/operations/check-ism-wiring.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, encodeFunctionData } from "viem";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENVIRONMENT = process.env.ARKBRIDGE_ENV ?? "testnet";

/** Hyperlane's ISM type enum. NULL means "no verification", which is only ever
 *  correct for a route that does not need security — never for a bridge. */
const MODULE_TYPE = {
  0: "UNUSED",
  1: "ROUTING",
  2: "AGGREGATION",
  3: "LEGACY_MULTISIG",
  4: "MERKLE_ROOT_MULTISIG",
  5: "MESSAGE_ID_MULTISIG",
  6: "NULL",
  7: "CCIP_READ",
  8: "ARB_L2_TO_L1",
};
const UNUSABLE = new Set([0, 6]);

/** Router keys, in the order a chain is likely to name them. */
const ROUTER_KEYS = ["mockUsdcCollateralRouter", "mockusdcSynthetic", "mockusdcBaseSynthetic"];

/** Same map the sibling operations scripts use, kept local so this stays a
 *  zero-dependency script that runs without a workspace build. */
const rpcFor = (chainKey) => {
  const map = {
    "ark-devnet": process.env.ARK_RPC_URL ?? "https://evm.34.60.137.196.sslip.io",
    sepolia: "https://sepolia.gateway.tenderly.co",
    "base-sepolia": "https://base-sepolia-rpc.publicnode.com",
    "bsc-testnet": "https://bsc-testnet-rpc.publicnode.com",
  };
  return map[chainKey];
};

const view = (name, outputs) => ({
  abi: [{ name, type: "function", stateMutability: "view", inputs: [], outputs }],
  functionName: name,
  args: [],
});

async function read(client, to, name, outputs) {
  try {
    const result = await client.call({ to, data: encodeFunctionData(view(name, outputs)) });
    return result.data;
  } catch {
    return undefined;
  }
}

const dir = join(ROOT, "deployments", ENVIRONMENT);
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

let failed = false;
console.log(`ISM wiring, ${ENVIRONMENT}\n`);

for (const file of files.sort()) {
  const artifact = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const chainKey = artifact.chain ?? file.replace(/\.json$/, "");
  const contracts = artifact.contracts ?? {};

  const rpc = rpcFor(chainKey);
  if (rpc === undefined) {
    console.log(`  ${chainKey.padEnd(16)} no RPC configured — skipped`);
    continue;
  }

  const client = createPublicClient({ transport: http(rpc) });

  for (const key of ROUTER_KEYS) {
    const router = contracts[key];
    if (router === undefined) continue;

    const ismRaw = await read(client, router, "interchainSecurityModule", [{ type: "address" }]);
    if (ismRaw === undefined) {
      console.log(`  ${chainKey}/${key}: router does not expose an ISM — skipped`);
      continue;
    }
    const ism = `0x${ismRaw.slice(26)}`;
    if (BigInt(ism) === 0n) {
      // Zero means "use the mailbox default", which is legitimate but worth
      // stating rather than passing over silently.
      console.log(`  ${chainKey.padEnd(16)} ${key.padEnd(26)} default (mailbox ISM)`);
      continue;
    }

    const typeRaw = await read(client, ism, "moduleType", [{ type: "uint8" }]);
    const type = typeRaw === undefined ? undefined : Number(BigInt(typeRaw));
    const label = type === undefined ? "unreadable" : (MODULE_TYPE[type] ?? `type ${type}`);

    // A guard ISM must take its type from the inner ISM, not answer for itself.
    const innerRaw = await read(client, ism, "INNER_ISM", [{ type: "address" }]);
    let delegation = "";
    if (innerRaw !== undefined) {
      const inner = `0x${innerRaw.slice(26)}`;
      const innerTypeRaw = await read(client, inner, "moduleType", [{ type: "uint8" }]);
      const innerType = innerTypeRaw === undefined ? undefined : Number(BigInt(innerTypeRaw));
      delegation =
        innerType === undefined
          ? "  inner unreadable"
          : innerType === type
            ? `  delegates from inner (${MODULE_TYPE[innerType] ?? innerType})`
            : `  DOES NOT DELEGATE: inner is ${MODULE_TYPE[innerType] ?? innerType}`;
      if (innerType !== undefined && innerType !== type) failed = true;
    }

    const bad = type === undefined || UNUSABLE.has(type);
    if (bad) failed = true;
    console.log(
      `  ${chainKey.padEnd(16)} ${key.padEnd(26)} ${label.padEnd(21)}` +
        `${bad ? "  <-- UNUSABLE" : ""}${delegation}`,
    );
  }
}

if (failed) {
  console.log(
    "\nAn ISM reports a type a relayer cannot build a proof for, or a guard ISM\n" +
      "is answering with its own type instead of its inner ISM's. Deliveries to\n" +
      "that chain will revert in gas estimation with empty metadata, while the\n" +
      "opposite direction keeps working — test both directions before trusting\n" +
      "a route.",
  );
  process.exit(1);
}

console.log("\nEvery configured ISM reports a usable module type.");
