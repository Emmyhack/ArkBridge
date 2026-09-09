import type { MenuIconName } from "../site/navigation";

/**
 * The grid of tiles behind the carousel.
 *
 * Positions are explicit cell coordinates on a 4×5 grid, hand-placed to be
 * unevenly distributed. An even fill would read as a table of contents; a
 * scatter reads as a field of capabilities, most of them dormant, with the two
 * relevant to the current slide lit.
 *
 * The coordinates are consumed twice — once to place the tile in CSS grid, once
 * to compute the SVG connector between the two lit tiles — so they live here
 * rather than being expressed in the stylesheet.
 */
export type Tile = {
  readonly id: string;
  readonly col: number;
  readonly row: number;
  readonly icon: MenuIconName;
  readonly label: string;
};

export const TILES: readonly Tile[] = [
  { id: "swap", col: 1, row: 0, icon: "route", label: "Routing" },
  { id: "verify", col: 2, row: 0, icon: "shield", label: "Verification" },
  { id: "index", col: 3, row: 0, icon: "chart", label: "Indexing" },
  { id: "vault", col: 0, row: 1, icon: "tokens", label: "Collateral" },
  { id: "quorum", col: 3, row: 1, icon: "status", label: "Quorum" },
  { id: "dispatch", col: 1, row: 2, icon: "bridge", label: "Dispatch" },
  { id: "limits", col: 2, row: 2, icon: "activity", label: "Limits" },
  { id: "registry", col: 0, row: 3, icon: "book", label: "Registry" },
  { id: "relay", col: 1, row: 3, icon: "code", label: "Relay" },
  { id: "receipts", col: 3, row: 3, icon: "question", label: "Receipts" },
  { id: "solvency", col: 1, row: 4, icon: "chart", label: "Solvency" },
  { id: "recovery", col: 3, row: 4, icon: "shield", label: "Recovery" },
] as const;

/**
 * The carousel slides.
 *
 * Each names a friction the bridge removes and the two tiles that do the
 * removing. Framed as problems rather than features on purpose — "one canonical
 * deployment" means nothing to someone who has never been handed a fake wrapped
 * token, and "you cannot receive the wrong token" does.
 */
export type Friction = {
  readonly id: string;
  readonly eyebrow: string;
  readonly icon: MenuIconName;
  readonly lead: string;
  readonly body: string;
  /** Exactly two tile ids. The connector is drawn from the first to the
   *  second, so the first must sit above and left of the second. */
  readonly lit: readonly [string, string];
};

export const FRICTIONS: readonly Friction[] = [
  {
    id: "canonical",
    eyebrow: "No wrapped-asset roulette",
    icon: "tokens",
    lead: "The destination token is explicit before you transfer.",
    body: "ArkBridge resolves each supported asset from the same registry used by the app and SDK, then shows its origin and representation instead of relying on a ticker alone.",
    lit: ["verify", "quorum"],
  },
  {
    id: "observable",
    eyebrow: "No silent failure",
    icon: "activity",
    lead: "Every transfer has observable progress.",
    body: "ArkBridge separates source confirmation, message verification, and destination delivery. A delayed transfer shows its current stage instead of collapsing the process into one spinner.",
    lit: ["vault", "dispatch"],
  },
  {
    id: "bounded",
    eyebrow: "No unbounded exposure",
    icon: "chart",
    lead: "Limits refill continuously, not on the hour.",
    body: "Rate limits are token buckets, so an attacker cannot move twice the cap by straddling a window boundary. The bucket drains as it is used and refills at a fixed rate.",
    lit: ["dispatch", "receipts"],
  },
  {
    id: "verifiable",
    eyebrow: "No unofficial deployments",
    icon: "code",
    lead: "Every address is published before it is used.",
    body: "Contracts, agent configuration and this interface live in one repository under one test suite. What is deployed on each chain is recorded in artifacts the app reads at build time.",
    lit: ["relay", "recovery"],
  },
] as const;

/** Grid geometry, shared by the CSS and the connector maths. */
export const CELL = 100;
export const GAP = 16;
export const COLUMNS = 4;
export const ROWS = 5;
export const GRID_WIDTH = COLUMNS * CELL + (COLUMNS - 1) * GAP;
export const GRID_HEIGHT = ROWS * CELL + (ROWS - 1) * GAP;

function centre(col: number, row: number): readonly [number, number] {
  return [col * (CELL + GAP) + CELL / 2, row * (CELL + GAP) + CELL / 2];
}

/**
 * The connector between two lit tiles: down, round the corner, across.
 *
 * An orthogonal path with one rounded elbow, rather than a straight diagonal.
 * A diagonal across a square grid reads as an arrow pointing somewhere; a
 * right-angled trace reads as a circuit, which is the correct metaphor for two
 * subsystems wired together.
 *
 * Returns null when the tiles are not in the expected relative position, so a
 * miswritten slide draws nothing instead of drawing a path that doubles back
 * through the grid.
 */
export function connectorPath(from: Tile, to: Tile): string | null {
  if (to.col <= from.col || to.row <= from.row) return null;
  const [x1, y1] = centre(from.col, from.row);
  const [x2, y2] = centre(to.col, to.row);
  const elbow = 18;
  return `M ${x1} ${y1} V ${y2 - elbow} Q ${x1} ${y2} ${x1 + elbow} ${y2} H ${x2}`;
}
