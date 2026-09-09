import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@arkbridge/config/node";

/**
 * Structural checks on the frontend.
 *
 * These do not replace looking at the thing in a browser. They pin the
 * properties that regress silently and are expensive to notice: an unlabelled
 * control, a status conveyed only by colour, a hard-coded chain name, a fixed
 * width that reintroduces horizontal scroll.
 */
const web = join(findRepoRoot(), "apps/web");
const ui = join(findRepoRoot(), "packages/ui/src");

function filesUnder(dir: string, extension: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(extension)) out.push(path);
    }
  };
  walk(dir);
  return out;
}

const tsx = filesUnder(web, ".tsx").map((path) => ({ path, source: readFileSync(path, "utf8") }));
const css = filesUnder(web, ".css").map((path) => ({ path, source: readFileSync(path, "utf8") }));

describe("chains are never hard-coded", () => {
  it("no component branches on a chain key", () => {
    // Adding Base must not require editing the frontend — §154 names this
    // exact failure mode.
    for (const { path, source } of tsx) {
      for (const forbidden of [
        '=== "sepolia"',
        '=== "ark-devnet"',
        '=== "base-sepolia"',
        '=== "bsc-testnet"',
      ]) {
        assert.ok(!source.includes(forbidden), `${path} branches on a chain key: ${forbidden}`);
      }
    }
  });

  it("no component hard-codes a chain id", () => {
    for (const { path, source } of tsx) {
      for (const id of ["11155111", "84532"]) {
        assert.ok(!source.includes(id), `${path} hard-codes chain id ${id}`);
      }
    }
  });
});

describe("colours come from tokens", () => {
  it("no component stylesheet inlines a hex colour", () => {
    for (const { path, source } of css) {
      if (path.endsWith("tokens.css")) continue; // the palette itself
      const hexes = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      assert.deepEqual(hexes, [], `${path} inlines hex colours: ${hexes.join(", ")}`);
    }
  });

  it("defines a light palette as well as dark", () => {
    const tokens = readFileSync(join(web, "styles/tokens.css"), "utf8");
    assert.ok(tokens.includes("prefers-color-scheme: light"));
    assert.ok(tokens.includes('[data-theme="light"]'));
  });
});

describe("accessibility", () => {
  it("keeps focus visible", () => {
    const globals = readFileSync(join(web, "styles/globals.css"), "utf8");
    assert.ok(globals.includes(":focus-visible"), "no visible focus style");
  });

  it("respects reduced motion", () => {
    const globals = readFileSync(join(web, "styles/globals.css"), "utf8");
    assert.ok(globals.includes("prefers-reduced-motion"));
  });

  it("never conveys state by colour alone", () => {
    for (const name of ["StatusBoard.tsx", "ActivityList.tsx", "TransferReceipt.tsx"]) {
      const source = readFileSync(join(web, "components", name), "utf8");
      assert.ok(source.includes("aria-hidden"), `${name}: decorative marker not hidden from AT`);
      assert.ok(
        source.includes("LABEL[") ||
          source.includes("presented.label") ||
          source.includes("ark-visually-hidden"),
        `${name}: status has no text equivalent`,
      );
    }
  });

  it("labels every select and the amount input", () => {
    const shell = readFileSync(join(web, "components/BridgeShell.tsx"), "utf8");
    const selects = (shell.match(/<select/g) ?? []).length;
    const labelled = (shell.match(/aria-label=|htmlFor=/g) ?? []).length;
    assert.ok(labelled >= selects, "a select or input is unlabelled");
  });
});

describe("responsiveness", () => {
  it("declares breakpoints for tablet and mobile", () => {
    const all = css.map((c) => c.source).join("\n");
    const widths = [...all.matchAll(/max-width:\s*(\d+)px/g)].map((m) => Number(m[1]));
    assert.ok(
      widths.some((w) => w > 800),
      "no tablet breakpoint",
    );
    assert.ok(
      widths.some((w) => w <= 600),
      "no mobile breakpoint",
    );
  });

  it("prevents horizontal page scroll", () => {
    const globals = readFileSync(join(web, "styles/globals.css"), "utf8");
    assert.ok(globals.includes("overflow-x: hidden"), "body can scroll horizontally");
  });

  it("uses no fixed widths that would overflow a small screen", () => {
    for (const { path, source } of css) {
      const fixed = [...source.matchAll(/[^-]width:\s*(\d{3,})px/g)]
        .map((m) => Number(m[1]))
        .filter((w) => w > 320);
      assert.deepEqual(fixed, [], `${path} has fixed widths: ${fixed.join(", ")}`);
    }
  });
});

describe("spec-mandated copy", () => {
  it("discloses bridged origin on the receive side", () => {
    const shell = readFileSync(join(web, "components/BridgeShell.tsx"), "utf8");
    assert.match(shell, /Bridged via ArkBridge/);
  });

  it("never presents a delay as a failure", () => {
    for (const name of ["TransferReceipt.tsx", "TransactionDetail.tsx"]) {
      const source = readFileSync(join(web, "components", name), "utf8");
      assert.match(source, /has not failed/i, `${name}: a delay is not explicitly non-failing`);
    }
  });

  it("keeps the primary destinations to exactly four (§19)", () => {
    // The navigation moved from a flat bar (components/Header.tsx) to a menu
    // model (components/site/navigation.ts), but the property being guarded is
    // unchanged and is the reason the guard exists: there are four application
    // destinations, and a fifth one added casually is how a nav stops being
    // navigable. The menus around them may hold reference material; the first
    // menu holds the product itself, and it holds exactly these four.
    const source = readFileSync(join(web, "components/site/navigation.ts"), "utf8");
    const primary = source.slice(source.indexOf("NAV_MENUS"), source.indexOf("feature:"));
    const items = (primary.match(/href: "\/[a-z]/g) ?? []).length;
    assert.equal(items, 4, "navigation is overcrowded");

    for (const route of ["/bridge", "/activity", "/tokens", "/status"]) {
      assert.ok(primary.includes(`href: "${route}"`), `${route} is not a primary destination`);
    }
  });

  it("routes every menu entry somewhere real", () => {
    // A menu is a promise that the destination exists. Internal hrefs are
    // checked against the app directory rather than trusted.
    const source = readFileSync(join(web, "components/site/navigation.ts"), "utf8");
    const internal = new Set(
      [...source.matchAll(/href: "(\/[a-z][a-z-]*)/g)].map((match) => match[1]),
    );
    for (const href of internal) {
      const route = String(href).slice(1);
      const pages = filesUnder(join(web, "app", route), "page.tsx");
      assert.ok(pages.length > 0, `${href} is linked but has no page`);
    }
  });

  it("has a page for every navigation item", () => {
    for (const route of ["bridge", "activity", "tokens", "status"]) {
      const pages = filesUnder(join(web, "app", route), "page.tsx");
      assert.ok(pages.length > 0, `/${route} has no page`);
    }
  });
});

describe("selectors (§26, §27)", () => {
  it("uses no native select in the bridge card", () => {
    // A native <select> cannot show a chain descriptor or an asset's origin,
    // both of which the spec requires.
    const shell = readFileSync(join(web, "components/BridgeShell.tsx"), "utf8");
    assert.ok(!shell.includes("<select"), "bridge card still uses a native select");
  });

  it("keeps chain ids out of the normal chain selector (§26)", () => {
    const source = readFileSync(join(web, "components/ChainSelector.tsx"), "utf8");
    assert.ok(!source.includes("chainId"), "chain selector exposes a chain id");
  });

  it("shows asset origin in the token selector (§27, §28)", () => {
    const source = readFileSync(join(web, "components/TokenSelector.tsx"), "utf8");
    assert.match(source, /Origin:/);
    assert.match(source, /Bridged via ArkBridge/);
  });

  it("is keyboard navigable (§118)", () => {
    const source = readFileSync(join(ui, "SearchList.tsx"), "utf8");
    for (const key of ["ArrowDown", "ArrowUp", "Enter"]) {
      assert.ok(source.includes(key), `search list does not handle ${key}`);
    }
    assert.ok(source.includes('role="listbox"'), "no listbox role");
    assert.ok(source.includes('role="option"'), "no option role");
  });

  it("uses the platform dialog so focus is trapped and Escape works", () => {
    const source = readFileSync(join(ui, "Dialog.tsx"), "utf8");
    assert.ok(source.includes("showModal"), "dialog is not modal");
    assert.ok(source.includes("<dialog"), "dialog is a div, losing focus trapping");
  });
});

describe("deep links (§68, §69)", () => {
  const source = readFileSync(join(web, "lib/deepLink.ts"), "utf8");

  it("validates every parameter against the registry", () => {
    // A link is untrusted input. An unknown chain must not put the form into a
    // state that cannot be submitted.
    assert.ok(source.includes("usableRoutes"), "deep link is not validated against real routes");
    assert.ok(source.includes("return usable ? candidate : undefined"));
  });

  it("accepts the inputToken alias the spec shows", () => {
    assert.ok(source.includes("inputToken"), "the §68 alias is unsupported");
  });
});

describe("route details and advanced disclosure (§36, §37)", () => {
  const source = readFileSync(join(web, "components/RouteDetails.tsx"), "utf8");

  it("keeps protocol detail out of the main card", () => {
    const shell = readFileSync(join(web, "components/BridgeShell.tsx"), "utf8");
    // §154: Hyperlane terminology must not dominate the primary card.
    assert.ok(!shell.includes("domainId"), "domain ids leak into the bridge card");
    assert.ok(!shell.includes("Mailbox"), "Mailbox is named in the bridge card");
  });

  it("collapses advanced details by default", () => {
    assert.ok(source.includes("useState(false)"), "advanced details start expanded");
    assert.ok(source.includes("aria-expanded"), "disclosure state is not announced");
  });

  it("exposes router addresses and domains behind the disclosure", () => {
    for (const field of ["Source router", "Destination router", "Source domain"]) {
      assert.ok(source.includes(field), `advanced details omit ${field}`);
    }
  });
});

describe("recipient (§65)", () => {
  const source = readFileSync(join(web, "components/RecipientField.tsx"), "utf8");

  it("defaults to the connected wallet and stays collapsed", () => {
    assert.ok(source.includes("useState(false)"), "recipient field starts expanded");
  });

  it("validates the address before it can be used", () => {
    assert.ok(source.includes("isAddress"), "recipient address is not validated");
    assert.ok(source.includes("aria-invalid"), "invalid state is not announced");
  });

  it("warns that a transfer cannot be reversed", () => {
    assert.match(source, /cannot be reversed|cannot be recovered/i);
  });
});

describe("error boundaries", () => {
  it("distinguishes a display failure from a transfer failure", () => {
    const source = readFileSync(join(web, "app/error.tsx"), "utf8");
    // A user mid-transfer must not read a render error as lost funds.
    assert.match(source, /not with any transfer/i);
    assert.match(source, /continues on-chain/i);
  });

  it("has a not-found page", () => {
    assert.ok(readFileSync(join(web, "app/not-found.tsx"), "utf8").length > 0);
  });
});

describe("FAQ (§20)", () => {
  const source = readFileSync(join(web, "app/faq/page.tsx"), "utf8");

  it("explains that the received asset is a representation (§28)", () => {
    assert.match(source, /ArkBridge-issued representation/);
  });

  it("explains that a delay is not a failure (§63)", () => {
    assert.match(source, /has not failed/);
  });

  it("explains why external-to-external is unavailable (§25)", () => {
    assert.match(source, /routes external liquidity through Ark/i);
  });
});

describe("motion system (§52, §59)", () => {
  const globals = readFileSync(join(web, "styles/globals.css"), "utf8");
  const tokens = readFileSync(join(web, "styles/tokens.css"), "utf8");
  const allCss = css.map((c) => c.source).join("\n");
  const uiCss = readFileSync(join(ui, "styles.css"), "utf8");

  it("defines durations and easings as tokens, not per component", () => {
    for (const token of ["--ark-duration-fast", "--ark-duration-base", "--ark-ease-out"]) {
      assert.ok(tokens.includes(token), `missing motion token ${token}`);
    }
  });

  it("keeps every animation short enough to feel responsive", () => {
    // Past ~600ms an interface feels like it is deciding rather than reacting.
    const durations = [...tokens.matchAll(/--ark-duration-[a-z]+:\s*(\d+)ms/g)].map((m) =>
      Number(m[1]),
    );
    assert.ok(durations.length > 0);
    for (const duration of durations) {
      assert.ok(duration <= 600, `a motion token is ${duration}ms, too slow to feel responsive`);
    }
  });

  it("excludes the effects the spec forbids", () => {
    // §52/§59: no bouncing, particles, moving backgrounds or parallax.
    //
    // Comments are stripped first. Documenting what was deliberately left out
    // is worth keeping; the check is about what is implemented, not what is
    // discussed.
    const declarations = allCss.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
    for (const banned of ["parallax", "particle", "bounce"]) {
      assert.ok(!declarations.includes(banned), `stylesheet implements "${banned}"`);
    }
  });

  it("honours reduced motion everywhere it animates", () => {
    // Every file that animates must also disable it. A vestibular trigger is
    // not a preference to partially honour.
    for (const { path, source } of [...css, { path: "ui/styles.css", source: uiCss }]) {
      const animates = /animation:\s*ark-|transform:\s*(translate|rotate|scale)/.test(source);
      if (!animates) continue;
      assert.ok(
        source.includes("prefers-reduced-motion"),
        `${path} animates without a reduced-motion escape`,
      );
    }
  });

  it("does not hide content behind JavaScript", () => {
    // The reveal's hidden state is scoped to [data-reveal-ready], set by JS.
    // Without that guard, a failed script leaves the page blank.
    assert.ok(
      globals.includes('[data-reveal-ready="true"] [data-reveal]'),
      "reveal hides content even when JS has not run",
    );
    const bare = /^\s*\[data-reveal\]\s*{[^}]*opacity:\s*0/m.test(globals);
    assert.ok(!bare, "content is hidden by CSS alone");
  });

  it("unobserves elements once revealed", () => {
    // A reveal is an arrival, not something that replays on every scroll.
    const source = readFileSync(join(ui, "useReveal.ts"), "utf8");
    assert.ok(source.includes("unobserve"), "reveal replays on scroll");
    assert.ok(source.includes("prefers-reduced-motion"), "reveal ignores reduced motion");
  });

  it("highlights a changed value without moving it", () => {
    // A quote figure that reflows while being read is worse than no feedback.
    const source = readFileSync(join(ui, "AnimatedValue.tsx"), "utf8");
    assert.ok(!source.includes("scale("), "value animation changes size");
    assert.ok(globals.includes("ark-flash"), "no background-only highlight defined");
  });
});

describe("typography", () => {
  const tokens = readFileSync(join(web, "styles/tokens.css"), "utf8");
  const globals = readFileSync(join(web, "styles/globals.css"), "utf8");
  const fonts = readFileSync(join(web, "lib/fonts.ts"), "utf8");

  it("defines the full role hierarchy the spec names", () => {
    for (const role of [
      "--ark-text-display",
      "--ark-text-heading",
      "--ark-text-subheading",
      "--ark-text-body",
      "--ark-text-label",
      "--ark-text-caption",
      "--ark-font-mono",
    ]) {
      assert.ok(tokens.includes(role), `type scale is missing ${role}`);
    }
  });

  it("exposes each role as a class components can name", () => {
    for (const cls of [".ark-display", ".ark-heading", ".ark-subheading", ".ark-label"]) {
      assert.ok(globals.includes(cls), `no class for ${cls}`);
    }
  });

  it("uses no raw pixel font sizes in component styles", () => {
    // A component states a role; it does not restate a number and drift from
    // every other component that meant the same thing.
    for (const { path, source } of css) {
      if (path.endsWith("tokens.css") || path.endsWith("globals.css")) continue;
      const raw = [...source.matchAll(/font-size:\s*\d+px/g)].map((m) => m[0]);
      assert.deepEqual(raw, [], `${path} hard-codes font sizes: ${raw.join(", ")}`);
    }
  });

  it("self-hosts fonts rather than fetching them at runtime", () => {
    // A webfont CDN in the critical path is a third-party dependency and a
    // layout-shift source.
    assert.ok(fonts.includes("next/font/google"), "fonts are not built in");
    for (const { path, source } of css) {
      assert.ok(!source.includes("fonts.googleapis.com"), `${path} links a font CDN`);
    }
  });

  it("gives every face a fallback stack", () => {
    const faces = (fonts.match(/fallback:/g) ?? []).length;
    assert.ok(faces >= 3, "a typeface has no fallback stack");
  });

  it("reserves monospace for identifiers", () => {
    for (const { path, source } of tsx) {
      if (!source.includes("ark-mono")) continue;
      // A digest and a reference id are identifiers too — anything a user
      // might quote back or compare character by character.
      assert.ok(
        /address|hash|messageId|Message ID|recipient|router|routeId|transaction|digest|reference/i.test(
          source,
        ),
        `${path} uses monospace for something that is not an identifier`,
      );
    }
  });

  it("uses tabular figures for values that change in place", () => {
    const all = css.map((c) => c.source).join("\n");
    assert.ok(all.includes("tabular-nums"), "no tabular figures anywhere");
  });
});

describe("page flow", () => {
  it("puts the form above the fold, with explanation below it", () => {
    const page = readFileSync(join(web, "app/bridge/page.tsx"), "utf8");
    // Compare rendered order, not import order — imports are alphabetised by
    // tooling and say nothing about what the user sees first.
    const introAt = page.indexOf("<BridgeIntro");
    const shellAt = page.indexOf("<BridgeShell");
    const explainAt = page.indexOf("<HowItWorks");
    assert.ok(introAt < shellAt, "the form is not directly below the headline");
    assert.ok(shellAt < explainAt, "explanation comes before the form");
  });

  it("states real network figures rather than marketing totals", () => {
    // A devnet quoting a large bridged volume would simply be false.
    const intro = readFileSync(join(web, "components/BridgeIntro.tsx"), "utf8");
    assert.ok(intro.includes("routeCount") && intro.includes("assetCount"));
    // Comments stripped: the file explains why it avoids marketing totals, and
    // that explanation naturally names one.
    const code = intro.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/\$\d/.test(code), "a currency figure is rendered in the hero");
  });

  it("describes the real mechanism below the fold", () => {
    const source = readFileSync(join(web, "components/HowItWorks.tsx"), "utf8");
    assert.match(source, /locked/i);
    assert.match(source, /validator/i);
    assert.match(source, /backed one-for-one/i);
  });
});
