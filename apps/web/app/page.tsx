import { getAllChains } from "@arkbridge/chain-registry";
import { usableRoutes } from "@arkbridge/bridge-core";
import { AudienceTabs } from "../components/landing/AudienceTabs";
import { Borderless } from "../components/landing/Borderless";
import { Frictions } from "../components/landing/Frictions";
import { Hero } from "../components/landing/Hero";
import { NetworkStrip, type NetworkStatus } from "../components/landing/NetworkStrip";
import { StartHere } from "../components/landing/StartHere";
import { catalogFor } from "../lib/catalog";
import { resolveWebEnvironment } from "../lib/env";
import styles from "./page.module.css";

/**
 * The landing page.
 *
 * `/` used to redirect straight to `/bridge`, on the reasoning that someone
 * arriving to move money should see the form rather than a pitch. That is right
 * for a returning user and wrong for a first-time one, who arrives with a
 * different question — *should I trust this with my assets* — that a form
 * cannot answer.
 *
 * Both are served: this page exists, and every route out of it lands on
 * `/bridge` in one click, from the nav, the hero, three of the tab panels and
 * the closing section.
 *
 * PAGE FLOW
 *
 *   1. Hero            The claim, and the action, above the fold.
 *   2. Audiences       The same system, said six ways, for six readers.
 *   3. Networks        What is actually connected today.
 *   4. Architecture    Why it is shaped this way.
 *   5. Frictions       What it removes, framed as problems.
 *   6. Start           One button, nothing else.
 *
 * EVERY NUMBER ON THIS PAGE IS DERIVED
 *
 * The counts and the network list come from the live route catalog, not from
 * the copy. That is not tidiness — a marketing page whose figures are typed in
 * by hand drifts from the product within a release, and on a bridge the drift
 * is always in the flattering direction. A network is "live" here if and only
 * if it appears in a route the bridge will actually quote, which is the same
 * predicate `/bridge` uses to populate its own selectors.
 */
export default async function Home() {
  const environment = resolveWebEnvironment();
  const catalog = await catalogFor(environment);
  const routes = usableRoutes(catalog);

  const liveChainKeys = new Set(
    routes.flatMap((route) => [route.sourceChain, route.destinationChain]),
  );

  // Live networks first, each group alphabetical. Registry order is the order
  // chains happened to be added, which puts a "soon" chain in the middle of the
  // strip and makes the row look like an inconsistent list rather than a state.
  const networks: readonly NetworkStatus[] = getAllChains(environment)
    .map((chain) => ({
      key: chain.key,
      name: chain.name,
      live: liveChainKeys.has(chain.key),
      ...(chain.logo === undefined ? {} : { logo: chain.logo }),
    }))
    .sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const assetCount = new Set(routes.map((route) => route.tokenId)).size;

  return (
    <div className={styles.page}>
      <Hero
        chainCount={liveChainKeys.size}
        routeCount={routes.length}
        assetCount={assetCount}
        networkNames={networks.filter((network) => network.live).map((network) => network.name)}
      />
      <AudienceTabs />
      <NetworkStrip networks={networks} />
      <Borderless />
      <Frictions />
      <StartHere />
    </div>
  );
}
