import { resolveWebEnvironment } from "../../lib/env";
import { catalogFor } from "../../lib/catalog";
import { usableRoutes } from "@arkbridge/bridge-core";
import styles from "./page.module.css";

export const metadata = {
  title: "Supported assets",
  description: "Verify ArkBridge assets, origins, contracts, and available routes.",
};

/**
 * Supported assets (§47, §48).
 *
 * Grouped by canonical origin, never by ticker. Sepolia MockUSDC and Base
 * MockUSDC share a symbol and nothing else — presenting them as one asset would
 * be the exact mistake the canonical-asset rule exists to prevent (§6).
 */
export default async function TokensPage() {
  const environment = resolveWebEnvironment();
  const catalog = await catalogFor(environment);
  const routes = usableRoutes(catalog);

  const listed = Object.values(catalog.tokens)
    .filter((token) => routes.some((route) => route.tokenId === token.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Supported assets</h1>
        <p className={styles.subtitle}>
          Assets sharing a ticker across origins are different assets. Each is listed by where it
          was issued.
        </p>
      </header>

      {listed.length === 0 ? (
        <p className={styles.empty}>No assets have a deployed route yet.</p>
      ) : (
        <ul className={styles.list}>
          {listed.map((token, index) => {
            const origin = catalog.chains[token.canonicalChain];
            const tokenRoutes = routes.filter((route) => route.tokenId === token.id);

            return (
              <li key={token.id} className={styles.card} data-reveal data-reveal-index={index}>
                <div className={styles.cardHead}>
                  <span className={styles.symbol}>{token.symbol}</span>
                  <span className={styles.name}>{token.name}</span>
                </div>

                <dl className={styles.facts}>
                  <div className={styles.fact}>
                    <dt>Origin</dt>
                    <dd>{origin?.name ?? token.canonicalChain}</dd>
                  </div>
                  <div className={styles.fact}>
                    <dt>Canonical contract</dt>
                    <dd className="ark-mono">
                      {origin?.explorerUrl === undefined ? (
                        token.canonicalAddress
                      ) : (
                        <a
                          className={styles.link}
                          href={`${origin.explorerUrl}/address/${token.canonicalAddress}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {token.canonicalAddress}
                        </a>
                      )}
                    </dd>
                  </div>
                  <div className={styles.fact}>
                    <dt>Decimals</dt>
                    <dd>{token.decimals}</dd>
                  </div>
                  <div className={styles.fact}>
                    <dt>Routes</dt>
                    <dd>
                      {tokenRoutes.map((route) => (
                        <span key={route.id} className={styles.route}>
                          {catalog.chains[route.sourceChain]?.name ?? route.sourceChain} →{" "}
                          {catalog.chains[route.destinationChain]?.name ?? route.destinationChain}
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>

                {/* Every representation that is not the canonical issuance is an
                    ArkBridge claim on locked collateral, and says so (§28). */}
                <ul className={styles.reps}>
                  {Object.entries(token.representations)
                    .filter(([, rep]) => rep.type === "synthetic")
                    .map(([chainKey, rep]) => (
                      <li key={chainKey} className={styles.rep}>
                        <span className={styles.repChain}>
                          {catalog.chains[chainKey]?.name ?? chainKey}
                        </span>
                        <span className={styles.repNote}>
                          Bridged via ArkBridge · backed by collateral on{" "}
                          {origin?.name ?? token.canonicalChain}
                        </span>
                        <span className="ark-mono">{rep.address}</span>
                      </li>
                    ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
