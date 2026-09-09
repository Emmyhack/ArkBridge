import type { Environment } from "@arkbridge/types";
import { ENVIRONMENTS, isEnvironment } from "@arkbridge/types";

/**
 * Resolve the active environment from a raw value.
 *
 * There is deliberately no default. An unset or misspelled `ARKBRIDGE_ENV`
 * silently falling back to some environment is how a testnet build ends up
 * pointed at mainnet addresses, or the reverse.
 */
export function resolveEnvironment(raw: string | undefined): Environment {
  if (raw === undefined || raw.trim() === "") {
    throw new Error(
      `ARKBRIDGE_ENV is not set. Set it to one of: ${ENVIRONMENTS.join(", ")}. ` +
        `See .env.example.`,
    );
  }
  const value = raw.trim();
  if (!isEnvironment(value)) {
    throw new Error(
      `ARKBRIDGE_ENV="${value}" is not a known environment. Expected one of: ${ENVIRONMENTS.join(", ")}.`,
    );
  }
  return value;
}

/** Read a required environment variable, failing loudly when absent. */
export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Required environment variable ${name} is not set. See .env.example.`);
  }
  return value.trim();
}

export function optionalEnv(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

/** Read a required integer environment variable (e.g. a chain or domain id). */
export function requireIntEnv(name: string, env: NodeJS.ProcessEnv = process.env): number {
  const raw = requireEnv(name, env);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name}="${raw}" must be a positive integer.`);
  }
  return value;
}
