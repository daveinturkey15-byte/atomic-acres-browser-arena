/**
 * Source 38 — super-terrain's forest layer: an editable SPLINE FIELD driving a
 * plant community that conforms to sculpted terrain.
 *
 * The register (row 38) names six technique atoms observed in the artefact.
 * Five are demonstrated here; the sixth is deliberately not:
 *   1. placement driven by an editable spline field rather than a painted
 *      density map, "so forests conform to terrain and are re-editable";
 *   2. a mask field separating WHERE foliage may grow from HOW MUCH;
 *   3. per-SPECIES parameter sets, so one material serves many plants;
 *   4. clump geometry plus a blade material for ground cover;
 *   5. a forest-floor blend that ties the scatter back into the ground
 *      material;
 *   6. a standalone tree editor with GLB export — NOT implemented. The
 *      register calls the editor a product question, not an agent decision.
 *
 * Atom 1 is shown as a live control, not a claim: `update(time)` steps the
 * authored curve through three poses on a fixed 0.6 s cadence, and everything
 * downstream — admitted plants, ground cover, the floor blend and the visible
 * spline ribbon — is re-derived from the pose. Move the curve, the forest
 * follows.
 *
 * BEFORE is the failure this replaces: uniform random scatter, no mask, and a
 * constant Y. The constant Y is the pitfall the carrier skill names outright
 * ("placing vegetation at a flat constant Y will sink trees on higher ground or
 * float them on lower areas") and it is measured here, not just asserted:
 * `uniformOffGround` counts the BEFORE plants whose base misses the ground by
 * more than 5 cm, against `fieldOffGround`, which is exactly zero.
 *
 * The two ground panels differ ONLY by the forest-floor blend: both sample the
 * same 64x64 baked base, and the AFTER panel adds the canopy/litter splat
 * derived from the plants actually placed. That isolates atom 5 the way a third
 * panel isolates row 36's bake.
 *
 * Licence, re-verified by this lane on 2026-09-12 and CONFLICTING with the
 * register: `vibe-stack/super-terrain` LICENSE on `main` now returns HTTP 200,
 * 1,094 B, MIT, "Copyright (c) 2026 alightinastorm (x.com/alightinastorm)".
 * The register's 2026-08-31 finding was "STILL NO LICENCE FILE ... 404 on all
 * five names". The register is not edited from this lane; the conflict is
 * recorded in SOURCE_RESEARCH.json for reconciliation. Either way this file
 * copies nothing: every function below is written here from the general idea,
 * which is what the register's decision (authority 2b) asked for. No file,
 * function, shader body, constant table or comment is taken from the source.
 */

import { hash11 } from '../../../noise';
import {
  beforeAfterPanels,
  countDraws,
  createRng,
  disposeTree,
  paintVertices,
  type Demo,
  type DemoContext,
} from './shared';

type ThreeApi = typeof import('three');
type BufferGeometry = import('three').BufferGeometry;
type InstancedMesh = import('three').InstancedMesh;

export const PATCH = 3.0;
const CANDIDATES = 900;
const COVER_CANDIDATES = 520;
// 2.5 cm quads. The channel is carved at a 0.30 m scale, and a coarser grid
// cannot represent its rim: at 80 segments the mesh normals sit 12 degrees off
// the closed-form normal there, which is what the terrain/mesh agreement test
// measures.
const TERRAIN_SEGMENTS = 120;
const FLOOR_SIZE = 64;
const RELIEF_SIZE = 128;
/** Detail tiles per patch edge: 3 m / 6 = 0.5 m per tile. */
const RELIEF_REPEAT = 6;

/** Seconds one authored curve pose is held before the next. */
export const POSE_SECONDS = 0.6;

// ---------------------------------------------------------------------------
// Terrain. A closed-form height field, so the same surface can be evaluated by
// the mesh builder, by the scatter, by the floor bake and by a CPU test without
// any of them sharing state.
// ---------------------------------------------------------------------------

const CLEARING = { x: 0.7, z: 0.5, radius: 0.55 };

/** Rolling ground before the stream is carved and the clearing is levelled. */
function rollingHeight(x: number, z: number): number {
  return (
    0.17 * Math.sin(x * 1.7 + 0.4) * Math.cos(z * 1.45 - 0.8)
    + 0.07 * Math.sin(x * 3.1 - z * 2.4 + 1.2)
    + 0.035 * Math.cos(x * 5.3 + z * 4.1)
  );
}

/**
 * Signed distance across the watercourse the mask field excludes. The mask and
 * the terrain read the SAME curve, which is why the stream is visibly a stream
 * and not an invisible rule.
 */
export function channelOffset(x: number, z: number): number {
  return z + Math.sin(x * 1.3) * 0.35 - 1.0;
}

/** 1 on the stream line, falling off across the banks. Drives species and soil. */
export function moistureAt(x: number, z: number): number {
  const d = channelOffset(x, z) / 0.45;
  return Math.exp(-d * d);
}

/** Level pad the clearing is flattened onto, so the glade reads as authored. */
const CLEARING_PAD = rollingHeight(CLEARING.x, CLEARING.z) - 0.015;

export function terrainHeight(x: number, z: number): number {
  const channel = channelOffset(x, z) / 0.30;
  const height = rollingHeight(x, z) - 0.26 * Math.exp(-channel * channel);
  const distance = Math.hypot(x - CLEARING.x, z - CLEARING.z);
  const edge = CLEARING.radius;
  const inner = CLEARING.radius * 0.55;
  if (distance >= edge) return height;
  const t = distance <= inner ? 0 : (distance - inner) / (edge - inner);
  const weight = 1 - t * t * (3 - 2 * t);
  return height * (1 - weight) + CLEARING_PAD * weight;
}

/** Unit surface normal by central difference on the closed-form height. */
export function terrainNormal(x: number, z: number): [number, number, number] {
  const e = 0.004;
  const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  const length = Math.hypot(dx, 1, dz);
  return [-dx / length, 1 / length, -dz / length];
}

/** Slope in radians from vertical. Species refuse ground steeper than they like. */
export function terrainSlope(x: number, z: number): number {
  const [, ny] = terrainNormal(x, z);
  return Math.acos(Math.max(-1, Math.min(1, ny)));
}

// ---------------------------------------------------------------------------
// Atom 2 — the mask field. Unchanged from the first delivery of this exhibit:
// a hard yes/no about admissibility that no density change can override.
// ---------------------------------------------------------------------------

export function maskField(x: number, z: number): boolean {
  const clearing = Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.radius;
  const watercourse = Math.abs(channelOffset(x, z)) < 0.22;
  return !clearing && !watercourse;
}

// ---------------------------------------------------------------------------
// Atom 1 — the spline field. Three authored poses of one curve; the exhibit
// cycles them so re-editability is visible rather than asserted.
// ---------------------------------------------------------------------------

export type Curve = ReadonlyArray<readonly [number, number]>;

export const CURVE_POSES: readonly Curve[] = [
  [[-1.35, -1.2], [-0.6, -0.35], [0.1, 0.15], [0.75, -0.25], [1.3, -1.0]],
  [[-1.35, -1.2], [-0.75, -0.1], [-0.05, 0.6], [0.6, 0.35], [1.3, -0.35]],
  [[-1.35, -0.9], [-0.5, -0.7], [0.25, -0.55], [0.85, -0.9], [1.3, -1.25]],
];

export function poseAtTime(time: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.floor(Math.max(0, time) / POSE_SECONDS) % CURVE_POSES.length;
}

/** Distance from (x, z) to the polyline, and the density that distance implies. */
export function splineDistance(x: number, z: number, curve: Curve): number {
  let nearest = Infinity;
  for (let i = 0; i < curve.length - 1; i += 1) {
    const [ax, az] = curve[i];
    const [bx, bz] = curve[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    nearest = Math.min(nearest, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return nearest;
}

export function splineDensity(x: number, z: number, curve: Curve, falloff = 0.95): number {
  return Math.max(0, 1 - splineDistance(x, z, curve) / falloff);
}

/** Point on the polyline at arc-length fraction `t`, for the overlay ribbon. */
export function sampleCurve(curve: Curve, t: number): [number, number] {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < curve.length - 1; i += 1) {
    const segment = Math.hypot(curve[i + 1][0] - curve[i][0], curve[i + 1][1] - curve[i][1]);
    lengths.push(segment);
    total += segment;
  }
  let travelled = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lengths.length; i += 1) {
    if (travelled > lengths[i] && i < lengths.length - 1) {
      travelled -= lengths[i];
      continue;
    }
    const f = lengths[i] > 0 ? Math.min(1, travelled / lengths[i]) : 0;
    return [
      curve[i][0] + (curve[i + 1][0] - curve[i][0]) * f,
      curve[i][1] + (curve[i + 1][1] - curve[i][1]) * f,
    ];
  }
  return [curve[0][0], curve[0][1]];
}

// ---------------------------------------------------------------------------
// Atom 3 — per-species parameter sets. Every field below changes where a plant
// may stand, how it stands there or how it reads; none of them add a material.
// Four species, four materials, whatever the instance count.
// ---------------------------------------------------------------------------

export type Species = {
  name: string;
  /** Relative share of candidate slots. */
  weight: number;
  minHeight: number;
  maxHeight: number;
  /** Crown radius in metres at unit height; also the separation the dart uses. */
  radius: number;
  minSeparation: number;
  /** Radians from vertical this species tolerates. */
  maxSlope: number;
  minMoisture: number;
  maxMoisture: number;
  /** 0 stands bolt upright, 1 lies flat along the ground normal. */
  normalFollow: number;
  /** Multiplies the spline density, so species answer one field differently. */
  densityBias: number;
  /** Litter and canopy shade this species contributes to the floor blend. */
  shade: number;
  litter: number;
  tint: number;
};

export const SPECIES: readonly Species[] = [
  {
    name: 'canopy-fir',
    weight: 0.20,
    minHeight: 0.52,
    maxHeight: 0.86,
    radius: 0.13,
    minSeparation: 0.19,
    maxSlope: 0.60,
    minMoisture: 0,
    maxMoisture: 0.45,
    normalFollow: 0.10,
    densityBias: 1.15,
    shade: 0.55,
    litter: 0.30,
    tint: 0xb9c6a8,
  },
  {
    name: 'broadleaf',
    weight: 0.18,
    minHeight: 0.42,
    maxHeight: 0.66,
    radius: 0.17,
    minSeparation: 0.22,
    maxSlope: 0.75,
    minMoisture: 0.05,
    maxMoisture: 0.80,
    normalFollow: 0.18,
    densityBias: 1.0,
    shade: 0.62,
    litter: 0.46,
    tint: 0xc8cfa6,
  },
  {
    name: 'riparian-willow',
    weight: 0.17,
    minHeight: 0.26,
    maxHeight: 0.44,
    radius: 0.12,
    minSeparation: 0.13,
    maxSlope: 1.00,
    minMoisture: 0.35,
    maxMoisture: 1.0,
    normalFollow: 0.30,
    densityBias: 0.75,
    shade: 0.34,
    litter: 0.20,
    tint: 0xbcd0b0,
  },
  {
    name: 'understory-shrub',
    weight: 0.45,
    minHeight: 0.12,
    maxHeight: 0.22,
    radius: 0.08,
    minSeparation: 0.075,
    maxSlope: 1.10,
    minMoisture: 0,
    maxMoisture: 0.90,
    normalFollow: 0.50,
    densityBias: 0.85,
    shade: 0.16,
    litter: 0.12,
    tint: 0xb6c9a2,
  },
];

/**
 * The species' own environment window, applied AFTER the mask and BEFORE the
 * density roll. Mask decides admissibility for anything; this decides whether
 * THIS plant belongs here; density decides how many. Three separate decisions.
 */
export function speciesAdmits(species: Species, x: number, z: number): boolean {
  if (!maskField(x, z)) return false;
  if (terrainSlope(x, z) > species.maxSlope) return false;
  const wet = moistureAt(x, z);
  return wet >= species.minMoisture && wet <= species.maxMoisture;
}

// ---------------------------------------------------------------------------
// Atom 5 — the forest-floor blend. Base soil is baked once from the terrain;
// the blend adds canopy shade and litter derived from the plants that were
// actually placed, so the ground answers the scatter instead of ignoring it.
// ---------------------------------------------------------------------------

export type FloorPlant = { x: number; z: number; radius: number; shade: number; litter: number };

/** Texel centre to patch-local world XZ, matching DataTexture's unflipped rows. */
export function floorTexelToWorld(u: number, v: number): [number, number] {
  return [(u - 0.5) * PATCH, (0.5 - v) * PATCH];
}

export function bakeFloorBase(size: number): Float32Array {
  const base = new Float32Array(size * size * 3);
  for (let row = 0; row < size; row += 1) {
    const v = (row + 0.5) / size;
    for (let col = 0; col < size; col += 1) {
      const u = (col + 0.5) / size;
      const [x, z] = floorTexelToWorld(u, v);
      const wet = moistureAt(x, z);
      const height = terrainHeight(x, z);
      const grain = 0.5 + 0.5 * Math.sin(x * 41.3 + z * 27.7) * Math.sin(x * 17.1 - z * 33.5);
      const i = (row * size + col) * 3;
      base[i] = 0.33 - wet * 0.15 + height * 0.12 + grain * 0.030;
      base[i + 1] = 0.29 - wet * 0.05 + height * 0.09 + grain * 0.034;
      base[i + 2] = 0.19 - wet * 0.02 + height * 0.05 + grain * 0.020;
    }
  }
  return base;
}

/**
 * Scatter-splat, not gather: each plant writes into its own texel footprint, so
 * a rebuild costs plants x footprint rather than texels x plants.
 */
export function bakeFloorBlend(
  base: Float32Array,
  plants: readonly FloorPlant[],
  size: number,
  out?: Uint8Array,
): Uint8Array {
  const data = out ?? new Uint8Array(size * size * 4);
  const shade = new Float32Array(size * size);
  const litter = new Float32Array(size * size);
  const texelsPerMetre = size / PATCH;

  for (const plant of plants) {
    const radius = Math.max(plant.radius, PATCH / size);
    const cu = plant.x / PATCH + 0.5;
    const cv = 0.5 - plant.z / PATCH;
    const cCol = cu * size - 0.5;
    const cRow = cv * size - 0.5;
    const span = radius * texelsPerMetre;
    const minRow = Math.max(0, Math.floor(cRow - span));
    const maxRow = Math.min(size - 1, Math.ceil(cRow + span));
    const minCol = Math.max(0, Math.floor(cCol - span));
    const maxCol = Math.min(size - 1, Math.ceil(cCol + span));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const dr = (row - cRow) / span;
        const dc = (col - cCol) / span;
        const d2 = dr * dr + dc * dc;
        if (d2 >= 1) continue;
        const falloff = (1 - d2) * (1 - d2);
        const t = row * size + col;
        shade[t] += plant.shade * falloff;
        litter[t] += plant.litter * falloff;
      }
    }
  }

  for (let t = 0; t < size * size; t += 1) {
    const darken = 1 - Math.min(0.55, shade[t]);
    const dressing = Math.min(0.75, litter[t]);
    const r = (base[t * 3] * darken) * (1 - dressing) + 0.29 * dressing;
    const g = (base[t * 3 + 1] * darken) * (1 - dressing) + 0.21 * dressing;
    const b = (base[t * 3 + 2] * darken) * (1 - dressing) + 0.12 * dressing;
    data[t * 4] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[t * 4 + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[t * 4 + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    data[t * 4 + 3] = 255;
  }
  return data;
}

/**
 * Micro-relief for the floor: a tileable height field for the ground's normal
 * map. Every term is periodic in both axes at an integer frequency, so the
 * field wraps exactly and the map can repeat without a seam.
 */
export function microReliefHeight(nx: number, ny: number): number {
  const tau = Math.PI * 2;
  const grain = 0.5 + 0.5 * Math.sin(tau * 6 * nx + 1.3) * Math.sin(tau * 5 * ny - 0.4);
  const fibres = 0.5 + 0.5 * Math.sin(tau * 13 * nx - tau * 9 * ny);
  const pebbleField = 0.5 + 0.5 * Math.sin(tau * 3 * nx + 0.7) * Math.cos(tau * 4 * ny - 1.1);
  const pebbles = pebbleField > 0.62 ? (pebbleField - 0.62) / 0.38 : 0;
  return grain * 0.45 + fibres * 0.18 + pebbles * 0.37;
}

/**
 * Tangent-space normal map from that height field, with TOROIDAL neighbour
 * sampling so the gradient at an edge sees the opposite edge rather than a
 * step. Encoding, strength and the [0.5, 0.5, 1] flat convention follow the
 * carrier skill's canvas generator; this writes the same bytes into a
 * DataTexture instead of a canvas, because a technique-lab factory must build
 * without a DOM and stay assertable on the CPU.
 */
export function bakeGroundNormalMap(size: number, strength: number): Uint8Array {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) field[y * size + x] = microReliefHeight(x / size, y / size);
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = field[y * size + ((x + size - 1) % size)];
      const right = field[y * size + ((x + 1) % size)];
      const down = field[((y + size - 1) % size) * size + x];
      const up = field[((y + 1) % size) * size + x];
      const gradX = (right - left) * strength;
      const gradY = (up - down) * strength;
      const length = Math.sqrt(gradX * gradX + gradY * gradY + 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round((-gradX / length) * 127.5 + 127.5);
      data[i + 1] = Math.round((-gradY / length) * 127.5 + 127.5);
      data[i + 2] = Math.round((1 / length) * 127.5 + 127.5);
      data[i + 3] = 255;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Geometry. Plants are merged into one geometry per species so a species costs
// one draw, and each is authored at unit height with its base at y = 0, so a
// per-instance uniform scale is a real height in metres.
// ---------------------------------------------------------------------------

type Part = { geometry: BufferGeometry; matrix: import('three').Matrix4 };

/**
 * Merges parts through the INJECTED THREE, so the merged geometry belongs to
 * the same module instance the host renders with. Every input is forced
 * non-indexed first: the carrier skill records that mixing indexed and
 * non-indexed inputs is the failure mode of geometry merging.
 */
function mergeParts(THREE: ThreeApi, parts: Part[]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const part of parts) {
    const flat = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    flat.applyMatrix4(part.matrix);
    const position = flat.getAttribute('position');
    const normal = flat.getAttribute('normal');
    const uv = flat.getAttribute('uv');
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    flat.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  return merged;
}

function placed(THREE: ThreeApi, geometry: BufferGeometry, x: number, y: number, z: number, tiltX = 0, tiltZ = 0, scaleY = 1): Part {
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler(tiltX, 0, tiltZ);
  matrix.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(euler),
    new THREE.Vector3(1, scaleY, 1),
  );
  return { geometry, matrix };
}

/** Builds one species' geometry at unit height, painted trunk-to-crown. */
function buildSpeciesGeometry(THREE: ThreeApi, species: Species): BufferGeometry {
  const sources: BufferGeometry[] = [];
  const parts: Part[] = [];
  const keep = (geometry: BufferGeometry): BufferGeometry => {
    sources.push(geometry);
    return geometry;
  };

  let trunkTop = 0;
  if (species.name === 'canopy-fir') {
    const trunk = keep(new THREE.CylinderGeometry(0.021, 0.032, 0.40, 6));
    parts.push(placed(THREE, trunk, 0, 0.20, 0));
    const tiers: Array<[number, number, number]> = [
      [0.135, 0.34, 0.40],
      [0.105, 0.30, 0.58],
      [0.072, 0.24, 0.76],
    ];
    for (const [radius, height, base] of tiers) {
      const cone = keep(new THREE.ConeGeometry(radius, height, 7));
      parts.push(placed(THREE, cone, 0, base + height / 2, 0));
    }
    trunkTop = 0.40;
  } else if (species.name === 'broadleaf') {
    const trunk = keep(new THREE.CylinderGeometry(0.024, 0.040, 0.46, 6));
    parts.push(placed(THREE, trunk, 0, 0.23, 0));
    const lobe = keep(new THREE.IcosahedronGeometry(0.23, 0));
    parts.push(placed(THREE, lobe, 0, 0.66, 0, 0, 0, 0.78));
    parts.push(placed(THREE, lobe, 0.13, 0.80, 0.06, 0, 0.2, 0.62));
    parts.push(placed(THREE, lobe, -0.11, 0.76, -0.09, 0.15, 0, 0.58));
    trunkTop = 0.46;
  } else if (species.name === 'riparian-willow') {
    const trunk = keep(new THREE.CylinderGeometry(0.020, 0.034, 0.34, 5));
    parts.push(placed(THREE, trunk, 0, 0.17, 0));
    const strand = keep(new THREE.CylinderGeometry(0.008, 0.015, 0.44, 3));
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + 0.3;
      const lean = 0.42;
      parts.push(placed(
        THREE,
        strand,
        Math.cos(angle) * 0.10,
        0.52,
        Math.sin(angle) * 0.10,
        Math.sin(angle) * lean,
        -Math.cos(angle) * lean,
      ));
    }
    trunkTop = 0.34;
  } else {
    const lobes: Array<[number, number, number, number, number]> = [
      [0.17, 0, 0.16, 0, 0.72],
      [0.13, 0.11, 0.22, 0.05, 0.62],
      [0.11, -0.09, 0.14, -0.08, 0.66],
    ];
    for (const [radius, x, y, z, flat] of lobes) {
      const blob = keep(new THREE.IcosahedronGeometry(radius, 0));
      parts.push(placed(THREE, blob, x, y, z, 0, 0, flat));
    }
    trunkTop = 0.04;
  }

  const geometry = mergeParts(THREE, parts);
  for (const source of sources) source.dispose();

  // One material per species; the trunk/crown split and the depth gradient are
  // carried by vertex colour, and per-instance tint is carried by instanceColor.
  paintVertices(THREE, geometry, (x, y, z) => {
    if (y < trunkTop) {
      const grain = 0.86 + 0.14 * Math.sin(y * 61);
      return [0.155 * grain, 0.112 * grain, 0.074 * grain];
    }
    const crown = Math.max(0, Math.min(1, (y - trunkTop) / Math.max(0.2, 1 - trunkTop)));
    const radial = Math.min(1, Math.hypot(x, z) / 0.22);
    const lift = 0.62 + 0.38 * crown;
    const rim = 0.78 + 0.22 * radial;
    return [0.085 * lift * rim, 0.205 * lift * rim, 0.070 * lift * rim];
  });
  return geometry;
}

/**
 * Atom 4 — clump geometry for ground cover: seven bent blades merged into one
 * geometry so a whole tuft is a single instance, with a root-to-tip vertex
 * gradient the blade material reads.
 */
function buildClumpGeometry(THREE: ThreeApi): BufferGeometry {
  const blades = 7;
  const segments = 3;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let b = 0; b < blades; b += 1) {
    const angle = (b / blades) * Math.PI * 2 + hash11(b * 3.1) * 0.7;
    const lean = 0.22 + hash11(b * 7.3) * 0.34;
    const height = 0.72 + hash11(b * 11.9) * 0.28;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const rootX = dirX * 0.018;
    const rootZ = dirZ * 0.018;
    const ring: Array<[number, number, number, number, number, number]> = [];
    for (let s = 0; s <= segments; s += 1) {
      const t = s / segments;
      const width = 0.016 * (1 - t) + 0.002;
      const y = height * t;
      const bend = lean * height * t * t;
      const cx = rootX + dirX * bend;
      const cz = rootZ + dirZ * bend;
      ring.push([cx - dirZ * width, y, cz + dirX * width, cx + dirZ * width, y, cz - dirX * width]);
    }
    for (let s = 0; s < segments; s += 1) {
      const [lx0, ly0, lz0, rx0, ry0, rz0] = ring[s];
      const [lx1, ly1, lz1, rx1, ry1, rz1] = ring[s + 1];
      const v0 = s / segments;
      const v1 = (s + 1) / segments;
      positions.push(lx0, ly0, lz0, rx0, ry0, rz0, lx1, ly1, lz1);
      uvs.push(0, v0, 1, v0, 0, v1);
      positions.push(rx0, ry0, rz0, rx1, ry1, rz1, lx1, ly1, lz1);
      uvs.push(1, v0, 1, v1, 0, v1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  paintVertices(THREE, geometry, (_x, y) => {
    const t = Math.max(0, Math.min(1, y / 0.85));
    return [0.055 + 0.115 * t, 0.115 + 0.205 * t, 0.038 + 0.075 * t];
  });
  return geometry;
}

// ---------------------------------------------------------------------------

type Candidate = {
  x: number;
  z: number;
  y: number;
  speciesIndex: number;
  roll: number;
  scale: number;
  quaternion: import('three').Quaternion;
  tint: import('three').Color;
  /** Mask + species window + separation. Pose gating only ever removes more. */
  environmental: boolean;
};

type Clump = {
  x: number;
  z: number;
  y: number;
  roll: number;
  scale: number;
  quaternion: import('three').Quaternion;
  tint: import('three').Color;
  environmental: boolean;
};

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-38-spline-field-forest';
  const { before, after } = beforeAfterPanels(THREE, 3.6);

  // --- terrain: one geometry, both panels, so the ground is provably the same
  const terrainGeometry = new THREE.PlaneGeometry(PATCH, PATCH, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPosition = terrainGeometry.getAttribute('position');
  for (let i = 0; i < terrainPosition.count; i += 1) {
    terrainPosition.setY(i, terrainHeight(terrainPosition.getX(i), terrainPosition.getZ(i)));
  }
  terrainPosition.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  terrainGeometry.computeBoundingSphere();

  const floorBase = bakeFloorBase(FLOOR_SIZE);
  const plainBytes = bakeFloorBlend(floorBase, [], FLOOR_SIZE);
  const blendBytes = bakeFloorBlend(floorBase, [], FLOOR_SIZE);
  const makeFloorTexture = (bytes: Uint8Array): import('three').DataTexture => {
    const texture = new THREE.DataTexture(bytes, FLOOR_SIZE, FLOOR_SIZE, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  };
  const plainTexture = makeFloorTexture(plainBytes);
  const blendTexture = makeFloorTexture(blendBytes);

  // Micro-relief, shared by both panels so the ONLY difference between the two
  // floors stays the forest-floor blend. The colour bake is unique to the patch
  // and must not tile; the relief is a detail tile and must.
  const reliefTexture = new THREE.DataTexture(
    bakeGroundNormalMap(RELIEF_SIZE, 2.2),
    RELIEF_SIZE,
    RELIEF_SIZE,
    THREE.RGBAFormat,
  );
  reliefTexture.colorSpace = THREE.NoColorSpace;
  reliefTexture.wrapS = THREE.RepeatWrapping;
  reliefTexture.wrapT = THREE.RepeatWrapping;
  reliefTexture.repeat.set(RELIEF_REPEAT, RELIEF_REPEAT);
  reliefTexture.minFilter = THREE.LinearMipmapLinearFilter;
  reliefTexture.magFilter = THREE.LinearFilter;
  reliefTexture.generateMipmaps = true;
  reliefTexture.needsUpdate = true;
  const groundMaterial = (map: import('three').DataTexture): import('three').Material =>
    new THREE.MeshStandardMaterial({
      map,
      normalMap: reliefTexture,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughness: 0.97,
      metalness: 0,
    });

  before.add(new THREE.Mesh(terrainGeometry, groundMaterial(plainTexture)));
  after.add(new THREE.Mesh(terrainGeometry, groundMaterial(blendTexture)));

  // --- one geometry and one material per species, whatever the plant count
  const speciesGeometries = SPECIES.map((species) => buildSpeciesGeometry(THREE, species));
  const makeSpeciesMeshes = (group: import('three').Group, label: string): InstancedMesh[] =>
    SPECIES.map((species, index) => {
      const mesh = new THREE.InstancedMesh(
        speciesGeometries[index],
        new THREE.MeshStandardMaterial({
          color: species.tint,
          vertexColors: true,
          roughness: 0.86,
          metalness: 0,
        }),
        CANDIDATES,
      );
      mesh.name = `${label}-${species.name}`;
      mesh.count = 0;
      group.add(mesh);
      return mesh;
    });

  const uniformMeshes = makeSpeciesMeshes(before, 'uniform');
  const fieldMeshes = makeSpeciesMeshes(after, 'field');

  // --- ground cover: clump geometry with its own blade material (atom 4)
  const clumpGeometry = buildClumpGeometry(THREE);
  const clumpMesh = new THREE.InstancedMesh(
    clumpGeometry,
    new THREE.MeshPhysicalMaterial({
      color: 0xc4d3a6,
      vertexColors: true,
      roughness: 0.58,
      metalness: 0,
      sheen: 0.6,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color(0xdff0b8),
      side: THREE.DoubleSide,
    }),
    COVER_CANDIDATES,
  );
  clumpMesh.name = 'ground-cover-clumps';
  clumpMesh.count = 0;
  after.add(clumpMesh);

  // --- the authored curve itself, drawn on the ground it controls
  const OVERLAY_SAMPLES = 72;
  const overlayGeometry = new THREE.BufferGeometry();
  const overlayPositions = new Float32Array(OVERLAY_SAMPLES * 2 * 3);
  overlayGeometry.setAttribute('position', new THREE.BufferAttribute(overlayPositions, 3));
  const overlayIndex: number[] = [];
  for (let i = 0; i < OVERLAY_SAMPLES - 1; i += 1) {
    const a = i * 2;
    overlayIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  overlayGeometry.setIndex(overlayIndex);
  const overlayMesh = new THREE.Mesh(
    overlayGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xffca7a,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  overlayMesh.name = 'spline-overlay';
  overlayMesh.renderOrder = 2;
  after.add(overlayMesh);

  // --- candidates: species pick, environment window and separation, once
  const rng = createRng(seed);
  const cumulative: number[] = [];
  let weightSum = 0;
  for (const species of SPECIES) {
    weightSum += species.weight;
    cumulative.push(weightSum);
  }

  const candidates: Candidate[] = [];
  const acceptedBySpecies: Array<Array<[number, number]>> = SPECIES.map(() => []);
  const up = new THREE.Vector3(0, 1, 0);
  const normalVector = new THREE.Vector3();
  const blend = new THREE.Vector3();

  let uniformOffGround = 0;
  let uniformViolatingMask = 0;
  const uniformCounts = SPECIES.map(() => 0);
  const uniformMatrix = new THREE.Matrix4();
  const uniformScale = new THREE.Vector3();
  const uniformPosition = new THREE.Vector3();
  const uniformTint = new THREE.Color();
  // BEFORE's constant Y: the patch's nominal ground plane, which is what a
  // scatter that never asks the terrain a question ends up standing on.
  const CONSTANT_Y = 0;

  for (let i = 0; i < CANDIDATES; i += 1) {
    const x = (rng() - 0.5) * PATCH;
    const z = (rng() - 0.5) * PATCH;
    const pick = rng() * weightSum;
    let speciesIndex = SPECIES.length - 1;
    for (let s = 0; s < cumulative.length; s += 1) {
      if (pick <= cumulative[s]) {
        speciesIndex = s;
        break;
      }
    }
    const species = SPECIES[speciesIndex];
    const height = species.minHeight + hash11(i * 1.7) * (species.maxHeight - species.minHeight);
    const ground = terrainHeight(x, z);
    const yaw = hash11(i * 4.4) * Math.PI * 2;

    // AFTER orientation: partly along the ground normal, by species.
    const [nx, ny, nz] = terrainNormal(x, z);
    normalVector.set(nx, ny, nz);
    blend.copy(up).lerp(normalVector, species.normalFollow).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, blend);
    quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(up, yaw));

    const shade = 0.88 + hash11(i * 13.3) * 0.24;
    const tint = new THREE.Color(species.tint).multiplyScalar(shade);

    // BEFORE: every candidate, no mask, no species window, constant Y.
    uniformPosition.set(x, CONSTANT_Y, z);
    uniformScale.setScalar(height);
    uniformMatrix.compose(
      uniformPosition,
      new THREE.Quaternion().setFromAxisAngle(up, yaw),
      uniformScale,
    );
    const uniformMesh = uniformMeshes[speciesIndex];
    uniformMesh.setMatrixAt(uniformCounts[speciesIndex], uniformMatrix);
    uniformTint.copy(tint);
    uniformMesh.setColorAt(uniformCounts[speciesIndex], uniformTint);
    uniformCounts[speciesIndex] += 1;
    if (!maskField(x, z)) uniformViolatingMask += 1;
    if (Math.abs(ground - CONSTANT_Y) > 0.05) uniformOffGround += 1;

    let environmental = speciesAdmits(species, x, z);
    if (environmental) {
      for (const [ax, az] of acceptedBySpecies[speciesIndex]) {
        if (Math.hypot(x - ax, z - az) < species.minSeparation) {
          environmental = false;
          break;
        }
      }
    }
    if (environmental) acceptedBySpecies[speciesIndex].push([x, z]);

    candidates.push({
      x,
      z,
      y: ground,
      speciesIndex,
      roll: hash11(i * 8.9),
      scale: height,
      quaternion,
      tint,
      environmental,
    });
  }

  for (let s = 0; s < SPECIES.length; s += 1) {
    uniformMeshes[s].count = uniformCounts[s];
    uniformMeshes[s].instanceMatrix.needsUpdate = true;
    if (uniformMeshes[s].instanceColor) uniformMeshes[s].instanceColor!.needsUpdate = true;
    uniformMeshes[s].computeBoundingSphere();
  }

  // --- ground-cover candidates, with their own stream and their own rules
  const coverRng = createRng(seed + 977);
  const clumps: Clump[] = [];
  for (let i = 0; i < COVER_CANDIDATES; i += 1) {
    const x = (coverRng() - 0.5) * PATCH;
    const z = (coverRng() - 0.5) * PATCH;
    const ground = terrainHeight(x, z);
    const [nx, ny, nz] = terrainNormal(x, z);
    normalVector.set(nx, ny, nz);
    blend.copy(up).lerp(normalVector, 0.8).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, blend);
    quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(up, hash11(i * 5.7) * Math.PI * 2));
    const wet = moistureAt(x, z);
    // Ground cover grows on the stream banks and in the open; it refuses only
    // the water itself and ground too steep to hold a tuft.
    const environmental = Math.abs(channelOffset(x, z)) > 0.13 && terrainSlope(x, z) < 1.15;
    clumps.push({
      x,
      z,
      y: ground,
      roll: hash11(i * 2.9),
      scale: (0.16 + hash11(i * 6.1) * 0.12) * (0.85 + wet * 0.4),
      quaternion,
      tint: new THREE.Color(0xc4d3a6).multiplyScalar(0.82 + hash11(i * 9.4) * 0.3),
      environmental,
    });
  }

  // --- pose-driven rebuild: everything downstream of the curve, re-derived
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();
  const colour = new THREE.Color();
  const floorPlants: FloorPlant[] = [];

  const counters: Record<string, number> = {
    candidates: CANDIDATES,
    coverCandidates: COVER_CANDIDATES,
    species: SPECIES.length,
    uniformPlaced: uniformCounts.reduce((a, b) => a + b, 0),
    uniformViolatingMask,
    uniformOffGround,
    fieldPlaced: 0,
    fieldViolatingMask: 0,
    fieldOffGround: 0,
    groundCoverPlaced: 0,
    curvePose: -1,
    poseRebuilds: 0,
    meanDistanceToCurve: 0,
    floorTexels: FLOOR_SIZE * FLOOR_SIZE,
    instancedMeshes: 0,
    triangles: 0,
  };

  let activePose = -1;

  function rebuild(pose: number): void {
    const curve = CURVE_POSES[pose];
    const counts = SPECIES.map(() => 0);
    floorPlants.length = 0;
    let placedCount = 0;
    let violations = 0;
    let offGround = 0;
    let distanceSum = 0;

    for (const candidate of candidates) {
      if (!candidate.environmental) continue;
      const species = SPECIES[candidate.speciesIndex];
      const density = splineDensity(candidate.x, candidate.z, curve) * species.densityBias;
      if (candidate.roll > density) continue;
      position.set(candidate.x, candidate.y, candidate.z);
      scaleVector.setScalar(candidate.scale);
      matrix.compose(position, candidate.quaternion, scaleVector);
      const mesh = fieldMeshes[candidate.speciesIndex];
      mesh.setMatrixAt(counts[candidate.speciesIndex], matrix);
      colour.copy(candidate.tint);
      mesh.setColorAt(counts[candidate.speciesIndex], colour);
      counts[candidate.speciesIndex] += 1;
      placedCount += 1;
      if (!maskField(candidate.x, candidate.z)) violations += 1;
      if (Math.abs(terrainHeight(candidate.x, candidate.z) - candidate.y) > 1e-6) offGround += 1;
      distanceSum += splineDistance(candidate.x, candidate.z, curve);
      floorPlants.push({
        x: candidate.x,
        z: candidate.z,
        radius: species.radius * candidate.scale * 2.6,
        shade: species.shade,
        litter: species.litter,
      });
    }

    for (let s = 0; s < SPECIES.length; s += 1) {
      fieldMeshes[s].count = counts[s];
      fieldMeshes[s].instanceMatrix.needsUpdate = true;
      if (fieldMeshes[s].instanceColor) fieldMeshes[s].instanceColor!.needsUpdate = true;
      fieldMeshes[s].computeBoundingSphere();
    }

    // Ground cover fills what the canopy leaves: it thins under dense forest
    // and carpets the clearing and the banks.
    let coverCount = 0;
    for (const clump of clumps) {
      if (!clump.environmental) continue;
      const canopy = splineDensity(clump.x, clump.z, curve);
      if (clump.roll < canopy * 0.72) continue;
      position.set(clump.x, clump.y, clump.z);
      scaleVector.setScalar(clump.scale);
      matrix.compose(position, clump.quaternion, scaleVector);
      clumpMesh.setMatrixAt(coverCount, matrix);
      colour.copy(clump.tint);
      clumpMesh.setColorAt(coverCount, colour);
      coverCount += 1;
      floorPlants.push({
        x: clump.x,
        z: clump.z,
        radius: 0.09,
        shade: 0.06,
        litter: 0.10,
      });
    }
    clumpMesh.count = coverCount;
    clumpMesh.instanceMatrix.needsUpdate = true;
    if (clumpMesh.instanceColor) clumpMesh.instanceColor.needsUpdate = true;
    clumpMesh.computeBoundingSphere();

    // The floor answers the scatter that was just placed.
    bakeFloorBlend(floorBase, floorPlants, FLOOR_SIZE, blendBytes);
    blendTexture.needsUpdate = true;

    // The visible ribbon is the same polyline the density read.
    for (let i = 0; i < OVERLAY_SAMPLES; i += 1) {
      const t = i / (OVERLAY_SAMPLES - 1);
      const [cx, cz] = sampleCurve(curve, t);
      const [ax, az] = sampleCurve(curve, Math.min(1, t + 0.01));
      const [bx, bz] = sampleCurve(curve, Math.max(0, t - 0.01));
      const tx = ax - bx;
      const tz = az - bz;
      const length = Math.hypot(tx, tz) || 1;
      const px = (-tz / length) * 0.032;
      const pz = (tx / length) * 0.032;
      const leftIndex = i * 6;
      overlayPositions[leftIndex] = cx + px;
      overlayPositions[leftIndex + 1] = terrainHeight(cx + px, cz + pz) + 0.012;
      overlayPositions[leftIndex + 2] = cz + pz;
      overlayPositions[leftIndex + 3] = cx - px;
      overlayPositions[leftIndex + 4] = terrainHeight(cx - px, cz - pz) + 0.012;
      overlayPositions[leftIndex + 5] = cz - pz;
    }
    overlayGeometry.getAttribute('position').needsUpdate = true;
    overlayGeometry.computeBoundingSphere();

    counters.fieldPlaced = placedCount;
    counters.fieldViolatingMask = violations;
    counters.fieldOffGround = offGround;
    counters.groundCoverPlaced = coverCount;
    counters.curvePose = pose;
    counters.poseRebuilds += 1;
    counters.meanDistanceToCurve = placedCount > 0 ? distanceSum / placedCount : 0;
    const draws = countDraws(root);
    counters.instancedMeshes = draws.instancedMeshes;
    counters.triangles = draws.triangles;
    activePose = pose;
  }

  root.add(before, after);
  rebuild(0);

  return {
    root,
    update: (time: number) => {
      const pose = poseAtTime(time);
      if (pose !== activePose) rebuild(pose);
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 38,
      title: 'Spline-field forest on sculpted terrain: mask, species, ground cover, floor blend',
      method:
        'An authored spline field drives placement density on a closed-form sculpted terrain, and '
        + 'a separate mask field decides admissibility first, so the glade and the watercourse '
        + 'stay clear at any density. Four species carry their own parameter sets — slope and '
        + 'moisture windows, separation, density bias and how far each leans into the ground '
        + 'normal — and each species is one geometry and one material however many plants stand '
        + 'in it. Ground cover is clump geometry under a sheen blade material, thinning where the '
        + 'canopy closes. A baked forest-floor blend ties the scatter into the ground material: '
        + 'both panels share one base bake, and only the AFTER floor carries the canopy shade and '
        + 'litter of the plants actually placed. update() steps the curve through three authored '
        + 'poses and re-derives all of it, so re-editability is a control, not a claim. BEFORE is '
        + 'uniform scatter with no mask at a constant Y — the sinking-and-floating failure the '
        + 'carrier skill names — and the miss is counted, not asserted.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/alightinastorm/status/2093648383202259325',
        'https://x.com/tokengremlin/status/2094265309360185606',
        'https://github.com/vibe-stack/super-terrain',
      ],
      limitation:
        'No code from the source repository is used. The terrain is a 3 m analytic patch, not the '
        + 'source\'s sculpting, CSG or tunnels; there is no 5-LOD streaming, no 4x4 km world, no '
        + 'terrain streaming, and no tree editor or GLB export — the register calls the editor a '
        + 'product question, so atom 6 is deliberately absent. Plants are merged primitives, not '
        + 'authored assets. The floor blend is a 64x64 baked colour map, not a terrain-material '
        + 'splat graph; micro-relief is a separate tiled procedural normal map, not an authored or '
        + 'scanned detail set, and nothing parallax-displaces the ground. The spline control is a fixed '
        + 'three-pose cycle on a timer, not an interactive editor, and separation is enforced on '
        + 'the candidate set rather than per pose. The register\'s "30+ tree types" is an author '
        + 'claim and is not verified here; four species are demonstrated. Licence state conflicts '
        + 'with the register — see SOURCE_RESEARCH.json. Rendered acceptance is OPEN: no pixels '
        + 'from this exhibit have been reviewed.',
      localLights: [],
      counters,
    },
  };
}

export default createDemo;
