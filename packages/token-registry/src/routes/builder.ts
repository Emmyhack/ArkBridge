import type { BridgeRoute, BridgeToken, RouteLimits } from "@arkbridge/types";
import { ZERO_ADDRESS } from "@arkbridge/types";
import { routeId } from "../types.js";

/**
 * Every V1 route has Ark at one end. There is no external-to-external path:
 * `ethereum -> bsc` is not a route ArkBridge offers, and the registry cannot
 * express one, so the UI has nothing invalid to render in the first place.
 */
export interface HubRoutePairOptions {
  readonly token: BridgeToken;
  readonly externalChain: string;
  readonly hubChain: string;
  /** Applied to the external -> hub direction (inbound). */
  readonly inboundLimits?: RouteLimits;
  /** Applied to the hub -> external direction (outbound). */
  readonly outboundLimits?: RouteLimits;
  readonly enabled: boolean;
}

/**
 * Build the two directed routes for one asset across one external chain.
 *
 * Directions are separate records on purpose: pausing `ethereum -> ark` must
 * not pause `ark -> ethereum`, and inbound and outbound capacity are tracked
 * independently.
 *
 * Router addresses start as `ZERO_ADDRESS` and are filled in from deployment
 * artifacts. A route with a zero router is never deployed and never selectable.
 */
export function defineHubRoutePair(options: HubRoutePairOptions): BridgeRoute[] {
  const { token, externalChain, hubChain, enabled } = options;

  if (externalChain === hubChain) {
    throw new Error(`Route pair for "${token.id}" has the hub chain on both ends.`);
  }
  if (token.representations[externalChain] === undefined) {
    throw new Error(`Token "${token.id}" has no representation on "${externalChain}".`);
  }
  if (token.representations[hubChain] === undefined) {
    throw new Error(`Token "${token.id}" has no representation on "${hubChain}".`);
  }

  const inbound: BridgeRoute = {
    id: routeId(externalChain, hubChain, token.id),
    sourceChain: externalChain,
    destinationChain: hubChain,
    tokenId: token.id,
    sourceRouter: ZERO_ADDRESS,
    destinationRouter: ZERO_ADDRESS,
    enabled,
    ...(options.inboundLimits === undefined ? {} : { limits: options.inboundLimits }),
  };

  const outbound: BridgeRoute = {
    id: routeId(hubChain, externalChain, token.id),
    sourceChain: hubChain,
    destinationChain: externalChain,
    tokenId: token.id,
    sourceRouter: ZERO_ADDRESS,
    destinationRouter: ZERO_ADDRESS,
    enabled,
    ...(options.outboundLimits === undefined ? {} : { limits: options.outboundLimits }),
  };

  return [inbound, outbound];
}

/**
 * Test-environment limits.
 *
 * These are development values chosen to exercise the limit logic, nothing
 * more. Production limits are set from reviewed production configuration and
 * are never derived from these.
 */
export function testLimits(decimals: number): RouteLimits {
  const unit = 10n ** BigInt(decimals);
  return {
    maxPerTransaction: 100_000n * unit,
    maxHourly: 500_000n * unit,
    maxDaily: 2_000_000n * unit,
  };
}
