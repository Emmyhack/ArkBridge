import type { ChainConfig } from "@arkbridge/types";
import { UNCONFIGURED } from "@arkbridge/types";

/**
 * Ark Constellation — the ArkBridge hub.
 *
 * Ark is a Cosmos SDK chain with an EVM execution layer. ArkBridge talks to it
 * exclusively over the EVM JSON-RPC endpoint; the CometBFT RPC and LCD are
 * operational surfaces, not bridge surfaces, and are not modelled here.
 *
 * Note that the Cosmos chain id (`arkdevnet_9000-1`) and the EVM chain id
 * (`9000`) are different identifiers for the same network. `chainId` below is
 * the EVM one — it is what a wallet switches to and what `eth_chainId` returns.
 *
 * HYPERLANE DOMAIN ID
 * -------------------
 * Ark devnet's domain id is 9000, chosen to match its EVM chain id.
 *
 * That equality is a deliberate choice, not a derivation — the two identifiers
 * remain independent everywhere else in this codebase. It was made against
 * three checks, run before the Mailbox was deployed:
 *
 *   1. 9000 fits uint32 (uses 14 of 32 bits).
 *   2. 9000 is unclaimed. Checked against all 348 chains in
 *      @hyperlane-xyz/registry@26.1.0: no chain claims domain 9000, and none
 *      claims EVM chain id 9000 either. Evmos sits at the adjacent 9001.
 *   3. It matches the live network: eth_chainId returns 0x2328 (9000).
 *
 * The value is fixed in the deployed Mailbox's bytecode and trusted by every
 * remote router that enrols against it. Changing it means redeploying core and
 * re-enrolling every route, so it is not adjustable in practice.
 *
 * `pnpm check:chains` reads it back from the deployed Mailbox
 * (`localDomain()`) and fails if the registry and the chain ever disagree.
 */

const ARK_NATIVE_CURRENCY = {
  name: "Kash",
  symbol: "KASH",
  decimals: 18,
} as const;

export const arkMainnet: ChainConfig = {
  key: "ark",
  name: "Ark Constellation",
  descriptor: "Native network",
  logo: "ark",
  chainId: UNCONFIGURED,
  hyperlaneDomainId: UNCONFIGURED,
  rpcUrls: [],
  nativeCurrency: ARK_NATIVE_CURRENCY,
  testnet: false,
  isHub: true,
  enabled: false,
};

/**
 * Ark Constellation Devnet.
 *
 * EVM chain id 9000, confirmed live against `eth_chainId` at the endpoint below.
 *
 * The endpoints are `sslip.io` hostnames resolving to the devnet host, with
 * Let's Encrypt certificates terminated by Caddy. They are devnet-only: a public
 * testnet or mainnet must move to an Ark-owned domain before launch. The legacy
 * plaintext `http://34.60.137.196:*` endpoints are deliberately not listed —
 * an unauthenticated transport is not something bridge tooling should fall back
 * to, and `CHAIN_PROD_INSECURE_RPC` rejects them in production regardless.
 */
export const arkDevnet: ChainConfig = {
  key: "ark-devnet",
  name: "Ark Constellation",
  descriptor: "Devnet",
  logo: "ark",
  chainId: 9000,
  hyperlaneDomainId: 9000,
  rpcUrls: ["https://evm.34.60.137.196.sslip.io"],
  wsUrls: ["wss://evm-ws.34.60.137.196.sslip.io"],
  explorerUrl: "https://explorer.34.60.137.196.sslip.io",
  explorerApiUrl: "https://explorer-api.34.60.137.196.sslip.io",
  explorerApiKind: "blockscout",
  faucetUrl: "https://faucet.34.60.137.196.sslip.io/",
  nativeCurrency: ARK_NATIVE_CURRENCY,
  testnet: true,
  isHub: true,
  // Enabled. Both directions of Ark <-> Sepolia are secured by ArkBridge's own
  // 2-of-3 validator sets and verified on chain: a message each way, and a
  // MockUSDC round trip (lock -> mint, burn -> release) with collateral and
  // synthetic supply equal at rest.
  //
  // This does NOT enable everything through Ark. Availability still requires the
  // asset and route to be enabled AND deployed, and BSC Testnet is gated
  // separately in the token registry because its inbound ISM still trusts a
  // validator key ArkBridge does not consider adequate. Enabling the hub cannot
  // un-gate it — that has to be done deliberately, after the ISM is migrated.
  //
  // See docs/security/validator-topology.md.
  enabled: true,
};

/**
 * Local Ark-like EVM environment used by the local cross-chain harness.
 * Chain id 31338 keeps it distinct from the default anvil chain id (31337) used
 * for the local "external" chain, so the two nodes can never be confused.
 */
export const arkLocal: ChainConfig = {
  key: "ark-local",
  name: "Ark Local",
  descriptor: "Local devnet",
  logo: "ark",
  chainId: 31338,
  hyperlaneDomainId: 31338,
  rpcUrls: ["http://127.0.0.1:8546"],
  nativeCurrency: ARK_NATIVE_CURRENCY,
  testnet: true,
  isHub: true,
  enabled: true,
};
