/**
 * nuketown2-effects.ts — DAY-VISUAL-C bounded golden-hour effects.
 *
 * Sun-shaft quads leaning toward the low sun plus a single CPU-drifted dust
 * field over the street, following the farcrysis-atmosphere pattern:
 * MeshBasicMaterial/PointsMaterial + AdditiveBlending, `fog: false`, no new
 * lights, no new pipeline per material (classic materials are outside the
 * node-graph budget), geometry built once, advance writes scalars and array
 * slots only — zero per-frame allocation.
 *
 * Presentation only: plain meshes under one group, no colliders, no spawns,
 * no authority. The backyard mist boxes in `atmosphere-system.ts` are
 * visual-a's constants and are untouched; these effects stay over the street
 * and cul-de-sac where the plan allows dust/shafts, never in the backyards.
 * Built AFTER the presentation batcher (plain meshes are not batch
 * candidates) and advanced through the arena's ONE existing per-frame hook
 * (`userData.nuketownLawnWind`), so there is no new call site and no new
 * traversal.
 */

import * as THREE from "three";

/** Shaft quads leaning down the street toward the sun. */
export const NUKETOWN2_EFFECTS_SHAFT_COUNT = 5;
/** Dust motes drifting in the shaft volume. */
export const NUKETOWN2_EFFECTS_DUST_COUNT = 64;
/** Draws added: one per shaft quad plus one Points. */
export const NUKETOWN2_EFFECTS_DRAW_COUNT = NUKETOWN2_EFFECTS_SHAFT_COUNT + 1;
/** Triangles added: two per quad; points add none. */
export const NUKETOWN2_EFFECTS_TRIANGLE_COUNT =
  NUKETOWN2_EFFECTS_SHAFT_COUNT * 2;

/**
 * Direction TO the low sun. The into-sun review probe bears (-0.853, +0.522)
 * in XZ at the golden-hour 11-degree elevation; this is that bearing as a
 * unit vector, the axis every shaft quad leans along.
 */
const SUN_BEARING_X = -0.853;
const SUN_BEARING_Z = 0.522;
const SUN_ELEVATION_RAD = (11 * Math.PI) / 180;

const _bearingLength = Math.hypot(SUN_BEARING_X, SUN_BEARING_Z);

const SUN_DIR = new THREE.Vector3(
  (SUN_BEARING_X / _bearingLength) * Math.cos(SUN_ELEVATION_RAD),
  Math.sin(SUN_ELEVATION_RAD),
  (SUN_BEARING_Z / _bearingLength) * Math.cos(SUN_ELEVATION_RAD),
).normalize();

const UP = new THREE.Vector3(0, 1, 0);

/** Fixed seed: every build places the same shafts and the same dust. */
const EFFECTS_SEED = 0xc10c4;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Nuketown2EffectShaft {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly baseOpacity: number;
  readonly phase: number;
}

export interface Nuketown2EffectsStats {
  readonly shafts: number;
  readonly dust: number;
  readonly draws: number;
  readonly triangles: number;
}

export interface Nuketown2Effects {
  readonly group: THREE.Group;
  readonly shafts: readonly Nuketown2EffectShaft[];
  readonly dustPoints: THREE.Points;
  readonly dustMaterial: THREE.PointsMaterial;
  readonly stats: Nuketown2EffectsStats;
  advance(seconds: number): void;
}

function buildShaft(
  rng: () => number,
  group: THREE.Group,
): Nuketown2EffectShaft {
  // DAY-POLISH (HF-535): high, faint beams. Feet stay above ~3 m (centre
  // 5.2 m minus worst-case vertical half-extent 1.14 m length + 1.0 m rolled
  // width = 3.06 m), clear of the carriageway, the parked vehicles and both
  // review-camera eye lines. Barely-there opacity: dust in a beam.
  const length = 8 + rng() * 4;
  const width = 1.2 + rng() * 0.8;
  const baseOpacity = 0.016 + rng() * 0.014;
  const phase = rng() * Math.PI * 2;
  // Verge-side anchors toward the low sun, clear of the carriageway
  // (|z| < 6.5 m) and the kerb-parked cars: high beams over the yards,
  // heads tipped toward the sun, never a quad across the road at eye level.
  const anchorX = -16 + rng() * 20;
  const anchorZ = (rng() < 0.5 ? -1 : 1) * (8 + rng() * 6);
  const roll = rng() * Math.PI * 2;
  const tilt = (rng() - 0.5) * 0.1;

  const geometry = new THREE.PlaneGeometry(width, length);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffe0b0,
    transparent: true,
    opacity: baseOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "nuketown2-effects-shaft";
  mesh.renderOrder = 997;
  mesh.frustumCulled = false;
  // PlaneGeometry height runs along local +Y: align +Y to the sun axis, roll
  // around it, then tilt slightly off-axis so no view is exactly edge-on.
  mesh.quaternion.setFromUnitVectors(UP, SUN_DIR);
  mesh.rotateY(roll);
  mesh.rotateX(tilt);
  mesh.position.set(
    anchorX + SUN_DIR.x * (length / 2 - 1.5),
    5.2 + SUN_DIR.y * (length / 2 - 1.5),
    anchorZ + SUN_DIR.z * (length / 2 - 1.5),
  );
  group.add(mesh);
  return { mesh, material, baseOpacity, phase };
}

const DUST_ORIGIN_COUNT = NUKETOWN2_EFFECTS_DUST_COUNT * 3;

function buildDust(
  rng: () => number,
  group: THREE.Group,
): {
  points: THREE.Points;
  material: THREE.PointsMaterial;
  origins: Float32Array;
  phases: Float32Array;
} {
  const origins = new Float32Array(DUST_ORIGIN_COUNT);
  const phases = new Float32Array(NUKETOWN2_EFFECTS_DUST_COUNT);
  const positions = new Float32Array(DUST_ORIGIN_COUNT);
  for (let i = 0; i < NUKETOWN2_EFFECTS_DUST_COUNT; i += 1) {
    origins[i * 3] = -14 + rng() * 20;
    origins[i * 3 + 1] = 0.3 + rng() * 5.7;
    origins[i * 3 + 2] = -7 + rng() * 14;
    phases[i] = rng() * Math.PI * 2;
    positions[i * 3] = origins[i * 3]!;
    positions[i * 3 + 1] = origins[i * 3 + 1]!;
    positions[i * 3 + 2] = origins[i * 3 + 2]!;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xffd9a0,
    size: 0.055,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "nuketown2-effects-dust";
  points.renderOrder = 998;
  points.frustumCulled = false;
  group.add(points);
  return { points, material, origins, phases };
}

/**
 * Build the bounded effect set under `parent`. Rebuilding on a parent that
 * already holds the group replaces it, so repeated admissions never stack.
 */
export function buildNuketown2Effects(
  parent: THREE.Object3D,
): Nuketown2Effects {
  const previous = parent.getObjectByName("nuketown2-effects");
  if (previous) parent.remove(previous);

  const rng = mulberry32(EFFECTS_SEED);
  const group = new THREE.Group();
  group.name = "nuketown2-effects";

  const shafts: Nuketown2EffectShaft[] = [];
  for (let i = 0; i < NUKETOWN2_EFFECTS_SHAFT_COUNT; i += 1) {
    shafts.push(buildShaft(rng, group));
  }
  const dust = buildDust(rng, group);
  parent.add(group);

  const stats: Nuketown2EffectsStats = Object.freeze({
    shafts: NUKETOWN2_EFFECTS_SHAFT_COUNT,
    dust: NUKETOWN2_EFFECTS_DUST_COUNT,
    draws: NUKETOWN2_EFFECTS_DRAW_COUNT,
    triangles: NUKETOWN2_EFFECTS_TRIANGLE_COUNT,
  });

  // Preallocated per-frame scratch: module-closed, never reallocated.
  const positionAttribute = dust.points.geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;

  return {
    group,
    shafts: Object.freeze(shafts),
    dustPoints: dust.points,
    dustMaterial: dust.material,
    stats,
    advance(seconds: number): void {
      const t = Number.isFinite(seconds) ? seconds : 0;
      for (let i = 0; i < shafts.length; i += 1) {
        const shaft = shafts[i]!;
        shaft.material.opacity =
          shaft.baseOpacity * (0.72 + 0.28 * Math.sin(t * 0.45 + shaft.phase));
      }
      const array = positionAttribute.array as Float32Array;
      for (let i = 0; i < NUKETOWN2_EFFECTS_DUST_COUNT; i += 1) {
        const phase = dust.phases[i]!;
        array[i * 3] = dust.origins[i * 3]! + Math.sin(t * 0.21 + phase) * 0.9;
        array[i * 3 + 1] =
          dust.origins[i * 3 + 1]! + Math.sin(t * 0.3 + phase * 1.3) * 0.55;
        array[i * 3 + 2] =
          dust.origins[i * 3 + 2]! + Math.cos(t * 0.17 + phase * 0.7) * 0.9;
      }
      positionAttribute.needsUpdate = true;
      dust.material.opacity = 0.45 + 0.15 * Math.sin(t * 0.6);
      group.rotation.y = 0.008 * Math.sin(t * 0.09);
    },
  };
}
