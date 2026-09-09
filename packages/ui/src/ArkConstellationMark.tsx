/**
 * The Ark Constellation network mark.
 *
 * NOT the ArkBridge mark. ArkBridge is the bridge — a product with its own
 * pylon-and-deck logo. Ark Constellation is the network the bridge connects to,
 * and it has its own identity. The two are mixed up easily and must not be: a
 * chain row labelled "Ark Constellation" showing ArkBridge's logo says the
 * bridge *is* the chain.
 *
 * GEOMETRY
 *
 * An annulus with two circular bites taken out of it at opposite corners, which
 * gives the mark its two-fold rotational symmetry — rotate it 180° and it is
 * unchanged. Every value below is measured off the supplied artwork and
 * expressed against the outer radius, so the proportions survive being redrawn
 * at any size:
 *
 *   outer radius   R
 *   inner hole     0.467 R
 *   bite radius    0.434 R
 *   bite centres   0.96 R from centre, on the 45° diagonal, 180° apart
 *
 * WHY A HAND-BUILT PATH AND NOT A MASK
 *
 * Subtracting three circles from a disc is what `<mask>` is for, and a mask
 * needs a document-unique id. An id means either a collision when two marks
 * render on one page, or a `useId()` — and a hook would make this component
 * unusable from a server component, which is where half the chain rows render.
 * So the outline is computed instead: the four circle-circle intersections are
 * solved exactly and joined with arcs, and the hole is a second subpath punched
 * out with `evenodd`. No ids, no hooks, safe anywhere.
 *
 * The intersections, for anyone checking the numbers: with R = 15 and the bite
 * at distance d = 14.396 with radius 6.5, the chord midpoint sits at
 * a = (d² + R² − r²) / 2d = 13.546 along the centre line and the half-chord is
 * h = √(R² − a²) = 6.443, giving the four points below.
 */
export function ArkConstellationMark({ className }: { readonly className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10.98 1.87A15 15 0 0 1 30.13 21.02A6.5 6.5 0 0 0 21.02 30.13A15 15 0 0 1 1.87 10.98A6.5 6.5 0 0 0 10.98 1.87ZM9 16A7 7 0 1 0 23 16A7 7 0 1 0 9 16Z"
      />
    </svg>
  );
}
