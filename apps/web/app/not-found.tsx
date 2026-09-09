import Link from "next/link";
import styles from "./error.module.css";

export default function NotFound() {
  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.body}>That page does not exist.</p>
      <div className={styles.actions}>
        <Link className={styles.secondary} href="/bridge">
          Go to Bridge
        </Link>
      </div>
    </div>
  );
}
