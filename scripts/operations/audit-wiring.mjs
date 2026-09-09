import { createPublicClient, http, encodeFunctionData } from "viem";
import { readFileSync } from "node:fs";
const ark = createPublicClient({ transport: http(process.env.ARK_RPC_URL) });
const sep = createPublicClient({ transport: http(process.env.SEPOLIA_RPC_URL) });
const a = JSON.parse(readFileSync("../../deployments/testnet/ark-devnet.json", "utf8")).contracts;
const s = JSON.parse(readFileSync("../../deployments/testnet/sepolia.json", "utf8")).contracts;

const read = async (client, to, sig) => {
  const r = await client
    .call({
      to,
      data: encodeFunctionData({
        abi: [
          {
            type: "function",
            name: sig,
            inputs: [],
            outputs: [{ type: "address" }],
            stateMutability: "view",
          },
        ],
        functionName: sig,
      }),
    })
    .catch(() => null);
  return r?.data && r.data !== "0x" ? "0x" + r.data.slice(-40) : null;
};

const named = (addr, book) => {
  if (addr === null) return "n/a";
  const hit = Object.entries(book).find(([, v]) => v.toLowerCase() === addr.toLowerCase());
  return hit ? `${addr}  (${hit[0]})` : addr;
};

console.log("=== ARK routers ===");
for (const key of ["mockusdcSynthetic", "mockusdcBaseSynthetic"]) {
  console.log(` ${key} ${a[key]}`);
  console.log("   hook :", named(await read(ark, a[key], "hook"), a));
  console.log("   ism  :", named(await read(ark, a[key], "interchainSecurityModule"), a));
}
console.log("   mailbox defaultHook :", named(await read(ark, a.mailbox, "defaultHook"), a));
console.log("   mailbox defaultIsm  :", named(await read(ark, a.mailbox, "defaultIsm"), a));

console.log("=== SEPOLIA collateral router ===");
console.log("   hook :", named(await read(sep, s.mockUsdcCollateralRouter, "hook"), s));
console.log(
  "   ism  :",
  named(await read(sep, s.mockUsdcCollateralRouter, "interchainSecurityModule"), s),
);
console.log("   mailbox defaultHook :", named(await read(sep, s.mailbox, "defaultHook"), s));
