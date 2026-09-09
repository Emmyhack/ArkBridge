#!/usr/bin/env node
/**
 * Manual transfer through @arkbridge/sdk.
 *
 * Exists to answer spec §135's question — can the SDK actually move tokens on a
 * testnet? — without a frontend. Also the reference for how an integrator wires
 * the SDK up: build a wallet client, hand it over, and let the SDK do the rest.
 *
 * The private key is read here and passed to viem. It never enters the SDK,
 * which only ever receives a wallet client to sign with (spec §77).
 *
 *   node scripts/bridge/transfer.mjs <sourceChain> <destChain> <tokenId> <amount>
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createArkBridgeFromArtifacts } from "@arkbridge/sdk/node";
import {
  formatAmount,
  parseAmount,
  presentStatus,
  normalizeError,
  presentFailure,
} from "@arkbridge/sdk";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const [sourceChain, destinationChain, token, amountInput] = process.argv.slice(2);
if (!sourceChain || !destinationChain || !token || !amountInput) {
  console.error("usage: transfer.mjs <sourceChain> <destChain> <tokenId> <amount>");
  process.exit(2);
}

const keyMatch = readFileSync(join(ROOT, ".env"), "utf8").match(/^DEPLOYER_PRIVATE_KEY=(.+)$/m);
if (!keyMatch) {
  console.error("DEPLOYER_PRIVATE_KEY not set in .env");
  process.exit(2);
}
const account = privateKeyToAccount(keyMatch[1].trim());

const bridge = await createArkBridgeFromArtifacts("testnet", ROOT);

const chain = bridge.getChains().find((c) => c.key === sourceChain);
if (!chain) {
  console.error(`unknown or disabled chain: ${sourceChain}`);
  process.exit(2);
}

const tokenInfo = bridge.getSupportedTokens().find((t) => t.id === token);
if (!tokenInfo) {
  console.error(`unsupported token: ${token}`);
  process.exit(2);
}
const decimals = tokenInfo.representations[sourceChain]?.decimals ?? tokenInfo.decimals;
const amount = parseAmount(amountInput, decimals);

const walletClient = createWalletClient({ account, transport: http(chain.rpcUrls[0]) });
const request = {
  sourceChain,
  destinationChain,
  token,
  amount,
  recipient: account.address,
  account: account.address,
  walletClient,
};

try {
  const availability = await bridge.isRouteAvailable({
    sourceChain,
    destinationChain,
    tokenId: token,
  });
  console.log(`route      ${availability.routeId}`);
  console.log(
    `available  ${availability.available}${availability.reason ? ` (${availability.reason})` : ""}`,
  );
  if (!availability.available) process.exit(1);
  console.log(
    `capacity   ${availability.capacity === undefined ? "unknown" : formatAmount(availability.capacity, decimals)}`,
  );

  const approval = await bridge.getApproval(request);
  console.log(
    `approval   required=${approval.required} current=${formatAmount(approval.current, decimals)}`,
  );
  if (approval.required) {
    console.log(`           approving...`);
    console.log(`           tx ${await bridge.approve(request)}`);
    await new Promise((r) => setTimeout(r, 10_000));
  }

  const quote = await bridge.quote(request);
  console.log(
    `quote      send ${formatAmount(quote.amount, decimals)} -> receive ${formatAmount(quote.estimatedReceived, decimals)}`,
  );
  console.log(
    `           bridge fee ${quote.bridgeFee}  interchain fee ${quote.interchainFee} wei`,
  );

  const submission = await bridge.bridge(request);
  console.log(`sourceTx   ${submission.sourceTransactionHash}`);
  console.log(`messageId  ${submission.messageId ?? "(not in receipt yet)"}`);

  if (submission.messageId) {
    for (let i = 0; i < 10; i++) {
      const status = await bridge.getMessageStatus(
        submission.messageId,
        sourceChain,
        destinationChain,
      );
      const label = presentStatus(status.delivered ? "DELIVERED" : "AWAITING_VERIFICATION");
      console.log(`status     ${label.label}`);
      if (status.delivered) break;
      await new Promise((r) => setTimeout(r, 45_000));
    }
  }
} catch (error) {
  const normalized = normalizeError(error);
  const presented = presentFailure(normalized.code);
  console.error(`\n${presented.title}`);
  console.error(`  ${presented.detail}`);
  if (presented.action) console.error(`  ${presented.action}`);
  console.error(`  [${normalized.code}] ${normalized.message}`);
  process.exit(1);
}
