/**
 * The ArkBridge mark.
 *
 * A bridge pylon with the deck running through it: two legs meeting at an apex,
 * crossed by a bar that overhangs on both sides.
 *
 * The overhang is doing the work. A bar that stopped at the legs would read as
 * the crossbar of a letter A and nothing more; carrying it past them turns the
 * shape into a structure — a tower the roadway passes through — which is what a
 * bridge looks like from the side. That it still reads as an A for Ark is a
 * bonus, not the premise.
 *
 * WHY THIS AND NOT SOMETHING RICHER
 *
 * The first attempt drew the topology literally: a keystone at the centre of a
 * ring with three nodes wired back to it — accurate, and it did not survive
 * contact with a 20px favicon. The nodes became lollipops and the keystone
 * became a bucket. A mark is seen small far more often than large, so the test
 * that matters is the browser tab, not the header. Two strokes survive it.
 *
 * Drawn as SVG so it stays crisp at any size and takes its colour from
 * `currentColor` rather than baking an accent into a raster — which is what
 * lets the same geometry serve the header, the footer and `app/icon.svg`.
 */
export function ArkMark({ className }: { readonly className?: string | undefined }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      {/* The pylon. One open path, so the apex is a single mitred joint rather
          than two strokes crossing and leaving a notch. */}
      <path
        d="M7 26.5 16 5.5 25 26.5"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The deck, lighter than the legs and reaching further out. Matching
          the pylon's weight collapsed the two into a single letterform; a
          thinner, longer bar keeps them reading as two members. */}
      <path
        d="M3.8 18H28.2"
        pathLength="1"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
