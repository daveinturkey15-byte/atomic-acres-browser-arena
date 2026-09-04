/**
 * RAID2 procedural facade detail — r185 technique #6 in our likeness.
 *
 * Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_generator_building.html
 * (`SkyscraperGenerator`: seeded, grouped facade geometry + role materials).
 * Recipe: docs/threejs-knowledge/r185/webgpu_generator_building.md (technique #6).
 * Our note: docs/threejs-knowledge/r185/raid2-generator-building-detail-ours.md.
 *
 * WHAT THIS IS. A seeded, deterministic facade-detail generator for the Raid
 * preview arena (raid2): window grids, mullions, sill ledges, string courses,
 * downpipes and AC units, derived from each AUTHORED building footprint. The
 * authored footprints and colliders are never touched: every piece here is
 * presentation-first (`solid: false`), glazing alone is `shots: true` with the
 * glass ballistic rating (the same rating the shipped C3 office window and the
 * court hoop boards carry), and everything else is `shots: false`.
 *
 * INSTANCED PER CLASS (brief: one draw per class). The five presentation
 * classes (mullion, sill ledge, string course, downpipe, AC unit) are each
 * emitted as a single `THREE.InstancedMesh` over a unit box — five draws
 * total for all presentation trim, whatever the instance count. Glazing stays
 * one `box()` mesh per pane because a merged or instanced pane field cannot
 * carry per-pane `ballisticSurfaceId` shot surfaces (shipped C3/hoop
 * precedent). Instance transforms are axis-aligned position+scale (sizes
 * encode orientation), composed deterministically in face order.
 *
 * WHY THE CENSUS STILL SEES EVERY INSTANCE. The parity audit
 * (`collectMeshes`) recovers exact per-instance boxes for meshes flagged
 * `userData.perInstanceAudit` (r185 `InstancedMesh.computeBoundingBox`
 * expands every instance matrix, and `Box3.setFromObject` consumes it), so
 * each trim instance audits exactly as an individual mesh would. Per-instance
 * names, buildings, centres and sizes ride in `userData.facadeInstances` for
 * the suite. The flag is opt-in: no other arena's instanced meshes change
 * audit behaviour.
 *
 * PARITY SHAPE (measured against scripts/qa/collider-visual-parity-core.ts):
 * - Walk-through census needs height >= 0.9 AND min-footprint >= 0.35. Glazing
 *   panes are 0.06 deep, mullions/downpipes 0.07–0.12 in both plan dims, and
 *   ledges/string courses/AC units are under 0.9 tall — every class is
 *   excluded on its own measurements, never on a name rule.
 * - Ballistic census needs height >= 0.9 AND max-footprint >= 0.35. Only the
 *   glazing panes qualify (1.1+ wide, 1.2 tall) and each carries its own
 *   `ballisticSurfaceId` with material 'glass'. All other classes drop out on
 *   size. The panes sit half-sunk in the wall face (0.03 proud), inside the
 *   0.05 flush epsilon, so even the footprint explanation agrees.
 * - Dead band: nothing here is solid, so the 0.9–1.8 m cover rule has no
 *   subject. Glazing spans 1.02–2.22 as non-solid glass, like the hoop boards.
 *
 * COPLANAR SHAPE. Tops are chosen off every existing raid2 top by more than
 * the 0.03 m instrument window (glass 2.22, mullion 2.26, AC 2.5, string 2.68,
 * downpipe 3.1 — clear of pilaster 2.95, cornice 3.45, slab 3.4, mount 0.7,
 * hard 1.9), and off each other where plans overlap (mullion caps glass by
 * 0.04, the ledge top sits 0.02 under the glass bottom — bottoms are not
 * top faces — and the transom crosses mid-pane). Same-material overlaps are
 * benign by the instrument's own rule.
 *
 * OFF SWITCH. Reuses the canonical `geometryDetail` control (applyMode
 * arena-reload, runtimeConsumer arena-stream): `reduced` maps to level
 * 'reduced', which emits nothing. See `raid2FacadeDetailLevelForGeometryDetail`.
 * `buildRaid2` threads the live setting through (arena-reload re-evaluates the
 * module, so the boot-time value is current); the generator default stays
 * 'full' for tests and tools.
 *
 * UV NOTE. Instanced trim shares one unit-box geometry, so the per-mesh
 * `worldTiled` UV rescale cannot apply per instance; trim carries 0..1 box
 * UVs, stretched on long string-course spans. The trim materials are forged
 * near-flat tints, and glazing — the only large glass piece — keeps its tiled
 * UVs via `box()`.
 *
 * COST. Generation runs once inside `buildRaid2` (arena stream, never combat):
 * ~54 `box()` calls for glazing plus five `InstancedMesh` allocations; no new
 * pipeline, no new material, no per-frame allocation afterwards — static
 * meshes only. Steady-state GPU cost is five instanced draws plus the rated
 * glazing panes (bounded by the per-building ceilings below); all trim is
 * `cast: false`.
 */

import * as THREE from 'three';
import { box, type Builder } from './additional-maps';
import { worldTiled } from './test-maps-art';

/** Detail level. 'reduced' is the geometryDetail=reduced off state: emit nothing. */
export type Raid2FacadeDetailLevel = 'full' | 'reduced';

/** The settings-registry entry that owns this stage's off switch (reused, not added). */
export const RAID2_FACADE_DETAIL_SETTING_KEY = 'geometryDetail' as const;

/** Map the canonical geometryDetail value onto this stage's level. */
export function raid2FacadeDetailLevelForGeometryDetail(
  value: 'reduced' | 'full' | string,
): Raid2FacadeDetailLevel {
  return value === 'reduced' ? 'reduced' : 'full';
}

/** Off state predicate, so the arena (and the tests) read one address. */
export function isRaid2FacadeDetailEnabled(level: Raid2FacadeDetailLevel): boolean {
  return level === 'full';
}

/** Name prefix for every mesh this generator authors. */
export const RAID2_FACADE_DETAIL_PREFIX = 'raid2 facade detail' as const;

/** Detail classes: one InstancedMesh draw per presentation class; glazing stays per-pane. */
export type Raid2FacadeDetailClass =
  | 'windowGlass'
  | 'mullion'
  | 'sillLedge'
  | 'stringCourse'
  | 'downpipe'
  | 'acUnit';

export type Raid2FacadeCounts = Record<Raid2FacadeDetailClass, number>;

/**
 * Per-building ceilings. A building that exceeds one fails the suite instead
 * of silently adding draws — ceilings may only go down.
 */
export const RAID2_FACADE_CEILINGS: Readonly<Record<Raid2FacadeDetailClass, number>> =
  Object.freeze({
    windowGlass: 12,
    mullion: 36,
    sillLedge: 12,
    stringCourse: 8,
    downpipe: 8,
    acUnit: 2,
  });

/** Materials this stage may touch. All are arena-forged families; never cloned. */
export type Raid2FacadeMaterials = Record<'stucco' | 'stone' | 'glass', THREE.Material>;

type BoxOptions = Parameters<typeof box>[5];

/** One authored wall face. Coordinates cite src/raid2-arena.ts wall tables. */
type FacadeFace = {
  /** Building id this face belongs to (ceilings + names are per building). */
  building: string;
  /** Short face tag for names. */
  face: string;
  /** Wall runs along X (fixed z) or along Z (fixed x). */
  axis: 'x' | 'z';
  /** Outer wall-face plane coordinate (the visible surface). */
  plane: number;
  /** Extent along the run axis. */
  from: number;
  to: number;
  /** Outward normal sign along the fixed axis. */
  outward: 1 | -1;
  /** Door/window mouths along the run axis (openings — never glaze over one). */
  mouths: ReadonlyArray<readonly [number, number]>;
};

/**
 * Authored faces, transcribed from the arena's own wall tables (mouth arrays
 * copied verbatim; solids are their complement). House mouths:
 * north [[-23,-19],[-2,2],[19,23]], south [[-17,-13],[6,10],[23,27]],
 * west [[-15.2,-13.2],[-10,-5.5]], east [[-19.2,-15.5],[-13,-10.5]].
 * Wing west mouth [[-32,-29]]. Laundry west [[1,7]], east [[-3.5,0]],
 * south [[-20,-16]]. Gallery west [[-3.5,0]], east [[1,7]], south [[19,23]].
 */
const FACES: readonly FacadeFace[] = Object.freeze([
  { building: 'house', face: 'north', axis: 'x', plane: -20, from: -26, to: 30, outward: -1, mouths: [[-23, -19], [-2, 2], [19, 23]] },
  { building: 'house', face: 'south', axis: 'x', plane: -4, from: -26, to: 30, outward: 1, mouths: [[-17, -13], [6, 10], [23, 27]] },
  { building: 'house', face: 'west', axis: 'z', plane: -26, from: -20, to: -4, outward: -1, mouths: [[-15.2, -13.2], [-10, -5.5]] },
  { building: 'house', face: 'east', axis: 'z', plane: 30, from: -20, to: -4, outward: 1, mouths: [[-19.2, -15.5], [-13, -10.5]] },
  { building: 'wing', face: 'north', axis: 'x', plane: -34, from: 18, to: 32, outward: -1, mouths: [] },
  { building: 'wing', face: 'west', axis: 'z', plane: 18, from: -34, to: -28, outward: -1, mouths: [[-32, -29]] },
  { building: 'wing', face: 'east', axis: 'z', plane: 32, from: -34, to: -28, outward: 1, mouths: [] },
  { building: 'laundry', face: 'west', axis: 'z', plane: -26, from: -4, to: 9, outward: -1, mouths: [[1, 7]] },
  { building: 'laundry', face: 'east', axis: 'z', plane: -10, from: -4, to: 9, outward: 1, mouths: [[-3.5, 0]] },
  { building: 'laundry', face: 'south', axis: 'x', plane: 9, from: -26, to: -10, outward: 1, mouths: [[-20, -16]] },
  { building: 'gallery', face: 'west', axis: 'z', plane: 14, from: -4, to: 8, outward: -1, mouths: [[-3.5, 0]] },
  { building: 'gallery', face: 'east', axis: 'z', plane: 30, from: -4, to: 8, outward: 1, mouths: [[1, 7]] },
  { building: 'gallery', face: 'south', axis: 'x', plane: 8, from: 14, to: 30, outward: 1, mouths: [[19, 23]] },
  { building: 'service', face: 'west', axis: 'z', plane: -34, from: 8, to: 14, outward: -1, mouths: [] },
  { building: 'service', face: 'south', axis: 'x', plane: 14, from: -34, to: -25.2, outward: 1, mouths: [] },
  { building: 'carport', face: 'east', axis: 'z', plane: 36, from: 7, to: 13, outward: 1, mouths: [] },
  { building: 'carport', face: 'south', axis: 'x', plane: 13, from: 27.2, to: 36, outward: 1, mouths: [] },
  { building: 'garage', face: 'north', axis: 'x', plane: -16, from: 38, to: 50, outward: -1, mouths: [] },
  { building: 'garage', face: 'south', axis: 'x', plane: 12, from: 38, to: 50, outward: 1, mouths: [] },
]);

// Vertical budget (tops clear every existing raid2 top by > 0.03 m).
const GLASS_Y0 = 1.02;
const GLASS_Y1 = 2.22;
const MULLION_Y0 = 1.0;
const MULLION_Y1 = 2.26;
const LEDGE_Y0 = 0.94;
const LEDGE_Y1 = 1.0;
const STRING_Y0 = 2.55;
const STRING_Y1 = 2.68;
const DOWNPIPE_TOP = 3.1;
const AC_Y0 = 2.0;
const AC_Y1 = 2.5;

const GLASS_W = 1.1;
const GLASS_T = 0.06;
const MAX_BAYS_PER_INTERVAL = 4;
/** Faces shorter than this get trim but no window bays. */
const MIN_BAY_FACE_LEN = 4;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Complement of the mouths over [from, to]: the solid wall a bay may sit on. */
function solidIntervals(face: FacadeFace): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cursor = face.from;
  for (const [mouthStart, mouthEnd] of face.mouths) {
    if (mouthStart > cursor) out.push([cursor, mouthStart]);
    cursor = Math.max(cursor, mouthEnd);
  }
  if (cursor < face.to) out.push([cursor, face.to]);
  return out.filter(([start, end]) => end - start > 0.01);
}

function rect(
  builder: Builder,
  name: string,
  centre: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  options: BoxOptions,
): THREE.Mesh {
  return worldTiled(box(builder, name, centre, size, material, options), size);
}

const glazing = { solid: false, shots: true, ballisticMaterial: 'glass', cast: false } as const;
/**
 * One trim placement: the per-instance record for an InstancedMesh class mesh.
 * Names keep the exact pre-instancing scheme (`${prefix} ${building} ${face}
 * … ${class-token}`) so audits and the suite see identical identities.
 */
 export type Raid2FacadePlacement = {
   readonly name: string;
   readonly building: string;
   readonly centre: readonly [number, number, number];
   readonly size: readonly [number, number, number];
 };

 type PresentationClass = Exclude<Raid2FacadeDetailClass, 'windowGlass'>;

 const PRESENTATION_CLASSES: readonly PresentationClass[] = Object.freeze([
   'mullion',
   'sillLedge',
   'stringCourse',
   'downpipe',
   'acUnit',
 ] as const);


 /**
  * Emit one InstancedMesh per presentation class over a unit box (one draw per
  * class). Transforms are position+scale only — all placements are
  * axis-aligned with orientation baked into the size. `perInstanceAudit` opts
  * the mesh into per-instance census expansion; `facadeInstances` carries the
  * per-instance identities for the suite. No `presentationBatchCandidate`: the
  * shared merge batcher only takes individual meshes.
  */
 function emitInstancedClass(
   builder: Builder,
   cls: PresentationClass,
   material: THREE.Material,
   placements: readonly Raid2FacadePlacement[],
 ): void {
   if (placements.length === 0) return;
   const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, placements.length);
   mesh.name = `${RAID2_FACADE_DETAIL_PREFIX} ${cls} instanced`;
   const matrix = new THREE.Matrix4();
   const position = new THREE.Vector3();
   const quaternion = new THREE.Quaternion();
   const scale = new THREE.Vector3();
   placements.forEach((placement, index) => {
     position.set(placement.centre[0], placement.centre[1], placement.centre[2]);
     scale.set(placement.size[0], placement.size[1], placement.size[2]);
     quaternion.identity();
     matrix.compose(position, quaternion, scale);
     mesh.setMatrixAt(index, matrix);
   });
   mesh.instanceMatrix.needsUpdate = true;
   mesh.computeBoundingBox();
   mesh.computeBoundingSphere();
   mesh.castShadow = false;
   mesh.receiveShadow = true;
   mesh.userData.presentationOnly = true;
   mesh.userData.perInstanceAudit = true;
   mesh.userData.facadeClass = cls;
   mesh.userData.facadeInstances = placements.map((placement) => ({ ...placement }));
   builder.root.add(mesh);
 }

 function emitWindow(
   builder: Builder,
   mats: Raid2FacadeMaterials,
   face: FacadeFace,
   centreAlong: number,
   bayIndex: number,
   trim: Record<PresentationClass, Raid2FacadePlacement[]>,
   counts: Raid2FacadeCounts,
 ): void {
   const tag = `${RAID2_FACADE_DETAIL_PREFIX} ${face.building} ${face.face} bay${bayIndex}`;
   const outwardOffset = (proud: number): number => face.plane + face.outward * proud;
   const place = (
     cls: PresentationClass,
     token: string,
     centre: [number, number, number],
     size: [number, number, number],
   ): void => {
     trim[cls].push({ name: `${tag} ${token}`, building: face.building, centre, size });
   };
   if (face.axis === 'x') {
     rect(builder, `${tag} pane`, [centreAlong, (GLASS_Y0 + GLASS_Y1) / 2, outwardOffset(0)],
       [GLASS_W, GLASS_Y1 - GLASS_Y0, GLASS_T], mats.glass, { ...glazing });
     for (const side of [-1, 0, 1]) {
       place('mullion', `mullion ${side}`, [centreAlong + (side * GLASS_W) / 3, (MULLION_Y0 + MULLION_Y1) / 2, outwardOffset(0.02)],
         [0.07, MULLION_Y1 - MULLION_Y0, 0.08]);
     }
     place('mullion', 'transom', [centreAlong, 1.635, outwardOffset(0.02)],
       [GLASS_W, 0.07, 0.08]);
     place('sillLedge', 'sill', [centreAlong, (LEDGE_Y0 + LEDGE_Y1) / 2, outwardOffset(0.06)],
       [GLASS_W + 0.24, LEDGE_Y1 - LEDGE_Y0, 0.18]);
   } else {
     rect(builder, `${tag} pane`, [outwardOffset(0), (GLASS_Y0 + GLASS_Y1) / 2, centreAlong],
       [GLASS_T, GLASS_Y1 - GLASS_Y0, GLASS_W], mats.glass, { ...glazing });
     for (const side of [-1, 0, 1]) {
       place('mullion', `mullion ${side}`, [outwardOffset(0.02), (MULLION_Y0 + MULLION_Y1) / 2, centreAlong + (side * GLASS_W) / 3],
         [0.08, MULLION_Y1 - MULLION_Y0, 0.07]);
     }
     place('mullion', 'transom', [outwardOffset(0.02), 1.635, centreAlong],
       [0.08, 0.07, GLASS_W]);
     place('sillLedge', 'sill', [outwardOffset(0.06), (LEDGE_Y0 + LEDGE_Y1) / 2, centreAlong],
       [0.18, LEDGE_Y1 - LEDGE_Y0, GLASS_W + 0.24]);
   }
   counts.windowGlass += 1;
   counts.mullion += 4;
   counts.sillLedge += 1;
 }

/**
 * Generate facade detail for every authored face. Presentation-only: the only
 * colliders-and-raycast contributor is the glazing (shots:true); no solid is
 * ever authored, so `builder.colliders` is untouched.
 */
export function generateRaid2FacadeDetail(
  builder: Builder,
  mats: Raid2FacadeMaterials,
  level: Raid2FacadeDetailLevel = 'full',
): Raid2FacadeCounts {
  const counts: Raid2FacadeCounts = {
    windowGlass: 0, mullion: 0, sillLedge: 0, stringCourse: 0, downpipe: 0, acUnit: 0,
  };
  if (!isRaid2FacadeDetailEnabled(level)) return counts;

  const perBuilding: Record<string, Raid2FacadeCounts> = {};
  const budgetOf = (building: string): Raid2FacadeCounts =>
    (perBuilding[building] ??= {
      windowGlass: 0, mullion: 0, sillLedge: 0, stringCourse: 0, downpipe: 0, acUnit: 0,
    });
  /** Presentation trim placements per class; emitted as one InstancedMesh each. */
  const trim: Record<PresentationClass, Raid2FacadePlacement[]> = {
    mullion: [], sillLedge: [], stringCourse: [], downpipe: [], acUnit: [],
  };
  for (const face of FACES) {
    const budget = budgetOf(face.building);
    const faceLen = face.to - face.from;
    for (const [start, end] of solidIntervals(face)) {
      const len = end - start;
      if (len < 1.2) continue;
      // String course per solid interval (stucco, above reach, non-substantial).
      if (budget.stringCourse < RAID2_FACADE_CEILINGS.stringCourse) {
        const mid = (start + end) / 2;
        const sizeLen = len;
        const centre: [number, number, number] = face.axis === 'x'
          ? [mid, (STRING_Y0 + STRING_Y1) / 2, face.plane + face.outward * 0.0]
          : [face.plane + face.outward * 0.0, (STRING_Y0 + STRING_Y1) / 2, mid];
        const size: [number, number, number] = face.axis === 'x'
          ? [sizeLen, STRING_Y1 - STRING_Y0, 0.14]
          : [0.14, STRING_Y1 - STRING_Y0, sizeLen];
        trim.stringCourse.push({
          name: `${RAID2_FACADE_DETAIL_PREFIX} ${face.building} ${face.face} stringcourse ${start.toFixed(1)}`,
          building: face.building, centre, size,
        });
        budget.stringCourse += 1;
        counts.stringCourse += 1;
      }
      if (faceLen >= MIN_BAY_FACE_LEN && len >= 2.0) {
        const bays = Math.min(
          MAX_BAYS_PER_INTERVAL,
          Math.max(1, Math.floor((len + 0.8) / 2.4)),
        );
        for (let bay = 0; bay < bays; bay += 1) {
          if (budget.windowGlass >= RAID2_FACADE_CEILINGS.windowGlass) break;
          if (budget.mullion + 4 > RAID2_FACADE_CEILINGS.mullion) break;
          if (budget.sillLedge >= RAID2_FACADE_CEILINGS.sillLedge) break;
          const centre = start + (len * (bay + 0.5)) / bays;
          const before: Raid2FacadeCounts = { ...counts };
          emitWindow(builder, mats, face, centre, bay, trim, counts);
          budget.windowGlass += counts.windowGlass - before.windowGlass;
          budget.mullion += counts.mullion - before.mullion;
          budget.sillLedge += counts.sillLedge - before.sillLedge;
        }
      }
    }
    // Downpipes at the face ends (thin, excluded from both censuses on size).
    if (faceLen >= MIN_BAY_FACE_LEN && budget.downpipe + 2 <= RAID2_FACADE_CEILINGS.downpipe) {
      for (const end of [face.from + 0.4, face.to - 0.4]) {
        const centre: [number, number, number] = face.axis === 'x'
          ? [end, DOWNPIPE_TOP / 2, face.plane + face.outward * 0.09]
          : [face.plane + face.outward * 0.09, DOWNPIPE_TOP / 2, end];
        trim.downpipe.push({
          name: `${RAID2_FACADE_DETAIL_PREFIX} ${face.building} ${face.face} downpipe ${end.toFixed(1)}`,
          building: face.building, centre, size: [0.12, DOWNPIPE_TOP, 0.12],
        });
        budget.downpipe += 1;
        counts.downpipe += 1;
      }
    }
  }

  // AC units: seeded per building on its longest face, clear of the ground game.
  for (const face of FACES) {
    if (face.axis !== 'x') continue;
    if (face.building === 'service' || face.building === 'carport') continue;
    const budget = budgetOf(face.building);
    if (budget.acUnit >= RAID2_FACADE_CEILINGS.acUnit) continue;
    const rng = mulberry32(hashString(`raid2-facade-ac:${face.building}:${face.face}`));
    if (rng() < 0.25) continue;
    const solids = solidIntervals(face).filter(([start, end]) => end - start >= 3);
    if (solids.length === 0) continue;
    const [start, end] = solids[Math.floor(rng() * solids.length)]!;
    const centre = start + 1.0 + rng() * (end - start - 2.0);
    trim.acUnit.push({
      name: `${RAID2_FACADE_DETAIL_PREFIX} ${face.building} ${face.face} acunit`,
      building: face.building,
      centre: [centre, (AC_Y0 + AC_Y1) / 2, face.plane + face.outward * 0.24],
      size: [0.7, AC_Y1 - AC_Y0, 0.45],
    });
    budget.acUnit += 1;
    counts.acUnit += 1;
  }
  // One draw per presentation class: a single InstancedMesh over a unit box.
  for (const cls of PRESENTATION_CLASSES) {
    emitInstancedClass(builder, cls, cls === 'stringCourse' ? mats.stucco : mats.stone, trim[cls]);
  }

  return counts;
}
