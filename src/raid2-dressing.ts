/**
 * RAID2 slice 2 dressing — estate cells 1–3 (facade-bay, pool-terrace, court).
 *
 * Plan: docs/research/2026-09-04/RAID-rebuild-plan.md §5 (cells 1–3), §6.5
 * (geometric z-fighting rule), §7 (gameplay contract). Slice 1 (branch
 * eight-surface forge; this module adds the first dressing that is free by
 * measurement: presentation-only, mountable, or wall-hugging solid trim that
 * stamps only cells the walls already own — never in the 0.9–1.8 m dead band,
 * never a new eye-blocking mass, zero new materials (every mesh reuses
 * the arena's forged families at their uniform palette tints), zero new
 * render pipelines.
 *
 * Solidity rule (learned against direction C of the parity gate): the
 * presentation batcher merges same-material boxes, so tall presentation boxes
 * would merge into a census-visible blob the ballistic gate rightly calls a
 * ghost. Facade trim is therefore SOLID — individually rated, individually
 * excludable (thin pilasters, above-reach cornices), stamping only cells the
 * walls already own. Tall thin pieces in open space (posts, poles) are
 * round/pointed/ringed geometry the batcher skips, each parity-excluded on
 * its own measurements; flat paint stays flat boxes.
 */

import * as THREE from 'three';
import { box, type Builder } from './additional-maps';
import { ringSegments } from './raid2-shapes';
import { worldTiled } from './test-maps-art';

export type Raid2DressingMaterialKey =
  | 'travertine' | 'stucco' | 'stone' | 'timber' | 'court' | 'poolTile'
  | 'gravel' | 'water' | 'glass' | 'planting' | 'hillside';

export type Raid2DressingMaterials = Record<Raid2DressingMaterialKey, THREE.Material>;

/** Arena verticals this dressing is placed against (src/raid2-arena.ts). */
export const RAID2_SLICE2_COURT_TOP = -0.35;
export const RAID2_SLICE2_LINE_LIFT = 0.034;
export const RAID2_SLICE2_LINE_T = 0.004;
export const RAID2_SLICE2_CANOPY_Y0 = 2.7;
export const RAID2_SLICE2_CORNICE_Y0 = 2.95;

/** The arena's fairness involution: (x, z) -> (-x, z). */
export function mirrorX(x: number): number {
  return -x;
}

type BoxOptions = Parameters<typeof box>[5];

function rect(
  builder: Builder,
  name: string,
  x0: number, x1: number,
  y0: number, y1: number,
  z0: number, z1: number,
  material: THREE.Material,
  options: BoxOptions = {},
): THREE.Mesh {
  return worldTiled(
    box(builder, name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      [x1 - x0, y1 - y0, z1 - z0], material, options),
    [x1 - x0, y1 - y0, z1 - z0],
  );
}

const presentation = { solid: false, shots: false, cast: false } as const;

/**
 * A round / pointed / ringed presentation piece. Non-box geometry is skipped
 * by the presentation batcher, so tall thin pieces never merge into a
 * census-visible blob; each is parity-excluded on its own measurements
 * (thin, short, above reach, or named decal/canopy).
 */
function dressingPiece(
  builder: Builder,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  uvSize: readonly [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.presentationBatchCandidate = true;
  builder.root.add(mesh);
  return worldTiled(mesh, uvSize);
}

/**
 * Cell 1 — facade-bay: cornice bands above reach and pilaster strips derived
 * through the X mirror. House faces: north z = -20, south z = -4
 * (src/raid2-arena.ts H_Z0/H_Z1, WALL_T 0.8).
 */
function dressFacadeBay(builder: Builder, m: Raid2DressingMaterials): void {
  // SOLID trim, not presentation: the batcher merges same-material boxes, so
  // tall presentation boxes would merge into a census-visible blob the
  // ballistic gate rightly calls a ghost. Solid trim is individually rated
  // (shots:true) and individually excludable (thin, or above reach), while
  // the metrics stay put: pilasters stamp the wall cells they stand on and
  // cornices (min.y 2.95 >= overhead 2.4) stamp roofed only.
  rect(builder, 'raid2 facade cornice north', -26, 30,
    RAID2_SLICE2_CORNICE_Y0, 3.45, -20.35, -19.95, m.stucco, { cast: false });
  rect(builder, 'raid2 facade cornice south', -26, 30,
    RAID2_SLICE2_CORNICE_Y0, 3.45, -4.05, -3.65, m.stucco, { cast: false });
  // Wall-backed xs on BOTH faces: the north wall is one cell thick, so a
  // pilaster shares no row with it and connects vertically alone — over any
  // door mouth that is an isolated eye-blocking cell against band 8 (measured:
  // 0.5 m2 singletons at the mouth xs). North mouths [-23,-19],[-2,2],[19,23]
  // plus south mouths [-17,-13],[6,10],[23,27] forbid (either sign)
  // [0,2],[6,10],[13,17],[19,27]; ±4, ±11, ±18 clear them all with a 0.2 m
  // pilaster half-width to spare, and both faces take the same set so the
  // mirror cannot drift.
  const westXs = [-18, -11, -4];
  const xs = [...westXs, ...westXs.map(mirrorX)].sort((a, b) => a - b);
  for (const x of xs) {
    rect(builder, `raid2 facade pilaster north ${x}`, x - 0.2, x + 0.2,
      0, RAID2_SLICE2_CORNICE_Y0, -20.15, -20.0, m.stucco, { cast: false });
    rect(builder, `raid2 facade pilaster south ${x}`, x - 0.2, x + 0.2,
      0, RAID2_SLICE2_CORNICE_Y0, -4.0, -3.85, m.stucco, { cast: false });
  }
}

/**
 * Cell 2 — pool-terrace: five mountable loungers clear of both walked pool
 * mouths (x 6..9 south of cell 0, x -10.5..-7.5 south of cell 5) and both
 * deck planter runs (z -22.4..-21.4), three round-pole umbrellas with cone
 * canopies above reach, and one towel stack.
 */
function dressPoolTerrace(builder: Builder, m: Raid2DressingMaterials): void {
  const loungerXs = [-2.5, 0, 2.5, 5, 7.5];
  loungerXs.forEach((x, index) => {
    rect(builder, `raid2 deck lounger ${index}`, x - 0.35, x + 0.35,
      0, 0.42, -23.3, -21.6, m.timber);
    rect(builder, `raid2 deck lounger head ${index}`, x - 0.35, x + 0.35,
      0, 0.62, -22.2, -21.6, m.timber);
  });
  [-1.25, 3.75, 6.5].forEach((x, index) => {
    dressingPiece(builder, `raid2 deck umbrella pole ${index}`,
      new THREE.CylinderGeometry(0.04, 0.04, RAID2_SLICE2_CANOPY_Y0, 8),
      m.timber, [x, RAID2_SLICE2_CANOPY_Y0 / 2, -22.5], [0.08, RAID2_SLICE2_CANOPY_Y0, 0.08]);
    dressingPiece(builder, `raid2 deck umbrella canopy ${index}`,
      new THREE.ConeGeometry(1.05, 0.4, 8),
      m.stucco, [x, RAID2_SLICE2_CANOPY_Y0 + 0.2, -22.5], [2.1, 0.4, 2.1]);
  });
  rect(builder, 'raid2 deck towel stack', 9.3, 9.9, 0, 0.6, -22.9, -22.4, m.stucco);
}

/**
 * Cell 3 — court: painted regulation lines as 34 mm-proud stone stripes on
 * the sunk floor (top -0.316, never coplanar with it), an 8-segment centre
 * circle through the arena's own ring helper, and two hoop assemblies with
 * round posts, mountable pads, rating-only glass and torus rims.
 * Court floor: x -34..-20, z -34..-23, top -0.35.
 */
function dressCourt(builder: Builder, m: Raid2DressingMaterials): void {
  const y0 = RAID2_SLICE2_COURT_TOP + RAID2_SLICE2_LINE_LIFT - RAID2_SLICE2_LINE_T;
  const y1 = RAID2_SLICE2_COURT_TOP + RAID2_SLICE2_LINE_LIFT;
  const stripe = (name: string, x0: number, x1: number, z0: number, z1: number): void => {
    rect(builder, `raid2 court stripe ${name}`, x0, x1, y0, y1, z0, z1, m.stone, { ...presentation });
  };
  stripe('sideline north', -32, -22, -31.55, -31.45);
  stripe('sideline south', -32, -22, -25.55, -25.45);
  stripe('baseline west', -32.05, -31.95, -31.5, -25.5);
  stripe('baseline east', -22.05, -21.95, -31.5, -25.5);
  stripe('centre line', -27.05, -26.95, -31.5, -25.5);
  stripe('key west north', -32, -29.5, -29.9, -29.8);
  stripe('key west south', -32, -29.5, -27.2, -27.1);
  stripe('key east north', -24.5, -22, -29.9, -29.8);
  stripe('key east south', -24.5, -22, -27.2, -27.1);
  stripe('free throw west', -29.6, -29.5, -29.9, -27.1);
  stripe('free throw east', -24.5, -24.4, -29.9, -27.1);
  for (const [index, seg] of ringSegments(-27, -28.5, 1.8, 8, 0.3).entries()) {
    worldTiled(
      box(builder, `raid2 court stripe circle ${index}`,
        [seg.x, (y0 + y1) / 2, seg.z], [seg.size[0], RAID2_SLICE2_LINE_T, seg.size[1]],
        m.stone, { ...presentation, rotation: seg.rotation as [number, number, number] | undefined }),
      [seg.size[0], RAID2_SLICE2_LINE_T, seg.size[1]],
    );
  }
  dressHoop(builder, m, 'west', -33.5, 1);
  dressHoop(builder, m, 'east', -20.5, -1);
}

/** One hoop standard: round post, mountable pad, rating-only glass, torus rim. */
function dressHoop(
  builder: Builder, m: Raid2DressingMaterials, end: string, postX: number, facing: 1 | -1,
): void {
  // No collider: a post piercing 1.70 m would stamp a new eye-blocking cell
  // against band 8's zero-headroom ratchet, while the 0.4 m pad at its foot
  // stays solid as the felt obstacle. A 0.12 m round post is parity-excluded
  // on both censuses (walk-through min footprint and ballistic wide dimension
  // are both 0.35 m).
  dressingPiece(builder, `raid2 court hoop post ${end}`,
    new THREE.CylinderGeometry(0.06, 0.06, 3.9, 8),
    m.stone, [postX, RAID2_SLICE2_COURT_TOP + 1.95, -28.5], [0.12, 3.9, 0.12]);
  rect(builder, `raid2 court hoop pad ${end}`, postX - 0.2, postX + 0.2,
    RAID2_SLICE2_COURT_TOP, 0.3, -28.7, -28.3, m.timber);
  const boardX0 = facing === 1 ? postX + 0.06 : postX - 0.12;
  rect(builder, `raid2 court hoop glass ${end}`, boardX0, boardX0 + 0.06,
    2.65, 3.6, -29.4, -27.6, m.glass,
    { solid: false, shots: true, ballisticMaterial: 'glass', cast: false });
  const rim = dressingPiece(builder, `raid2 court hoop rim ${end}`,
    new THREE.TorusGeometry(0.225, 0.025, 8, 16),
    m.timber, [postX + facing * 0.45, 3.02, -28.5], [0.45, 0.05, 0.45]);
  rim.rotation.set(Math.PI / 2, 0, 0);
}

export function dressRaid2(builder: Builder, m: Raid2DressingMaterials): void {
  dressFacadeBay(builder, m);
  dressPoolTerrace(builder, m);
  dressCourt(builder, m);
}
