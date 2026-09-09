import { resolveWebEnvironment } from "../../lib/env";
import { catalogFor } from "../../lib/catalog";
import { ActivityList } from "../../components/ActivityList";
import styles from "./page.module.css";

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
