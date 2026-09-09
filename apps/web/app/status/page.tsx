import { resolveWebEnvironment } from "../../lib/env";
import { catalogFor } from "../../lib/catalog";
import { getEnabledChains } from "@arkbridge/chain-registry";
import { usableRoutes } from "@arkbridge/bridge-core";
import { StatusBoard } from "../../components/StatusBoard";
import styles from "./page.module.css";

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
