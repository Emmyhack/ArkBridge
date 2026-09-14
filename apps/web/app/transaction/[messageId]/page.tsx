import { resolveWebEnvironment } from "../../../lib/env";
import { catalogFor } from "../../../lib/catalog";
import { deploymentsFor } from "../../../lib/deployments";
import { getEnabledChains } from "@arkbridge/chain-registry";
import { TransactionDetail } from "../../../components/TransactionDetail";
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
  title: "Transfer details",
  description: "Track the on-chain status of an ArkBridge transfer.",
};

/** Deep-linkable transfer detail (§43). */
export default async function TransactionPage({
  params,
}: {
  readonly params: Promise<{ readonly messageId: string }>;
}) {
  const { messageId } = await params;
  const environment = resolveWebEnvironment();
  const catalog = await catalogFor(environment);
  const chains = getEnabledChains(environment);
  const deployments = await deploymentsFor(
    environment,
    chains.map((chain) => chain.key),
  );

  return (
    <div className={styles.page}>
      <TransactionDetail catalog={catalog} deployments={deployments} messageId={messageId} />
    </div>
  );
}
