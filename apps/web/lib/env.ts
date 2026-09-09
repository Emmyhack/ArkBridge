import type { Environment } from "@arkbridge/types";
import { isEnvironment } from "@arkbridge/types";

/**
 * The environment this build targets.
 *
 * Read from a NEXT_PUBLIC_ variable because it is bundled into the browser, and
 * validated rather than cast: an unset or misspelled value silently defaulting
 * is how a testnet build ends up pointing at mainnet addresses, or the reverse.
 */
export function resolveWebEnvironment(): Environment {
  const raw = process.env["NEXT_PUBLIC_ARKBRIDGE_ENV"];
  if (raw === undefined || !isEnvironment(raw)) {
    throw new Error(
      `NEXT_PUBLIC_ARKBRIDGE_ENV is "${String(raw)}". Set it to local, testnet, staging or mainnet.`,
    );
  }
  return raw;
}
