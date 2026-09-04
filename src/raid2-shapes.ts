/**
 * RAID2 plan shapes — the small amount of geometry algebra the layout needs,
 * kept out of the arena file so the arena stays a readable table of extents.
 *
 * Everything here is pure: rectangles in, rectangles out, no THREE, no
 * randomness. That is what lets src/raid2-fidelity.test.ts assert against the
 * SAME shapes the arena emits rather than against a second transcription.
 */

/** `[x0, x1, z0, z1]`, the arena's own extent convention. */
export type PlanRect = readonly [number, number, number, number];

const EPS = 1e-6;

/**
 * S \ (union of holes), as axis-aligned rectangles.
 *
 * THIS IS THE BURIAL FIX, and it is worth saying why it is a function rather
 * than four hand-typed boxes. The arena paved every footprint slice as one slab
 * from y -1 to y 0 and then authored the pool basin (top -0.55) and the sunk
 * sport court (top -0.35) UNDERNEATH it. Both were therefore invisible and
 * un-enterable: measured this session, a column probe at the pool centre
 * returns `raid2 paving -20` top 0.00 above `raid2 pool water` top -0.12 above
 * `raid2 pool basin` top -0.55. The arena's own art direction — the pool as one
 * of two saturated notes on the map, the court as the "cross it and pray"
 * pocket — did not exist in the frame. `open-world-city-art-loop`'s rule is
 * geometric and it is the rule that was broken: nothing is drawn under a floor,
 * so the floor is CUT, not offset.
 *
 * Bands are merged where consecutive x-bands carry the same z-complement, so a
 * six-band organic pool costs a handful of paving boxes rather than a grid.
 */
export function subtractRects(slice: PlanRect, holes: readonly PlanRect[]): PlanRect[] {
  const [sx0, sx1, sz0, sz1] = slice;
  const clipped = holes
    .map(([hx0, hx1, hz0, hz1]): PlanRect => [
      Math.max(hx0, sx0), Math.min(hx1, sx1), Math.max(hz0, sz0), Math.min(hz1, sz1),
    ])
    .filter(([x0, x1, z0, z1]) => x1 - x0 > EPS && z1 - z0 > EPS);
  if (clipped.length === 0) return [slice];

  const cuts = new Set<number>([sx0, sx1]);
  for (const [x0, x1] of clipped) { cuts.add(x0); cuts.add(x1); }
  const xs = [...cuts].sort((a, b) => a - b);

  type Band = { x0: number; x1: number; spans: Array<[number, number]> };
  const bands: Band[] = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (x1 - x0 <= EPS) continue;
    const mid = (x0 + x1) / 2;
    const blocked = clipped
      .filter(([hx0, hx1]) => hx0 < mid && mid < hx1)
      .map(([, , hz0, hz1]): [number, number] => [hz0, hz1])
      .sort((a, b) => a[0] - b[0]);
    const spans: Array<[number, number]> = [];
    let cursor = sz0;
    for (const [z0, z1] of blocked) {
      if (z0 > cursor + EPS) spans.push([cursor, z0]);
      cursor = Math.max(cursor, z1);
    }
    if (cursor < sz1 - EPS) spans.push([cursor, sz1]);
    const previous = bands[bands.length - 1];
    if (previous && sameSpans(previous.spans, spans)) previous.x1 = x1;
    else bands.push({ x0, x1, spans });
  }

  const out: PlanRect[] = [];
  for (const band of bands) for (const [z0, z1] of band.spans) out.push([band.x0, band.x1, z0, z1]);
  return out;
}

function sameSpans(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  if (a.length !== b.length) return false;
  return a.every(([z0, z1], index) => Math.abs(z0 - b[index][0]) < EPS && Math.abs(z1 - b[index][1]) < EPS);
}

/**
 * A filled circle as `slices` axis-aligned bands, INSCRIBED (every band lies
 * inside the true circle, so a disc never grows past its measured diameter).
 * Odd slice counts read better because one band carries the full width.
 */
export function discBands(cx: number, cz: number, radius: number, slices = 5): PlanRect[] {
  const out: PlanRect[] = [];
  for (let i = 0; i < slices; i += 1) {
    const z0 = cz - radius + (2 * radius * i) / slices;
    const z1 = cz - radius + (2 * radius * (i + 1)) / slices;
    const far = Math.max(Math.abs(z0 - cz), Math.abs(z1 - cz));
    const half = Math.sqrt(Math.max(0, radius * radius - far * far));
    if (half <= EPS) continue;
    out.push([cx - half, cx + half, z0, z1]);
  }
  return out;
}

/**
 * One chord segment of a ring, ready to hand straight to `box`.
 *
 * `size` and `rotation` are pre-resolved because a rotated collider is NOT a
 * free choice here: `box` writes its collider bounds from position +/- size/2
 * and carries the rotation alongside, so a segment rotated by exactly a quarter
 * turn produces an axis-aligned box whose recorded bounds are its own footprint
 * turned ninety degrees. The collider/visual parity audit measured exactly that
 * and reported two unexplained colliders on the drive kerb ring. The four
 * cardinal segments are therefore emitted UNROTATED with their extents swapped,
 * which is the same shape and an honest bound.
 */
export type RingSegment = {
  x: number; z: number; length: number; angle: number;
  size: readonly [number, number]; rotation?: readonly [number, number, number];
};

/**
 * A ring approximated by `count` chord segments, each authored as a rotated
 * box. Segments are returned with their tangent angle so the caller can pass
 * it straight to `box`'s `rotation` — the collider carries the rotation too, so
 * the kerb a player walks and the kerb they see are the same object.
 */
export function ringSegments(cx: number, cz: number, radius: number, count: number, width: number): RingSegment[] {
  const out: RingSegment[] = [];
  const step = (Math.PI * 2) / count;
  const chord = 2 * radius * Math.sin(step / 2);
  for (let i = 0; i < count; i += 1) {
    const theta = i * step;
    // A box's local +X runs along the chord, so it is rotated about Y by the
    // tangent angle. THREE's Y rotation is left-handed against atan2(z, x),
    // hence the negation.
    const angle = -theta - Math.PI / 2;
    const half = ((angle % Math.PI) + Math.PI) % Math.PI;
    const alongX = Math.min(half, Math.PI - half) < 1e-6;
    const alongZ = Math.abs(half - Math.PI / 2) < 1e-6;
    out.push({
      x: cx + radius * Math.cos(theta),
      z: cz + radius * Math.sin(theta),
      length: chord,
      angle,
      size: alongZ ? [width, chord] : [chord, width],
      rotation: alongX || alongZ ? undefined : [0, angle, 0],
    });
  }
  return out;
}

/**
 * THE POOL, as measured (see src/raid2-reference.ts for the method).
 *
 * The reference pool is NOT the 28 x 8 m rectangle this arena shipped. Read
 * row by row off the artefact it is a narrow channel at the garage end that
 * opens, at about X -5, into a broad lobe wrapped around a round basin. Water
 * area 107.0 m2 inside a 23.4 x 11.6 m envelope: fill 0.394, against the
 * rectangle's 1.00.
 *
 * These are the WATER cells. The basin slab and the coping are derived from
 * them in the arena so the three can never disagree.
 */
export const RAID2_POOL_WATER: readonly PlanRect[] = Object.freeze([
  // The channel, narrowing to its 3.3 m waist at about X +2 and widening again
  // as it runs south. Rows y=204..276 of the artefact.
  [5.0, 10.3, -31.4, -27.0],
  [1.0, 5.0, -31.7, -28.3],
  [-2.0, 1.0, -32.4, -27.4],
  [-5.2, -2.0, -33.4, -26.8],
  // The southern lobe, which the artefact shows as TWO strips either side of
  // the round basin. Rows y=280..308.
  [-12.9, -5.2, -34.8, -31.3],
  [-12.0, -5.2, -25.6, -24.0],
]);

/** Coping runs, one per exposed water edge, 0.5 m deep. Derived, not typed twice. */
export const RAID2_POOL_COPING_DEPTH = 0.5;
