"use client";

import { useMemo, useState } from "react";
import { FEE_RANGES, type Candle, type FeeRange } from "../lib/useFeeSeries";
import styles from "./FeeChart.module.css";

/**
 * The base-fee chart.
 *
 * Hand-drawn SVG rather than a charting library. A candlestick plot is about a
 * hundred lines of arithmetic; the smallest capable library is two orders of
 * magnitude more JavaScript, wants a canvas, and brings its own theming layer
 * that would sit as a second design system inside this one.
 *
 * SCALE
 *
 * The y-axis never starts at zero. Base fees move in a narrow band well above
 * it, and anchoring to zero would compress every real movement into a flat
 * line. That is legitimate for a series with no meaningful zero — and the axis
 * is always labelled, so the range is stated rather than implied.
 *
 * The x-axis is labelled in elapsed time, derived from the *measured* block
 * time of the chain rather than a constant, and falls back to block numbers
 * when that measurement is not available. It never guesses.
 */
export function FeeChart({
  candles,
  current,
  ceiling,
  unit,
  loading,
  unavailable,
  range,
  onRangeChange,
  perCandle,
  blockSeconds,
}: {
  readonly candles: readonly Candle[];
  readonly current?: number | undefined;
  /** Drawn as a horizontal rule when a limit is armed. */
  readonly ceiling?: number | undefined;
  readonly unit: string;
  readonly loading: boolean;
  readonly unavailable: boolean;
  readonly range: FeeRange;
  readonly onRangeChange: (range: FeeRange) => void;
  readonly perCandle: number;
  /** Measured, from `useChainTiming`. Absent means the axis stays in blocks. */
  readonly blockSeconds?: number | undefined;
}) {
  // The candle under the pointer, or none. `null` rather than undefined so the
  // readout can distinguish "not hovering" from "no data".
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (candles.length === 0) return undefined;
    let min = Math.min(...candles.map((c) => c.low));
    let max = Math.max(...candles.map((c) => c.high));
    // An armed ceiling must be visible even when it sits outside the traded
    // range — a limit you cannot see on the chart is worse than no chart.
    if (ceiling !== undefined && Number.isFinite(ceiling)) {
      min = Math.min(min, ceiling);
      max = Math.max(max, ceiling);
    }
    const span = max - min || Math.max(max, 1) * 0.1;
    const pad = span * 0.08;
    return { min: min - pad, max: max + pad, span: span + pad * 2 };
  }, [candles, ceiling]);

  const ranges = (
    <div className={styles.ranges} role="group" aria-label="Chart range">
      {FEE_RANGES.map((option) => (
        <button
          key={option}
          type="button"
          className={styles.range}
          aria-pressed={option === range}
          onClick={() => {
            onRangeChange(option);
          }}
        >
          {rangeLabel(option, blockSeconds)}
        </button>
      ))}
    </div>
  );

  if (unavailable) {
    return (
      <div className={styles.chart} data-state="empty">
        <p className={styles.message}>
          This network does not serve fee history, so there is nothing to chart. Limits still work —
          they are checked against the live base fee.
        </p>
      </div>
    );
  }

  if (geometry === undefined) {
    return (
      <div className={styles.chart} data-state="empty">
        <p className={styles.message}>
          {loading ? "Reading recent blocks…" : "No fee history yet."}
        </p>
      </div>
    );
  }

  const W = 1000;
  const H = 380;
  const slot = W / candles.length;
  const bodyWidth = Math.max(Math.min(slot * 0.6, 14), 1.5);
  const y = (value: number) => H - ((value - geometry.min) / geometry.span) * H;
  const ticks = Array.from({ length: 5 }, (_, i) => geometry.min + (geometry.span / 4) * i);

  const last = candles[candles.length - 1];
  const shown = hover === null ? last : (candles[hover] ?? last);
  const change = shown === undefined ? 0 : shown.close - shown.open;
  const changePct = shown === undefined || shown.open === 0 ? 0 : (change / shown.open) * 100;

  // Four x labels, evenly spaced, skipping the first slot so the leftmost label
  // is not clipped by the axis gutter.
  const xLabels = [0.25, 0.5, 0.75, 1].map((fraction) => {
    const index = Math.min(Math.round(candles.length * fraction) - 1, candles.length - 1);
    return { fraction, index };
  });

  return (
    <div className={styles.chart}>
      <div className={styles.toolbar}>
        <span className={styles.readoutLabel}>Base fee</span>
        {current === undefined ? null : (
          <span className={`${styles.readoutValue} ark-numeric`}>
            {formatFee(current)} {unit}
          </span>
        )}
        {ranges}
      </div>

      {/* The OHLC line. Follows the pointer, and falls back to the most recent
          candle so the row is never blank. */}
      {shown === undefined ? null : (
        <div className={styles.ohlc} aria-live="off">
          <span>
            O <b className="ark-numeric">{formatFee(shown.open)}</b>
          </span>
          <span>
            H <b className="ark-numeric">{formatFee(shown.high)}</b>
          </span>
          <span>
            L <b className="ark-numeric">{formatFee(shown.low)}</b>
          </span>
          <span>
            C <b className="ark-numeric">{formatFee(shown.close)}</b>
          </span>
          <span className={styles.change} data-rising={change >= 0}>
            {change >= 0 ? "+" : ""}
            {formatFee(change)} ({changePct >= 0 ? "+" : ""}
            {changePct.toFixed(2)}%)
          </span>
          {hover === null ? null : <span className={styles.hoverHint}>block {shown.block}</span>}
        </div>
      )}

      <div className={styles.plot}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className={styles.svg}
          role="img"
          aria-label={`Source network base fee over the last ${candles.length * perCandle} blocks`}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            if (box.width === 0) return;
            const fraction = (event.clientX - box.left) / box.width;
            const index = Math.floor(fraction * candles.length);
            setHover(index >= 0 && index < candles.length ? index : null);
          }}
          onPointerLeave={() => {
            setHover(null);
          }}
        >
          {ticks.map((tick) => (
            <line
              key={tick}
              x1="0"
              x2={W}
              y1={y(tick)}
              y2={y(tick)}
              className={styles.grid}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {candles.map((candle) => {
            const cx = candle.index * slot + slot / 2;
            const rising = candle.close >= candle.open;
            const top = y(Math.max(candle.open, candle.close));
            const bottom = y(Math.min(candle.open, candle.close));
            return (
              <g key={candle.index}>
                <line
                  x1={cx}
                  x2={cx}
                  y1={y(candle.high)}
                  y2={y(candle.low)}
                  className={rising ? styles.wickUp : styles.wickDown}
                  vectorEffect="non-scaling-stroke"
                />
                <rect
                  x={cx - bodyWidth / 2}
                  y={top}
                  width={bodyWidth}
                  // A doji — open equal to close — would render as a zero-height
                  // rect and vanish; floored to a visible line.
                  height={Math.max(bottom - top, 1.5)}
                  className={rising ? styles.bodyUp : styles.bodyDown}
                />
              </g>
            );
          })}

          {hover === null || candles[hover] === undefined ? null : (
            <line
              x1={hover * slot + slot / 2}
              x2={hover * slot + slot / 2}
              y1="0"
              y2={H}
              className={styles.crosshair}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {ceiling === undefined ? null : (
            <line
              x1="0"
              x2={W}
              y1={y(ceiling)}
              y2={y(ceiling)}
              className={styles.ceiling}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        <div className={styles.axisY} aria-hidden="true">
          {[...ticks].reverse().map((tick) => (
            <span key={tick}>{formatFee(tick)}</span>
          ))}
        </div>
      </div>

      <div className={styles.axisX} aria-hidden="true">
        {xLabels.map(({ fraction, index }) => {
          const candlesAgo = candles.length - 1 - index;
          return (
            <span key={fraction} style={{ left: `${fraction * 100}%` }}>
              {blockSeconds === undefined
                ? `#${candles[index]?.block ?? ""}`
                : elapsed(candlesAgo * perCandle * blockSeconds)}
            </span>
          );
        })}
      </div>

      <p className={styles.caption}>
        Source network base fee, {candles.length * perCandle} most recent blocks. This is what the
        delivery fee is priced from.
      </p>
    </div>
  );
}

/** Gwei values span several orders of magnitude across chains, so precision is
 *  chosen from the value rather than fixed. */
function formatFee(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 1) return value.toFixed(3);
  if (abs >= 0.001) return value.toFixed(5);
  if (abs === 0) return "0";
  return value.toExponential(2);
}

/** A range button reads as a duration once block time is known, and as a block
 *  count until then — never as a duration this app has not measured. */
function rangeLabel(blocks: FeeRange, blockSeconds: number | undefined): string {
  if (blockSeconds === undefined) return `${blocks}`;
  return elapsed(blocks * blockSeconds);
}

function elapsed(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}
