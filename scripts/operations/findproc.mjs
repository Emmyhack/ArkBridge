import { createPublicClient, http, parseAbiItem } from "viem";
import { writeFileSync } from "node:fs";
const client = createPublicClient({ transport: http(process.env.ARK_RPC_URL) });
const MAILBOX = "0xe441256be7296Fc42d2597A54dcD42E2C70cCb68";
const ev = parseAbiItem(
  "event Process(uint32 indexed origin, bytes32 indexed sender, address indexed recipient)",
);
const latest = await client.getBlockNumber();
const WINDOW = 9000n;
let found = null;
// Page backwards: the most recent delivery is the cheapest to find and the most
// certain to still be in the node's retained history.
for (let end = latest; end > 0n && found === null; end -= WINDOW) {
  const start = end > WINDOW ? end - WINDOW : 0n;
  const logs = await client.getLogs({ address: MAILBOX, event: ev, fromBlock: start, toBlock: end });
  if (logs.length > 0) found = logs[logs.length - 1];
  if (latest - end > 120000n) break;
}
if (found === null) {
  console.log("no Process events found in the retained window");
  process.exit(0);
}
const tx = await client.getTransaction({ hash: found.transactionHash });
const receipt = await client.getTransactionReceipt({ hash: found.transactionHash });
console.log("delivery tx :", found.transactionHash);
console.log("block       :", found.blockNumber.toString());
console.log("origin      :", found.args.origin);
console.log("recipient   :", found.args.recipient);
console.log("calldata    :", (tx.input.length - 2) / 2, "bytes, selector", tx.input.slice(0, 10));
console.log("status      :", receipt.status);
writeFileSync(
  "../../packages/contracts/test/fork/delivered-message.json",
  JSON.stringify(
    {
      note: "A real delivery on Ark, captured for the INV-06 replay fork test.",
      chain: "ark-devnet",
      mailbox: MAILBOX,
      transactionHash: found.transactionHash,
      blockNumber: found.blockNumber.toString(),
      origin: found.args.origin,
      sender: found.args.sender,
      recipient: found.args.recipient,
      processCalldata: tx.input,
    },
    null,
    2,
  ),
);
console.log("saved packages/contracts/test/fork/delivered-message.json");
