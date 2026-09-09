/**
 * Minimal ABIs for the contracts ArkBridge talks to.
 *
 * Hand-written rather than generated: these are the handful of functions the
 * SDK actually calls, and a trimmed ABI keeps the browser bundle small. Each
 * signature is verified against the deployed contracts by the SDK's live tests.
 */

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

/** Hyperlane warp router (collateral and synthetic share this surface). */
export const TOKEN_ROUTER_ABI = [
  {
    type: "function",
    name: "transferRemote",
    stateMutability: "payable",
    inputs: [
      { name: "destination", type: "uint32" },
      { name: "recipient", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "messageId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "quoteGasPayment",
    stateMutability: "view",
    inputs: [{ name: "destination", type: "uint32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "routers",
    stateMutability: "view",
    inputs: [{ name: "domain", type: "uint32" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "SentTransferRemote",
    inputs: [
      { name: "destination", type: "uint32", indexed: true },
      { name: "recipient", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const MAILBOX_ABI = [
  {
    type: "function",
    name: "delivered",
    stateMutability: "view",
    inputs: [{ name: "messageId", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "localDomain",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "event",
    name: "DispatchId",
    inputs: [{ name: "messageId", type: "bytes32", indexed: true }],
  },
] as const;

/** ArkBridge guard: remaining capacity for the UI. */
export const GUARD_ABI = [
  {
    type: "function",
    name: "availableCapacity",
    stateMutability: "view",
    inputs: [{ name: "routeId", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const RATE_LIMITER_ABI = [
  {
    type: "function",
    name: "windowsOf",
    stateMutability: "view",
    inputs: [{ name: "routeId", type: "bytes32" }],
    outputs: [
      { name: "hourly", type: "uint256" },
      { name: "daily", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "limitsOf",
    stateMutability: "view",
    inputs: [{ name: "routeId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "maxPerTransaction", type: "uint256" },
          { name: "maxHourly", type: "uint256" },
          { name: "maxDaily", type: "uint256" },
        ],
      },
    ],
  },
] as const;
