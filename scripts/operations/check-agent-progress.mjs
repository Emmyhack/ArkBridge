#!/usr/bin/env node
/**
 * Are the agents actually making forward progress?
 *
 * WHY THIS EXISTS
 *
 * `check-agent-balances.mjs` was written because a relayer that runs out of gas
 * stops delivering without erroring. This is the same class of silent stall with
 * a different cause, and the balance check is blind to it: the agents had gas,
 * the containers were up, the health checks passed, and Sepolia deliveries had
 * stopped entirely.
 *
 * The cause was a single rate-limited RPC endpoint. Hyperlane's sequence-aware
 * cursor asks for a window of logs, receives a partial answer because the
 * provider is throttling, decides the sequences do not match what it expected,
 * and rewinds to its last good snapshot — then does it again. It never advances.
 * In a 25-minute window that produced 763 rewinds and 118 rate-limit errors, and
 * a transfer sat in flight with the user's collateral already locked.
 *
 * Two signals, both read from the agents' own logs:
 *
 *   rate limits   the provider refusing work
 *   rewinds       the cursor failing to advance because of it
 *
 * Rewinds are the one that matters. A few rate limits with no rewinds is an
 * agent absorbing throttling correctly. Rewinds without progress is a stall.
 *
 *   node scripts/operations/check-agent-progress.mjs [window]     e.g. 15m
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WINDOW = process.argv[2] ?? "15m";

/*
 * Docker Desktop does not reliably put its CLI on PATH, so the bare name is
 * tried first and then the two places it installs to. Each candidate is *run*
 * rather than merely tested for existence: `docker` on PATH is the common case
 * and there is no file to stat for it.
 */
const DOCKER = (() => {
  const candidates = [
    "docker",
    join(homedir(), ".docker/bin/docker"),
    "/usr/local/bin/docker",
    "/Applications/Docker.app/Contents/Resources/bin/docker",
  ];
  for (const candidate of candidates) {
    if (candidate !== "docker" && !existsSync(candidate)) continue;
    try {
      execFileSync(candidate, ["version", "--format", "{{.Client.Version}}"], {
        stdio: "ignore",
      });
      return candidate;
    } catch {
      // Not this one — either absent from PATH or unable to reach a daemon.
    }
  }
  console.error(
    "Could not find a working docker CLI. Start Docker Desktop, or put its\n" +
      'CLI on PATH: export PATH="$HOME/.docker/bin:$PATH"',
  );
  process.exit(1);
})();

/*
 * Rewinds per minute above which a cursor is stuck rather than noisy.
 *
 * A RATE, not a count. The first version of this compared a raw count against
 * the requested window, which is wrong in both directions: the same stall reads
 * "ok" over five minutes and "STALLED" over forty-five, and a window longer than
 * the retained log silently compares against less data than it asked for. Nine
 * rewinds in two minutes and thirty-one in forty-five are the same fault; only
 * the rate says so.
 *
 * A healthy agent rewinds occasionally — a reorg, a slow provider — so the
 * threshold is not zero. The separation observed here is wide: agents that are
 * advancing sit at 0.0, and the stuck Sepolia validators sat at 4.2 to 4.8.
 * Two a minute is placed in that gap rather than at the edge of either, so the
 * verdict does not flip between adjacent windows of the same fault.
 */
const REWINDS_PER_MINUTE_LIMIT = 2;

function logsFor(container) {
  try {
    return execFileSync(DOCKER, ["logs", "--since", WINDOW, container], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error) {
    // A container that is not running is a finding, not a crash.
    return undefined;
  }
}

function running() {
  const out = execFileSync(DOCKER, ["ps", "--format", "{{.Names}}"], { encoding: "utf8" });
  return out.split("\n").filter((n) => n.startsWith("ark-"));
}

const containers = running();
if (containers.length === 0) {
  console.error("No ark-* containers are running.");
  process.exit(1);
}

let stalled = false;
console.log(
  `Agent progress over the last ${WINDOW}\n  (fwd-rewinds = forward cursor failing to advance; backfill rewinds are excluded)\n`,
);

for (const container of containers.sort()) {
  const log = logsFor(container);
  if (log === undefined) {
    console.log(`  ${container.padEnd(26)} NO LOGS`);
    stalled = true;
    continue;
  }

  const count = (needle) => log.split(needle).length - 1;
  const rateLimits = count("Rate limit exceeded");

  /*
   * Only FORWARD rewinds count.
   *
   * Hyperlane runs two cursors per syncer. The forward one tracks the chain tip
   * and decides whether messages arriving now get indexed and signed; when it
   * cannot advance, new transfers strand. The backward one backfills history and
   * rewinds routinely and harmlessly while it works through a large range.
   *
   * Counting both made this monitor useless at exactly the wrong moment: after
   * the validator databases were rebuilt, the backfill cursor produced 21
   * rewinds in six minutes and the monitor reported STALLED — while a live
   * transfer was delivering in under a minute. A detector that fires during
   * normal recovery is a detector nobody reads during a real one.
   *
   * The incident this was written for showed `sequence_aware::forward` on every
   * rewind, so narrowing to forward keeps the true positive and drops the false
   * one.
   */
  const rewinds = log
    .split("rewinding to last indexed snapshot")
    .slice(0, -1)
    .filter((chunk) => {
      // The cursor module path is logged before the message on the same line.
      const line = chunk.slice(chunk.lastIndexOf("\n") + 1);
      return line.includes("sequence_aware::forward");
    }).length;

  // Coverage, so an empty window is distinguishable from a clean one.
  const firstTimestamp = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/m.exec(
    log.replace(/\u001b\[[0-9;]*m/g, ""),
  );
  const coveredMinutes =
    firstTimestamp === null
      ? undefined
      : Math.round((Date.now() - Date.parse(firstTimestamp[1])) / 60000);

  // Rate against the window actually covered by the logs, not the one asked for.
  const minutes = coveredMinutes === undefined || coveredMinutes < 1 ? 1 : coveredMinutes;
  const rewindRate = rewinds / minutes;

  const state =
    rewindRate > REWINDS_PER_MINUTE_LIMIT ? "STALLED" : rateLimits > 0 ? "throttled" : "ok";
  if (state === "STALLED") stalled = true;

  const coverage = coveredMinutes === undefined ? "" : `${coveredMinutes}m retained`;
  console.log(
    `  ${container.padEnd(26)} ${rewindRate.toFixed(1).padStart(5)} fwd-rewinds/min  ` +
      `${String(rateLimits).padStart(4)} rate-limited   ${state.padEnd(10)}${coverage}`,
  );
}

if (stalled) {
  console.log(
    "\nA forward cursor is rewinding without advancing. This is almost always one\n" +
      "rate-limited RPC endpoint: add a second URL for that chain in\n" +
      "infrastructure/hyperlane/agents/agent-config.json and restart the agent.\n" +
      "Transfers stay in flight with collateral locked while this persists.",
  );
  process.exit(1);
}

console.log("\nAll agents are advancing.");
