import { createPublicClient, http } from "viem";
import { readFileSync } from "node:fs";
const client = createPublicClient({ transport: http(process.env.ARK_RPC_URL) });
const ADDR = "0x3155E3658841a0B9Ea59F3Cb3A55040481ad1cF7";
const onchain = (await client.getCode({ address: ADDR })).replace(/^0x/, "");
const local = JSON.parse(
  readFileSync("../../packages/contracts/out/ArkBridgeGuardHook.sol/ArkBridgeGuardHook.json", "utf8"),
).deployedBytecode.object.replace(/^0x/, "");
console.log("on-chain runtime bytes:", onchain.length / 2);
console.log("local    runtime bytes:", local.length / 2);
console.log("identical:", onchain === local);
if (onchain !== local) {
  let i = 0;
  while (i < Math.min(onchain.length, local.length) && onchain[i] === local[i]) i++;
  console.log("first divergence at byte:", Math.floor(i / 2));
}
// What is the mailbox actually using as its required hook right now?
const mailbox = "0xe441256be7296Fc42d2597A54dcD42E2C70cCb68";
for (const [label, sel] of [["requiredHook", "0xe495f1d4"], ["defaultHook", "0x3d1250b7"]]) {
  const r = await client.call({ to: mailbox, data: sel }).catch(() => null);
  console.log(label, r?.data ? "0x" + r.data.slice(-40) : "n/a");
}
