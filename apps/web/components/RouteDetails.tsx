"use client";

import { useState } from "react";
import { Dialog } from "@arkbridge/ui";
import type { RouteCatalog } from "@arkbridge/bridge-core";
import type { BridgeRoute } from "@arkbridge/types";
import styles from "./RouteDetails.module.css";

/**
 * Route details drawer (§36) and advanced disclosure (§37).
 *
 * Everything a technical user might want to verify — router addresses, domain
 * ids, the security model — lives here rather than in the main card. §154 names
 * "Hyperlane terminology dominating the main card" as a failure condition, so
 * the default view stays plain and this is one click away.
 *
 * Advanced details are collapsed by default within the drawer, because even a
 * user who opens this mostly wants to know what secures the route, not its
 * domain id.
 */
export function RouteDetails({
  catalog,
  route,
}: {
  readonly catalog: RouteCatalog;
  readonly route: BridgeRoute | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  if (route === undefined) return null;

  const source = catalog.chains[route.sourceChain];
  const destination = catalog.chains[route.destinationChain];
  const token = catalog.tokens[route.tokenId];
  const origin = token === undefined ? undefined : catalog.chains[token.canonicalChain];

  const explorer = (chainKey: string, address: string) => {
    const url = catalog.chains[chainKey]?.explorerUrl;
    return url === undefined ? undefined : `${url}/address/${address}`;
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setOpen(true);
        }}
      >
        View details →
      </button>

      <Dialog
        open={open}
        title="Route details"
        onClose={() => {
          setOpen(false);
        }}
      >
        <div className={styles.body}>
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Source network</dt>
              <dd>{source?.name ?? route.sourceChain}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Destination network</dt>
              <dd>{destination?.name ?? route.destinationChain}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Canonical asset</dt>
              <dd>
                {token?.symbol ?? route.tokenId} on {origin?.name ?? token?.canonicalChain}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Destination form</dt>
              <dd>
                {token?.representations[route.destinationChain]?.type === "synthetic"
                  ? "ArkBridge synthetic, backed by locked collateral"
                  : "Canonical asset released from collateral"}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Security model</dt>
              <dd>
                Validator multisig over the origin chain, verified on the destination before any
                assets move.
              </dd>
            </div>
          </dl>

          <button
            type="button"
            className={styles.disclosure}
            aria-expanded={advanced}
            onClick={() => {
              setAdvanced((current) => !current);
            }}
          >
            {advanced ? "▾" : "▸"} Advanced details
          </button>

          {advanced ? (
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>Source domain</dt>
                <dd className="ark-mono">{source?.hyperlaneDomainId ?? "—"}</dd>
              </div>
              <div className={styles.fact}>
                <dt>Destination domain</dt>
                <dd className="ark-mono">{destination?.hyperlaneDomainId ?? "—"}</dd>
              </div>
              <div className={styles.fact}>
                <dt>Source router</dt>
                <dd className="ark-mono">
                  {(() => {
                    const url = explorer(route.sourceChain, route.sourceRouter);
                    return url === undefined ? (
                      route.sourceRouter
                    ) : (
                      <a className={styles.link} href={url} target="_blank" rel="noreferrer">
                        {route.sourceRouter}
                      </a>
                    );
                  })()}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Destination router</dt>
                <dd className="ark-mono">
                  {(() => {
                    const url = explorer(route.destinationChain, route.destinationRouter);
                    return url === undefined ? (
                      route.destinationRouter
                    ) : (
                      <a className={styles.link} href={url} target="_blank" rel="noreferrer">
                        {route.destinationRouter}
                      </a>
                    );
                  })()}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Route id</dt>
                <dd className="ark-mono">{route.id}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
