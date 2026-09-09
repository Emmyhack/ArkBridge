import { resolveWebEnvironment } from "../../../lib/env";
import { catalogFor } from "../../../lib/catalog";
import { deploymentsFor } from "../../../lib/deployments";
import { getEnabledChains } from "@arkbridge/chain-registry";
import { TransactionDetail } from "../../../components/TransactionDetail";
import styles from "./page.module.css";

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
