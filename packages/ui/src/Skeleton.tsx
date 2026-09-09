/**
 * A loading placeholder (§60).
 *
 * Used instead of a full-page spinner: the page structure stays visible while
 * one value loads, so the interface does not appear to restart every time a
 * balance is refetched.
 */
export function Skeleton({
  width,
  height = 14,
}: {
  readonly width: string;
  readonly height?: number;
}) {
  return <span className="ark-skeleton" style={{ width, height }} aria-hidden="true" />;
}
