import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getEnabledChains } from "@arkbridge/chain-registry";
import { Backdrop } from "../components/site/Backdrop";
import { SiteFooter } from "../components/site/SiteFooter";
import { SiteHeader } from "../components/site/SiteHeader";
import { SupportButton } from "../components/site/SupportButton";
import { RevealProvider } from "../components/RevealProvider";
import { Web3Provider } from "../providers/Web3Provider";
import { resolveWebEnvironment } from "../lib/env";
import { fontVariables } from "../lib/fonts";
import "../styles/globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: {
    default: "ArkBridge",
    template: "%s · ArkBridge",
  },
  description:
    "Move supported assets between Ark Constellation and connected EVM networks with registry-backed routes, transparent fees, and on-chain transfer tracking.",
  applicationName: "ArkBridge",
  keywords: ["ArkBridge", "Ark Constellation", "cross-chain bridge", "Hyperlane"],
  openGraph: {
    type: "website",
    siteName: "ArkBridge",
    title: "ArkBridge",
    description:
      "The asset bridge for Ark Constellation, with registry-backed routes and on-chain transfer tracking.",
  },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  const environment = resolveWebEnvironment();
  // Resolved on the server from the registry, then handed to the client. Adding
  // a chain never touches this file (§83, §149).
  const chains = getEnabledChains(environment);
  const networkLinks = chains.map((chain) => ({
    href: `/bridge?from=${chain.key}`,
    label: chain.name,
  }));

  return (
    <html
      lang="en"
      className={fontVariables}
      // Wallet extensions such as Bybit annotate the document element before
      // React starts. The application subtree must still be checked normally,
      // but extension-owned root attributes are outside our render contract.
      suppressHydrationWarning
    >
      <body>
        <Web3Provider chains={chains}>
          <RevealProvider />
          {/* Ambient layer first and outside the shell: it is fixed, so its
              position in the tree is irrelevant to layout, and keeping it out
              of the flow makes that explicit. */}
          <Backdrop />
          <div className={styles.shell}>
            <SiteHeader networkLinks={networkLinks} />
            <main className={styles.main}>{children}</main>
            <SiteFooter environment={environment} networkLinks={networkLinks} />
          </div>
          <SupportButton />
        </Web3Provider>
      </body>
    </html>
  );
}
