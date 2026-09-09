import type { BridgeToken } from "@arkbridge/types";
import { ZERO_ADDRESS } from "@arkbridge/types";

/**
 * KASH / WKASH — NOT part of the first release.
 *
 * Ark's native asset leaving Ark is the inverse of every other route in V1: Ark
 * becomes the collateral side and the external chain holds the synthetic. That
 * direction needs its own security review, its own limits, and a decision on
 * whether the native or the wrapped form is the canonical bridging surface.
 *
 * These entries exist so the shape is settled and the registry does not need
 * restructuring later. Both ship disabled and must not be enabled without an
 * explicit decision to do so.
 */

export function defineKashTokens(hubChain: string): BridgeToken[] {
  return [
    {
      id: `${hubChain}-wkash`,
      name: "Wrapped Kash",
      symbol: "WKASH",
      decimals: 18,
      canonicalChain: hubChain,
      canonicalAddress: ZERO_ADDRESS,
      isMock: false,
      // Bridging KASH/WKASH is out of scope for V1. Do not enable.
      enabled: false,
      representations: {
        [hubChain]: {
          address: ZERO_ADDRESS,
          type: "collateral",
          decimals: 18,
        },
      },
    },
  ];
}
