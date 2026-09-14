import { getEnabledChains } from "@arkbridge/chain-registry";
import { resolveWebEnvironment } from "../../lib/env";
import { catalogFor } from "../../lib/catalog";
import { deploymentsFor } from "../../lib/deployments";
import { Suspense } from "react";
import { BridgeShell } from "../../components/BridgeShell";
import { BridgeSkeleton } from "../../components/BridgeSkeleton";
import { BridgeIntro } from "../../components/BridgeIntro";
import { HowItWorks } from "../../components/HowItWorks";
import { usableRoutes } from "@arkbridge/bridge-core";
import styles from "./page.module.css";

/**
 * Re-read the deployment artifacts at most once a minute.
 *
 * Without this the page is prerendered once at build time and the contract
 * addresses are frozen into the HTML, which means redeploying a contract would
 * require rebuilding and redeploying the frontend — the coupling §120 and §154
 * exist to prevent. The artifacts are read on the server, so the alternative
 * (`force-dynamic`) would put a filesystem read on every request for data that
 * changes only when someone runs a deploy script.
 *
 * Sixty seconds is the compromise: a redeploy is picked up without a build, and
 * the common case still serves a cached render.
 */
export const revalidate = 60;

export const metadata = {
  title: "Bridge",
  description: "Transfer supported assets between Ark Constellation and connected networks.",
};

/**
 * The bridge page.
 *
 * The catalog is resolved on the server and passed down, so the client never
 * reaches for the registry itself and adding a chain stays a config change.
 */
export default async function BridgePage() {
  const environment = resolveWebEnvironment();
  const catalog = await catalogFor(environment);
  const chains = getEnabledChains(environment);
  const deployments = await deploymentsFor(
    environment,
    chains.map((chain) => chain.key),
  );

  const routes = usableRoutes(catalog);
  const assetCount = new Set(routes.map((route) => route.tokenId)).size;
  const networkCount = new Set(routes.flatMap((r) => [r.sourceChain, r.destinationChain])).size;

  return (
    <div className={styles.page}>
      <BridgeIntro chainCount={networkCount} routeCount={routes.length} assetCount={assetCount} />

      {/*
        The card reads the deep-link query string, which Next requires be behind
        a Suspense boundary so the rest of the page can still be prerendered.
        The fallback is the real skeleton rather than a spinner (§60), so the
        layout does not jump when the card mounts.
      */}
      <Suspense fallback={<BridgeSkeleton />}>
        <BridgeShell catalog={catalog} deployments={deployments} chainCount={chains.length} />
      </Suspense>

      <HowItWorks />
    </div>
  );
}
