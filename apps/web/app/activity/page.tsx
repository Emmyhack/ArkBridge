import { resolveWebEnvironment } from "../../lib/env";
import { catalogFor } from "../../lib/catalog";
import { ActivityList } from "../../components/ActivityList";
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
  title: "Activity",
  description: "View ArkBridge transfers recorded by this wallet.",
};

export default async function ActivityPage() {
  const environment = resolveWebEnvironment();
  const catalog = await catalogFor(environment);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Activity</h1>
      <p className={styles.subtitle}>
        Review ArkBridge transfers recorded in this browser for your connected wallet.
      </p>
      <ActivityList catalog={catalog} />
    </div>
  );
}
