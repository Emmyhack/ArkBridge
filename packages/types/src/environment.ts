/**
 * Deployment environments. Each one has its own chain set, deployment
 * artifacts and configuration directory; nothing is shared implicitly.
 */
export const ENVIRONMENTS = ["local", "testnet", "staging", "mainnet"] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

export function isEnvironment(value: unknown): value is Environment {
  return typeof value === "string" && (ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Environments that move real user funds. Deployment and configuration
 * validation is strictest here: no mock tokens, no unconfigured registry
 * entries, no EOA-only ownership.
 */
export const PRODUCTION_ENVIRONMENTS = ["mainnet"] as const satisfies readonly Environment[];

export function isProductionEnvironment(environment: Environment): boolean {
  return (PRODUCTION_ENVIRONMENTS as readonly Environment[]).includes(environment);
}
