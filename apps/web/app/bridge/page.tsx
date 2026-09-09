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
