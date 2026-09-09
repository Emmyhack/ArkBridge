#!/usr/bin/env node
/**
 * Agent gas balances (§97).
 *
 * A relayer that runs out of gas does not error — it simply stops delivering.
 * Transfers sit in AWAITING_VERIFICATION with the user's funds already locked,
 * and nothing anywhere reports a fault. That silence is the reason this exists.
 *
 * Thresholds are per role, because the roles have different burn rates:
 *
 *   relayer     submits a transaction per delivery, on every destination chain.
 *               Warns early and loudly.
 *   validator   sends exactly one transaction ever (its announcement). A low
 *               balance here is only a problem before that has happened, so the
 *               threshold is nominal.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, formatEther } from "viem";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CHAINS = {
  "ark-devnet": { rpc: "https://evm.34.60.137.196.sslip.io", symbol: "KASH" },
  sepolia: { rpc: "https://ethereum-sepolia-rpc.publicnode.com", symbol: "ETH" },
  "base-sepolia": { rpc: "https://base-sepolia-rpc.publicnode.com", symbol: "ETH" },
};

/**
 * Thresholds in TRANSACTIONS REMAINING, not native units.
 *
 * An absolute balance means nothing across chains: 0.0005 ETH buys ~83 billion
 * gas on Base at 0.006 gwei and roughly nothing on Sepolia at 1.1 gwei. The
 * first version of this monitor used fixed amounts and reported healthy Base
 * agents as CRITICAL — a false alarm, which is the failure mode that gets a
 * monitor ignored.
 *
 * So thresholds are "how many more transactions can this agent send", computed
 * from the chain's current gas price.
 */
const TX_GAS = { relayer: 250_000n, validator: 170_000n, deployer: 2_000_000n };

const THRESHOLDS = {
  // The relayer sends one per delivery and must never run dry mid-traffic.
  relayer: { warning: 200, critical: 50 },
  // A validator sends exactly one transaction ever: its announcement.
  validator: { warning: 5, critical: 1 },
  deployer: { warning: 3, critical: 1 },
};

function readEnvKeys() {
  const env = readFileSync(join(ROOT, ".env"), "utf8");
  const pick = (name) => env.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();
  return {
    relayer: pick("RELAYER_KEY"),
    validator1: pick("VALIDATOR_1_KEY"),
    validator2: pick("VALIDATOR_2_KEY"),
    validator3: pick("VALIDATOR_3_KEY"),
    deployer: pick("DEPLOYER_PRIVATE_KEY"),
  };
}

// Addresses are derived locally and only addresses are ever printed. A monitor
// has no reason to handle key material beyond deriving what to look up.
const { privateKeyToAccount } = await import("viem/accounts");
const keys = readEnvKeys();

const AGENTS = [];
for (const [name, key] of Object.entries(keys)) {
  if (key === undefined || key.length < 66) continue;
  const role = name.startsWith("validator") ? "validator" : name;
  try {
    AGENTS.push({ name, role, address: privateKeyToAccount(key).address });
  } catch {
    console.error(`  ${name}: key is malformed, cannot derive an address`);
  }
}

let worst = 0; // 0 ok, 1 warning, 2 critical

for (const [chainKey, chain] of Object.entries(CHAINS)) {
  const client = createPublicClient({ transport: http(chain.rpc) });

  let gasPrice;
  try {
    gasPrice = await client.getGasPrice();
  } catch {
    console.log(`\n${chainKey}  (unreachable)`);
    continue;
  }
  console.log(`\n${chainKey}  gas ${(Number(gasPrice) / 1e9).toFixed(3)} gwei`);

  for (const agent of AGENTS) {
    let balance;
    try {
      balance = await client.getBalance({ address: agent.address });
    } catch {
      console.log(`  ${agent.name.padEnd(11)} unreachable`);
      continue;
    }

    const amount = Number(formatEther(balance));
    const limits = THRESHOLDS[agent.role] ?? THRESHOLDS.validator;
    const perTx = (TX_GAS[agent.role] ?? TX_GAS.validator) * gasPrice;
    const remaining = perTx === 0n ? Infinity : Number(balance / perTx);

    let state = "ok";
    if (remaining < limits.critical) {
      state = "CRITICAL";
      worst = 2;
    } else if (remaining < limits.warning) {
      state = "warning";
      worst = Math.max(worst, 1);
    }

    console.log(
      `  ${agent.name.padEnd(11)} ${amount.toFixed(6).padStart(10)} ${chain.symbol.padEnd(5)}` +
        ` ${String(remaining === Infinity ? "∞" : Math.floor(remaining)).padStart(8)} tx  ${state}`,
    );
  }
}

console.log(
  worst === 2
    ? "\nCRITICAL: an agent is below its critical threshold. Deliveries will stop silently."
    : worst === 1
      ? "\nWARNING: an agent is running low. Top up before it stops delivering."
      : "\nAll agents funded.",
);

process.exit(worst === 2 ? 1 : 0);
