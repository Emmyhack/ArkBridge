import type { ChainConfig } from "@arkbridge/types";

/**
 * Minimal JSON-RPC client.
 *
 * Deliberately dependency-free: this package is imported by the frontend, the
 * indexer and operations scripts alike, and none of them should inherit a web3
 * library just so configuration can be checked against a live node.
 */

interface JsonRpcResponse {
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
}

export class RpcError extends Error {
  constructor(
    readonly url: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "RpcError";
  }
}

export async function rpcCall(
  url: string,
  method: string,
  params: readonly unknown[] = [],
  timeoutMs = 15_000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new RpcError(url, `${method}: HTTP ${String(response.status)}`);
    }

    const body = (await response.json()) as JsonRpcResponse;
    if (body.error !== undefined) {
      throw new RpcError(url, `${method}: ${body.error.message} (${String(body.error.code)})`);
    }
    return body.result;
  } catch (cause) {
    if (cause instanceof RpcError) throw cause;
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new RpcError(url, `${method}: ${reason}`, { cause });
  } finally {
    clearTimeout(timer);
  }
}

function expectHex(value: unknown, context: string): string {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error(`${context}: expected a hex string, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** The EVM chain id the node actually reports. */
export async function fetchChainId(url: string): Promise<number> {
  return Number(BigInt(expectHex(await rpcCall(url, "eth_chainId"), "eth_chainId")));
}

export async function fetchBlockNumber(url: string): Promise<number> {
  return Number(BigInt(expectHex(await rpcCall(url, "eth_blockNumber"), "eth_blockNumber")));
}

/**
 * The Hyperlane domain id a deployed Mailbox reports.
 *
 * `0x8d3638f4` is the selector for `localDomain()`; re-derive it with
 * `cast sig "localDomain()"` if you need to confirm it.
 *
 * This reads the deployed value rather than the intended one. The domain id is
 * fixed at deployment and trusted by every remote router, so the registry must
 * agree with the chain, not with the deployment plan.
 */
export async function fetchLocalDomain(url: string, mailbox: string): Promise<number> {
  const result = await rpcCall(url, "eth_call", [{ to: mailbox, data: "0x8d3638f4" }, "latest"]);
  const hex = expectHex(result, "localDomain()");
  if (hex === "0x") {
    throw new Error(`localDomain(): no code at ${mailbox} — is this a Mailbox?`);
  }
  return Number(BigInt(hex));
}

/** First reachable RPC URL for a chain, or `undefined` if none respond. */
export async function firstReachableRpc(chain: ChainConfig): Promise<string | undefined> {
  for (const url of chain.rpcUrls) {
    try {
      await fetchChainId(url);
      return url;
    } catch {
      // Try the next endpoint; the caller reports if none are reachable.
    }
  }
  return undefined;
}
