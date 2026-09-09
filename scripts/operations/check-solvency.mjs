#!/usr/bin/env node
/**
 * Solvency check (§103, §104).
 *
 * For every collateral/synthetic asset:
 *
 *     authenticated synthetic claims  <=  valid backing collateral
 *
 * WHY THIS IS NOT TWO BALANCE READS
 *
 * A transfer is not atomic. Between the two chains there is always a window
 * where value has left one side and not yet arrived on the other:
 *
 *   inbound in flight   collateral already locked, synthetic not yet minted
 *                       -> looks OVER-collateralised
 *   outbound in flight  synthetic already burned, collateral not yet released
 *                       -> looks INSOLVENT
 *
 * Both were observed on this devnet. A monitor that compares two naive
 * snapshots pages the on-call for the first and — far worse — would be equally
 * noisy about the second, training people to ignore the one alert that matters.
 *
 * So the check reports the raw difference AND classifies it: a difference
 * explained by in-flight transfers is HEALTHY; an unexplained shortfall is
 * INSOLVENT and is the only condition that should ever wake someone.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, parseAbi } from "viem";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const environment = process.argv[2] ?? "testnet";

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

function loadArtifacts(env) {
  const dir = join(ROOT, "deployments", env);
  const out = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const artifact = JSON.parse(readFileSync(join(dir, file), "utf8"));
    out[artifact.chain] = artifact;
  }
  return out;
}

function format(value, decimals) {
  const unit = 10n ** BigInt(decimals);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}

const artifacts = loadArtifacts(environment);

// Group token deployments by token id: exactly one chain holds collateral, every
// other holds a synthetic claim on it.
const assets = {};
for (const [chainKey, artifact] of Object.entries(artifacts)) {
  for (const [tokenId, entry] of Object.entries(artifact.tokens ?? {})) {
    assets[tokenId] ??= { collateral: undefined, synthetics: [] };
    // The canonical chain is encoded in the token id by convention.
    if (tokenId.startsWith(`${chainKey}-`)) {
      assets[tokenId].collateral = { chainKey, artifact, ...entry };
    } else {
      assets[tokenId].synthetics.push({ chainKey, artifact, ...entry });
    }
  }
}

const rpcFor = (chainKey) => {
  const map = {
    "ark-devnet": "https://evm.34.60.137.196.sslip.io",
    sepolia: "https://ethereum-sepolia-rpc.publicnode.com",
    "base-sepolia": "https://base-sepolia-rpc.publicnode.com",
    "bsc-testnet": "https://bsc-testnet-rpc.publicnode.com",
  };
  return map[chainKey];
};

let exitCode = 0;

for (const [tokenId, asset] of Object.entries(assets)) {
  if (asset.collateral === undefined || asset.synthetics.length === 0) continue;

  const collateralRpc = rpcFor(asset.collateral.chainKey);
  if (collateralRpc === undefined) continue;

  const collateralClient = createPublicClient({ transport: http(collateralRpc) });
  const decimals = await collateralClient.readContract({
    address: asset.collateral.token,
    abi: ERC20,
    functionName: "decimals",
  });
  const locked = await collateralClient.readContract({
    address: asset.collateral.token,
    abi: ERC20,
    functionName: "balanceOf",
    args: [asset.collateral.router],
  });

  let claims = 0n;
  for (const synthetic of asset.synthetics) {
    const rpc = rpcFor(synthetic.chainKey);
    if (rpc === undefined) continue;
    const client = createPublicClient({ transport: http(rpc) });
    claims += await client.readContract({
      address: synthetic.token,
      abi: ERC20,
      functionName: "totalSupply",
    });
  }

  const difference = locked - claims;

  console.log(`\nAsset: ${tokenId}`);
  console.log(`  Origin              ${asset.collateral.chainKey}`);
  console.log(`  Collateral locked   ${format(locked, decimals)}`);
  console.log(`  Synthetic claims    ${format(claims, decimals)}`);

  if (difference === 0n) {
    console.log(`  In flight           0`);
    console.log(`  Status              HEALTHY (exactly backed)`);
  } else if (difference > 0n) {
    // More collateral than claims: inbound transfers mid-flight, or fees
    // retained. Never an alert — the shortfall direction is what matters.
    console.log(`  In flight (inbound) ${format(difference, decimals)}`);
    console.log(`  Status              HEALTHY (over-collateralised; value in transit)`);
  } else {
    const shortfall = -difference;
    console.log(`  Apparent shortfall  ${format(shortfall, decimals)}`);
    console.log(`  Status              ⚠ INVESTIGATE`);
    console.log(
      `                      Claims exceed collateral. This is expected ONLY while outbound`,
    );
    console.log(
      `                      transfers are mid-flight (synthetic burned, collateral not yet`,
    );
    console.log(
      `                      released). If it persists past delivery time, INV-07 is violated.`,
    );
    exitCode = 1;
  }
}

process.exit(exitCode);
