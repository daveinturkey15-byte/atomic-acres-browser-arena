/**
 * forge-kit/street/prefabs.ts — HF-536 (NIGHT-MUSE-STREET)
 *
 * Street wear kit: manholes, drain grates, tar patches, gutter litter,
 * kerb chips and pothole rings. Pure presentation geometry prefabs for the
 * carriageway and kerb line, emitted through `pair()` by the arena.
 *
 * WHY BOXES. Every kit part flows through `pair()` -> `box()`, which builds
 * BoxGeometry (12 tris). Round reads (disc, ring, octagon) follow the
 * street-signs bollard precedent: axis-aligned boxes, with rotated twins only
 * where the 60-tri budget allows. The manhole disc stays a single plate and
 * the grate keeps its specified frame + five bars (6 boxes = 72 tris, over
 * the 60 budget — recorded in the lane REPORT, the construction is explicit
 * in the brief so it is kept rather than thinned).
 *
 * RELIEF. The carriageway top is y = 0 (stem/bay slabs centre -0.06 h 0.12,
 * turning-head disc the same). Every part bottom sits 0.04–0.05 m above it:
 * inside the brief's [0.02, 0.05] band and above the 0.03 m coplanar-near
 * band, so no part bottom ever pairs with the road surface. Rings abut their
 * discs edge-to-edge (never stacked over them), so same-facing stacked faces
 * never share plan area.
 */

export type StreetRole =
  | 'iron' // Cast iron: manhole covers, grate frames/bars -> darkest metal
  | 'asphalt' // Repair asphalt: tar patches -> darkest asphalt-family role
  | 'concrete' // Kerb concrete: chips, pothole rims -> existing concrete role
  | 'mulch'; // Leaf litter/grit: gutter strips -> existing soil/mulch role

export const STREET_ROLES = Object.freeze([
  'iron',
  'asphalt',
  'concrete',
  'mulch',
] as const);

export interface StreetPart {
  readonly suffix: string;
  readonly offset: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly role: StreetRole;
  readonly cast: boolean;
  readonly rotation?: readonly [number, number, number];
}

export const STREET_BOX_TRIANGLES = 12;

/** Bottom relief of the lowest parts above the carriageway top (y = 0). */
export const STREET_RELIEF_M = 0.04;

const part = (
  suffix: string,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  role: StreetRole,
  cast: boolean,
  rotation?: readonly [number, number, number],
): StreetPart => Object.freeze({
  suffix,
  offset,
  size,
  role,
  cast,
  ...(rotation ? { rotation } : {}),
});

/**
 * 1. manholeCover — 0.60 m cast-iron disc plate, 0.02 m thick with its
 * bottom at relief, plus a 0.05 m wide rim ring (4 abutting bars) whose top
 * sits 0.01 m above the disc top. 5 boxes = 60 triangles.
 */
export function manholeCover(): readonly StreetPart[] {
  const D = 0.60;
  const T = 0.02;
  const discTop = STREET_RELIEF_M + T;
  const rimW = 0.05;
  const rimTop = discTop + 0.01;
  const rimT = 0.02;
  const rimY = rimTop - rimT / 2;
  const outer = D / 2 + rimW;
  return Object.freeze([
    // Disc plate
    part('disc', [0, STREET_RELIEF_M + T / 2, 0], [D, T, D], 'iron', false),
    // Rim ring: N/S bars span the full outer width, E/W bars abut between them
    part('rim north', [0, rimY, outer - rimW / 2], [outer * 2, rimT, rimW], 'iron', false),
    part('rim south', [0, rimY, -(outer - rimW / 2)], [outer * 2, rimT, rimW], 'iron', false),
    part('rim east', [outer - rimW / 2, rimY, 0], [rimW, rimT, D / 2], 'iron', false),
    part('rim west', [-(outer - rimW / 2), rimY, 0], [rimW, rimT, D / 2], 'iron', false),
  ]);
}
export const MANHOLE_COVER_TRIANGLES = 5 * STREET_BOX_TRIANGLES; // 60

/**
 * 2. drainGrate — 0.45 x 0.30 m kerb-side grate. Frame plate 0.02 m thick
 * with its bottom at relief; five 0.04 m wide slot bars standing through it,
 * tops 0.01 m proud of the frame top. 6 boxes = 72 triangles (over the 60
 * budget; the frame + five-bar construction is brief-explicit, see REPORT).
 */
export function drainGrate(): readonly StreetPart[] {
  const W = 0.45;
  const D = 0.30;
  const frameT = 0.02;
  const frameTop = STREET_RELIEF_M + frameT;
  const barW = 0.04;
  const barL = D - 0.02;
  const barTop = frameTop + 0.01;
  const barT = barTop - STREET_RELIEF_M;
  const barY = STREET_RELIEF_M + barT / 2;
  const bars: StreetPart[] = [];
  for (let i = 0; i < 5; i += 1) {
    const x = -W / 2 + barW / 2 + 0.025 + i * ((W - 0.05 - barW) / 4);
    bars.push(part(`bar ${i}`, [x, barY, 0], [barW, barT, barL], 'iron', false));
  }
  return Object.freeze([
    part('frame', [0, STREET_RELIEF_M + frameT / 2, 0], [W, frameT, D], 'iron', false),
    ...bars,
  ]);
}
export const DRAIN_GRATE_TRIANGLES = 6 * STREET_BOX_TRIANGLES; // 72

/**
 * 3. tarPatch — asphalt repair square, `size` m a side (0.9–1.6), 0.02 m
 * thick with its bottom at relief, plus a 0.10 m bevel strip abutting the
 * north and south edges, tops flush. 3 boxes = 36 triangles.
 */
export function tarPatch(size: number): readonly StreetPart[] {
  const T = 0.02;
  const bevelW = 0.10;
  return Object.freeze([
    part('patch', [0, STREET_RELIEF_M + T / 2, 0], [size, T, size], 'asphalt', false),
    part('bevel north', [0, STREET_RELIEF_M + T / 2, size / 2 + bevelW / 2], [size, T, bevelW], 'asphalt', false),
    part('bevel south', [0, STREET_RELIEF_M + T / 2, -(size / 2 + bevelW / 2)], [size, T, bevelW], 'asphalt', false),
  ]);
}
export const TAR_PATCH_TRIANGLES = 3 * STREET_BOX_TRIANGLES; // 36

/**
 * 4. gutterLitter — `length` m strip (1.2–2.4) of leaf litter/grit along the
 * kerb base, 0.12 m wide, 0.02 m thick with its bottom at relief.
 * 1 box = 12 triangles.
 */
export function gutterLitter(length: number): readonly StreetPart[] {
  const T = 0.02;
  return Object.freeze([
    part('strip', [0, STREET_RELIEF_M + T / 2, 0], [length, T, 0.12], 'mulch', false),
  ]);
}
export const GUTTER_LITTER_TRIANGLES = 1 * STREET_BOX_TRIANGLES; // 12

/**
 * 5. kerbChip — 0.10 x 0.08 x 0.03 m concrete chip lying on the asphalt next
 * to the kerb, rotated `yawRadians` about Y. Bottom at relief (Y rotation
 * keeps the bottom face planar). 1 box = 12 triangles.
 */
export function kerbChip(yawRadians: number): readonly StreetPart[] {
  const T = 0.03;
  return Object.freeze([
    part('chip', [0, STREET_RELIEF_M + T / 2, 0], [0.10, T, 0.08], 'concrete', false, [0, yawRadians, 0]),
  ]);
}
export const KERB_CHIP_TRIANGLES = 1 * STREET_BOX_TRIANGLES; // 12

/**
 * 6. potholeRing — `diameter` m (0.5–0.7) dark filled-pothole disc, 0.02 m
 * thick with its bottom at relief, with a lighter 0.06 m rim ring abutting
 * it edge-to-edge, tops flush. 5 boxes = 60 triangles.
 */
export function potholeRing(diameter: number): readonly StreetPart[] {
  const T = 0.02;
  const rimW = 0.06;
  const outer = diameter / 2 + rimW;
  const y = STREET_RELIEF_M + T / 2;
  return Object.freeze([
    part('fill', [0, y, 0], [diameter, T, diameter], 'asphalt', false),
    part('rim north', [0, y, outer - rimW / 2], [outer * 2, T, rimW], 'concrete', false),
    part('rim south', [0, y, -(outer - rimW / 2)], [outer * 2, T, rimW], 'concrete', false),
    part('rim east', [outer - rimW / 2, y, 0], [rimW, T, diameter / 2], 'concrete', false),
    part('rim west', [-(outer - rimW / 2), y, 0], [rimW, T, diameter / 2], 'concrete', false),
  ]);
}
export const POTHOLE_RING_TRIANGLES = 5 * STREET_BOX_TRIANGLES; // 60

export interface StreetPropPlacement {
  readonly propId: string;
  readonly anchor: readonly [number, number, number];
  readonly parts: readonly StreetPart[];
}

/**
 * Authored placements on the carriageway and kerb line, in the AUTHORED
 * frame. Emitted through `pair()` so south gets the exact 180-degree partner.
 *
 * Every anchor was solved against BOTH vehicle frames at once: the placement
 * and its (-x, -z) image must each clear every vehicle rect by >= 0.5 m
 * (truck box/cab, coach, saloon, classic — all in nuketown2-layout.ts), stay
 * off the centre-line dashes, keep the full AABB on the carriageway
 * (stem rect, turning-head circle, bays), and never overlap another
 * placement's AABB or its image. Counts: 2 manholes (centreline), 4 drain
 * grates (kerb line, turning head + mid-street), 3 tar patches (wheel paths),
 * 6 gutter litter strips, 8 kerb chips, 2 pothole rings. All anchors y = 0,
 * the carriageway top; parts carry their own relief.
 */
export function streetPropPlacements(): readonly StreetPropPlacement[] {
  const deg = (d: number): number => (d * Math.PI) / 180;
  return Object.freeze([
    // 1. Manholes on the carriageway centreline (clear of dashes + classic).
    Object.freeze({
      propId: 'street-wear manhole 0',
      anchor: [10.2, 0, 0] as const,
      parts: manholeCover(),
    }),
    Object.freeze({
      propId: 'street-wear manhole 1',
      anchor: [14.5, 0, 0] as const,
      parts: manholeCover(),
    }),
    // 2. Drain grates at the kerb line (turning head + mid-street).
    Object.freeze({
      propId: 'street-wear drain grate 0',
      anchor: [-11, 0, -4.85] as const,
      parts: drainGrate(),
    }),
    Object.freeze({
      propId: 'street-wear drain grate 1',
      anchor: [-6.9, 0, 4.85] as const,
      parts: drainGrate(),
    }),
    Object.freeze({
      propId: 'street-wear drain grate 2',
      anchor: [6.2, 0, -4.85] as const,
      parts: drainGrate(),
    }),
    Object.freeze({
      propId: 'street-wear drain grate 3',
      anchor: [12, 0, 4.85] as const,
      parts: drainGrate(),
    }),
    // 3. Tar patches in the wheel paths.
    Object.freeze({
      propId: 'street-wear tar patch 0',
      anchor: [-0.5, 0, 1.5] as const,
      parts: tarPatch(1.2),
    }),
    Object.freeze({
      propId: 'street-wear tar patch 1',
      anchor: [1.8, 0, -1.5] as const,
      parts: tarPatch(0.9),
    }),
    Object.freeze({
      propId: 'street-wear tar patch 2',
      anchor: [11, 0, 1.5] as const,
      parts: tarPatch(1.4),
    }),
    // 4. Gutter litter strips along the kerb base.
    Object.freeze({
      propId: 'street-wear gutter litter 0',
      anchor: [-13, 0, 5.0] as const,
      parts: gutterLitter(2.0),
    }),
    Object.freeze({
      propId: 'street-wear gutter litter 1',
      anchor: [-5.0, 0, 5.0] as const,
      parts: gutterLitter(1.2),
    }),
    Object.freeze({
      propId: 'street-wear gutter litter 2',
      anchor: [3.0, 0, -5.0] as const,
      parts: gutterLitter(1.2),
    }),
    Object.freeze({
      propId: 'street-wear gutter litter 3',
      anchor: [9, 0, -5.0] as const,
      parts: gutterLitter(1.8),
    }),
    Object.freeze({
      propId: 'street-wear gutter litter 4',
      anchor: [13, 0, 5.0] as const,
      parts: gutterLitter(1.2),
    }),
    Object.freeze({
      propId: 'street-wear gutter litter 5',
      anchor: [-9, 0, -5.0] as const,
      parts: gutterLitter(2.0),
    }),
    // 5. Kerb chips on the asphalt next to the kerb (15–40 deg yaw).
    Object.freeze({
      propId: 'street-wear kerb chip 0',
      anchor: [-6, 0, -4.8] as const,
      parts: kerbChip(deg(25)),
    }),
    Object.freeze({
      propId: 'street-wear kerb chip 1',
      anchor: [2.0, 0, -4.5] as const,
      parts: kerbChip(deg(30)),
    }),
    Object.freeze({
      propId: 'street-wear kerb chip 2',
      anchor: [0, 0, 4.5] as const,
      parts: kerbChip(deg(15)),
    }),
    Object.freeze({
      propId: 'street-wear kerb chip 3',
      anchor: [3.5, 0, -4.8] as const,
      parts: kerbChip(deg(40)),
    }),
    Object.freeze({
      propId: 'street-wear kerb chip 4',
      anchor: [2.5, 0, 4.9] as const,
      parts: kerbChip(deg(20)),
    }),
    Object.freeze({
      propId: 'street-wear kerb chip 5',
      anchor: [12, 0, -4.8] as const,
      parts: kerbChip(deg(35)),
    }),
    Object.freeze({
      propId: 'street-wear kerb chip 6',
      anchor: [-12.5, 0, -4.5] as const,
      parts: kerbChip(deg(18)),
    }),
    Object.freeze({
      propId: 'street-wear kerb chip 7',
      anchor: [14.5, 0, -4.9] as const,
      parts: kerbChip(deg(28)),
    }),
    // 6. Pothole rings (filled-pothole read).
    Object.freeze({
      propId: 'street-wear pothole ring 0',
      anchor: [-9.3, 0, -0.45] as const,
      parts: potholeRing(0.5),
    }),
    Object.freeze({
      propId: 'street-wear pothole ring 1',
      anchor: [12.3, 0, 2.1] as const,
      parts: potholeRing(0.5),
    }),
  ]);
}
