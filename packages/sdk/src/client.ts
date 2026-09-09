import type { Address, BridgeQuote, BridgeSubmission, Hex } from "@arkbridge/types";
import { BridgeError, ZERO_ADDRESS } from "@arkbridge/types";
import type { BridgeRoute, BridgeToken, ChainConfig } from "@arkbridge/types";
import {
  normalizeError,
  resolveRoute,
  routeIdOf,
  usableRoutes,
  validateAmount,
} from "@arkbridge/bridge-core";
import type { RouteSelection } from "@arkbridge/bridge-core";
import type { PublicClient } from "viem";
import { encodeAbiParameters, keccak256, pad, toHex } from "viem";
import { ERC20_ABI, GUARD_ABI, MAILBOX_ABI, TOKEN_ROUTER_ABI } from "./abi.js";
import type {
  ApprovalState,
  ArkBridgeConfig,
  BridgeRequest,
  MessageStatus,
  QuoteRequest,
  RouteAvailability,
} from "./types.js";

/**
 * The SDK's public request shape names the asset `token`; the routing layer
 * names it `tokenId`. Adapting here rather than renaming either keeps the
 * public API readable while the internal name stays explicit that it is an id,
 * not a symbol.
 */
function selectionOf(request: {
  readonly sourceChain: string;
  readonly destinationChain: string;
  readonly token: string;
}): RouteSelection {
  return {
    sourceChain: request.sourceChain,
    destinationChain: request.destinationChain,
    tokenId: request.token,
  };
}

/**
 * The ArkBridge client.
 *
 * ## It never touches a private key
 *
 * Every write takes a `WalletClient` supplied by the caller and asks it to
 * sign. There is no code path that accepts, stores, or derives key material,
 * because the same bundle runs in a browser (spec §77). Operational scripts
 * that do hold keys use `cast`/`forge` and share nothing with this package.
 *
 * ## It decides nothing about infrastructure
 *
 * Clients and deployment addresses are injected. The SDK does not pick an RPC,
 * read the filesystem, or consult an environment variable — an app embedding
 * this in a browser owns those choices, and usually the user's own wallet
 * provider is the right answer.
 */
export class ArkBridge {
  private readonly config: ArkBridgeConfig;

  constructor(config: ArkBridgeConfig) {
    this.config = config;
  }

  // -- discovery ----------------------------------------------------------

  getChains(): readonly ChainConfig[] {
    return Object.values(this.config.catalog.chains).filter((chain) => chain.enabled);
  }

  getSupportedTokens(): readonly BridgeToken[] {
    const ids = new Set(usableRoutes(this.config.catalog).map((route) => route.tokenId));
    return [...ids].flatMap((id) => {
      const token = this.config.catalog.tokens[id];
      return token === undefined ? [] : [token];
    });
  }

  getSupportedRoutes(): readonly BridgeRoute[] {
    return usableRoutes(this.config.catalog);
  }

  // -- availability and limits --------------------------------------------

  /**
   * Whether a route can be used right now, and for how much.
   *
   * Reads the on-chain guard when one is deployed. Capacity is surfaced so the
   * UI can show remaining headroom *before* the user commits — spec §88 is
   * explicit that a user must not reach wallet confirmation on a transfer the
   * route will reject.
   */
  async isRouteAvailable(selection: RouteSelection): Promise<RouteAvailability> {
    const routeId = routeIdOf(selection);
    let route: BridgeRoute;
    try {
      route = resolveRoute(this.config.catalog, selection);
    } catch (error) {
      const normalized = normalizeError(error);
      return { routeId, available: false, reason: normalized.message };
    }

    const capacity = await this.getCapacity(route);
    if (capacity !== undefined && capacity === 0n) {
      return {
        routeId,
        available: false,
        reason: "This route has no remaining capacity right now.",
        capacity,
      };
    }

    return capacity === undefined
      ? { routeId, available: true }
      : { routeId, available: true, capacity };
  }

  /** Remaining capacity from the on-chain guard, or `undefined` if none deployed. */
  async getCapacity(route: BridgeRoute): Promise<bigint | undefined> {
    const guard = this.config.deployments[route.sourceChain]?.guard;
    const client = this.config.clients[route.sourceChain];
    if (guard === undefined || client === undefined) return undefined;

    try {
      return await client.readContract({
        address: guard,
        abi: GUARD_ABI,
        functionName: "availableCapacity",
        args: [this.onChainRouteId(route)],
      });
    } catch {
      // A guard that cannot be read must not block quoting — the transfer will
      // still be rejected on-chain if it is over the limit. Returning undefined
      // means "unknown", not "unlimited"; callers surface it as unknown.
      return undefined;
    }
  }

  /**
   * The route id as the on-chain guard knows it.
   *
   * `keccak256` of the registry route id string, so the same identifier is used
   * off-chain and on-chain. Deriving it rather than storing a second copy is
   * what keeps them from drifting apart.
   */
  onChainRouteId(route: BridgeRoute): Hex {
    return keccak256(toHex(route.id));
  }

  // -- quoting -------------------------------------------------------------

  async quote(request: QuoteRequest): Promise<BridgeQuote> {
    const route = resolveRoute(this.config.catalog, selectionOf(request));
    const client = this.requireClient(route.sourceChain);

    const capacity = await this.getCapacity(route);

    if (request.account !== undefined) {
      const balance = await this.getBalance(route, request.account);
      validateAmount({
        route,
        amount: request.amount,
        balance,
        ...(capacity === undefined ? {} : { capacity }),
      });
    }

    let interchainFee = 0n;
    try {
      interchainFee = await client.readContract({
        address: route.sourceRouter,
        abi: TOKEN_ROUTER_ABI,
        functionName: "quoteGasPayment",
        args: [this.domainOf(route.destinationChain)],
      });
    } catch (error) {
      throw normalizeError(error);
    }

    // V1 routes are 1:1 with no protocol fee. This is stated rather than
    // hidden: spec §33 forbids folding unrelated fees into one unexplained
    // number, and a zero fee shown as "$0" is more honest than omitting it.
    const bridgeFee = 0n;

    return {
      sourceChain: route.sourceChain,
      destinationChain: route.destinationChain,
      token: route.tokenId,
      amount: request.amount,
      estimatedReceived: request.amount - bridgeFee,
      bridgeFee,
      interchainFee,
      routeId: route.id,
      ...(capacity === undefined ? {} : { limitRemaining: capacity }),
    };
  }

  // -- balances and approval ----------------------------------------------

  async getBalance(route: BridgeRoute, account: Address): Promise<bigint> {
    const client = this.requireClient(route.sourceChain);
    const token = this.requireToken(route.tokenId);
    const representation = token.representations[route.sourceChain];
    if (representation === undefined) {
      throw new BridgeError(
        "UNSUPPORTED_TOKEN",
        `${token.id} has no representation on ${route.sourceChain}.`,
        { tokenId: token.id, chain: route.sourceChain },
      );
    }

    try {
      return await client.readContract({
        address: representation.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account],
      });
    } catch (error) {
      throw normalizeError(error);
    }
  }

  /**
   * Whether an approval is needed before bridging.
   *
   * A synthetic router *is* the ERC20, so it burns the caller's own balance and
   * needs no allowance. Only a collateral route pulls tokens and therefore
   * requires approval — returning `required: false` for synthetics avoids
   * showing the user a step that does nothing.
   */
  async getApproval(request: QuoteRequest & { account: Address }): Promise<ApprovalState> {
    const route = resolveRoute(this.config.catalog, selectionOf(request));
    const token = this.requireToken(route.tokenId);
    const representation = token.representations[route.sourceChain];
    if (representation === undefined) {
      throw new BridgeError("UNSUPPORTED_TOKEN", `${token.id} is not on ${route.sourceChain}.`, {
        tokenId: token.id,
      });
    }

    if (representation.type === "synthetic") {
      return {
        required: false,
        current: 0n,
        spender: route.sourceRouter,
        token: representation.address,
      };
    }

    const client = this.requireClient(route.sourceChain);
    const current = await client.readContract({
      address: representation.address,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [request.account, route.sourceRouter],
    });

    return {
      required: current < request.amount,
      current,
      spender: route.sourceRouter,
      token: representation.address,
    };
  }

  async approve(request: BridgeRequest): Promise<Hex> {
    const approval = await this.getApproval(request);
    if (!approval.required) {
      throw new BridgeError("INSUFFICIENT_ALLOWANCE", "No approval is required for this route.");
    }
    const chain = this.requireChain(request.sourceChain);
    const client = this.requireClient(request.sourceChain);

    try {
      const hash = await request.walletClient.writeContract({
        address: approval.token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [approval.spender, request.amount],
        // Prefer the wallet client's own account object. Passing a bare address
        // puts viem in JSON-RPC account mode, which asks the *node* to sign —
        // correct for an injected browser wallet, but a public RPC will reject
        // it with "unknown account". A locally-signing client carries a full
        // Account here and signs itself.
        account: request.walletClient.account ?? request.account,
        chain: null,
      });
      // Approval is not usable until it is confirmed. Resolving at submission
      // time leaves the interface reading the old allowance and asking the
      // user to approve again.
      await client.waitForTransactionReceipt({ hash });
      return hash;
    } catch (error) {
      throw this.withChain(normalizeError(error), chain.key);
    }
  }

  // -- transfer ------------------------------------------------------------

  /**
   * Submit a transfer.
   *
   * Everything is validated before the wallet is asked to sign: route, amount,
   * balance, capacity and allowance. A user should never be walked into a
   * confirmation dialog for a transaction that is going to revert.
   */
  async bridge(request: BridgeRequest): Promise<BridgeSubmission> {
    const route = resolveRoute(this.config.catalog, selectionOf(request));
    const client = this.requireClient(route.sourceChain);

    const balance = await this.getBalance(route, request.account);
    const capacity = await this.getCapacity(route);
    validateAmount({
      route,
      amount: request.amount,
      balance,
      ...(capacity === undefined ? {} : { capacity }),
    });

    const approval = await this.getApproval(request);
    if (approval.required) {
      throw new BridgeError("INSUFFICIENT_ALLOWANCE", "Approve this asset before bridging.", {
        routeId: route.id,
      });
    }

    const fee = await client.readContract({
      address: route.sourceRouter,
      abi: TOKEN_ROUTER_ABI,
      functionName: "quoteGasPayment",
      args: [this.domainOf(route.destinationChain)],
    });

    let hash: Hex;
    try {
      hash = await request.walletClient.writeContract({
        address: route.sourceRouter,
        abi: TOKEN_ROUTER_ABI,
        functionName: "transferRemote",
        args: [
          this.domainOf(route.destinationChain),
          pad(request.recipient, { size: 32 }),
          request.amount,
        ],
        value: fee,
        account: request.walletClient.account ?? request.account,
        chain: null,
      });
    } catch (error) {
      throw this.withChain(normalizeError(error), route.sourceChain);
    }

    const messageId = await this.readMessageId(route.sourceChain, hash);
    return messageId === undefined
      ? { sourceTransactionHash: hash, routeId: route.id }
      : { sourceTransactionHash: hash, messageId, routeId: route.id };
  }

  // -- status --------------------------------------------------------------

  /**
   * Read the message id out of a source receipt.
   *
   * Taken from the Mailbox's `DispatchId` log rather than the router's return
   * value, because a wallet gives back a hash, not a return value. Absence is
   * not an error — the receipt may simply not be mined yet.
   */
  async readMessageId(chainKey: string, txHash: Hex): Promise<Hex | undefined> {
    const client = this.requireClient(chainKey);
    const mailbox = this.config.deployments[chainKey]?.mailbox;
    if (mailbox === undefined) return undefined;

    try {
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      const dispatchId = keccak256(toHex("DispatchId(bytes32)"));
      for (const log of receipt.logs) {
        if (
          log.address.toLowerCase() === mailbox.toLowerCase() &&
          log.topics[0]?.toLowerCase() === dispatchId.toLowerCase() &&
          log.topics[1] !== undefined
        ) {
          return log.topics[1];
        }
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  /** Whether a message has been delivered on its destination chain. */
  async getMessageStatus(
    messageId: Hex,
    sourceChain: string,
    destinationChain: string,
  ): Promise<MessageStatus> {
    const client = this.requireClient(destinationChain);
    const mailbox = this.config.deployments[destinationChain]?.mailbox;
    if (mailbox === undefined) {
      throw new BridgeError("UNSUPPORTED_CHAIN", `No Mailbox recorded for ${destinationChain}.`, {
        chain: destinationChain,
      });
    }

    try {
      const delivered = await client.readContract({
        address: mailbox,
        abi: MAILBOX_ABI,
        functionName: "delivered",
        args: [messageId],
      });
      return { messageId, delivered, sourceChain, destinationChain };
    } catch (error) {
      throw normalizeError(error);
    }
  }

  // -- internals -----------------------------------------------------------

  private requireClient(chainKey: string): PublicClient {
    const client = this.config.clients[chainKey];
    if (client === undefined) {
      throw new BridgeError("RPC_UNAVAILABLE", `No client configured for ${chainKey}.`, {
        chain: chainKey,
      });
    }
    return client;
  }

  private requireChain(chainKey: string): ChainConfig {
    const chain = this.config.catalog.chains[chainKey];
    if (chain === undefined) {
      throw new BridgeError("UNSUPPORTED_CHAIN", `Unknown chain ${chainKey}.`, { chain: chainKey });
    }
    return chain;
  }

  private requireToken(tokenId: string): BridgeToken {
    const token = this.config.catalog.tokens[tokenId];
    if (token === undefined) {
      throw new BridgeError("UNSUPPORTED_TOKEN", `Unknown asset ${tokenId}.`, { tokenId });
    }
    return token;
  }

  private domainOf(chainKey: string): number {
    const chain = this.requireChain(chainKey);
    if (chain.hyperlaneDomainId <= 0) {
      throw new BridgeError(
        "UNSUPPORTED_CHAIN",
        `${chainKey} has no confirmed Hyperlane domain id.`,
        { chain: chainKey },
      );
    }
    return chain.hyperlaneDomainId;
  }

  private withChain(error: BridgeError, chainKey: string): BridgeError {
    return new BridgeError(error.code, error.message, { ...error.context, chain: chainKey });
  }
}

export { ZERO_ADDRESS, encodeAbiParameters };
