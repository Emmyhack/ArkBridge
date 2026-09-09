"use client";

import { useQueries } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import type { RouteCatalog } from "@arkbridge/bridge-core";
import type { BridgeRoute, ChainConfig } from "@arkbridge/types";
import styles from "./StatusBoard.module.css";
import { ChainMark } from "@arkbridge/ui";

type Health = "operational" | "degraded" | "unavailable" | "checking";

const LABEL: Record<Health, string> = {
  operational: "Operational",
  degraded: "Degraded",
  unavailable: "Unavailable",
  checking: "Checking…",
};

/**
 * Live status board.
 *
 * Each network is probed directly rather than reported from a cached
 * dashboard, so "Operational" means the chain answered just now. Status is
 * always icon plus text — never colour alone (§50).
 */
export function StatusBoard({
  catalog,
  chains,
  routes,
  gatedCount,
}: {
  readonly catalog: RouteCatalog;
  readonly chains: readonly ChainConfig[];
  readonly routes: readonly BridgeRoute[];
  readonly gatedCount: number;
}) {
  const results = useQueries({
    queries: chains.map((chain) => ({
      queryKey: ["chain-health", chain.key],
      // A status page that hammers every chain is its own outage (§119).
      refetchInterval: 30_000,
      staleTime: 25_000,
      retry: 1,
      queryFn: async () => {
        const rpc = chain.rpcUrls[0];
        if (rpc === undefined) throw new Error("no rpc");
        const client = createPublicClient({ transport: http(rpc) });
        const start = Date.now();
        const block = await client.getBlockNumber();
        return { block, latency: Date.now() - start };
      },
    })),
  });

  const health = (index: number): Health => {
    const result = results[index];
    if (result === undefined || result.isPending) return "checking";
    if (result.isError) return "unavailable";
    // A chain that answers but slowly is degraded, not healthy — saying
    // "Operational" while a user waits 8 seconds per read is misleading.
    return (result.data?.latency ?? 0) > 4000 ? "degraded" : "operational";
  };

  const allHealthy = chains.every((_, index) => health(index) === "operational");
  const anyDown = chains.some((_, index) => health(index) === "unavailable");
  const overall: Health = anyDown ? "unavailable" : allHealthy ? "operational" : "degraded";

  return (
    <div className={styles.board}>
      <header className={styles.head}>
        <h1 className={styles.title}>ArkBridge Status</h1>
        <p className={styles.overall} data-health={overall}>
          <span className={styles.dot} aria-hidden="true" />
          {overall === "operational"
            ? "All systems operational"
            : overall === "unavailable"
              ? "One or more networks unreachable"
              : "Partially degraded"}
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Networks</h2>
        <ul className={styles.list}>
          {chains.map((chain, index) => {
            const state = health(index);
            const result = results[index];
            return (
              <li key={chain.key} className={styles.row}>
                <span className={styles.rowName}>
                  {/* The same mark the selectors use, from the same registry
                      field — a network must not look like one thing in the
                      bridge card and another on the status page. */}
                  <ChainMark chainKey={chain.key} label={chain.name} logo={chain.logo} />
                  {chain.name}
                  {chain.descriptor === undefined ? "" : ` · ${chain.descriptor}`}
                </span>
                <span className={styles.state} data-health={state}>
                  <span className={styles.dot} aria-hidden="true" />
                  {LABEL[state]}
                  {result?.data === undefined ? null : (
                    <span className={styles.latency}>{result.data.latency}ms</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Routes</h2>
        <ul className={styles.list}>
          {routes.map((route) => {
            const source = catalog.chains[route.sourceChain];
            const destination = catalog.chains[route.destinationChain];
            const sourceIndex = chains.findIndex((c) => c.key === route.sourceChain);
            const destinationIndex = chains.findIndex((c) => c.key === route.destinationChain);
            // A route is only as healthy as the weaker of its two ends.
            const state: Health =
              health(sourceIndex) === "unavailable" || health(destinationIndex) === "unavailable"
                ? "unavailable"
                : health(sourceIndex) === "degraded" || health(destinationIndex) === "degraded"
                  ? "degraded"
                  : "operational";

            return (
              <li key={route.id} className={styles.row}>
                <span className={styles.rowName}>
                  {source?.name ?? route.sourceChain} →{" "}
                  {destination?.name ?? route.destinationChain}
                  <span className={styles.asset}>
                    {catalog.tokens[route.tokenId]?.symbol ?? route.tokenId}
                  </span>
                </span>
                <span className={styles.state} data-health={state}>
                  <span className={styles.dot} aria-hidden="true" />
                  {LABEL[state]}
                </span>
              </li>
            );
          })}
        </ul>
        {gatedCount > 0 ? (
          <p className={styles.note}>
            {gatedCount} route{gatedCount === 1 ? " is" : "s are"} defined but not currently
            offered. A route stays unavailable until its security configuration is complete.
          </p>
        ) : null}
      </section>
    </div>
  );
}
