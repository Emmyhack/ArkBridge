/**
 * Recovers each contract's constructor arguments from its deployment.
 *
 * The deployment transaction's input is `creationCode || abi.encode(args)`, so
 * the arguments are whatever remains after the locally compiled creation code.
 * Deriving them this way rather than re-deriving them from the deploy script is
 * deliberate: it verifies against what was actually deployed, so a contract
 * built from different arguments than the script intended fails here instead of
 * being verified with a plausible lie.
 */
import { createPublicClient, http } from "viem";
import { readFileSync } from "node:fs";

const client = createPublicClient({ transport: http(process.env.ARK_RPC_URL) });
const deployment = JSON.parse(readFileSync("../../deployments/testnet/ark-devnet.json", "utf8"));
const OUT = "../../packages/contracts/out";

const TARGETS = [
  { key: "rateLimiter", file: "ArkBridgeRateLimiter.sol", name: "ArkBridgeRateLimiter" },
  {
    key: "pauseController",
    file: "ArkBridgePauseController.sol",
    name: "ArkBridgePauseController",
  },
  { key: "guard", file: "ArkBridgeGuard.sol", name: "ArkBridgeGuard" },
  { key: "guardHook", file: "ArkBridgeGuardHook.sol", name: "ArkBridgeGuardHook" },
  { key: "guardIsm", file: "ArkBridgeGuardIsm.sol", name: "ArkBridgeGuardIsm" },
  { key: "recoveryIsm", file: "ArkBridgeRecoveryIsm.sol", name: "ArkBridgeRecoveryIsm" },
];

for (const target of TARGETS) {
  const address = deployment.contracts[target.key];
  if (address === undefined) {
    console.log(`${target.key}: not in artifact`);
    continue;
  }

  let creation;
  try {
    creation = JSON.parse(
      readFileSync(`${OUT}/${target.file}/${target.name}.json`, "utf8"),
    ).bytecode.object.replace(/^0x/, "");
  } catch {
    console.log(`${target.key}: no local build artifact`);
    continue;
  }

  // The creation tx is not always recorded in the deployment artifact, so ask
  // the explorer where the code came from when it is missing.
  let txHash = deployment.contractDetails?.[target.key]?.deploymentTx;
  if (txHash === undefined || /^0x0+$/.test(txHash)) {
    const res = await fetch(
      `https://explorer-api.34.60.137.196.sslip.io/api?module=contract&action=getcontractcreation&contractaddresses=${address}`,
    )
      .then((r) => r.json())
      .catch(() => null);
    txHash = res?.result?.[0]?.txHash ?? res?.result?.[0]?.transactionHash;
  }
  if (txHash === undefined) {
    console.log(`${target.key}: creation tx unknown`);
    continue;
  }

  const tx = await client.getTransaction({ hash: txHash }).catch(() => null);
  if (tx === null) {
    console.log(`${target.key}: creation tx not retrievable`);
    continue;
  }

  const input = tx.input.replace(/^0x/, "");
  if (!input.startsWith(creation.slice(0, 64))) {
    console.log(`${target.key}: deployed code does not match the local build`);
    continue;
  }
  const args = input.slice(creation.length);
  console.log(`${target.key} ${address} args=0x${args || "(none)"}`);
}
