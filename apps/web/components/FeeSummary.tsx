import { formatAmount } from "@arkbridge/bridge-core";
import { AnimatedValue } from "@arkbridge/ui";
import type { BridgeQuote } from "@arkbridge/types";
import type { ChainConfig } from "@arkbridge/types";
import styles from "./FeeSummary.module.css";

/**
 * Quote breakdown (§32, §33).
 *
 * Delivery cost and ArkBridge's own fee are listed separately. A zero fee is
 * shown as zero rather than hidden — folding unrelated numbers together, or
 * quietly omitting one, is exactly what §33 forbids.
 */
export function FeeSummary({
  quote,
  decimals,
  symbol,
  sourceChain,
}: {
  readonly quote: BridgeQuote;
  readonly decimals: number;
  readonly symbol: string;
  readonly sourceChain: ChainConfig | undefined;
}) {
  const native = sourceChain?.nativeCurrency.symbol ?? "";

  return (
    <dl className={styles.summary}>
      <div className={styles.row}>
        <dt>You send</dt>
        <dd>
          {formatAmount(quote.amount, decimals)} {symbol}
        </dd>
      </div>
      <div className={styles.row}>
        <dt>You receive</dt>
        {/* The figure the user is actually deciding on. Highlighted when it
            changes so an updated quote is noticed rather than silently swapped. */}
        <dd className={styles.emphasis}>
          <AnimatedValue value={quote.estimatedReceived.toString()}>
            {formatAmount(quote.estimatedReceived, decimals)} {symbol}
          </AnimatedValue>
        </dd>
      </div>
      <div className={styles.row}>
        <dt>Delivery fee</dt>
        <dd>
          {quote.interchainFee === 0n
            ? "0"
            : `${formatAmount(quote.interchainFee, 18, { maxFractionDigits: 8 })} ${native}`}
        </dd>
      </div>
      <div className={styles.row}>
        <dt>ArkBridge fee</dt>
        <dd>{quote.bridgeFee === 0n ? "0" : formatAmount(quote.bridgeFee, decimals)}</dd>
      </div>
      {quote.limitRemaining === undefined ? null : (
        <div className={styles.row}>
          <dt>Route capacity</dt>
          <dd>
            {formatAmount(quote.limitRemaining, decimals)} {symbol}
          </dd>
        </div>
      )}
      <div className={styles.row}>
        <dt>Estimated delivery</dt>
        {/* Never a promise (§34): cross-chain delivery can be delayed. */}
        <dd>Varies</dd>
      </div>
    </dl>
  );
}
