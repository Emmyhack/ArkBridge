#!/usr/bin/env node
import { ENVIRONMENTS, UNCONFIGURED, isEnvironment } from "@arkbridge/types";
import type { ChainConfig, Environment } from "@arkbridge/types";
import { getChainRegistry } from "@arkbridge/chain-registry";
import { loadDeploymentArtifacts } from "../node.js";
import { fetchBlockNumber, fetchChainId, fetchLocalDomain, firstReachableRpc } from "../rpc.js";

/**
 * Check the chain registry against the live networks.
 *
 * Registry values are written by hand and go stale. This reads each chain's
 * RPC endpoint and compares what the node reports against what the registry
 * claims, so a wrong chain id or a domain id that drifted from the deployed
 * Mailbox is caught here rather than by a misrouted transfer.
 *
 * Usage:
 *   arkbridge-check-chains              check every environment
 *   arkbridge-check-chains testnet      check one
 *
 * Local environments are skipped unless named explicitly — their endpoints only
 * exist while the harness is running.
 */

type Status = "ok" | "mismatch" | "unreachable" | "unverified" | "skipped";

interface Line {
  readonly status: Status;
  readonly text: string;
}

const MARK: Record<Status, string> = {
  ok: "  ok  ",
  mismatch: " FAIL ",
  unreachable: " DOWN ",
  unverified: "  ??  ",
  skipped: " skip ",
};

async function checkChain(chain: ChainConfig, mailbox: string | undefined): Promise<Line[]> {
  const lines: Line[] = [];

  if (chain.rpcUrls.length === 0) {
    return [
      {
        status: "skipped",
        text: `${chain.key}: no RPC endpoint configured yet`,
      },
    ];
  }

  // Fall through the endpoint list rather than giving up on the first one:
  // a single public RPC being down says nothing about the registry.
  const url = await firstReachableRpc(chain);
  if (url === undefined) {
    return [
      {
        status: "unreachable",
        text: `${chain.key}: no endpoint responded (${String(chain.rpcUrls.length)} tried)`,
      },
    ];
  }

  let liveChainId: number;
  let block: number;
  try {
    liveChainId = await fetchChainId(url);
    block = await fetchBlockNumber(url);
  } catch (error) {
    return [
      {
        status: "unreachable",
        text: `${chain.key}: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }

  if (chain.chainId === UNCONFIGURED) {
    lines.push({
      status: "mismatch",
      text: `${chain.key}: registry chainId is UNCONFIGURED but the node reports ${String(liveChainId)} — set it`,
    });
  } else if (chain.chainId !== liveChainId) {
    lines.push({
      status: "mismatch",
      text: `${chain.key}: registry chainId ${String(chain.chainId)} but the node reports ${String(liveChainId)}`,
    });
  } else {
    lines.push({
      status: "ok",
      text: `${chain.key}: chainId ${String(liveChainId)}, block ${String(block)}`,
    });
  }

  // The Hyperlane domain id is only checkable once a Mailbox is deployed. Until
  // then it is a pending decision, not a mismatch.
  if (mailbox === undefined) {
    // No Mailbox address on file. That means the domain id cannot be checked
    // here — not that it is wrong. Ethereum and BNB Smart Chain have canonical
    // Hyperlane deployments that ArkBridge neither deployed nor recorded an
    // artifact for, so their domain ids are simply unverified until one exists.
    lines.push(
      chain.hyperlaneDomainId === UNCONFIGURED
        ? {
            status: "skipped",
            text: `${chain.key}: domain id pending — no Mailbox deployed yet`,
          }
        : {
            status: "unverified",
            text:
              `${chain.key}: domain ${String(chain.hyperlaneDomainId)} unverified — ` +
              `no Mailbox address on file. Record one in deployments/ to check it.`,
          },
    );
    return lines;
  }

  try {
    const liveDomain = await fetchLocalDomain(url, mailbox);
    if (chain.hyperlaneDomainId !== liveDomain) {
      lines.push({
        status: "mismatch",
        text: `${chain.key}: registry domain ${String(chain.hyperlaneDomainId)} but Mailbox ${mailbox} reports ${String(liveDomain)}`,
      });
    } else {
      lines.push({ status: "ok", text: `${chain.key}: domain ${String(liveDomain)} (Mailbox)` });
    }
  } catch (error) {
    lines.push({
      status: "unreachable",
      text: `${chain.key}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return lines;
}

async function main(): Promise<number> {
  const requested = process.argv.slice(2);
  for (const arg of requested) {
    if (!isEnvironment(arg)) {
      process.stderr.write(
        `Unknown environment "${arg}". Expected one of: ${ENVIRONMENTS.join(", ")}.\n`,
      );
      return 2;
    }
  }

  const environments: readonly Environment[] =
    requested.length > 0
      ? (requested as Environment[])
      : ENVIRONMENTS.filter((environment) => environment !== "local");

  let failed = false;

  for (const environment of environments) {
    process.stdout.write(`\n${environment}\n`);

    const registry = getChainRegistry(environment);
    const artifacts = await loadDeploymentArtifacts(environment);
    const mailboxes = new Map(
      artifacts.map((artifact) => [artifact.chain, artifact.contracts["mailbox"]]),
    );

    const results = await Promise.all(
      Object.values(registry.chains).map((chain) => checkChain(chain, mailboxes.get(chain.key))),
    );

    for (const line of results.flat()) {
      process.stdout.write(`  [${MARK[line.status]}] ${line.text}\n`);
      if (line.status === "mismatch") failed = true;
    }
  }

  // Only an actual disagreement fails the run. An unreachable endpoint or an
  // unverifiable domain id is reported but not fatal: neither is a configuration
  // error, and a check that goes red for reasons outside the repository stops
  // being read.
  process.stdout.write(failed ? "\nRegistry disagrees with the live networks.\n" : "\nOK\n");
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
