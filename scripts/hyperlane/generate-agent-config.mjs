#!/usr/bin/env node
/**
 * Generate the Hyperlane agent config from the deployment artifact.
 *
 * Agents need contract addresses, and those live in exactly one place:
 * deployments/<env>/<chain>.json. Hand-maintaining a second copy in an agent
 * config is how a validator ends up watching the wrong Mailbox — so this file
 * is generated, never edited.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifact = JSON.parse(
  readFileSync(join(root, "deployments/testnet/ark-devnet.json"), "utf8"),
);

const { contracts, contractDetails, chainId, hyperlaneDomainId } = artifact;

// Index from the block the Mailbox was created in. Starting at 0 would make the
// validator scan 200k+ empty blocks before reaching anything relevant.
const indexFrom = contractDetails.mailbox.block;

const config = {
  chains: {
    arkdevnet: {
      name: "arkdevnet",
      displayName: "Ark Constellation Devnet",
      protocol: "ethereum",
      chainId,
      domainId: hyperlaneDomainId,
      rpcUrls: [{ http: "https://evm.34.60.137.196.sslip.io" }],
      mailbox: contracts.mailbox,
      merkleTreeHook: contracts.merkleTreeHook,
      validatorAnnounce: contracts.validatorAnnounce,
      // No IGP is deployed; the relayer runs with gas payment enforcement off.
      interchainGasPaymaster: "0x0000000000000000000000000000000000000000",
      index: { from: indexFrom, chunk: 999 },
      blocks: {
        // Measured on the live chain: ~2.95s. The agent requires this field.
        estimateBlockTime: 3,
        // CometBFT finalises at commit, so there is no reorg to wait out. 1 is a
        // margin against RPC nodes serving stale state, not against reorgs.
        reorgPeriod: 1,
        confirmations: 1,
      },
    },

    // Sepolia is a destination for Ark-originated messages, so the relayer needs
    // it. Addresses are Hyperlane's canonical Sepolia deployment — ArkBridge
    // neither deployed nor owns these, and does not redeploy core on a chain
    // that already has one.
    sepolia: {
      name: "sepolia",
      displayName: "Sepolia",
      protocol: "ethereum",
      chainId: 11155111,
      domainId: 11155111,
      rpcUrls: [{ http: "https://ethereum-sepolia-rpc.publicnode.com" }],
      mailbox: "0xfFAEF09B3cd11D9b20d1a19bECca54EEC2884766",
      merkleTreeHook: "0x4917a9746A7B6E0A57159cCb7F5a6744247f2d0d",
      validatorAnnounce: "0xE6105C59480a1B7DD3E4f28153aFdbE12F4CfCD9",
      interchainGasPaymaster: "0x6f2756380FD49228ae25Aa7F2817993cB74Ecc56",
      index: { from: 11632506, chunk: 999 },
      blocks: { estimateBlockTime: 12, reorgPeriod: 2, confirmations: 1 },
    },

    // Base Sepolia. Hyperlane already operates core here, so these are its
    // canonical addresses — ArkBridge deploys warp routes only.
    basesepolia: {
      name: "basesepolia",
      displayName: "Base Sepolia",
      protocol: "ethereum",
      chainId: 84532,
      domainId: 84532,
      // Two endpoints: sepolia.base.org rate-limits an indexing agent hard
      // enough to stall message delivery. Agents fail over in listed order.
      rpcUrls: [
        { http: "https://base-sepolia-rpc.publicnode.com" },
        { http: "https://sepolia.base.org" },
      ],
      mailbox: "0x6966b0E55883d49BFB24539356a2f8A673E02039",
      merkleTreeHook: "0x86fb9F1c124fB20ff130C41a79a432F770f67AFD",
      validatorAnnounce: "0x20c44b1E3BeaDA1e9826CFd48BeEDABeE9871cE9",
      interchainGasPaymaster: "0x28B02B97a850872C4D33C3E024fab6499ad96564",
      index: { from: 46392000, chunk: 999 },
      // OP-stack L2: blocks are 2s and sequencer-confirmed quickly, but final
      // only once the batch settles on L1. Not 1.
      blocks: { estimateBlockTime: 2, reorgPeriod: 5, confirmations: 1 },
    },
  },
};

const out = join(root, "infrastructure/hyperlane/agents/agent-config.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(config, null, 2) + "\n");

console.log(`wrote ${out.replace(root + "/", "")}`);
console.log(`  mailbox        ${contracts.mailbox}`);
console.log(`  merkleTreeHook ${contracts.merkleTreeHook}`);
console.log(`  indexing from  block ${indexFrom}`);
