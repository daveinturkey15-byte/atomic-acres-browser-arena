/**
 * ATOMIC ACRES REBUILD — InteriorsGray (walkable ground floors, graybox).
 *
 * Floor truth (read, in the references directory named in the task):
 * - `yellow-ground-cutaway.png` — yellow house: front living room with the
 *   street door + picture window, rear kitchen/dining, bath + box room along
 *   one flank, stairwell to the (out of scope) upper floor.
 * - `teal-ground-cutaway.png` — teal house: same front-living / rear-kitchen
 *   split, stairwell on the opposite flank, garage attached at the side.
 * - `living-room-eye.png` — front door opens straight into the living room;
 *   the kitchen/dining sits behind a wide cased opening, no door leaf.
 * - `bedroom-eye.png` — UPPER floor only. Out of scope for this pass; it pins
 *   nothing here and no stair is built.
 *
 * Where the plates are silent (exact partition lines, door leaves, room
 * names), both houses use straight double-loaded rectangles off a living-room
 * hub, and that substitution is stated here rather than hidden: living spans
 * the front band; kitchen / den / bath split the rear band along the street
 * axis; every rear room opens DIRECTLY off living (star topology, no hallway,
 * no sealed pocket). No furniture, no stairs, no uppers, no finishes.
 *
 * Shell facts: LayoutGray `02-layout-spark.md` dims (west 7.2 x 6.0 at
 * (-13.5, 1.5), east 7.8 x 6.4 at (13.5, -1.5)) as LANDED in
 * `src/atomic-acres-rebuild-arena.ts` — `w` along world x, `d` along world z,
 * fronts on the loop-facing faces (west front = +x face, east front = -x
 * face; assumption A2 there). Porch slabs and 1.0 m door-marker slabs sit on
 * those faces, centred on the house cz, door head 2.2 m.
 *
 * Reconciliation notes (all stated, all fenced):
 * 1. FACING (was assumption 1, now resolved): everything below is WORLD
 *    frame, fronts on the loop faces per the landed A2. The earlier +z-front
 *    draft never left this lane (uncommitted) and is fully superseded.
 * 2. Exterior shell walls are assumed 0.3 m thick (nuketown2 `WALL_T`); the
 *    inner faces this module rooms against move with that single constant.
 * 3. Interior partitions are 0.2 m graybox walls, 3.0 m storey, door head
 *    2.2 m — the nuketown2 ground band (capsule 1.82 m + autostep clears
 *    2.2 m with margin). Door-marker head matches at 2.2 m.
 * 4. PORCH: my porch rect matches their slab EXACTLY (2.0 m outboard of the
 *    face, 90% of depth about cz). The 0.45 m step is NOTED here
 *    (`REBUILD_PORCH_STEP_M`); their slab top sits at 0.3 m. The 0.15 m delta
 *    is the orchestrator's call — porch construction is LayoutGray's.
 * 5. FRONT PORTAL is 1.0 m wide, centred on cz — exactly their marker width —
 *    and satisfies the >= 0.95 m carve rule. The carve itself stays
 *    LayoutGray's (shell boxes are theirs); this module specifies it and owns
 *    the matching movement/shot authority per their A2.
 * 6. Spawns stay outside: this module exports NO spawn layout (AuthorityGray
 *    owns spawns) and every room rect is strictly inside its shell.
 *
 * Authority contract (for AuthorityGray / the orchestrator):
 * - Interior walls ARE gameplay authority. `buildAtomicAcresRebuildInteriors`
 *   emits through `box()` with solid+shots, so each movement collider,
 *   physics collider and ballistic surface shares the mesh's own bounds
 *   object — exact match by construction, in both graphics profiles (no
 *   profile-conditional geometry anywhere here).
 * - Lintels above door heads emit shots:true, solid:false: shots above the
 *   head are stopped, movement passes under.
 *   `atomicAcresRebuildInteriorAuthority` exposes the same rects
 *   (`kind: 'solid'` = movement + shot, `'lintel'` = shot-only) if
 *   AuthorityGray prefers to commit them itself. The rects repeat the part
 *   records' own centre-minus-half-size arithmetic bit-for-bit.
 * - Wiring point: AuthorityGray calls EITHER the build function at
 *   authority-commit time (NOT inside LayoutGray's presentation pass, whose
 *   authority stays empty per its spec) OR consumes the rect export.
 *   This module touches no other file.
 */

import * as THREE from 'three';
import { box, standard, type Builder } from './additional-maps';

/** SPREAD 1.6x (owner feel 2026-09-15): every plan (x/z) centre and extent.
 * Heights never scale. Single source: LayoutGray, AuthorityGray and emission
 * below all read this, so visual and collider frames stay bit-identical. */
export const ATOMIC_ACRES_REBUILD_SPREAD = 1.6;

export type RebuildHouseId = 'west' | 'east';
export type RebuildRoomId = 'living' | 'kitchen' | 'bath';
export type RebuildNodeId = RebuildRoomId | 'porch';

export const REBUILD_INTERIOR_WALL_T = 0.2;
/** Assumed exterior shell wall thickness (m) — note 2 above. */
export const REBUILD_SHELL_WALL_T = 0.3;
/** Ground-storey clear height (m). */
export const REBUILD_STOREY_H = 3.0;
/** Interior door clear head (m). */
export const REBUILD_DOOR_HEAD_Y = 2.2;
/** Interior door clear width (m). */
export const REBUILD_INTERIOR_DOOR_W = 1.0;
/** Wide cased openings for the concept open great-room (living/kitchen/den flow). */
export const REBUILD_WIDE_OPENING_W = 2.4;
/** Front-door portal width (m) — matches the landed marker, >= 0.95 rule. */
export const REBUILD_FRONT_DOOR_W = 1.0;
/** Porch step noted for LayoutGray (m) — note 4 above. */
export const REBUILD_PORCH_STEP_M = 0.45;

export interface RebuildHouseSpec {
  readonly house: RebuildHouseId;
  /** Shell centre, world (LayoutGray dims). */
  readonly cx: number;
  readonly cz: number;
  /** Shell size: w along world x, d along world z. */
  readonly w: number;
  readonly d: number;
  /** Loop-facing front: +1 = +x face (west), -1 = -x face (east). */
  readonly face: 1 | -1;
  /** Living-room depth from the inner front face. */
  readonly livingDepth: number;
}

export const ATOMIC_ACRES_REBUILD_HOUSES: readonly RebuildHouseSpec[] = Object.freeze([
  // Open-plan great-rooms (concept cutaways): deep living + compact rear
  // galley/bath; the den lives upstairs as a future study, not chopped
  // out of the ground floor.
  Object.freeze({ house: 'west', cx: -13.5, cz: 1.5, w: 7.2, d: 6.0, face: 1, livingDepth: 4.2 }),
  Object.freeze({ house: 'east', cx: 13.5, cz: -1.5, w: 7.8, d: 6.4, face: -1, livingDepth: 4.3 }),
] as const);

export interface RebuildRoomSpec {
  readonly house: RebuildHouseId;
  readonly id: RebuildRoomId;
  /** World-frame rect. */
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/**
 * Doorway shape mirrors NUKETOWN2_DOORWAYS (`span`/`centre`/`at`) plus the
 * graph endpoints the porch-rooted reachability walk needs. `span: 'x'` gaps
 * run along x in the wall plane z = `at`; `span: 'z'` gaps run along z in
 * the wall plane x = `at`. All coordinates world frame.
 */
export interface RebuildDoorwaySpec {
  readonly id: string;
  readonly house: RebuildHouseId;
  readonly span: 'x' | 'z';
  readonly centre: number;
  readonly at: number;
  readonly width: number;
  readonly headY: number;
  readonly floorY: number;
  readonly from: RebuildNodeId;
  readonly to: RebuildNodeId;
}

/** Solid upright wall box, world frame. Shot-only lintels live separately. */
export interface RebuildWallSpec {
  readonly id: string;
  readonly house: RebuildHouseId;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** World-frame authority rect (movement + shot, or shot-only for lintels). */
export interface RebuildAuthorityRect {
  readonly house: RebuildHouseId;
  readonly kind: 'solid' | 'lintel';
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly minY: number;
  readonly maxY: number;
}

/** Porch specification for LayoutGray — specified here, built there. */
export interface RebuildPorchSpec {
  readonly house: RebuildHouseId;
  /** World-frame slab rect (matches the landed slab footprint exactly). */
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly stepM: number;
}

interface HouseFrame {
  /** Inner faces of the assumed 0.3 m exterior shell, world. */
  innerFront: number;
  innerRear: number;
  xLo: number;
  xHi: number;
  zLo: number;
  zHi: number;
  /** Front wall plane (outer), world x. */
  frontPlane: number;
  /** Cross-partition wall plane (x) between living and the rear band. */
  partitionX: number;
}

export function houseFrame(spec: RebuildHouseSpec): HouseFrame {
  const frontPlane = spec.cx + spec.face * (spec.w / 2);
  const rearPlane = spec.cx - spec.face * (spec.w / 2);
  const innerFront = frontPlane - spec.face * REBUILD_SHELL_WALL_T;
  const innerRear = rearPlane + spec.face * REBUILD_SHELL_WALL_T;
  return {
    innerFront,
    innerRear,
    xLo: Math.min(innerFront, innerRear),
    xHi: Math.max(innerFront, innerRear),
    zLo: spec.cz - spec.d / 2 + REBUILD_SHELL_WALL_T,
    zHi: spec.cz + spec.d / 2 - REBUILD_SHELL_WALL_T,
    frontPlane,
    partitionX: innerFront - spec.face * spec.livingDepth,
  };
}

/** Bath straddles the house centreline along z; half-width 0.8 m. */
const BATH_HALF_W = 0.8;

export const ATOMIC_ACRES_REBUILD_ROOMS: readonly RebuildRoomSpec[] = Object.freeze(
  ATOMIC_ACRES_REBUILD_HOUSES.flatMap((spec) => {
    const frame = houseFrame(spec);
    const t = REBUILD_INTERIOR_WALL_T;
    const partFront = frame.partitionX + spec.face * (t / 2);
    const partRear = frame.partitionX - spec.face * (t / 2);
    return [
      Object.freeze({
        house: spec.house, id: 'living',
        x0: Math.min(frame.innerFront, partFront), x1: Math.max(frame.innerFront, partFront),
        z0: frame.zLo, z1: frame.zHi,
      }),
      Object.freeze({
        house: spec.house, id: 'kitchen',
        x0: Math.min(frame.innerRear, partRear), x1: Math.max(frame.innerRear, partRear),
        z0: frame.zLo, z1: spec.cz - BATH_HALF_W - t / 2,
      }),
      Object.freeze({
        house: spec.house, id: 'bath',
        x0: Math.min(frame.innerRear, partRear), x1: Math.max(frame.innerRear, partRear),
        z0: spec.cz - BATH_HALF_W + t / 2, z1: spec.cz + BATH_HALF_W - t / 2,
      }),
    ] as const;
  }),
);

export const ATOMIC_ACRES_REBUILD_DOORWAYS: readonly RebuildDoorwaySpec[] = Object.freeze(
  ATOMIC_ACRES_REBUILD_HOUSES.flatMap((spec) => {
    const frame = houseFrame(spec);
    const t = REBUILD_INTERIOR_WALL_T;
    const kitchenCz = (frame.zLo + (spec.cz - BATH_HALF_W - t / 2)) / 2;
    return [
      Object.freeze({
        id: `${spec.house} front door`, house: spec.house, span: 'z',
        centre: spec.cz, at: frame.frontPlane, width: REBUILD_FRONT_DOOR_W,
        headY: REBUILD_DOOR_HEAD_Y, floorY: 0, from: 'porch', to: 'living',
      }),
      Object.freeze({
        id: `${spec.house} living to kitchen`, house: spec.house, span: 'z',
        centre: kitchenCz, at: frame.partitionX, width: REBUILD_WIDE_OPENING_W,
        headY: REBUILD_DOOR_HEAD_Y, floorY: 0, from: 'living', to: 'kitchen',
      }),
      Object.freeze({
        id: `${spec.house} living to bath`, house: spec.house, span: 'z',
        centre: spec.cz, at: frame.partitionX, width: REBUILD_INTERIOR_DOOR_W,
        headY: REBUILD_DOOR_HEAD_Y, floorY: 0, from: 'living', to: 'bath',
      }),
    ] as const;
  }),
);

type GapRun = readonly [number, number];

/** Subtract doorway gaps from a wall run; drops slivers <= 0.05 m. */
function subtractGaps(run: GapRun, gaps: readonly GapRun[]): GapRun[] {
  const ordered = [...gaps].sort((a, b) => a[0] - b[0]);
  const out: GapRun[] = [];
  let cursor = run[0];
  for (const gap of ordered) {
    if (gap[0] > cursor) out.push([cursor, Math.min(gap[0], run[1])] as const);
    cursor = Math.max(cursor, gap[1]);
  }
  if (cursor < run[1]) out.push([cursor, run[1]] as const);
  return out.filter(([a, b]) => b - a > 0.05);
}

export const ATOMIC_ACRES_REBUILD_WALLS: readonly RebuildWallSpec[] = Object.freeze(
  ATOMIC_ACRES_REBUILD_HOUSES.flatMap((spec) => {
    const frame = houseFrame(spec);
    const t = REBUILD_INTERIOR_WALL_T;
    const gaps: GapRun[] = ATOMIC_ACRES_REBUILD_DOORWAYS.filter(
      (door) => door.house === spec.house && door.span === 'z' && door.at === frame.partitionX,
    ).map((door) => [door.centre - door.width / 2, door.centre + door.width / 2] as const);
    // Dining nook: the old den frontage stays fully open to the living room
    // (no wall, no lintel) so the great-room flows around the bath box.
    gaps.push([spec.cz + BATH_HALF_W + t / 2, frame.zHi] as const);
    const cross: RebuildWallSpec[] = subtractGaps([frame.zLo, frame.zHi], gaps).map((run, index) =>
      Object.freeze({
        id: `${spec.house} cross partition ${index}`, house: spec.house,
        x0: frame.partitionX - t / 2, x1: frame.partitionX + t / 2, z0: run[0], z1: run[1],
      }),
    );
    const partRear = frame.partitionX - spec.face * (t / 2);
    const flankX0 = Math.min(frame.innerRear, partRear);
    const flankX1 = Math.max(frame.innerRear, partRear);
    const bathSouth: RebuildWallSpec = Object.freeze({
      id: `${spec.house} bath south`, house: spec.house,
      x0: flankX0, x1: flankX1,
      z0: spec.cz - BATH_HALF_W - t / 2, z1: spec.cz - BATH_HALF_W + t / 2,
    });
    const bathNorth: RebuildWallSpec = Object.freeze({
      id: `${spec.house} bath north`, house: spec.house,
      x0: flankX0, x1: flankX1,
      z0: spec.cz + BATH_HALF_W - t / 2, z1: spec.cz + BATH_HALF_W + t / 2,
    });
    return [...cross, bathSouth, bathNorth];
  }),
);

export const ATOMIC_ACRES_REBUILD_PORCHES: readonly RebuildPorchSpec[] = Object.freeze(
  ATOMIC_ACRES_REBUILD_HOUSES.map((spec) => {
    const frame = houseFrame(spec);
    const outboard = frame.frontPlane + spec.face * 2.0;
    return Object.freeze({
      house: spec.house,
      x0: Math.min(frame.frontPlane, outboard), x1: Math.max(frame.frontPlane, outboard),
      z0: spec.cz - spec.d * 0.45, z1: spec.cz + spec.d * 0.45,
      stepM: REBUILD_PORCH_STEP_M,
    });
  }),
);

export function houseSpec(house: RebuildHouseId): RebuildHouseSpec {
  const found = ATOMIC_ACRES_REBUILD_HOUSES.find((entry) => entry.house === house);
  if (!found) throw new Error(`Unknown rebuild house: ${house}`);
  return found;
}

/** The front-door portal LayoutGray must carve, per house. */
export function frontDoorSpec(house: RebuildHouseId): RebuildDoorwaySpec {
  const found = ATOMIC_ACRES_REBUILD_DOORWAYS.find(
    (door) => door.house === house && door.from === 'porch',
  );
  if (!found) throw new Error(`Missing front door spec: ${house}`);
  return found;
}

/** Front-door carve point for LayoutGray, world frame. */
export interface RebuildFrontPortal {
  readonly house: RebuildHouseId;
  /** Loop-facing shell face the portal must be carved in. */
  readonly face: 1 | -1;
  /** Wall plane (x) of that face. */
  readonly planeX: number;
  /** Gap centre along the face (z). */
  readonly centreZ: number;
  readonly width: number;
  readonly headY: number;
}
export function frontDoorPortal(house: RebuildHouseId): RebuildFrontPortal {
  const spec = houseSpec(house);
  const door = frontDoorSpec(house);
  return { house, face: spec.face, planeX: door.at, centreZ: door.centre, width: door.width, headY: door.headY };
}

/**
 * Single source for emission AND authority: one world-frame part list, so the
 * collider rects repeat the mesh bounds' own arithmetic (centre minus
 * half-size) bit-for-bit instead of re-deriving corners in a new order.
 */
interface RebuildPart {
  readonly name: string;
  readonly house: RebuildHouseId;
  readonly cx: number;
  readonly cz: number;
  readonly sx: number;
  readonly sz: number;
  readonly y0: number;
  readonly y1: number;
  readonly lintel: boolean;
}

function rebuildParts(): RebuildPart[] {
  const t = REBUILD_INTERIOR_WALL_T;
  return ATOMIC_ACRES_REBUILD_HOUSES.flatMap((spec) => {
    const walls: RebuildPart[] = ATOMIC_ACRES_REBUILD_WALLS.filter(
      (wall) => wall.house === spec.house,
    ).map((wall) => ({
      name: `atomic-acres-rebuild house interior ${wall.id}`,
      house: spec.house,
      cx: (wall.x0 + wall.x1) / 2, cz: (wall.z0 + wall.z1) / 2,
      sx: wall.x1 - wall.x0, sz: wall.z1 - wall.z0,
      y0: 0, y1: REBUILD_STOREY_H, lintel: false,
    }));
    const lintels: RebuildPart[] = ATOMIC_ACRES_REBUILD_DOORWAYS.filter(
      (door) => door.house === spec.house && door.span === 'z' && door.from !== 'porch',
    ).map((door) => ({
      name: `atomic-acres-rebuild house interior lintel ${door.id}`,
      house: spec.house,
      cx: door.at, cz: door.centre, sx: t, sz: door.width,
      y0: door.headY, y1: REBUILD_STOREY_H, lintel: true,
    }));
    // Upper partitions (y 3..6) + their lintels (head 5.2..6).
    const upper: RebuildPart[] = upperWalls(spec.house).map((wall) => ({
      name: `atomic-acres-rebuild house upper ${wall.id}`,
      house: spec.house,
      cx: (wall.x0 + wall.x1) / 2, cz: (wall.z0 + wall.z1) / 2,
      sx: wall.x1 - wall.x0, sz: wall.z1 - wall.z0,
      y0: REBUILD_UPPER_FLOOR_Y, y1: REBUILD_UPPER_TOP_Y, lintel: false,
    }));
    const upperLintels: RebuildPart[] = upperDoors(spec.house).filter(
      (door) => door.from !== 'stairtop',
    ).map((door) => ({
      name: `atomic-acres-rebuild house upper lintel ${door.id}`,
      house: spec.house,
      cx: door.span === 'z' ? door.at : door.centre,
      cz: door.span === 'z' ? door.centre : door.at,
      sx: door.span === 'z' ? t : door.width,
      sz: door.span === 'z' ? door.width : t,
      y0: REBUILD_UPPER_DOOR_HEAD_Y, y1: REBUILD_UPPER_TOP_Y, lintel: true,
    }));
    // Stair treads (solid climbable steps, 0.2 risers over the 0.42 autostep).
    const stair = stairSpec(spec.house);
    const steps: RebuildPart[] = Array.from({ length: REBUILD_STAIR_STEPS }, (_, i) => ({
      name: `atomic-acres-rebuild house stair ${spec.house} step ${i}`,
      house: spec.house,
      cx: (stair.x0 + stair.x1) / 2, cz: stair.zA + i * REBUILD_STAIR_TREAD + REBUILD_STAIR_TREAD / 2,
      sx: stair.x1 - stair.x0, sz: REBUILD_STAIR_TREAD,
      y0: 0, y1: REBUILD_STAIR_RISER * (i + 1), lintel: false,
    }));
    // Upper floor slabs (top at 3.0) with the stairwell hole (see upperSlabs).
    const slabs: RebuildPart[] = upperSlabs(spec.house).map((slab, index) => ({
      name: `atomic-acres-rebuild house upper slab ${spec.house} ${index}`,
      house: spec.house,
      cx: (slab.x0 + slab.x1) / 2, cz: (slab.z0 + slab.z1) / 2,
      sx: slab.x1 - slab.x0, sz: slab.z1 - slab.z0,
      y0: REBUILD_UPPER_FLOOR_Y - REBUILD_UPPER_SLAB_T, y1: REBUILD_UPPER_FLOOR_Y, lintel: false,
    }));
    // Stairwell guard rail on the landing side (1 m, solid).
    const rail: RebuildPart = {
      name: `atomic-acres-rebuild house stair rail ${spec.house}`,
      house: spec.house,
      cx: stair.x1 + spec.face * (REBUILD_RAIL_T / 2), cz: (stair.zA + stair.zB) / 2,
      sx: REBUILD_RAIL_T, sz: stair.zB - stair.zA,
      y0: REBUILD_UPPER_FLOOR_Y, y1: REBUILD_UPPER_FLOOR_Y + REBUILD_RAIL_H, lintel: false,
    };
    // Garage shells (0..2.8) + personnel link lintels (shots-only).
    const garage: RebuildPart[] = garageWalls(spec.house).map((wall) => ({
      name: `atomic-acres-rebuild garage ${wall.id}`,
      house: spec.house,
      cx: (wall.x0 + wall.x1) / 2, cz: (wall.z0 + wall.z1) / 2,
      sx: wall.x1 - wall.x0, sz: wall.z1 - wall.z0,
      y0: 0, y1: REBUILD_GARAGE_H, lintel: false,
    }));
    const garageLink = garageSpec(spec.house);
    // Personnel link spans two wall planes (garage face + house rear face).
    const linkFaceX = spec.face === 1 ? garageLink.cx + REBUILD_GARAGE_W / 2 : garageLink.cx - REBUILD_GARAGE_W / 2;
    const linkRearX = spec.cx - spec.face * (spec.w / 2);
    const linkLintels: RebuildPart[] = [linkFaceX, linkRearX].map((planeX, index) => ({
      name: `atomic-acres-rebuild garage link lintel ${spec.house} ${index}`,
      house: spec.house,
      cx: planeX, cz: (garageLink.linkZ0 + garageLink.linkZ1) / 2,
      sx: REBUILD_SHELL_WALL_T, sz: garageLink.linkZ1 - garageLink.linkZ0,
      y0: REBUILD_DOOR_HEAD_Y, y1: REBUILD_GARAGE_H, lintel: true,
    }));
    return [...walls, ...lintels, ...upper, ...upperLintels, ...steps, ...slabs, rail, ...garage, ...linkLintels];
  });
}

/** World-frame authority rects. `solid` stops movement + shots; `lintel` shots only. */
export function atomicAcresRebuildInteriorAuthority(): readonly RebuildAuthorityRect[] {
  // Arithmetic mirrors box() bit-for-bit: it receives center [cx*S, ...] and
  // size [sx*S, ...] and stores position +/- size/2, so the rects must apply
  // SPREAD to the operands in the same order, not to the unscaled result.
  const S = ATOMIC_ACRES_REBUILD_SPREAD;
  return Object.freeze(
    rebuildParts().map((part) =>
      Object.freeze({
        house: part.house, kind: part.lintel ? 'lintel' : 'solid',
        x0: part.cx * S - (part.sx * S) / 2, x1: part.cx * S + (part.sx * S) / 2,
        z0: part.cz * S - (part.sz * S) / 2, z1: part.cz * S + (part.sz * S) / 2,
        minY: part.y0, maxY: part.y1,
      }),
    ),
  );
}

/** Porch-rooted reachability: every room must be visitable from its porch. */
export function rebuildReachableRooms(house: RebuildHouseId): RebuildRoomId[] {
  const doors = ATOMIC_ACRES_REBUILD_DOORWAYS.filter((door) => door.house === house);
  const seen = new Set<string>(['porch']);
  const queue: string[] = ['porch'];
  while (queue.length > 0) {
    const node = queue.pop()!;
    for (const door of doors) {
      const next = door.from === node ? door.to : door.to === node ? door.from : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return ATOMIC_ACRES_REBUILD_ROOMS.filter((room) => room.house === house && seen.has(room.id)).map(
    (room) => room.id,
  );
}

/**
 * Emit both houses' interior partitions through `box()` — solid + shots for
 * uprights (movement + shot authority), shots-only for lintels — so movement
 * colliders, physics colliders and ballistic surfaces share each mesh's
 * bounds exactly. Call at AUTHORITY-commit time (AuthorityGray), never inside
 * LayoutGray's presentation pass. No Math.random anywhere: deterministic.
 * Returns the emitted meshes.
 */
export function buildAtomicAcresRebuildInteriors(builder: Builder): THREE.Mesh[] {
  const gray = standard(0x8f9296);
  const S = ATOMIC_ACRES_REBUILD_SPREAD;
  return rebuildParts().map((part) =>
    box(
      builder,
      part.name,
      [part.cx * S, (part.y0 + part.y1) / 2, part.cz * S],
      [part.sx * S, part.y1 - part.y0, part.sz * S],
      gray,
      { solid: !part.lintel, shots: true, ballisticMaterial: 'interior-wall' },
    ),
  );
}

// ---------------------------------------------------------------------------
// Upper storey, stairs and garage link (concept cutaways, ground truth above).
// Greybox massing only: shells stay hollow, partitions 0.2 m, doors 1.0 m,
// wide great-room openings already landed above. Blender/Trellis dress later.
// ---------------------------------------------------------------------------

export const REBUILD_STAIR_STEPS = 15;
export const REBUILD_STAIR_RISER = 0.2;
export const REBUILD_STAIR_TREAD = 0.3;
export const REBUILD_STAIR_WIDTH = 1.1;
export const REBUILD_UPPER_FLOOR_Y = 3.0;
export const REBUILD_UPPER_TOP_Y = 6.0;
export const REBUILD_UPPER_DOOR_HEAD_Y = 5.2;
export const REBUILD_UPPER_SLAB_T = 0.25;
export const REBUILD_RAIL_H = 1.0;
export const REBUILD_RAIL_T = 0.1;
export const REBUILD_GARAGE_WALL_T = 0.25;
export const REBUILD_GARAGE_H = 2.8;
export const REBUILD_GARAGE_W = 3.4;
export const REBUILD_GARAGE_D = 5.0;

export type RebuildUpperRoomId = 'rearBed' | 'bathUp' | 'landing';
export type RebuildUpperNodeId = RebuildUpperRoomId | 'stairtop';

export interface RebuildStairSpec {
  readonly house: RebuildHouseId;
  readonly x0: number;
  readonly x1: number;
  readonly zA: number;
  readonly zB: number;
}

/** Straight run in the living room along the partition, rising toward the rear band. */
export function stairSpec(house: RebuildHouseId): RebuildStairSpec {
  const spec = houseSpec(house);
  const frame = houseFrame(spec);
  const runXa = frame.partitionX + spec.face * 0.25;
  const runXb = runXa + spec.face * REBUILD_STAIR_WIDTH;
  const zA = frame.zLo + 0.45;
  return {
    house,
    x0: Math.min(runXa, runXb), x1: Math.max(runXa, runXb),
    zA, zB: zA + REBUILD_STAIR_STEPS * REBUILD_STAIR_TREAD,
  };
}

export interface RebuildUpperSlab {
  readonly house: RebuildHouseId;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/** Upper floor slabs (top at 3.0) with the stairwell hole left open. */
export function upperSlabs(house: RebuildHouseId): readonly RebuildUpperSlab[] {
  const spec = houseSpec(house);
  const frame = houseFrame(spec);
  const stair = stairSpec(house);
  const slabs = [
    { x0: frame.xLo, x1: stair.x0, z0: frame.zLo, z1: frame.zHi },
    { x0: stair.x0, x1: stair.x1, z0: stair.zB, z1: frame.zHi },
    { x0: stair.x1, x1: frame.xHi, z0: frame.zLo, z1: frame.zHi },
    { x0: stair.x0, x1: stair.x1, z0: frame.zLo, z1: stair.zA },
  ];
  return Object.freeze(slabs.map((slab) => Object.freeze({ house, ...slab })));
}

export interface RebuildUpperDoor {
  readonly id: string;
  readonly house: RebuildHouseId;
  readonly span: 'x' | 'z';
  readonly centre: number;
  readonly at: number;
  readonly width: number;
  readonly from: RebuildUpperNodeId;
  readonly to: RebuildUpperNodeId;
}

/** Upper doors: U1 front-bedroom door, U2 bedroom + bath doors, stair arrival. */
export function upperDoors(house: RebuildHouseId): readonly RebuildUpperDoor[] {
  const spec = houseSpec(house);
  const frame = houseFrame(spec);
  const stair = stairSpec(house);
  const bathZ0 = stair.zB - 2.2;
  const bedZ = frame.zLo + 1.4;
  const bathZ = bathZ0 + 1.1;
  return Object.freeze([
    Object.freeze({ id: `${house} stair arrival`, house, span: 'x' as const, centre: (stair.x0 + stair.x1) / 2, at: stair.zB - 0.15, width: REBUILD_STAIR_WIDTH, from: 'stairtop' as const, to: 'landing' as const }),
    Object.freeze({ id: `${house} landing to rearBed`, house, span: 'z' as const, centre: bedZ, at: frame.partitionX, width: REBUILD_INTERIOR_DOOR_W, from: 'landing' as const, to: 'rearBed' as const }),
    Object.freeze({ id: `${house} landing to bathUp`, house, span: 'z' as const, centre: bathZ, at: frame.partitionX, width: REBUILD_INTERIOR_DOOR_W, from: 'landing' as const, to: 'bathUp' as const }),
  ]);
}

/** Upper partition walls (0.2 m, y 3..6): U2 flank on the ground partition, U3 bath cross. No U1: the stair arrives onto open landing. */
export function upperWalls(house: RebuildHouseId): readonly RebuildWallSpec[] {
  const spec = houseSpec(house);
  const frame = houseFrame(spec);
  const stair = stairSpec(house);
  const t = REBUILD_INTERIOR_WALL_T;
  const bathZ0 = stair.zB - 2.2;
  const bedZ = frame.zLo + 1.4;
  const bathZ = bathZ0 + 1.1;
  const u2: RebuildWallSpec[] = subtractGaps([frame.zLo, stair.zB], [[bedZ - 0.5, bedZ + 0.5], [bathZ - 0.5, bathZ + 0.5]]).map((run, index) =>
    Object.freeze({ id: `${house} upper flank ${index}`, house, x0: frame.partitionX - t / 2, x1: frame.partitionX + t / 2, z0: run[0], z1: run[1] }),
  );
  const u3: RebuildWallSpec = Object.freeze({
    id: `${house} upper bath cross`, house,
    x0: frame.xLo, x1: frame.partitionX, z0: bathZ0 - t / 2, z1: bathZ0 + t / 2,
  });
  return Object.freeze([...u2, u3]);
}

export function garageWalls(house: RebuildHouseId): readonly RebuildWallSpec[] {
  const garage = garageSpec(house);
  const spec = houseSpec(house);
  const t = REBUILD_GARAGE_WALL_T;
  const x0 = garage.cx - REBUILD_GARAGE_W / 2;
  const x1 = garage.cx + REBUILD_GARAGE_W / 2;
  const z0 = garage.cz - REBUILD_GARAGE_D / 2;
  const z1 = garage.cz + REBUILD_GARAGE_D / 2;
  const linkSide = spec.face === 1 ? x1 : x0;
  const farSide = spec.face === 1 ? x0 : x1;
  const linkRuns = subtractGaps([z0, z1], [[garage.linkZ0, garage.linkZ1]]);
  const walls: RebuildWallSpec[] = [
    Object.freeze({ id: `${house} garage north`, house, x0, x1, z0: z1 - t, z1 }),
    Object.freeze({ id: `${house} garage south`, house, x0, x1, z0, z1: z0 + t }),
    Object.freeze({ id: `${house} garage far`, house, x0: spec.face === 1 ? farSide : farSide - t, x1: spec.face === 1 ? farSide + t : farSide, z0, z1 }),
    ...linkRuns.map((run, index) =>
      Object.freeze({ id: `${house} garage link ${index}`, house, x0: spec.face === 1 ? linkSide - t : linkSide, x1: spec.face === 1 ? linkSide : linkSide + t, z0: run[0], z1: run[1] }),
    ),
  ];
  return Object.freeze(walls);
}

export interface RebuildUpperRoomSpec {
  readonly house: RebuildHouseId;
  readonly id: RebuildUpperRoomId;
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}
export function upperRooms(house: RebuildHouseId): readonly RebuildUpperRoomSpec[] {
  const spec = houseSpec(house);
  const frame = houseFrame(spec);
  const stair = stairSpec(house);
  const bathZ0 = stair.zB - 2.2;
  return Object.freeze([
    Object.freeze({ house, id: 'rearBed' as const, x0: frame.xLo, x1: frame.partitionX, z0: frame.zLo, z1: bathZ0 }),
    Object.freeze({ house, id: 'bathUp' as const, x0: frame.xLo, x1: frame.partitionX, z0: bathZ0, z1: stair.zB }),
    Object.freeze({ house, id: 'landing' as const, x0: frame.partitionX, x1: frame.xHi, z0: frame.zLo, z1: frame.zHi }),
  ]);
}
/** Landing-rooted reachability upstairs: stairtop arrives onto the landing, two doors off it. */
export function upperReachableRooms(house: RebuildHouseId): RebuildUpperRoomId[] {
  const doors = upperDoors(house);

  const seen = new Set<string>(['stairtop', 'landing']);
  const queue: string[] = ['landing'];
  while (queue.length > 0) {
    const node = queue.pop()!;
    for (const door of doors) {
      const next = door.from === node ? door.to : door.to === node ? door.from : null;
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  const ids: RebuildUpperRoomId[] = ['rearBed', 'bathUp', 'landing'];
  return ids.filter((id) => seen.has(id));
}

export interface RebuildGarageSpec {
  readonly house: RebuildHouseId;
  readonly cx: number;
  readonly cz: number;
  /** Personnel link-door gap (world z range) shared with the house rear wall. */
  readonly linkZ0: number;
  readonly linkZ1: number;
}

/** Attached garages flank BOTH houses; personnel door links garage to living room. */
export function garageSpec(house: RebuildHouseId): RebuildGarageSpec {
  const spec = houseSpec(house);
  const west = house === 'west';
  const cx = west ? -18.9 : 19.2;
  return { house, cx, cz: spec.cz, linkZ0: spec.cz - 0.5, linkZ1: spec.cz + 0.5 };
}


/** House rear-wall split at the garage link door (LayoutGray + AuthorityGray share). */
export function rearLinkGap(house: RebuildHouseId): GapRun {
  const garage = garageSpec(house);
  return [garage.linkZ0, garage.linkZ1] as const;
}
