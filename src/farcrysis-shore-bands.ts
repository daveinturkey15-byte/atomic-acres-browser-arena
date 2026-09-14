/**
 * farcrysis-shore-bands.ts — square-shore placement arithmetic for every
 * Farcrysis dressing layer.
 *
 * HF-396 grew the island from +/-32 m to +/-64 m. Layers that kept sampling
 * CIRCULAR radii after that rescale hug the square shore only along the four
 * axis faces: on the corner diagonals a circular ring of radius r collapses to
 * Chebyshev r/sqrt(2), stranding beach species up to ~22 m inland of the real
 * waterline (the audited "thrown together" read).
 *
 * Everything here derives from FARCRYSIS_BOUNDS + FARCRYSIS_SHORE +
 * FARCRYSIS_WATER_LEVEL — the terrain authority's own Chebyshev edge-distance
 * convention — so if the island extent ever changes again the bands re-derive
 * automatically instead of re-staling. Pure functions; no scene access; leaf
 * module (imports constants + terrain authority only), safe for any art layer.
 */
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { FARCRYSIS_SHORE, FARCRYSIS_WATER_LEVEL } from './farcrysis-terrain-authority';

/** Half-extent of the square island (metres from origin to a boundary face). */
export const FARCRYSIS_ARENA_HALF = FARCRYSIS_BOUNDS.maxX;

/**
 * Edge distance of the waterline all around the island: where the HF-393
 * descending shelf envelope crosses the gameplay water level:
 *   joinHeight - shelfSlope * (descentStartDist - d) = WATER_LEVEL.
 */
export const FARCRYSIS_WATERLINE_EDGE: number = FARCRYSIS_SHORE.descentStartDist
  - (FARCRYSIS_SHORE.joinHeight - FARCRYSIS_WATER_LEVEL) / FARCRYSIS_SHORE.shelfSlope;

/** Dry-land depth from the waterline to the boundary wall. */
export const FARCRYSIS_INLAND_DEPTH = FARCRYSIS_ARENA_HALF - FARCRYSIS_WATERLINE_EDGE;

/**
 * Metres inward from the square boundary face at (x, z). >= 0 on the island;
 * negative offshore. This is the ONE shore-distance convention — identical to
 * farcrysis-vegetation.ts's edgeDistance and the terrain authority's profile.
 */
export function farcrysisEdgeDistance(x: number, z: number): number {
  return FARCRYSIS_ARENA_HALF - Math.max(Math.abs(x), Math.abs(z));
}

/**
 * Uniform deterministic point over the island square, inset `margin` metres
 * from every boundary face. Consumes exactly two rng() calls per draw so
 * callers keep their existing seed chains predictable.
 */
export function farcrysisSquarePoint(
  rng: () => number,
  margin: number,
): [number, number] {
  const span = FARCRYSIS_ARENA_HALF - margin;
  return [(rng() * 2 - 1) * span, (rng() * 2 - 1) * span];
}

/**
 * Rejection-draws a uniform point over the island square (inset `margin`
 * metres from every boundary face) accepted inside the shore-edge band
 * [innerEdge, outerEdge]. Consumes the caller's seeded rng only, so placement
 * stays deterministic per seed chain.
 */
export function farcrysisEdgeBandPoint(
  rng: () => number,
  band: Readonly<[number, number]>,
  margin: number,
): [number, number] {
  for (;;) {
    const [x, z] = farcrysisSquarePoint(rng, margin);
    const edge = farcrysisEdgeDistance(x, z);
    if (edge >= band[0] && edge <= band[1]) return [x, z];
  }
}
