import type { MenuIconName } from "../site/navigation";

/**
 * The audience tabs.
 *
 * Segmented by *who is standing in front of the screen*, not by feature, and
 * that is the whole point of the section. The same bridge is a different
 * product to a holder (do I trust this token?) and to a treasury (can I prove
 * the backing to an auditor?). A feature list forces both to translate; naming
 * the reader lets each one find their sentence and stop.
 *
 * `lead` is the claim, set in the accent colour inline. `body` is the evidence
 * for it. Every claim here is one the deployed system actually satisfies —
 * there is nothing in this list that is roadmap.
 */
export type Audience = {
  readonly id: string;
  readonly tab: string;
  readonly icon: MenuIconName;
  readonly title: string;
  readonly lead: string;
  readonly body: string;
  readonly href: string;
  readonly cta: string;
};

export const AUDIENCES: readonly Audience[] = [
  {
    id: "holders",
    tab: "Holders",
    icon: "tokens",
    title: "Know exactly which token you receive.",
    lead: "ArkBridge resolves supported assets from one reviewed registry.",
    body: "Every listing shows the asset's origin, its canonical contract, and the ArkBridge representation used on the destination network. You can verify the addresses before transferring.",
    href: "/tokens",
    cta: "See every asset",
  },
  {
    id: "traders",
    tab: "Traders",
    icon: "activity",
    title: "Follow every transfer step.",
    lead: "ArkBridge reports progress from source submission through destination delivery.",
    body: "Confirmation, dispatch, verification, delivery readiness, and completion are shown as distinct stages. When processing takes longer than usual, the interface identifies the current stage.",
    href: "/activity",
    cta: "Track a transfer",
  },
  {
    id: "treasuries",
    tab: "Treasuries",
    icon: "shield",
    title: "Verify the system from source data.",
    lead: "Routes and contract addresses are published for independent checks.",
    body: "ArkBridge records deployments in machine-readable artifacts and provides operational tooling to compare locked collateral with bridged supply. Review the configured routes and live network status before moving treasury assets.",
    href: "/status",
    cta: "Check solvency",
  },
  {
    id: "protocols",
    tab: "Protocols",
    icon: "route",
    title: "Integrate the hub, not the topology.",
    lead: "Every route runs through Ark, so you integrate one shape.",
    body: "External chains never talk to each other directly — they talk to the hub. Adding the next chain does not multiply your integration surface, because the route you already handle is the route the new chain uses.",
    href: "https://github.com/Emmyhack/ArkBridge/tree/main/packages/sdk",
    cta: "Read the SDK",
  },
  {
    id: "validators",
    tab: "Validators",
    icon: "status",
    title: "Understand how messages are verified.",
    lead: "ArkBridge publishes its validator topology and security assumptions.",
    body: "The documentation describes the validator sets and thresholds used by deployed routes. Routes that do not meet ArkBridge's security requirements remain gated and unavailable in the transfer interface.",
    href: "/status",
    cta: "Inspect the set",
  },
  {
    id: "developers",
    tab: "Developers",
    icon: "code",
    title: "A typed client, not a wall of ABIs.",
    lead: "Quote, approve, transfer and track through one interface.",
    body: "The SDK resolves routes from the same registry the app uses, so a chain that is enabled in config is a chain your integration already supports. Contracts, agents and this interface are in one repository, under one test suite.",
    href: "https://github.com/Emmyhack/ArkBridge",
    cta: "Browse the source",
  },
] as const;
