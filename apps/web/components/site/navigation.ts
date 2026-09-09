/**
 * The navigation model.
 *
 * Kept as data, in one place, because three surfaces render the same structure
 * — the desktop mega-menu, the mobile drawer and the footer sitemap — and they
 * must not drift. Adding a destination is an edit here, not in three files.
 *
 * The four *application* destinations (§19) still lead: Bridge, Activity,
 * Tokens, Status. What the menu adds is somewhere to put the material that
 * would otherwise crowd them out.
 */

export type NavLink = {
  readonly href: string;
  readonly label: string;
  /** One line, present tense. Absent for links whose label is self-evident. */
  readonly description?: string;
  /** Names a glyph in `MenuIcon`; keeps SVG paths out of the data. */
  readonly icon?: MenuIconName;
  readonly external?: boolean;
};

export type MenuIconName =
  | "bridge"
  | "activity"
  | "tokens"
  | "status"
  | "book"
  | "shield"
  | "question"
  | "code"
  | "chart"
  | "route";

export type NavMenu = {
  readonly id: string;
  readonly label: string;
  readonly links: readonly NavLink[];
  /**
   * The optional second column: a titled grid of numbered cards. Only the
   * first menu carries one, deliberately — a mega-menu on every item is a
   * site that has not decided what matters.
   */
  readonly feature?: {
    readonly title: string;
    readonly items: readonly NavLink[];
  };
};

export const NAV_MENUS: readonly NavMenu[] = [
  {
    id: "bridge",
    label: "Bridge",
    links: [
      {
        href: "/bridge",
        label: "Transfer",
        description: "Move assets to and from Ark",
        icon: "bridge",
      },
      {
        href: "/activity",
        label: "Activity",
        description: "Track transfers in flight",
        icon: "activity",
      },
      {
        href: "/tokens",
        label: "Tokens",
        description: "Every asset and its backing",
        icon: "tokens",
      },
      {
        href: "/status",
        label: "Status",
        description: "Live health of each route",
        icon: "status",
      },
    ],
    feature: {
      title: "Routes through the hub",
      items: [
        { href: "/bridge?from=ethereum", label: "Ethereum" },
        { href: "/bridge?from=base", label: "Base" },
        { href: "/bridge?from=bsc", label: "BNB Chain" },
        { href: "/tokens", label: "Assets" },
        { href: "/status", label: "Validators" },
        { href: "/activity", label: "Transfers" },
      ],
    },
  },
  {
    id: "learn",
    label: "Learn",
    links: [
      {
        href: "/faq",
        label: "FAQ",
        description: "How the bridge behaves, answered",
        icon: "question",
      },
      {
        href: "https://github.com/Emmyhack/ArkBridge/blob/main/SECURITY.md",
        label: "Security",
        description: "Model, assumptions and disclosure",
        icon: "shield",
        external: true,
      },
      {
        href: "https://github.com/Emmyhack/ArkBridge/tree/main/docs",
        label: "Documentation",
        description: "Architecture and operations",
        icon: "book",
        external: true,
      },
    ],
  },
  {
    id: "network",
    label: "Network",
    links: [
      {
        href: "/status",
        label: "Route health",
        description: "Per-route liveness and limits",
        icon: "chart",
      },
      {
        href: "/tokens",
        label: "Collateral",
        description: "What backs each synthetic asset",
        icon: "route",
      },
      {
        href: "https://github.com/Emmyhack/ArkBridge",
        label: "Source",
        description: "Contracts, agents and this app",
        icon: "code",
        external: true,
      },
    ],
  },
] as const;

/** The footer sitemap. Broader than the nav on purpose — a footer is where you
 *  look when you already know the thing exists and want to find it again. */
export const FOOTER_COLUMNS: readonly {
  readonly title: string;
  readonly links: readonly NavLink[];
}[] = [
  {
    title: "Bridge",
    links: [
      { href: "/bridge", label: "Transfer" },
      { href: "/activity", label: "Activity" },
      { href: "/tokens", label: "Tokens" },
      { href: "/status", label: "Status" },
    ],
  },
  {
    title: "Networks",
    links: [
      { href: "/bridge?from=ethereum", label: "Ethereum" },
      { href: "/bridge?from=base", label: "Base" },
      { href: "/bridge?from=bsc", label: "BNB Chain" },
      { href: "/bridge", label: "Ark" },
    ],
  },
  {
    title: "Security",
    links: [
      {
        href: "https://github.com/Emmyhack/ArkBridge/blob/main/SECURITY.md",
        label: "Security model",
        external: true,
      },
      {
        href: "https://github.com/Emmyhack/ArkBridge/blob/main/SECURITY.md#reporting",
        label: "Disclosure",
        external: true,
      },
      { href: "/status", label: "Live monitoring" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/faq", label: "FAQ" },
      {
        href: "https://github.com/Emmyhack/ArkBridge/tree/main/docs",
        label: "Documentation",
        external: true,
      },
      {
        href: "https://github.com/Emmyhack/ArkBridge/blob/main/README.md",
        label: "Overview",
        external: true,
      },
    ],
  },
  {
    title: "Build",
    links: [
      {
        href: "https://github.com/Emmyhack/ArkBridge/tree/main/packages/sdk",
        label: "SDK",
        external: true,
      },
      {
        href: "https://github.com/Emmyhack/ArkBridge/tree/main/packages/contracts",
        label: "Contracts",
        external: true,
      },
      {
        href: "https://github.com/Emmyhack/ArkBridge/blob/main/CONTRIBUTING.md",
        label: "Contributing",
        external: true,
      },
    ],
  },
  {
    title: "Project",
    links: [
      { href: "https://github.com/Emmyhack/ArkBridge", label: "GitHub", external: true },
      {
        href: "https://github.com/Emmyhack/ArkBridge/issues",
        label: "Issues",
        external: true,
      },
      {
        href: "https://github.com/Emmyhack/ArkBridge/blob/main/LICENSE",
        label: "License",
        external: true,
      },
    ],
  },
] as const;

/** Replace environment-specific network shortcuts without duplicating the
 * navigation model in the server layout, header, and footer. */
export function navigationFor(networks: readonly NavLink[]): readonly NavMenu[] {
  return NAV_MENUS.map((menu) => {
    if (menu.id !== "bridge" || menu.feature === undefined) return menu;
    return {
      ...menu,
      feature: {
        ...menu.feature,
        items: [
          ...networks,
          ...menu.feature.items.filter((item) => !item.href.startsWith("/bridge?from=")),
        ],
      },
    };
  });
}

export function footerFor(networks: readonly NavLink[]) {
  return FOOTER_COLUMNS.map((column) =>
    column.title === "Networks" ? { ...column, links: networks } : column,
  );
}
