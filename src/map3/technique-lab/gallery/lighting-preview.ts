/**
 * src/map3/technique-lab/gallery/lighting-preview.ts — CPU-built
 * "Lighting & Environment" preview for the Skills Lab host. No renderer, no
 * RAF, no fetch: it builds one bounded THREE.Group (grass, road, shed) with
 * MeshStandardMaterial PBR and two preview-owned lights, which the host mounts
 * into its single shared scene. All geometry/material APIs below were verified
 * against the installed three 0.185.1 source before use.
 *
 * Real lab techniques reused (restated, bounded for a CPU-safe preview):
 * - source-18 procedural grass: jittered-grid blade placement with rejection
 *   tests (here: road strip, shed footprint and a slope cap over gentle
 *   terrain), tapered blade geometry, per-blade color variation. The source's
 *   GLSL wind bend and 200K+ blade budget are NOT reproduced: blades are
 *   static InstancedMesh instances (240) under MeshStandardMaterial, which is
 *   what the WebGPU path accepts.
 * - source-48 dark-interior value discipline: dusk grading is bought with
 *   light color/intensity and distance darkening intent, not with a post
 *   chain, bloom threshold change or vignette — this preview owns no post
 *   chain and changes none.
 * - source-07 code-only procedural authoring: every mesh and material is
 *   authored in code; no external asset, texture or environment map is loaded.
 *
 * Honesty rules:
 * - Only the time-of-day and weather states implemented below are offered as
 *   enabled controls. Anything else the UI names is rendered disabled with an
 *   "(unavailable — not implemented)" label; setters reject unknown states
 *   without changing anything.
 * - Materials set envMapIntensity (real PBR reflection weight), but the host
 *   scene provides no environment map in this lane, so reflections stay
 *   diffuse — that is stated in the UI, not hidden.
 * - No browser/GPU visual acceptance has been run for this preview; the UI
 *   says OPEN and stays truthful about it.
 */

import * as THREE from 'three';
import { disposeObject } from './blender-viewer';

/** Time-of-day states the code actually implements. */
export const LIGHTING_TIMES = ['morning', 'noon', 'dusk'] as const;
export type LightingTime = (typeof LIGHTING_TIMES)[number];

/** Weather states the code actually implements. */
export const LIGHTING_WEATHER = ['clear', 'overcast'] as const;
export type LightingWeather = (typeof LIGHTING_WEATHER)[number];

/**
 * States the UI names but the code does not implement. The host renders these
 * as disabled options labelled unavailable; they must never become enabled
 * without a real implementation behind them.
 */
export const UNSUPPORTED_TIMES = ['night'] as const;
export const UNSUPPORTED_WEATHER = ['rain', 'storm'] as const;

export function isLightingTime(value: unknown): value is LightingTime {
  return (
    value === 'morning' || value === 'noon' || value === 'dusk'
  );
}

export function isLightingWeather(value: unknown): value is LightingWeather {
  return value === 'clear' || value === 'overcast';
}

/** Bounded preview budget: small enough to build on the CPU in milliseconds. */
export const LIGHTING_BLADE_COUNT = 240;
const GROUND_SIZE = 18;
const ROAD_HALF_WIDTH = 1.2;
const SHED_POS = { x: 4.2, z: -2.5 };
const SHED_HALF = { x: 1.5, z: 1.2 };
/** Blades are rejected where the terrain is steeper than this (radians). */
const MAX_BLADE_SLOPE = 0.62;

/** Gentle procedural terrain; flattened under the road strip and the shed. */
export function groundHeight(x: number, z: number): number {
  const rolling =
    0.35 * Math.sin(x * 0.45) * Math.cos(z * 0.5) +
    0.15 * Math.sin(x * 1.3 + z * 0.9);
  const roadness = Math.max(0, 1 - Math.abs(x) / (ROAD_HALF_WIDTH + 1.2));
  const shedDx = Math.max(0, 1 - Math.abs(x - SHED_POS.x) / (SHED_HALF.x + 1.2));
  const shedDz = Math.max(0, 1 - Math.abs(z - SHED_POS.z) / (SHED_HALF.z + 1.2));
  const flat = Math.max(roadness, Math.min(shedDx, shedDz));
  return rolling * (1 - flat);
}

function groundSlope(x: number, z: number): number {
  const eps = 0.15;
  const h = groundHeight(x, z);
  const dx = (groundHeight(x + eps, z) - h) / eps;
  const dz = (groundHeight(x, z + eps) - h) / eps;
  return Math.atan(Math.hypot(dx, dz));
}

function onRoad(x: number): boolean {
  return Math.abs(x) < ROAD_HALF_WIDTH + 0.25;
}

function onShedFootprint(x: number, z: number): boolean {
  return (
    Math.abs(x - SHED_POS.x) < SHED_HALF.x + 0.2 &&
    Math.abs(z - SHED_POS.z) < SHED_HALF.z + 0.2
  );
}

export interface SunParams {
  color: number;
  intensity: number;
  position: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
}

const TIME_SUN: Record<LightingTime, SunParams> = {
  morning: {
    color: 0xffd9b0,
    intensity: 1.6,
    position: [6, 2.5, 2],
    hemiSky: 0xbfd4dd,
    hemiGround: 0x2a2620,
    hemiIntensity: 0.5,
  },
  noon: {
    color: 0xffffff,
    intensity: 2.4,
    position: [1.5, 8, 1],
    hemiSky: 0xcfe4ef,
    hemiGround: 0x33302a,
    hemiIntensity: 0.7,
  },
  dusk: {
    color: 0xff9a5c,
    intensity: 1.1,
    position: [-6, 2, -1.5],
    hemiSky: 0x8f7f8c,
    hemiGround: 0x1f1b18,
    hemiIntensity: 0.35,
  },
};

/** Weather multiplies the time-of-day rig; overcast cools the sun. */
export function sunParamsFor(
  time: LightingTime,
  weather: LightingWeather,
): SunParams {
  const base = TIME_SUN[time];
  if (weather === 'clear') return { ...base, position: [...base.position] as [number, number, number] };
  return {
    color: 0xcfd6dd,
    intensity: base.intensity * 0.35,
    position: [...base.position] as [number, number, number],
    hemiSky: base.hemiSky,
    hemiGround: base.hemiGround,
    hemiIntensity: base.hemiIntensity * 1.25,
  };
}

/** Tapered grass blade: a 2-segment plane narrowed toward the tip. */
function createBladeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(0.09, 0.55, 1, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const t = (y + 0.275) / 0.55;
    pos.setX(i, pos.getX(i) * (1 - t * 0.85));
  }
  geo.translate(0, 0.275, 0);
  geo.computeVertexNormals();
  return geo;
}

export interface LightingPreviewHandle {
  root: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  bladeCount: number;
  time: LightingTime;
  weather: LightingWeather;
  readonly disposed: boolean;
  /** Applies a supported state; unknown states return false and change nothing. */
  setTimeOfDay(time: LightingTime): boolean;
  setWeather(weather: LightingWeather): boolean;
  /** Frees every geometry/material exactly once. Idempotent. */
  dispose(): void;
}

/**
 * Build the bounded grass/road/shed preview. Deterministic: the same seed
 * always places the same blades. Throws only on a real THREE failure; the
 * host surfaces that instead of mounting a fallback scene.
 */
export function createLightingPreview(
  seed = 20260913,
): LightingPreviewHandle {
  let rng = seed >>> 0;
  const random = (): number => {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    return rng / 0x100000000;
  };

  const root = new THREE.Group();
  root.name = 'lighting-preview';

  // Ground: displaced plane following groundHeight, grass-green PBR.
  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 36, 36);
  groundGeo.rotateX(-Math.PI / 2);
  const groundPos = groundGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < groundPos.count; i += 1) {
    groundPos.setY(i, groundHeight(groundPos.getX(i), groundPos.getZ(i)));
  }
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x4d7a38,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.4,
  });
  root.add(new THREE.Mesh(groundGeo, groundMat));

  // Road: dark asphalt ribbon following the terrain, clear of the grass.
  const roadGeo = new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, GROUND_SIZE, 1, 36);
  roadGeo.rotateX(-Math.PI / 2);
  const roadPos = roadGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < roadPos.count; i += 1) {
    const x = roadPos.getX(i);
    const z = roadPos.getZ(i);
    roadPos.setY(i, groundHeight(x, z) + 0.03);
  }
  roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x33373b,
    roughness: 0.95,
    metalness: 0.0,
    envMapIntensity: 0.3,
  });
  root.add(new THREE.Mesh(roadGeo, roadMat));

  // Grass: jittered-grid InstancedMesh with road/shed/slope rejection.
  const bladeGeo = createBladeGeometry();
  const bladeMat = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.4,
  });
  const blades = new THREE.InstancedMesh(
    bladeGeo,
    bladeMat,
    LIGHTING_BLADE_COUNT,
  );
  const dummy = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const at = new THREE.Vector3();
  const tint = new THREE.Color();
  const cells = Math.ceil(Math.sqrt(LIGHTING_BLADE_COUNT));
  let placed = 0;
  let guard = 0;
  while (placed < LIGHTING_BLADE_COUNT && guard < LIGHTING_BLADE_COUNT * 40) {
    guard += 1;
    const cx = (guard % cells) + random();
    const cz = Math.floor(guard / cells) % cells + random();
    const x = (cx / cells - 0.5) * (GROUND_SIZE - 1);
    const z = (cz / cells - 0.5) * (GROUND_SIZE - 1);
    if (onRoad(x) || onShedFootprint(x, z)) continue;
    if (groundSlope(x, z) > MAX_BLADE_SLOPE) continue;
    euler.set(0, random() * Math.PI, 0);
    quat.setFromEuler(euler);
    const s = 0.7 + random() * 0.8;
    scale.set(s, s * (0.8 + random() * 0.6), s);
    at.set(x, groundHeight(x, z), z);
    dummy.compose(at, quat, scale);
    blades.setMatrixAt(placed, dummy);
    tint.setHSL(0.26 + random() * 0.05, 0.45, 0.28 + random() * 0.14);
    blades.setColorAt(placed, tint);
    placed += 1;
  }
  blades.count = placed;
  if (blades.instanceMatrix) blades.instanceMatrix.needsUpdate = true;
  if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
  root.add(blades);

  // Shed: box walls, two gable slabs, dark door — plain PBR, no textures.
  const shed = new THREE.Group();
  shed.position.set(SHED_POS.x, groundHeight(SHED_POS.x, SHED_POS.z), SHED_POS.z);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x8a6b4a,
    roughness: 0.85,
    metalness: 0.0,
    envMapIntensity: 0.4,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x5a5f66,
    roughness: 0.7,
    metalness: 0.25,
    envMapIntensity: 0.6,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x2c2f33,
    roughness: 0.9,
    metalness: 0.0,
    envMapIntensity: 0.3,
  });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.8), wallMat);
  walls.position.y = 0.8;
  shed.add(walls);
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 2.2), roofMat);
    slab.position.set(side * 0.58, 1.85, 0);
    slab.rotation.z = side * -0.5;
    shed.add(slab);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), doorMat);
  door.position.set(0, 0.62, 0.91);
  shed.add(door);
  root.add(shed);

  // Preview-owned lights: the host rig is never touched.
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(1.5, 8, 1);
  const hemi = new THREE.HemisphereLight(0xcfe4ef, 0x33302a, 0.7);
  root.add(sun, hemi);

  let time: LightingTime = 'noon';
  let weather: LightingWeather = 'clear';
  let freed = false;
  const apply = (): void => {
    const params = sunParamsFor(time, weather);
    sun.color.setHex(params.color);
    sun.intensity = params.intensity;
    sun.position.set(...params.position);
    hemi.color.setHex(params.hemiSky);
    hemi.groundColor.setHex(params.hemiGround);
    hemi.intensity = params.hemiIntensity;
  };
  apply();

  return {
    root,
    sun,
    hemi,
    bladeCount: placed,
    get time(): LightingTime {
      return time;
    },
    get weather(): LightingWeather {
      return weather;
    },
    get disposed(): boolean {
      return freed;
    },
    setTimeOfDay(next: LightingTime): boolean {
      if (freed || !isLightingTime(next)) return false;
      time = next;
      apply();
      return true;
    },
    setWeather(next: LightingWeather): boolean {
      if (freed || !isLightingWeather(next)) return false;
      weather = next;
      apply();
      return true;
    },
    dispose(): void {
      if (freed) return;
      freed = true;
      disposeObject(root);
    },
  };
}
