/**
 * farcrysis-midmap-landmarks.ts — HF-395 relational mid-map composition.
 *
 * Owner complaint (HF-395): "all the assets in the middle of the map just
 * feel a bit thrown together they're not very well coordinated so that
 * probably needs to be redone."
 *
 * Diagnosis (resources file §4, arXiv 2608.17975 §5): every mid-map family
 * (ruined walls, crates, canopy trees, bushes, ferns) was placed with its own
 * hand-listed ABSOLUTE coordinates. Independent scatter lists cannot read as
 * intentional composition — the exact failure the paper's DSL prevents by
 * preferring RELATIONAL placement (align_centers, place_on_axis,
 * distribute_along_axis, stack_shapes, radial_shapes).
 *
 * This module is the single source of truth for the recomposed mid-map:
 * four rotationally-symmetric jungle landmarks, one per intercardinal
 * quadrant, each anchored ON a spawn diagonal so the old-growth groves keep
 * breaking the spawn-to-spawn sightlines (the design intent the scattered
 * tree list used to serve). Every prop derives its world position from its
 * landmark frame (centre + outward + tangent unit vectors) — no absolute
 * coordinate tables anywhere downstream.
 *
 * Landmark anatomy (local frame: u = outward from arena centre,
 * v = tangent/+90°):
 *   - 3 old-growth trees: radial cluster r=3.0 at {90°,210°,330°} around u.
 *   - One broken ruin wall on the outward edge (u=5.2): two 3.2 m segments
 *     distributed along v (centres v=±2.0) with a 0.8 m collapse gap and
 *     rubble in the gap — reads as one ruined structure, not lone slabs.
 *   - A crate cache against the wall's inner face (u=4.1): one two-tier
 *     stack aligned under segment A plus one single crate under B.
 *   - A hedgerow of bushes behind the wall (u=6.3) distributed along v.
 *   - Ferns radially distributed at the grove base.
 *
 * Everything is pure arithmetic — no Math.random, no RNG streams — so host
 * and guest build identical geometry deterministically.
 */

import { farcrysisTerrainHeight } from './farcrysis-terrain-authority';

export type Vec2 = readonly [number, number];

// ---------------------------------------------------------------------------
// Relational placement primitives (DSL analogues)
// ---------------------------------------------------------------------------

/** radial_shapes: `count` points on a circle, evenly phased from `phase`. */
export function radialCluster(center: Vec2, radius: number, count: number, phaseRad: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = phaseRad + (i / count) * Math.PI * 2;
    out.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
  }
  return out;
}

/** distribute_along_axis: `count` points centred on `origin`, spaced along `dir`. */
export function distributeAlongAxis(origin: Vec2, dir: Vec2, spacing: number, count: number): Vec2[] {
  const out: Vec2[] = [];
  const start = -((count - 1) / 2) * spacing;
  for (let i = 0; i < count; i += 1) {
    const t = start + i * spacing;
    out.push([origin[0] + dir[0] * t, origin[1] + dir[1] * t]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Landmark frames — one per intercardinal quadrant, centres on the diagonals
// ---------------------------------------------------------------------------

export type LandmarkTag = 'nw' | 'ne' | 'sw' | 'se';

export type LandmarkFrame = Readonly<{
  tag: LandmarkTag;
  /** Grove centre: on the spawn diagonal at LANDMARK_RADIUS from arena centre. */
  center: Vec2;
  /** Unit vector pointing away from the arena centre. */
  outward: Vec2;
  /** Unit vector +90° from outward (tangential). */
  tangent: Vec2;
}>;

// HF-396 grew the island to +/-64 m (4x area); the landmark ring tracks the
// mid-map band between the research core (~6 m) and the beach ring (~45 m).
const LANDMARK_RADIUS = 26;

function makeFrame(tag: LandmarkTag, sx: -1 | 1, sz: -1 | 1): LandmarkFrame {
  const center: Vec2 = [sx * LANDMARK_RADIUS, sz * LANDMARK_RADIUS];
  const len = Math.hypot(center[0], center[1]);
  const outward: Vec2 = [center[0] / len, center[1] / len];
  // +90° rotation: (x,z) -> (-z? ) — use screen-consistent perp (oz, -ox).
  const tangent: Vec2 = [outward[1], -outward[0]];
  return { tag, center, outward, tangent };
}

export const FARCRYSIS_LANDMARKS: readonly LandmarkFrame[] = Object.freeze([
  makeFrame('nw', -1, -1),
  makeFrame('ne', 1, -1),
  makeFrame('sw', -1, 1),
  makeFrame('se', 1, 1),
]);

export function landmarkByTag(tag: LandmarkTag): LandmarkFrame {
  const frame = FARCRYSIS_LANDMARKS.find((f) => f.tag === tag);
  if (!frame) throw new Error(`unknown landmark tag: ${tag}`);
  return frame;
}

/** Place a point at local offsets (alongOutward*u + alongTangent*v). */
export function localToWorld(frame: LandmarkFrame, alongOutward: number, alongTangent: number): Vec2 {
  return [
    frame.center[0] + frame.outward[0] * alongOutward + frame.tangent[0] * alongTangent,
    frame.center[1] + frame.outward[1] * alongOutward + frame.tangent[1] * alongTangent,
  ];
}

// ---------------------------------------------------------------------------
// Composed placements — world-space, consumed by farcrysis.ts / -art.ts
// ---------------------------------------------------------------------------

/** Art-layer fringe row sits further out again, behind the builder hedgerow. */
export const LANDMARK_FRINGE_OUTWARD = 7.6;
/** Wall segments sit this far outboard of the grove centre. */
export const LANDMARK_WALL_OUTWARD = 5.2;
/** Crate faces sit just inside the wall's inner face (wall half-thickness 0.25 + crate half 0.85). */
export const LANDMARK_CRATE_OUTWARD = 4.1;
/** Hedgerow sits behind the wall. */
export const LANDMARK_HEDGE_OUTWARD = 6.3;
// 90°, 198°, 300° measured from outward toward tangent. Chosen so no trunk
// enters the wall/crate band (u > 2, |v| <= 3): the 330° blade used to put a
// trunk inside the solo crate's AABB in every quadrant, and the 210°/270°
// alternatives either re-collide or leave a diagonal without its blocker
// trunk (each grove must contribute one trunk with radial < 36 m onto its
// spawn diagonal — the 198° tree leans inward and provides it).
const TREE_ANGLES = [Math.PI / 2, Math.PI * (11 / 10), Math.PI * (5 / 3)];

/** 3 old-growth trees per landmark, radial cluster avoiding the inward axis. */
export function landmarkTreePositions(frame: LandmarkFrame): Vec2[] {
  return TREE_ANGLES.map((angle) => {
    // angle measured from outward toward tangent.
    const u = Math.cos(angle) * 3.0;
    const v = Math.sin(angle) * 3.0;
    return localToWorld(frame, u, v);
  });
}

export type WallSegmentSpec = Readonly<{
  key: string;
  pos: Vec2;
  /** World yaw of the segment's long axis (radians). */
  yaw: number;
  size: readonly [number, number, number];
  tilt: number;
}>;

/**
 * The broken ruin wall: two aligned segments with a central collapse gap.
 * Long axis lies along v (place_on_axis), both share the same u — they read
 * as ONE ruined structure with a fallen section, not two lone slabs.
 */
export function landmarkWallSpecs(frame: LandmarkFrame): readonly WallSegmentSpec[] {
  // THREE yaw θ maps a box's local +Z long axis to world (sinθ, cosθ), so a
  // segment laid along the tangent v needs θ = atan2(v.x, v.z).
  const tangentYaw = Math.atan2(frame.tangent[0], frame.tangent[1]);
  const parity = frame.tag === 'nw' || frame.tag === 'se' ? 1 : -1;
  const mk = (key: string, vOffset: number, tilt: number): WallSegmentSpec => ({
    key,
    pos: localToWorld(frame, LANDMARK_WALL_OUTWARD, vOffset),
    yaw: tangentYaw,
    size: [0.5, 1.6, 3.2],
    tilt,
  });
  return [
    mk('a', 2.0, 0.22 * parity),
    mk('b', -2.0, -0.18 * parity),
  ];
}

export type CratePlacement = Readonly<{
  tier: 0 | 1;
  pos: Vec2;
  yaw: number;
  /** true for the two-tier stack base (the wordmark plaque anchors here). */
  isStackBase: boolean;
}>;

/**
 * Crate cache against the wall's inner face: stack_shapes (two tiers) under
 * segment A, one single under segment B. Deterministic yaws.
 */
export function landmarkCratePlacements(frame: LandmarkFrame): readonly CratePlacement[] {
  const tangentYaw = Math.atan2(frame.tangent[0], frame.tangent[1]);
  const stackPos = localToWorld(frame, LANDMARK_CRATE_OUTWARD, 2.0);
  const singlePos = localToWorld(frame, LANDMARK_CRATE_OUTWARD, -2.0);
  return [
    { tier: 0, pos: stackPos, yaw: tangentYaw, isStackBase: true },
    { tier: 1, pos: stackPos, yaw: tangentYaw + 0.35, isStackBase: false },
    { tier: 0, pos: singlePos, yaw: tangentYaw - 0.22, isStackBase: false },
  ];
}

/** Hedgerow behind the wall (distribute_along_axis). */
export function landmarkHedgePositions(frame: LandmarkFrame): Vec2[] {
  return distributeAlongAxis(
    localToWorld(frame, LANDMARK_HEDGE_OUTWARD, 0),
    frame.tangent,
    1.6,
    4,
  );
}

/** Ferns scattered radially at the grove base. */
export function landmarkFernPositions(frame: LandmarkFrame): Vec2[] {
  return radialCluster(frame.center, 1.7, 6, frame.center[0] * 0.05 + frame.center[1] * 0.03);
}

/** Rubble rocks filling the wall's collapse gap (presentation-only). */
export function landmarkRubblePositions(frame: LandmarkFrame): Vec2[] {
  return [
    localToWorld(frame, LANDMARK_WALL_OUTWARD, 0.3),
    localToWorld(frame, LANDMARK_WALL_OUTWARD, -0.35),
  ];
}

// ---------------------------------------------------------------------------
// Wordmark anchors — the art layer's crate plaques derive from the SAME
// placement data as the colliders (previously a duplicated absolute table).
// ---------------------------------------------------------------------------

export type WordmarkAnchor = Readonly<{
  tag: LandmarkTag;
  /** Plaque centre in world space (already terrain-seated). */
  position: readonly [number, number, number];
  yaw: number;
}>;

/**
 * The plaque rides the STACK base crate's outer (+u) face. Yaw faces the
 * plaque outward, away from the arena centre.
 */
export function landmarkWordmarkAnchor(frame: LandmarkFrame): WordmarkAnchor {
  const stack = landmarkCratePlacements(frame)[0];
  // Plaque geometry is thin in local Z; yaw θ points its face along
  // (sinθ, cosθ), so facing outward u needs θ = atan2(u.x, u.z).
  const outwardYaw = Math.atan2(frame.outward[0], frame.outward[1]);
  const gx = stack.pos[0] + frame.outward[0] * 0.92;
  const gz = stack.pos[1] + frame.outward[1] * 0.92;
  const gy = farcrysisTerrainHeight(stack.pos[0], stack.pos[1]) + 0.95;
  return { tag: frame.tag, position: [gx, gy, gz], yaw: outwardYaw };
}

// ---------------------------------------------------------------------------
// Approach kit — the breakable interactables that belong to each landmark
// ---------------------------------------------------------------------------
//
// HF-395 round 2. The relational spine above landed in Pass 80, but the most
// visible mid-map props never joined it: addInteractables() in
// farcrysis-physics.ts still hand-listed the mid-ring crates, barrels and
// sandbags in ABSOLUTE coordinates, under comments describing a layout that
// no longer exists ("radius ~19 m" on props whose real radial is 38.2 m,
// "ruined wall N / S" when the walls are named nw/ne/sw/se). Measured
// consequences before this table existed:
//   - farcrysis-crate-17 at (-28,-26) sat 2.00 m from the NW grove centre and
//     2.12 m from the nearest grove trunk — a stray crate INSIDE the grove.
//   - farcrysis-crate-01 at (-34,-34) hung 3.7 m outboard of the NW fringe
//     row on the same diagonal — a lone extra crate off every landmark.
//
// The ids are unchanged (existing gates key off them); only the positions now
// derive from the shared frames. Each landmark carries the same SKELETON — a
// two-crate supply pair on the inward approach plus one picket piece further
// along the same flank — but the flank side and the picket KIND vary per
// quadrant, so the four quadrants stop reading as one arrangement stamped
// four times (the other residual the Pass 80 audit recorded).
//
// Local frame reminder: u = outward from the arena centre, v = tangent.
// Occupied bands are u >= 4.1 (crate cache, ruin wall, hedgerow, art fringe)
// and the grove trunks at (0,+3.0), (-2.85,-0.93), (+1.50,-2.60); the kit
// below sits on the INWARD approach with |v| >= 3.4, clear of all of them.

/** Inward-approach supply pair, crate A (nearest the grove). */
const LANDMARK_APPROACH_CRATE_A: Vec2 = [-2.6, 4.9];
/** Inward-approach supply pair, crate B (set back behind A). */
const LANDMARK_APPROACH_CRATE_B: Vec2 = [-4.7, 3.4];
/** Picket piece on the same flank, further along the tangent. */
const LANDMARK_APPROACH_PICKET: Vec2 = [-1.0, 6.2];
/** Weathered boulder framing the ruin outer flank (opposite the approach). */
const LANDMARK_BOULDER: Vec2 = [6.8, -8.4];

/**
 * Nothing that is not part of a landmark may sit this close to its centre.
 * Pinned by farcrysis-midmap-landmarks.test.ts. Measured headroom: the
 * nearest surviving unrelated props (farcrysis-crate-27/-28 and
 * farcrysis-barrel-15/-16, the mid-jungle pocket family) sit 8.49 m out on
 * the pure tangential bearing, so the radius has 0.49 m of margin.
 */
export const LANDMARK_KEEPOUT_RADIUS_M = 8.0;

export type LandmarkInteractableKind = 'crate' | 'barrel' | 'sandbag';

export type LandmarkInteractableSpec = Readonly<{
  tag: LandmarkTag;
  /** Slot within the kit — stable across quadrants. */
  slot: 'crate-a' | 'crate-b' | 'picket';
  /** The prop id addInteractables() registers. Unchanged from the old table. */
  id: string;
  kind: LandmarkInteractableKind;
  pos: Vec2;
  /** Crate cube side, sandbag wall width, or drum diameter (metres). */
  footprint: number;
}>;

/** Which tangential flank the approach kit occupies, per quadrant. */
function approachSide(tag: LandmarkTag): 1 | -1 {
  return tag === 'nw' || tag === 'sw' ? 1 : -1;
}

/** Which picket piece this quadrant carries, so the four are not identical. */
function picketKind(tag: LandmarkTag): LandmarkInteractableKind {
  return tag === 'nw' || tag === 'se' ? 'sandbag' : 'barrel';
}

/**
 * Prop ids per quadrant, preserving the ids the old absolute table used so no
 * existing gate, ballistic surface or cover id changes.
 *   crate-a  <- the old "mid-ring rotated square" crates 01-04
 *   crate-b  <- the old "jungle mid-ring diagonals" crates 17-20
 *   picket   <- the old mid-field barrels 09/10 and path sandbags 03/04
 */
const APPROACH_IDS: Readonly<Record<LandmarkTag, Readonly<{ crateA: string; crateB: string; picket: string }>>> = {
  nw: { crateA: 'farcrysis-crate-01', crateB: 'farcrysis-crate-17', picket: 'farcrysis-sandbag-03' },
  ne: { crateA: 'farcrysis-crate-04', crateB: 'farcrysis-crate-20', picket: 'farcrysis-barrel-10' },
  sw: { crateA: 'farcrysis-crate-03', crateB: 'farcrysis-crate-19', picket: 'farcrysis-barrel-09' },
  se: { crateA: 'farcrysis-crate-02', crateB: 'farcrysis-crate-18', picket: 'farcrysis-sandbag-04' },
};

/** Crate sizes carried over from the old table so silhouettes do not change. */
const APPROACH_CRATE_SIZES: Readonly<Record<LandmarkTag, readonly [number, number]>> = {
  nw: [1.0, 0.95],
  ne: [1.0, 0.9],
  sw: [1.0, 0.9],
  se: [1.0, 0.95],
};

/** Sandbag picket footprint (width) — matches the old placeSandbagWall call. */
export const LANDMARK_PICKET_SANDBAG_WIDTH_M = 2.2;
/** Sandbag picket depth and height — matches the old placeSandbagWall call. */
export const LANDMARK_PICKET_SANDBAG_HEIGHT_M = 0.6;
export const LANDMARK_PICKET_SANDBAG_DEPTH_M = 0.45;
/** Barrel picket footprint (drum diameter). */
export const LANDMARK_PICKET_BARREL_DIAMETER_M = 0.6;

/** The breakable interactables that belong to one landmark. */
export function landmarkInteractableSpecs(frame: LandmarkFrame): readonly LandmarkInteractableSpec[] {
  const side = approachSide(frame.tag);
  const ids = APPROACH_IDS[frame.tag];
  const [sizeA, sizeB] = APPROACH_CRATE_SIZES[frame.tag];
  const kind = picketKind(frame.tag);
  const at = (local: Vec2): Vec2 => localToWorld(frame, local[0], local[1] * side);
  return [
    { tag: frame.tag, slot: 'crate-a', id: ids.crateA, kind: 'crate', pos: at(LANDMARK_APPROACH_CRATE_A), footprint: sizeA },
    { tag: frame.tag, slot: 'crate-b', id: ids.crateB, kind: 'crate', pos: at(LANDMARK_APPROACH_CRATE_B), footprint: sizeB },
    {
      tag: frame.tag,
      slot: 'picket',
      id: ids.picket,
      kind,
      pos: at(LANDMARK_APPROACH_PICKET),
      footprint: kind === 'sandbag' ? LANDMARK_PICKET_SANDBAG_WIDTH_M : LANDMARK_PICKET_BARREL_DIAMETER_M,
    },
  ];
}

/** Every landmark approach kit, flattened (build-loop convenience). */
export function allLandmarkInteractableSpecs(): readonly LandmarkInteractableSpec[] {
  return FARCRYSIS_LANDMARKS.flatMap((frame) => landmarkInteractableSpecs(frame));
}

/**
 * The limestone boulder framing each ruin outer flank.
 *
 * Replaces farcrysis-rock-nw/-se, which were two lone ABSOLUTE boulders at
 * (-28,-40) and (28,40) — present in two of the four quadrants, so they broke
 * the four-fold composition outright. There are now four, one per landmark,
 * derived from the frames like everything else.
 */
export function landmarkBoulderPosition(frame: LandmarkFrame): Vec2 {
  const side = approachSide(frame.tag);
  return localToWorld(frame, LANDMARK_BOULDER[0], LANDMARK_BOULDER[1] * side);
}

/** Boulder footprint (width/depth) — carried over from the old rock covers. */
export const LANDMARK_BOULDER_SIZE_M = 2.2;

/**
 * Every world position this module authors for a landmark, in one list.
 * The coordination gate uses it to answer "is this prop part of a landmark?"
 * by POSITION rather than by an id regex — an id pattern can only prove a
 * prop was named after a landmark, never that it was placed by one.
 */
export function landmarkAuthoredPositions(frame: LandmarkFrame): Vec2[] {
  return [
    ...landmarkTreePositions(frame),
    ...landmarkWallSpecs(frame).map((w) => w.pos),
    ...landmarkCratePlacements(frame).map((c) => c.pos),
    ...landmarkHedgePositions(frame),
    ...landmarkFernPositions(frame),
    ...landmarkRubblePositions(frame),
    ...landmarkInteractableSpecs(frame).map((s) => s.pos),
    landmarkBoulderPosition(frame),
  ];
}
