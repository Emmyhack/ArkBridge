import { createPublicClient, http } from "viem";
import { readFileSync } from "node:fs";
const client = createPublicClient({ transport: http(process.env.ARK_RPC_URL) });
const onchain = (await client.getCode({ address: "0x3155E3658841a0B9Ea59F3Cb3A55040481ad1cF7" })).replace(/^0x/, "");
const art = JSON.parse(readFileSync("../../packages/contracts/out/ArkBridgeGuardHook.sol/ArkBridgeGuardHook.json", "utf8"));
const local = art.deployedBytecode.object.replace(/^0x/, "");

// PUSH4 (0x63) immediates in the dispatcher are the function selectors.
const selectors = (code) => {
  const found = new Set();
  for (let i = 0; i + 10 <= code.length; i += 2) {
    if (code.slice(i, i + 2) === "63") found.add("0x" + code.slice(i + 2, i + 10));
  }
  return found;
};

// Map selectors back to names using the compiled ABI.
import { toFunctionSelector } from "viem";
const names = new Map();
for (const item of art.abi) {
  if (item.type !== "function") continue;
  const sig = `${item.name}(${item.inputs.map((i) => i.type).join(",")})`;
  names.set(toFunctionSelector(sig), sig);
}

const a = selectors(onchain), b = selectors(local);
const only = (x, y) => [...x].filter((s) => !y.has(s)).filter((s) => names.has(s));
console.log("selectors only on-chain :", only(a, b).map((s) => names.get(s)));
console.log("selectors only in source:", only(b, a).map((s) => names.get(s)));
console.log("shared, known           :", [...a].filter((s) => b.has(s) && names.has(s)).map((s) => names.get(s)));
