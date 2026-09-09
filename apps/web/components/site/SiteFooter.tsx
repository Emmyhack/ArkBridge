import Link from "next/link";
import { ExternalArrow } from "./MenuIcon";
import { footerFor, type NavLink } from "./navigation";
import styles from "./SiteFooter.module.css";

/**
 * The footer.
 *
 * A bordered panel inset from the page edge rather than a full-bleed band. The
 * band is the conventional treatment and it has a specific failure on a dark
 * site: with no background change available to separate it, a full-width footer
 * either needs a hard rule across the viewport or it dissolves into the page.
 * Making it a card sidesteps that — the border does the separating, and the
 * page ground continues around it.
 *
 * The environment line is not decoration. On anything but mainnet it is the
 * last chance to tell someone the assets they just moved are not real (§118).
 */
export function SiteFooter({
  environment,
  networkLinks,
}: {
  readonly environment: string;
  readonly networkLinks: readonly NavLink[];
}) {
  const isMainnet = environment === "mainnet";
  const columns = footerFor(networkLinks);

  return (
    <footer className={styles.footer}>
      <div className={styles.panel}>
        <nav className={styles.columns} aria-label="Footer">
          {columns.map((column) => (
            <div key={column.title} className={styles.column}>
              <h2 className={styles.columnTitle}>{column.title}</h2>
              <ul className={styles.list}>
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.href}-${link.label}`}>
                    {link.external === true ? (
                      <a className={styles.link} href={link.href} target="_blank" rel="noreferrer">
                        {link.label}
                        <ExternalArrow />
                      </a>
                    ) : (
                      <Link className={styles.link} href={link.href}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.baseline}>
          <span className={styles.brand}>ArkBridge</span>
          <span
            className={styles.environment}
            data-testnet={!isMainnet}
            /* Announced, not just coloured: colour alone cannot carry a warning
               this consequential (§50, §118). */
          >
            {isMainnet ? "Mainnet" : `${environment} · test assets only`}
          </span>
          <span className={styles.note}>The asset bridge for Ark Constellation</span>
        </div>
      </div>
    </footer>
  );
}
