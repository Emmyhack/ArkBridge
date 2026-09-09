import styles from "./Globe.module.css";

/**
 * The dotted globe.
 *
 * Points on a sphere, orthographically projected, with the far hemisphere
 * discarded. Generating the geometry rather than shipping an illustration means
 * it is a few hundred bytes of arithmetic instead of an asset, it inherits the
 * theme colours, and it stays sharp at any size.
 *
 * The projection is the standard one: a point at latitude φ and longitude λ on
 * a sphere of radius R lands at
 *
 *   x = R·cos φ·sin λ      y = −R·sin φ      z = cos φ·cos λ
 *
 * and z is the depth. Keeping only z > 0 leaves the hemisphere facing the
 * viewer; fading and shrinking each dot by z gives the flat projection its
 * roundness back, because points near the limb are both dimmer and smaller.
 *
 * DETERMINISM
 *
 * Every coordinate is a pure function of the loop counters. Nothing here calls
 * `Math.random()`, which on a server-rendered page would generate one set of
 * points during rendering and a different set during hydration — React reports
 * that as a mismatch and replaces the whole subtree.
 */
const RADIUS = 150;
const LAT_STEP = 10;
const LON_STEP = 10;

type Point = { readonly x: number; readonly y: number; readonly z: number };

function sphereDots(): readonly Point[] {
  const points: Point[] = [];
  for (let lat = -80; lat <= 80; lat += LAT_STEP) {
    const phi = (lat * Math.PI) / 180;
    // Rings near the poles are physically shorter, so stepping longitude by a
    // constant would bunch the dots up there. Dividing by cos φ widens the
    // step toward the poles and keeps the spacing roughly even.
    const step = Math.min(LON_STEP / Math.max(Math.cos(phi), 0.2), 60);
    for (let lon = -180; lon < 180; lon += step) {
      const lambda = (lon * Math.PI) / 180;
      const z = Math.cos(phi) * Math.cos(lambda);
      if (z <= 0.02) continue;
      points.push({
        x: RADIUS * Math.cos(phi) * Math.sin(lambda),
        y: -RADIUS * Math.sin(phi),
        z,
      });
    }
  }
  return points;
}

const DOTS = sphereDots();

/**
 * The inbound arcs.
 *
 * Three curves reaching the globe from off-frame, each carrying a labelled pip
 * at its origin — one per external chain the bridge serves. They are drawn as
 * dashed strokes with an animated dash offset, so the motion is entirely in the
 * dash pattern: nothing changes position, so nothing can cause a reflow.
 */
const ARCS: readonly {
  readonly id: string;
  readonly label: string;
  readonly d: string;
  readonly pip: readonly [number, number];
  readonly delay: string;
}[] = [
  // Each path ends on the limb — a point at exactly RADIUS from the origin —
  // so the line meets the globe's edge rather than running across the dot
  // field and appearing to pass through the sphere.
  {
    id: "ethereum",
    label: "Ethereum",
    d: "M-232 -128 C -196 -112, -166 -94, -131 -73",
    pip: [-232, -128],
    delay: "0s",
  },
  {
    id: "base",
    label: "Base",
    d: "M-96 -206 C -84 -180, -72 -158, -58 -138",
    pip: [-96, -206],
    delay: "-3s",
  },
  {
    id: "bnb",
    label: "BNB Chain",
    d: "M-244 66 C -206 60, -176 46, -146 34",
    pip: [-244, 66],
    delay: "-6s",
  },
] as const;

export function Globe() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <svg viewBox="-260 -220 520 440" className={styles.svg} role="presentation">
        {/* Atmosphere first, so every dot and arc paints on top of it. */}
        <circle cx="0" cy="0" r={RADIUS * 1.04} className={styles.atmosphere} />

        <g className={styles.dots}>
          {DOTS.map((dot, index) => (
            <circle
              key={index}
              cx={dot.x.toFixed(2)}
              cy={dot.y.toFixed(2)}
              r={(0.8 + dot.z * 1.5).toFixed(2)}
              opacity={(0.14 + dot.z * 0.62).toFixed(3)}
            />
          ))}
        </g>

        {/* The limb: a hard edge is what makes the dot field read as a sphere
            rather than as a circular crop of a pattern. */}
        <circle cx="0" cy="0" r={RADIUS} className={styles.limb} />

        <g className={styles.arcs}>
          {ARCS.map((arc) => (
            <path key={arc.id} d={arc.d} style={{ animationDelay: arc.delay }} />
          ))}
        </g>

        <g className={styles.pips}>
          {ARCS.map((arc) => (
            <g key={arc.id} transform={`translate(${arc.pip[0]} ${arc.pip[1]})`}>
              <circle r="15" className={styles.pipHalo} style={{ animationDelay: arc.delay }} />
              <circle r="7" className={styles.pipCore} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
