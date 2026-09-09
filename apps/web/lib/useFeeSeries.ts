"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import type { RouteCatalog } from "@arkbridge/bridge-core";

/**
 * The source network's base fee, as a candlestick series.
 *
 * WHY THIS IS THE SERIES
 *
 * A bridge has no exchange rate. Assets cross one-for-one, so there is no price
 * to chart and nothing to speculate on — charting a "rate" here would be
 * theatre. What genuinely varies, minute to minute, is what the transfer
 * *costs*: the delivery fee is paid in the source chain's gas token and is
 * dominated by that chain's base fee. So the base fee is the series, and it is
 * the thing a limit can be set against.
 *
 * WHY `eth_feeHistory` AND NOT POLLING
 *
 * Sampling the gas price on a timer would leave the chart empty on first load
 * and only fill in as long as the tab stayed open. `eth_feeHistory` returns the
 * base fee of every block in a range in one call, so the chart is populated and
 * historically accurate the moment the page renders. It is a standard JSON-RPC
 * method; a node that does not implement it produces an explicit unavailable
 * state rather than a blank panel pretending to be loading.
 *
 * Blocks are grouped into candles because one point per block is noise at this
 * width — a few hundred blocks across ~700px is sub-pixel. Each candle carries
 * the open, high, low and close of its group, which is the honest summary of a
 * range rather than an average that hides the spikes that matter here.
 */
export interface Candle {
  readonly index: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Block number of the candle's last block, for the axis. */
  readonly block: number;
}

export interface FeeSeries {
  readonly candles: readonly Candle[];
  /** Latest base fee in gwei — the number a limit is compared against. */
  readonly current?: number;
  /** Blocks aggregated into each candle, so callers can convert to a duration. */
  readonly perCandle: number;
  readonly loading: boolean;
  /** Set when the node cannot serve fee history. Never treated as "loading". */
  readonly unavailable: boolean;
}

/**
 * Ranges are expressed in blocks, not minutes.
 *
 * Blocks are what `eth_feeHistory` actually takes, and they are the same on
 * every chain; minutes are not. Labelling a button "1h" and then fetching a
 * fixed block count would mean it covered an hour on Ethereum and something
 * quite different on a testnet with irregular block production. The interface
 * converts to a duration for display using the *measured* block time, so the
 * label is derived from the chain rather than assumed about it.
 *
 * 1024 is the ceiling because that is the largest `blockCount` most nodes will
 * serve in a single call, and paging further back would turn one request into
 * several for a chart nobody is studying that closely.
 */
export const FEE_RANGES = [128, 256, 512, 1024] as const;
export type FeeRange = (typeof FEE_RANGES)[number];

/** Candles per range, chosen so the chart always draws 60–70 of them: fewer
 *  and it is a bar chart, more and the bodies fall below a pixel. */
const PER_CANDLE: Record<FeeRange, number> = { 128: 2, 256: 4, 512: 8, 1024: 16 };

const WEI_PER_GWEI = 1e9;

export function useFeeSeries(
  catalog: RouteCatalog,
  chainKey: string,
  range: FeeRange = 256,
): FeeSeries {
  const chain = catalog.chains[chainKey];
  const rpc = chain?.rpcUrls[0];

  const perCandle = PER_CANDLE[range];

  const query = useQuery({
    queryKey: ["fee-series", chainKey, rpc, range],
    enabled: rpc !== undefined,
    // Roughly a block on the slowest chain here. Fresh enough to watch a limit
    // against, slow enough not to hammer a public RPC.
    refetchInterval: 12_000,
    staleTime: 10_000,
    retry: 1,
    queryFn: async () => {
      if (rpc === undefined) throw new Error("no rpc");
      const client = createPublicClient({ transport: http(rpc) });
      const history = await client.getFeeHistory({
        blockCount: range,
        rewardPercentiles: [],
      });

      const fees = history.baseFeePerGas ?? [];
      if (fees.length === 0) throw new Error("no fee history");

      // The last entry is the *next* block's projected base fee, not a mined
      // one. It is the most useful number for "what would I pay now", so it is
      // kept as `current` and excluded from the candles, which describe blocks
      // that actually happened.
      const mined = fees.slice(0, -1).map((wei) => Number(wei) / WEI_PER_GWEI);
      const projected = fees[fees.length - 1];
      const oldest = Number(history.oldestBlock);

      const candles: Candle[] = [];
      for (let i = 0; i < mined.length; i += perCandle) {
        const group = mined.slice(i, i + perCandle);
        const open = group[0];
        const close = group[group.length - 1];
        if (open === undefined || close === undefined) continue;
        candles.push({
          index: candles.length,
          open,
          close,
          high: Math.max(...group),
          low: Math.min(...group),
          block: oldest + i + group.length - 1,
        });
      }

      return {
        candles,
        current: projected === undefined ? undefined : Number(projected) / WEI_PER_GWEI,
      };
    },
  });

  return {
    candles: query.data?.candles ?? [],
    ...(query.data?.current === undefined ? {} : { current: query.data.current }),
    perCandle,
    loading: query.isPending && query.fetchStatus !== "idle",
    unavailable: query.isError,
  };
}
