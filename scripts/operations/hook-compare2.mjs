import { createPublicClient, http, toFunctionSelector } from "viem";
import { readFileSync } from "node:fs";
const ark = createPublicClient({ transport: http(process.env.ARK_RPC_URL) });
const sep = createPublicClient({ transport: http(process.env.SEPOLIA_RPC_URL) });
const art = JSON.parse(
  readFileSync(
    "../../packages/contracts/out/ArkBridgeGuardHook.sol/ArkBridgeGuardHook.json",
    "utf8",
  ),
);
const local = art.deployedBytecode.object.replace(/^0x/, "");
const immutables = art.deployedBytecode.immutableReferences ?? {};

/** Blanks the immutable slots so two builds can be compared on code alone. */
const normalise = (hex) => {
  const bytes = hex.split("");
  for (const refs of Object.values(immutables)) {
    for (const { start, length } of refs) {
      for (let i = start * 2; i < (start + length) * 2; i++) bytes[i] = "0";
    }
  }
  return bytes.join("");
};

const sel = {
  hookType: toFunctionSelector("hookType()"),
  guard: toFunctionSelector("GUARD()"),
  inner: toFunctionSelector("INNER_HOOK()"),
};
console.log("hookType selector:", sel.hookType);

for (const { label, client, addr } of [
  { label: "ark    ", client: ark, addr: "0x3155E3658841a0B9Ea59F3Cb3A55040481ad1cF7" },
  { label: "sepolia", client: sep, addr: "0x7E3A670E7DafC4E92D7572b78d52A1E2F0A47553" },
]) {
  const code = (await client.getCode({ address: addr })).replace(/^0x/, "");
  const call = async (data) => {
    const r = await client.call({ to: addr, data }).catch(() => null);
    return r?.data ?? null;
  };
  const ht = await call(sel.hookType);
  const g = await call(sel.guard);
  const inner = await call(sel.inner);
  console.log(`${label} ${addr}`);
  console.log(
    `  bytes ${code.length / 2}  codeEqualsSource(immutables blanked)=${normalise(code) === normalise(local)}`,
  );
  console.log(`  hookType   = ${ht === null ? "REVERTS" : Number(BigInt(ht))}`);
  console.log(`  GUARD      = ${g ? "0x" + g.slice(-40) : "n/a"}`);
  console.log(`  INNER_HOOK = ${inner ? "0x" + inner.slice(-40) : "n/a"}`);
}
console.log("local bytes", local.length / 2);
