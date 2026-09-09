#!/usr/bin/env node
import { ENVIRONMENTS, isEnvironment } from "@arkbridge/types";
import type { Environment } from "@arkbridge/types";
import { loadRegistries } from "../node.js";
import { validateRegistries } from "../validate.js";
import type { ValidationIssue } from "../validate.js";

/**
 * Validate every environment's registries, with deployment artifacts folded in.
 *
 * Run by CI on every change. Usage:
 *   arkbridge-validate-config              validate all environments
 *   arkbridge-validate-config testnet      validate one
 */

const SYMBOL: Record<ValidationIssue["severity"], string> = {
  error: "ERROR",
  warning: "warn ",
};

function print(issue: ValidationIssue): void {
  process.stdout.write(
    `  ${SYMBOL[issue.severity]}  [${issue.code}] ${issue.subject}\n         ${issue.message}\n`,
  );
}

async function main(): Promise<number> {
  const requested = process.argv.slice(2);
  for (const arg of requested) {
    if (!isEnvironment(arg)) {
      process.stderr.write(
        `Unknown environment "${arg}". Expected one of: ${ENVIRONMENTS.join(", ")}.\n`,
      );
      return 2;
    }
  }

  const environments: readonly Environment[] =
    requested.length > 0 ? (requested as Environment[]) : ENVIRONMENTS;

  let failed = false;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const environment of environments) {
    const { chains, tokens } = await loadRegistries(environment);
    const result = validateRegistries(chains, tokens);

    const errors = result.issues.filter((issue) => issue.severity === "error");
    const warnings = result.issues.filter((issue) => issue.severity === "warning");
    totalErrors += errors.length;
    totalWarnings += warnings.length;

    const chainCount = Object.keys(chains.chains).length;
    const routeCount = Object.keys(tokens.routes).length;
    const tokenCount = Object.keys(tokens.tokens).length;

    process.stdout.write(
      `\n${environment}: ${String(chainCount)} chains, ${String(tokenCount)} tokens, ` +
        `${String(routeCount)} routes — ${result.ok ? "OK" : "FAILED"}\n`,
    );

    for (const issue of result.issues) print(issue);
    if (!result.ok) failed = true;
  }

  process.stdout.write(`\n${String(totalErrors)} error(s), ${String(totalWarnings)} warning(s).\n`);
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  },
);
