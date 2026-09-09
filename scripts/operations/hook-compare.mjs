import { createPublicClient, http } from "viem";
import { readFileSync } from "node:fs";
const ark = createPublicClient({ transport: http(process.env.ARK_RPC_URL) });
const sep = createPublicClient({ transport: http(process.env.SEPOLIA_RPC_URL) });
const local = JSON.parse(
  readFileSync(
    "../../packages/contracts/out/ArkBridgeGuardHook.sol/ArkBridgeGuardHook.json",
    "utf8",
  ),
).deployedBytecode.object.replace(/^0x/, "");

const HOOK_TYPE = "0x9c42df70"; // hookType()
for (const { label, client, addr } of [
  { label: "ark    ", client: ark, addr: "0x3155E3658841a0B9Ea59F3Cb3A55040481ad1cF7" },
  { label: "sepolia", client: sep, addr: "0x7E3A670E7DafC4E92D7572b78d52A1E2F0A47553" },
]) {
  const code = (await client.getCode({ address: addr })).replace(/^0x/, "");
  const res = await client
    .call({ to: addr, data: HOOK_TYPE })
    .catch((e) => ({ err: e.shortMessage ?? "revert" }));
  console.log(
    `${label} ${addr}\n  bytes ${code.length / 2}  matchesSource=${code === local}  hookType=${
      res.err ?? parseInt(res.data ?? "0x", 16)
    }`,
  );
}
console.log(`local build bytes ${local.length / 2}`);
