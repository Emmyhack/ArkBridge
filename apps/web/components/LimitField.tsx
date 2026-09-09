"use client";

import styles from "./LimitField.module.css";

/**
 * The fee ceiling, and the honest description of what arming it does.
 *
 * "Recommended" fills in the current base fee less 10%, which is the useful
 * default: a ceiling at exactly the current fee is met immediately and is
 * therefore not a limit at all, and a user who wants that should press the
 * button on the Instant tab. Ten percent below is close enough to trigger
 * within an ordinary lull and far enough to mean something.
 *
 * The warning underneath is not boilerplate. A watch that stops when the tab
 * closes, described as an "order", is how someone ends up believing a transfer
 * is pending when nothing anywhere is holding it.
 */
export function LimitField({
  value,
  onChange,
  current,
  unit,
  armed,
  met,
  onArm,
  onCancel,
  canArm,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly current?: number | undefined;
  readonly unit: string;
  readonly armed: boolean;
  readonly met: boolean;
  readonly onArm: () => void;
  readonly onCancel: () => void;
  readonly canArm: boolean;
}) {
  const recommended = current === undefined ? undefined : current * 0.9;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.label}>Send when base fee is at or below</span>
        {current === undefined ? null : (
          <span className={styles.current}>
            now <span className="ark-numeric">{formatGwei(current)}</span>
          </span>
        )}
        {recommended === undefined ? null : (
          <button
            type="button"
            className={styles.recommend}
            onClick={() => {
              onChange(formatGwei(recommended));
            }}
          >
            Recommended
          </button>
        )}
      </div>

      <div className={styles.row}>
        <input
          className={styles.input}
          inputMode="decimal"
          placeholder="0.00"
          aria-label={`Fee ceiling in ${unit}`}
          value={value}
          disabled={armed}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
        <span className={styles.unit}>{unit}</span>
      </div>

      <button
        type="button"
        className={armed ? styles.cancel : styles.arm}
        onClick={armed ? onCancel : onArm}
        disabled={!armed && !canArm}
      >
        {armed ? "Cancel watch" : met ? "Watch (ceiling already met)" : "Watch this fee"}
      </button>

      {/* Short, but it still says the two things that matter: nothing is signed
          in advance, and the watch does not survive the tab. */}
      <p className={styles.caveat}>
        Watched in this browser only — nothing is signed in advance, and closing the tab ends it.
      </p>
    </div>
  );
}

function formatGwei(value: number): string {
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(3);
  if (value >= 0.001) return value.toFixed(5);
  return value.toExponential(2);
}
