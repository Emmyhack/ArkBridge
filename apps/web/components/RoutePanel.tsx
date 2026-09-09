import { formatAmount } from "@arkbridge/bridge-core";
import type { RouteCatalog } from "@arkbridge/bridge-core";
import type { BridgeQuote, BridgeRoute, ChainConfig } from "@arkbridge/types";
import type { ChainTiming } from "../lib/useChainTiming";
import type { RouteHealthState } from "../lib/useRouteHealth";
import { RouteDetails } from "./RouteDetails";
import styles from "./RoutePanel.module.css";

/**
 * Secondary route information (§35).
 *
 * Progressive disclosure (§16): before an amount is entered this shows only the
 * path, the asset and its origin. Fee and capacity detail appear once the user
 * has actually committed to a number, so the empty state stays calm (§15).
 */
const STATUS_LABEL: Record<RouteHealthState["health"], string> = {
  checking: "Checking…",
  operational: "Operational",
  degraded: "Degraded",
  unavailable: "Unavailable",
};

/** Seconds, at the precision the number deserves. A block time of 12.4s is
 *  meaningful; one of 12.437s is noise. */
function format(seconds: number): string {
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  if (seconds >= 10) return `${Math.round(seconds)}s`;
  return `${seconds.toFixed(1)}s`;
}

export function RoutePanel({
  catalog,
  sourceChain,
  destinationChain,
  tokenId,
  showDetails,
  route,
  health,
  timing,
  quote,
  decimals,
}: {
  readonly catalog: RouteCatalog;
  readonly sourceChain: ChainConfig | undefined;
  readonly destinationChain: ChainConfig | undefined;
  readonly tokenId: string;
  readonly showDetails: boolean;
  readonly route?: BridgeRoute | undefined;
  /** Live, from the on-chain guard and both chains. Never assumed. */
  readonly health: RouteHealthState;
  readonly timing: ChainTiming;
  readonly quote?: BridgeQuote | undefined;
  readonly decimals: number;
}) {
  const token = catalog.tokens[tokenId];
  const origin = token === undefined ? undefined : catalog.chains[token.canonicalChain];

  return (
    <aside className={styles.panel} aria-label="Route">
      <h2 className={styles.heading}>Route</h2>

      <ol className={styles.path}>
        <li className={styles.hop}>{sourceChain?.name ?? "—"}</li>
        <li className={styles.arrow} aria-hidden="true">
          ↓
        </li>
        <li className={styles.hop}>Hyperlane</li>
        <li className={styles.arrow} aria-hidden="true">
          ↓
        </li>
        <li className={styles.hop}>{destinationChain?.name ?? "—"}</li>
      </ol>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Asset</dt>
          <dd>{token?.symbol ?? "—"}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Origin</dt>
          <dd>{origin?.name ?? token?.canonicalChain ?? "—"}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Status</dt>
          {/*
            Read, not asserted. This was a hardcoded "Operational" — a string
            that looked exactly like a check and was not one. It now reflects
            the guard's capacity read and both chains answering (§50: icon plus
            text, never colour alone).
          */}
          <dd className={styles.status} data-health={health.health}>
            <span className={styles.statusDot} aria-hidden="true" />
            {STATUS_LABEL[health.health]}
          </dd>
        </div>

        {health.reason === undefined ? null : (
          <div className={styles.fact}>
            <dt>Reason</dt>
            <dd>{health.reason}</dd>
          </div>
        )}

        {showDetails ? (
          <>
            <div className={styles.fact}>
              <dt>ArkBridge fee</dt>
              {/* From the quote, not a constant. Shown as zero rather than
                  hidden when it is zero: never fold unrelated numbers together
                  or omit one silently (§33). */}
              <dd>
                {quote === undefined
                  ? "—"
                  : quote.bridgeFee === 0n
                    ? "0"
                    : formatAmount(quote.bridgeFee, decimals)}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Block time</dt>
              {/* Measured on both chains just now. This is the part of a
                  delivery that can be measured; the rest is named below rather
                  than folded into one confident number (§34). */}
              <dd>
                {timing.sourceSeconds === undefined || timing.destinationSeconds === undefined
                  ? timing.loading
                    ? "Measuring…"
                    : "—"
                  : `${format(timing.sourceSeconds)} source · ${format(timing.destinationSeconds)} destination`}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Delivery</dt>
              <dd>
                {timing.floorSeconds === undefined
                  ? "Varies with validator and relayer timing"
                  : `At least ${format(timing.floorSeconds)}, plus validator and relayer time`}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <RouteDetails catalog={catalog} route={route} />
    </aside>
  );
}
