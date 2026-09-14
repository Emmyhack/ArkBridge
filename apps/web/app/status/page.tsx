import { resolveWebEnvironment } from "../../lib/env";
import { catalogFor } from "../../lib/catalog";
import { getEnabledChains } from "@arkbridge/chain-registry";
import { usableRoutes } from "@arkbridge/bridge-core";
import { StatusBoard } from "../../components/StatusBoard";
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
  title: "Network status",
  description: "Check live network and route availability for ArkBridge.",
};

/**
 * Infrastructure status (§49).
 *
 * ArkBridge-specific rather than borrowed from any bridge UI: networks, routes,
 * then the delivery infrastructure. Nothing here exposes operational secrets —
 * no agent addresses, no endpoints, no key material.
 */
export default async function StatusPage() {
  const environment = resolveWebEnvironment();
  const catalog = await catalogFor(environment);
  const chains = getEnabledChains(environment);
  const routes = usableRoutes(catalog);

  const gatedRoutes = Object.values(catalog.routes).filter(
    (route) => !routes.some((usable) => usable.id === route.id),
  );

  return (
    <div className={styles.page}>
      <StatusBoard
        catalog={catalog}
        chains={chains}
        routes={routes}
        gatedCount={gatedRoutes.length}
      />
    </div>
  );
}
