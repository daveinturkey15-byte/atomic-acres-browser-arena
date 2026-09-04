/**
 * nuketown2-interior-look.ts — PASS 96: the dark-interior lighting look for
 * both Nuke Town Rebuild houses, after threejs-webgpu-interior-lighting-look.
 *
 * WHAT IT ADDS. Ceiling fixtures already exist as emissive lenses (HF-440
 * Cycle 2); this lane completes the skill's recipe at zero light-source cost:
 *   1. table lamps as emissive bodies in both ground rooms (shades reuse the
 *      shared warm ceiling-light material, so their intensity IS the one
 *      uniform every fixture reads);
 *   2. a value plan per room (lit lanes get the fixtures, corners stay dark);
 *   3. skirting grime at the floor/wall junctions, through the existing decal
 *      path (`nuketown2GrimeDecals`, wall-grime family, -3 tier).
 *
 * WHAT IT DOES NOT ADD. No dynamic light (no PointLight/SpotLight; the
 * clustered lane owns real lights), no new material (every row reuses a
 * material the caller passes in), no new render pipeline (the pipeline-budget
 * gate's distinct-graph count is untouched), no per-frame work (static
 * geometry merged by `batchPresentationOnlyBoxes`, one static uniform never
 * written in the frame loop). Upper rooms keep their ceiling lens only: their
 * corners read dark by construction, and a vertical upper-floor strip would
 * break the wall-grime top rule the grime gate pins, so it is cut scope,
 * recorded OPEN in the pass report rather than solved by touching the gate.
 *
 * Everything is authored ONCE and emitted through `pair()`, presentation-only
 * (`solid: false, shots: false, cast: false`), so both houses match by
 * construction and the coplanar instrument stays at HOUSE-INTERIOR 0: every
 * new top face below initials its gap against the walking slab (0.08) and the
 * baseboard line (0.14) in the plan table, and the gate re-measures them.
 */
import * as THREE from 'three';
import {
  NUKETOWN2_GROUND_FLOOR_TOP,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_HOUSE_WIDTH,
  NUKETOWN2_WALL_T,
} from './nuketown2-layout';
import type { Nuketown2Decal } from './nuketown2-grime-decals';

// ---------------------------------------------------------------------------
// Anchors, derived once from the layout the shell itself builds from
// ---------------------------------------------------------------------------

/** Authored x centre of the north house; `pair()` mirrors it south. */
const CX = NUKETOWN2_HOUSE_LAYOUT[0]!.x;
/** Room-side faces of the three dressed ground-floor walls (the west wall's */
/** junction already belongs to the ground baseboards, so it gets no strip). */
const EAST_INNER = CX + NUKETOWN2_HOUSE_WIDTH / 2 - NUKETOWN2_WALL_T;
const FRONT_INNER = NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_WALL_T;
const BACK_INNER = NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH + NUKETOWN2_WALL_T;
const FLOOR_TOP = NUKETOWN2_GROUND_FLOOR_TOP;

// ---------------------------------------------------------------------------
// Value plan: which room gets light, and which corner stays dark
// ---------------------------------------------------------------------------

export type Nuketown2InteriorRoomLook = Readonly<{
  /** Ground front room, ground back room, upper front room, upper back room. */
  room: string;
  /** Ceiling lenses in this room, per house (the HF-440 fixtures, kept). */
  ceilingFixtures: number;
  /** Table lamps in this room, per house (this lane). */
  tableLamps: number;
  /** Where the light sits: the lane a player fights along. */
  litLane: string;
  /** The corner with no emissive within 2 m: the skill's dark corner. */
  darkCorner: string;
}>;

export const NUKETOWN2_INTERIOR_VALUE_PLAN: readonly Nuketown2InteriorRoomLook[] = Object.freeze([
  Object.freeze({
    room: 'ground front',
    ceilingFixtures: 1,
    tableLamps: 1,
    litLane: 'front door -> counter -> partition door',
    darkCorner: 'east-front (grime L, no emissive)',
  }),
  Object.freeze({
    room: 'ground back',
    ceilingFixtures: 1,
    tableLamps: 1,
    litLane: 'garage link -> bench -> back door',
    darkCorner: 'east-back (grime L, no emissive)',
  }),
  Object.freeze({
    room: 'upper front',
    ceilingFixtures: 1,
    tableLamps: 0,
    litLane: 'stair head -> window seat',
    darkCorner: 'both corners (lens only)',
  }),
  Object.freeze({
    room: 'upper back',
    ceilingFixtures: 1,
    tableLamps: 0,
    litLane: 'landing -> crate -> balcony door',
    darkCorner: 'both corners (lens only)',
  }),
]);

/** Machine counts the gate re-derives from the built arena, never restated. */
export const NUKETOWN2_INTERIOR_LOOK_COUNTS = Object.freeze({
  /** 4 rooms x 1 lens, per house; x2 houses via pair(). */
  ceilingLensAuthored: 4,
  /** 2 ground rooms x (base + stem + shade), per house; x2 via pair(). */
  lampSolidsAuthored: 6,
  /** 2 ground rooms x 2 junction strips, per house; x2 via the grime loop. */
  junctionStripsAuthored: 4,
});

// ---------------------------------------------------------------------------
// Table lamps: one per ground room, standing on the furniture that is there
// ---------------------------------------------------------------------------

export type Nuketown2InteriorLampSolid = Readonly<{
  name: string;
  /** AUTHORED position - the arena's `pair()` applies the handedness mirror. */
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  material: THREE.Material;
}>;

/** Counter top (front) and bench top (back): the two tops lamps stand on. */
const TABLE_TOP = 1.0;
/** Lamp stack: 0.04 base + 0.30 stem + 0.26 shade, all sitting on TABLE_TOP. */
const LAMP_BASE_H = 0.04;
const LAMP_STEM_H = 0.30;
const LAMP_SHADE_H = 0.26;

function lampStack(
  name: string,
  x: number,
  z: number,
  trim: THREE.Material,
  warmLight: THREE.Material,
): readonly Nuketown2InteriorLampSolid[] {
  const baseY = TABLE_TOP + LAMP_BASE_H / 2;
  const stemY = TABLE_TOP + LAMP_BASE_H + LAMP_STEM_H / 2;
  const shadeY = TABLE_TOP + LAMP_BASE_H + LAMP_STEM_H + LAMP_SHADE_H / 2;
  return Object.freeze([
    Object.freeze({ name: `${name} base`, position: [x, baseY, z] as const, size: [0.16, LAMP_BASE_H, 0.16] as const, material: trim }),
    Object.freeze({ name: `${name} stem`, position: [x, stemY, z] as const, size: [0.04, LAMP_STEM_H, 0.04] as const, material: trim }),
    // The shade IS the emissive body: the shared warm lens material, so its
    // intensity is the one fixture uniform, never a per-lamp value.
    Object.freeze({ name: `${name} shade`, position: [x, shadeY, z] as const, size: [0.30, LAMP_SHADE_H, 0.30] as const, material: warmLight }),
  ]);
}

export function nuketown2InteriorLampSolids(
  trim: THREE.Material,
  warmLight: THREE.Material,
): readonly Nuketown2InteriorLampSolid[] {
  return Object.freeze([
    // Front room lamp, west end of the kitchen counter: clear of the upper
    // cabinets (east edge -5.95) and of the partition-door lane.
    ...lampStack('house front table lamp', -5.6, -12.8, trim, warmLight),
    // Back room lamp, east end of the living bench: clear of the wall shelf
    // (west edge 3.375) and of the internal-door lane.
    ...lampStack('house back table lamp', 2.5, -20.6, trim, warmLight),
  ]);
}

// ---------------------------------------------------------------------------
// Skirting grime: floor/wall junction films through the existing decal path
// ---------------------------------------------------------------------------
/** Strip film: 24 mm proud like the perimeter grime, 0.18 tall in the splash zone. */
const JUNCTION_T = 0.024;
const JUNCTION_H = 0.18;
/** Top lands at floor + 0.18: clear of the slab (0.08) and the baseboards (0.14). */
const JUNCTION_Y = FLOOR_TOP + JUNCTION_H / 2;

export function nuketown2InteriorJunctionDecals(
  wallGrime: THREE.Material,
): readonly Nuketown2Decal[] {
  const frontZ = FRONT_INNER - JUNCTION_T / 2;
  const backZ = BACK_INNER + JUNCTION_T / 2;
  const eastX = EAST_INNER - JUNCTION_T / 2;
  return Object.freeze([
    // Front room dark corner (east-front): front wall run clears the front
    // door (x -2.15..-0.35); east wall run clears the partition baseboards.
    Object.freeze({
      name: 'house interior junction grime front',
      family: 'wall-grime' as const,
      position: [2.45, JUNCTION_Y, frontZ] as const,
      size: [2.9, JUNCTION_H, JUNCTION_T] as const,
      material: wallGrime,
    }),
    Object.freeze({
      name: 'house interior junction grime front east',
      family: 'wall-grime' as const,
      position: [eastX, JUNCTION_Y, -13.4] as const,
      size: [JUNCTION_T, JUNCTION_H, 5.0] as const,
      material: wallGrime,
    }),
    // Back room dark corner (east-back): back wall run starts east of the
    // stair flight (inboard edge -4.80); east wall run crosses the link-door
    // threshold as tracked-in dirt, on the continuous 0.08 slab.
    Object.freeze({
      name: 'house interior junction grime back',
      family: 'wall-grime' as const,
      position: [-1.05, JUNCTION_Y, backZ] as const,
      size: [9.9, JUNCTION_H, JUNCTION_T] as const,
      material: wallGrime,
    }),
    Object.freeze({
      name: 'house interior junction grime back east',
      family: 'wall-grime' as const,
      position: [eastX, JUNCTION_Y, -19.7] as const,
      size: [JUNCTION_T, JUNCTION_H, 4.8] as const,
      material: wallGrime,
    }),
  ]);
}
