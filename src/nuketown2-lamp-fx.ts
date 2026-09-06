/**
 * nuketown2-lamp-fx.ts - HF-536 NIGHT GEMINI-14: Lamp light cones and dust motes.
 *
 * WHAT WAS MISSING (critic gap #5, street-centre (560,25)-(625,350)):
 * "Street lamps exhibit emissive glowing lantern heads, bloom halos, and ground
 * light pools at authored time, but lack atmospheric volumetric light shaft
 * scattering (god-ray cone) and airborne dust mote reflections between the
 * lantern housing and the roadway pavement (also visible on into-sun-street
 * at (295,0)-(380,200) and vehicle-far at (650,0)-(700,200))."
 *
 * WHAT THIS ADDS (bounded brief):
 * 1. LIGHT CONES: under every lantern head and both porch lights an inverted
 *    soft cone made of 3 crossed vertical quads (two-sided, additive blending,
 *    depthWrite off, no texture: alpha is a continuous UV gradient - bright at
 *    the head fading to 0 at 85 % of the way to the pool, and fading toward the
 *    quad edges), warm lamp colour, peak opacity 0.14 (in range [0.10, 0.16]),
 *    cone radius at the ground = pool radius (2.6 m street, 1.0 m porch).
 *    Never coplanar with post or pool (offset 0.02 m).
 * 2. DUST MOTES: one InstancedMesh of tiny camera-agnostic octahedra (8 mm
 *    diameter, in range 6-12 mm), 110 per lamp (in range [90, 160]) strictly
 *    within the cone volume, additive, opacity 0.35-0.6 by a deterministic
 *    per-instance hash.
 * 3. BUDGET GATES:
 *    - Draws: exactly +2 (one shared cone material mesh, one instanced mote mesh).
 *    - Tris: 36 (cones) + 5,280 (motes) = 5,316 total (<= 6k total).
 *    - Program-set: exactly +2 (two new MeshBasicNodeMaterial singletons).
 *    - Samplers: zero samplers.
 *    - Presentation only: no colliders, no raycast, no shot surfaces.
 *    - Zero coplanar faces with post or pool.
 */

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/** Cast boundary for the TSL DSL (repo idiom: one cast per module). */
const {
  abs,
  attribute,
  clamp,
  float,
  uv,
  vec3,
  vec4,
} = TSL as unknown as Record<string, any>;

/** Warm sodium-ish tint matching the lamp pools (0xffc37a). */
export const LAMP_FX_COLOR_HEX = 0xffc37a;

/** Cone peak opacity at the lantern head (brief: 0.10-0.16). */
export const LAMP_CONE_PEAK_OPACITY = 0.14;

/** Cone base opacity at the ground/pool plane (brief: endpoints 0 at the base). */
export const LAMP_CONE_BASE_OPACITY = 0.0;

/** Distance fraction from head where cone alpha reaches 0 (brief: 85 % of the way to the pool). */
export const LAMP_CONE_FADE_CUTOFF = 0.85;

/** Height of street lamp lantern head (fixture point), metres. */
export const STREET_LAMP_HEAD_Y = 4.35;

/** Top of pool slab (LAMP_POOL_Y 0.012 + LAMP_POOL_SLAB_H/2 0.010 = 0.022 m). */
export const STREET_LAMP_POOL_PLANE_Y = 0.022;

/**
 * Street lamp cone bottom height, metres.
 * Offset 0.02 m above the pool plane to avoid coplanar z-fighting (brief: pool plane +0.02 m).
 */
export const STREET_LAMP_CONE_BOTTOM_Y = STREET_LAMP_POOL_PLANE_Y + 0.02; // 0.042

/** Street lamp cone radius at ground: equal to pool radius (brief: 2.6 m). */
export const STREET_LAMP_CONE_GROUND_RADIUS = 2.6;

/** Street lamp cone radius at lantern head, metres. */
export const STREET_LAMP_CONE_HEAD_RADIUS = 0.20;

/** Porch light head height (centre of wall lantern body), metres. */
export const PORCH_LIGHT_HEAD_Y = 2.50;

/** Porch ground plane height, metres. */
export const PORCH_GROUND_PLANE_Y = 0.0;

/**
 * Porch light cone bottom height: 0.02 m above porch ground plane (brief: offset 0.02 m).
 */
export const PORCH_LIGHT_CONE_BOTTOM_Y = PORCH_GROUND_PLANE_Y + 0.02; // 0.02

/** Porch light cone radius at ground, metres (brief: smaller cone). */
export const PORCH_LIGHT_CONE_GROUND_RADIUS = 1.0;

/** Porch light cone radius at head, metres. */
export const PORCH_LIGHT_CONE_HEAD_RADIUS = 0.08;

/** Number of crossed vertical quads per cone set (brief: 3 crossed vertical quads). */
export const LAMP_CONE_QUADS_PER_CONE = 3;

/** Triangles per cone set (3 quads * 2 triangles = 6). */
export const LAMP_CONE_TRIANGLES_PER_CONE = 6;

/** Mote count per lamp (brief: 90-160 per lamp). */
export const LAMP_MOTES_PER_LAMP = 110;

/** Mote base diameter (brief: 6-12 mm). */
export const LAMP_MOTE_BASE_DIAMETER_M = 0.008; // 8 mm
export const LAMP_MOTE_MIN_DIAMETER_M = 0.006;
export const LAMP_MOTE_MAX_DIAMETER_M = 0.012;

/** Mote opacity range (brief: 0.35-0.6 by a per-instance hash). */
export const LAMP_MOTE_MIN_OPACITY = 0.35;
export const LAMP_MOTE_MAX_OPACITY = 0.60;

/**
 * Quad yaw angles: 15, 75, 135 degrees.
 * Starts with a 15-degree offset so no quad plane is parallel to the axis-aligned
 * lamp post faces (0 and 90 degrees), ensuring zero coplanar races.
 */
export const LAMP_CONE_QUAD_ANGLES: readonly number[] = Object.freeze([
  Math.PI / 12,                  // 15 deg
  Math.PI / 12 + Math.PI / 3,     // 75 deg
  Math.PI / 12 + (2 * Math.PI) / 3, // 135 deg
]);

export interface LampFxSpec {
  readonly id: string;
  readonly kind: 'street' | 'porch';
  readonly position: readonly [number, number, number];
  readonly headHeight: number;
  readonly bottomY: number;
  readonly topRadius: number;
  readonly groundRadius: number;
}

/**
 * Specifications for all 6 lamps: 4 street verge lamps and 2 front porch lights.
 */
export const NUKETOWN2_LAMP_FX_SPECS: readonly LampFxSpec[] = Object.freeze([
  // 4 street verge lamps (west/east on north and south verges)
  Object.freeze({
    id: 'north verge west street lamp',
    kind: 'street',
    position: [-12, STREET_LAMP_HEAD_Y, -6.7] as const,
    headHeight: STREET_LAMP_HEAD_Y,
    bottomY: STREET_LAMP_CONE_BOTTOM_Y,
    topRadius: STREET_LAMP_CONE_HEAD_RADIUS,
    groundRadius: STREET_LAMP_CONE_GROUND_RADIUS,
  }),
  Object.freeze({
    id: 'north verge east street lamp',
    kind: 'street',
    position: [-4, STREET_LAMP_HEAD_Y, -6.7] as const,
    headHeight: STREET_LAMP_HEAD_Y,
    bottomY: STREET_LAMP_CONE_BOTTOM_Y,
    topRadius: STREET_LAMP_CONE_HEAD_RADIUS,
    groundRadius: STREET_LAMP_CONE_GROUND_RADIUS,
  }),
  Object.freeze({
    id: 'south verge west street lamp',
    kind: 'street',
    position: [12, STREET_LAMP_HEAD_Y, 6.7] as const,
    headHeight: STREET_LAMP_HEAD_Y,
    bottomY: STREET_LAMP_CONE_BOTTOM_Y,
    topRadius: STREET_LAMP_CONE_HEAD_RADIUS,
    groundRadius: STREET_LAMP_CONE_GROUND_RADIUS,
  }),
  Object.freeze({
    id: 'south verge east street lamp',
    kind: 'street',
    position: [4, STREET_LAMP_HEAD_Y, 6.7] as const,
    headHeight: STREET_LAMP_HEAD_Y,
    bottomY: STREET_LAMP_CONE_BOTTOM_Y,
    topRadius: STREET_LAMP_CONE_HEAD_RADIUS,
    groundRadius: STREET_LAMP_CONE_GROUND_RADIUS,
  }),
  // 2 house front porch lights (beside front door heads, hardware kit anchor [1.26, 0, -10])
  Object.freeze({
    id: 'north house front porch light',
    kind: 'porch',
    position: [1.26, PORCH_LIGHT_HEAD_Y, -9.848] as const,
    headHeight: PORCH_LIGHT_HEAD_Y,
    bottomY: PORCH_LIGHT_CONE_BOTTOM_Y,
    topRadius: PORCH_LIGHT_CONE_HEAD_RADIUS,
    groundRadius: PORCH_LIGHT_CONE_GROUND_RADIUS,
  }),
  Object.freeze({
    id: 'south house front porch light',
    kind: 'porch',
    position: [-1.26, PORCH_LIGHT_HEAD_Y, 9.848] as const,
    headHeight: PORCH_LIGHT_HEAD_Y,
    bottomY: PORCH_LIGHT_CONE_BOTTOM_Y,
    topRadius: PORCH_LIGHT_CONE_HEAD_RADIUS,
    groundRadius: PORCH_LIGHT_CONE_GROUND_RADIUS,
  }),
]);

/** Deterministic 32-bit integer hash for per-instance placement and opacity. */
export function hashInt(index: number, seed: number): number {
  let h = Math.imul(index ^ seed, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85103b41);
  h = h ^ (h >>> 13);
  return h >>> 0;
}

/** Deterministic float in [0, 1) from index and seed. */
export function hashFloat(index: number, seed: number): number {
  return hashInt(index, seed) / 4294967296;
}

/** Per-instance opacity in [0.35, 0.60] (brief: 0.35-0.6 by a per-instance hash). */
export function moteOpacity(instanceIndex: number): number {
  const f = hashFloat(instanceIndex, 0x9e3779b9);
  return LAMP_MOTE_MIN_OPACITY + f * (LAMP_MOTE_MAX_OPACITY - LAMP_MOTE_MIN_OPACITY);
}

let cachedLampConeMaterial: MeshBasicNodeMaterial | null = null;

/**
 * The lane's ONE additive light-cone material, shared by all 6 light cones.
 *
 * Inverted soft cone gradient:
 * - Two-sided, additive blending, depthWrite: false.
 * - Zero samplers.
 * - Continuous TSL UV gradient:
 *   - Horizontal: bright along the quad vertical axis (uv.x = 0.5), fading to 0 at edges.
 *   - Vertical: bright at the lantern head (uv.y = 1.0), fading to 0 at 85 % of the way
 *     to the pool (uv.y <= 0.15), remaining strictly 0 at the base (uv.y = 0).
 */
export function getLampConeMaterial(): MeshBasicNodeMaterial {
  if (cachedLampConeMaterial) return cachedLampConeMaterial;
  const material = new MeshBasicNodeMaterial();
  material.name = 'nuketown2-lamp-light-cone';
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = THREE.DoubleSide;
  material.blending = THREE.AdditiveBlending;

  const warm = new THREE.Color().setHex(LAMP_FX_COLOR_HEX, THREE.SRGBColorSpace);
  const tint = vec3(float(warm.r), float(warm.g), float(warm.b));

  // Horizontal fade: 1 at centre (uv.x = 0.5), 0 at left/right edges (uv.x = 0 or 1).
  const dx = abs(uv().x.mul(float(2.0)).sub(float(1.0)));
  const hFade = clamp(float(1.0).sub(dx), float(0.0), float(1.0));

  // Vertical fade: 1 at head (uv.y = 1.0), 0 at 85% down (uv.y <= 0.15), 0 at base (uv.y = 0).
  const vFade = clamp(uv().y.sub(float(1.0 - LAMP_CONE_FADE_CUTOFF)).div(float(LAMP_CONE_FADE_CUTOFF)), float(0.0), float(1.0));

  const alpha = float(LAMP_CONE_PEAK_OPACITY).mul(hFade).mul(vFade);
  material.colorNode = vec4(tint, alpha);

  cachedLampConeMaterial = material;
  return material;
}

let cachedLampMoteMaterial: MeshBasicNodeMaterial | null = null;

/**
 * The lane's ONE additive mote material, shared by all dust motes.
 * Reads per-instance opacity via the instanced attribute 'instanceOpacity'.
 */
export function getLampMoteMaterial(): MeshBasicNodeMaterial {
  if (cachedLampMoteMaterial) return cachedLampMoteMaterial;
  const material = new MeshBasicNodeMaterial();
  material.name = 'nuketown2-lamp-dust-mote';
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = THREE.DoubleSide;
  material.blending = THREE.AdditiveBlending;

  const warm = new THREE.Color().setHex(LAMP_FX_COLOR_HEX, THREE.SRGBColorSpace);
  const tint = vec3(float(warm.r), float(warm.g), float(warm.b));
  const instOpacity = attribute('instanceOpacity', 'float');

  material.colorNode = vec4(tint, instOpacity);

  cachedLampMoteMaterial = material;
  return material;
}

/**
 * Builds the 3 crossed vertical quads for one lamp cone set.
 */
export function buildLampConeGeometry(spec: LampFxSpec): THREE.BufferGeometry {
  const quads = LAMP_CONE_QUADS_PER_CONE;
  const vertexCount = quads * 4;
  const indexCount = quads * 6;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 4);
  const indices = new Uint16Array(indexCount);

  const cx = spec.position[0];
  const cz = spec.position[2];
  const yTop = spec.headHeight;
  const yBottom = spec.bottomY;
  const rTop = spec.topRadius;
  const rBottom = spec.groundRadius;

  const warm = new THREE.Color().setHex(LAMP_FX_COLOR_HEX, THREE.SRGBColorSpace);

  for (let q = 0; q < quads; q += 1) {
    const angle = LAMP_CONE_QUAD_ANGLES[q]!;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Quad normal (perpendicular to quad plane in horizontal direction)
    const nx = -sinA;
    const nz = cosA;

    const baseV = q * 4;
    const baseI = q * 6;

    // Corner 0: Top-Left (u = 0, v = 1)
    positions[(baseV + 0) * 3 + 0] = cx - rTop * cosA;
    positions[(baseV + 0) * 3 + 1] = yTop;
    positions[(baseV + 0) * 3 + 2] = cz - rTop * sinA;
    uvs[(baseV + 0) * 2 + 0] = 0.0;
    uvs[(baseV + 0) * 2 + 1] = 1.0;

    // Corner 1: Top-Right (u = 1, v = 1)
    positions[(baseV + 1) * 3 + 0] = cx + rTop * cosA;
    positions[(baseV + 1) * 3 + 1] = yTop;
    positions[(baseV + 1) * 3 + 2] = cz + rTop * sinA;
    uvs[(baseV + 1) * 2 + 0] = 1.0;
    uvs[(baseV + 1) * 2 + 1] = 1.0;

    // Corner 2: Bottom-Left (u = 0, v = 0)
    positions[(baseV + 2) * 3 + 0] = cx - rBottom * cosA;
    positions[(baseV + 2) * 3 + 1] = yBottom;
    positions[(baseV + 2) * 3 + 2] = cz - rBottom * sinA;
    uvs[(baseV + 2) * 2 + 0] = 0.0;
    uvs[(baseV + 2) * 2 + 1] = 0.0;

    // Corner 3: Bottom-Right (u = 1, v = 0)
    positions[(baseV + 3) * 3 + 0] = cx + rBottom * cosA;
    positions[(baseV + 3) * 3 + 1] = yBottom;
    positions[(baseV + 3) * 3 + 2] = cz + rBottom * sinA;
    uvs[(baseV + 3) * 2 + 0] = 1.0;
    uvs[(baseV + 3) * 2 + 1] = 0.0;

    for (let c = 0; c < 4; c += 1) {
      const idx = baseV + c;
      normals[idx * 3 + 0] = nx;
      normals[idx * 3 + 1] = 0;
      normals[idx * 3 + 2] = nz;

      // Vertex color gradient
      const u = uvs[idx * 2 + 0]!;
      const v = uvs[idx * 2 + 1]!;
      const dx = Math.abs(2 * u - 1);
      const hFade = Math.max(0, 1 - dx);
      const vFade = Math.max(0, Math.min(1, (v - (1 - LAMP_CONE_FADE_CUTOFF)) / LAMP_CONE_FADE_CUTOFF));
      const a = LAMP_CONE_PEAK_OPACITY * hFade * vFade;

      colors[idx * 4 + 0] = warm.r;
      colors[idx * 4 + 1] = warm.g;
      colors[idx * 4 + 2] = warm.b;
      colors[idx * 4 + 3] = a;
    }

    // Two triangles per quad: (0, 2, 1) and (1, 2, 3)
    indices[baseI + 0] = baseV + 0;
    indices[baseI + 1] = baseV + 2;
    indices[baseI + 2] = baseV + 1;
    indices[baseI + 3] = baseV + 1;
    indices[baseI + 4] = baseV + 2;
    indices[baseI + 5] = baseV + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Builds the merged geometry containing all 6 cone sets (18 quads, 36 triangles).
 */
export function buildMergedConesGeometry(specs: readonly LampFxSpec[] = NUKETOWN2_LAMP_FX_SPECS): THREE.BufferGeometry {
  const totalQuads = specs.length * LAMP_CONE_QUADS_PER_CONE;
  const totalVertices = totalQuads * 4;
  const totalIndices = totalQuads * 6;

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const uvs = new Float32Array(totalVertices * 2);
  const colors = new Float32Array(totalVertices * 4);
  const indices = new Uint16Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;

  for (const spec of specs) {
    const geo = buildLampConeGeometry(spec);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const norm = geo.getAttribute('normal') as THREE.BufferAttribute;
    const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const idx = geo.index!;

    for (let v = 0; v < pos.count; v += 1) {
      const gv = vertexOffset + v;
      positions[gv * 3 + 0] = pos.getX(v);
      positions[gv * 3 + 1] = pos.getY(v);
      positions[gv * 3 + 2] = pos.getZ(v);

      normals[gv * 3 + 0] = norm.getX(v);
      normals[gv * 3 + 1] = norm.getY(v);
      normals[gv * 3 + 2] = norm.getZ(v);

      uvs[gv * 2 + 0] = uvAttr.getX(v);
      uvs[gv * 2 + 1] = uvAttr.getY(v);

      colors[gv * 4 + 0] = col.getX(v);
      colors[gv * 4 + 1] = col.getY(v);
      colors[gv * 4 + 2] = col.getZ(v);
      colors[gv * 4 + 3] = col.getW(v);
    }

    for (let i = 0; i < idx.count; i += 1) {
      indices[indexOffset + i] = vertexOffset + idx.getX(i);
    }

    vertexOffset += pos.count;
    indexOffset += idx.count;
    geo.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Builds the InstancedMesh containing dust motes across all 6 lamps.
 */
export function buildDustMotesMesh(
  specs: readonly LampFxSpec[] = NUKETOWN2_LAMP_FX_SPECS,
  motesPerLamp: number = LAMP_MOTES_PER_LAMP,
): THREE.InstancedMesh {
  const totalMotes = specs.length * motesPerLamp;
  const baseOctahedronRadius = LAMP_MOTE_BASE_DIAMETER_M / 2; // 4 mm radius -> 8 mm diameter
  const geometry = new THREE.OctahedronGeometry(baseOctahedronRadius, 0);

  const opacities = new Float32Array(totalMotes);
  const material = getLampMoteMaterial();
  const instancedMesh = new THREE.InstancedMesh(geometry, material, totalMotes);
  instancedMesh.name = 'nuketown2 lamp dust motes';
  instancedMesh.userData.presentationOnly = true;
  instancedMesh.userData.farcrysisArt = true;
  instancedMesh.castShadow = false;
  instancedMesh.receiveShadow = false;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color().setHex(LAMP_FX_COLOR_HEX, THREE.SRGBColorSpace);

  for (let lampIdx = 0; lampIdx < specs.length; lampIdx += 1) {
    const spec = specs[lampIdx]!;
    const cx = spec.position[0];
    const cz = spec.position[2];
    const yTop = spec.headHeight;
    const yBottom = spec.bottomY;
    const rTop = spec.topRadius;
    const rBottom = spec.groundRadius;

    for (let m = 0; m < motesPerLamp; m += 1) {
      const instanceIdx = lampIdx * motesPerLamp + m;

      // Opacity by deterministic hash in [0.35, 0.60]
      const op = moteOpacity(instanceIdx);
      opacities[instanceIdx] = op;
      instancedMesh.setColorAt(instanceIdx, new THREE.Color(color.r * op, color.g * op, color.b * op));

      // Deterministic vertical position within cone (with 0.04m margin from top and bottom)
      const uy = hashFloat(instanceIdx, 0xa1b2c3d4);
      const yPad = 0.04;
      const py = (yBottom + yPad) + uy * Math.max(0.1, yTop - yBottom - 2 * yPad);

      // Height fraction from head (0 at head, 1 at bottom)
      const t = Math.max(0, Math.min(1, (yTop - py) / (yTop - yBottom)));
      const coneRadiusAtY = rTop + t * (rBottom - rTop);

      // Deterministic horizontal position inside cone volume
      // Use sqrt(ur) for area distribution, scaled by 0.90 to stay comfortably within the cone
      const uPhi = hashFloat(instanceIdx, 0x4d3c2b1a);
      const phi = uPhi * Math.PI * 2;
      const uR = hashFloat(instanceIdx, 0xf0e1d2c3);
      const r = coneRadiusAtY * Math.sqrt(uR) * 0.90;

      position.set(cx + r * Math.cos(phi), py, cz + r * Math.sin(phi));

      // Random 3D tumble orientation
      const rotX = hashFloat(instanceIdx, 0x13579bdf) * Math.PI * 2;
      const rotY = hashFloat(instanceIdx, 0x2468ace0) * Math.PI * 2;
      const rotZ = hashFloat(instanceIdx, 0x369cf024) * Math.PI * 2;
      rotation.set(rotX, rotY, rotZ);
      quaternion.setFromEuler(rotation);

      // Scale variation within 6 mm to 12 mm diameter (0.75x to 1.5x of 8 mm)
      const uScale = hashFloat(instanceIdx, 0x778899aa);
      const s = 0.75 + uScale * 0.75; // 0.75..1.5 -> diameter 6..12 mm
      scale.set(s, s, s);

      matrix.compose(position, quaternion, scale);
      instancedMesh.setMatrixAt(instanceIdx, matrix);
    }
  }

  geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(opacities, 1));
  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

  return instancedMesh;
}

export interface Nuketown2LampFxResult {
  readonly group: THREE.Group;
  readonly coneMesh: THREE.Mesh;
  readonly moteMesh: THREE.InstancedMesh;
  readonly specs: readonly LampFxSpec[];
  readonly perLampConeGeometries: readonly THREE.BufferGeometry[];
  readonly stats: {
    readonly conesCount: number;
    readonly motesCount: number;
    readonly motesPerLamp: number;
    readonly drawCalls: number;
    readonly triangles: number;
  };
}

/**
 * Builds and mounts the complete presentation-only lamp FX module into the arena root.
 * Export conforms to additive-module-authoring skill contract.
 */
export function buildNuketown2LampFx(root: THREE.Object3D): Nuketown2LampFxResult {
  const specs = NUKETOWN2_LAMP_FX_SPECS;
  const group = new THREE.Group();
  group.name = 'nuketown2-lamp-fx';
  group.userData.presentationOnly = true;

  // 1. Light cones: merged into 1 Mesh sharing 1 material -> exactly 1 draw call
  const perLampConeGeometries = specs.map((spec) => buildLampConeGeometry(spec));
  const mergedConeGeo = buildMergedConesGeometry(specs);
  const coneMaterial = getLampConeMaterial();
  const coneMesh = new THREE.Mesh(mergedConeGeo, coneMaterial);
  coneMesh.name = 'nuketown2 lamp light cones';
  coneMesh.userData.presentationOnly = true;
  coneMesh.userData.farcrysisArt = true;
  coneMesh.castShadow = false;
  coneMesh.receiveShadow = false;
  group.add(coneMesh);

  // 2. Dust motes: 1 InstancedMesh sharing 1 material -> exactly 1 draw call
  const moteMesh = buildDustMotesMesh(specs, LAMP_MOTES_PER_LAMP);
  group.add(moteMesh);

  root.add(group);

  const coneTris = specs.length * LAMP_CONE_TRIANGLES_PER_CONE; // 6 * 6 = 36
  const moteTris = specs.length * LAMP_MOTES_PER_LAMP * 8;      // 6 * 110 * 8 = 5280
  const totalTris = coneTris + moteTris;                       // 5316 <= 6k

  const stats = Object.freeze({
    conesCount: specs.length,
    motesCount: specs.length * LAMP_MOTES_PER_LAMP,
    motesPerLamp: LAMP_MOTES_PER_LAMP,
    drawCalls: 2,
    triangles: totalTris,
  });

  const result: Nuketown2LampFxResult = Object.freeze({
    group,
    coneMesh,
    moteMesh,
    specs,
    perLampConeGeometries,
    stats,
  });

  root.userData.nuketown2LampFx = result;
  root.userData.nuketown2LampFxStats = stats;

  return result;
}

/**
 * Animation hook conforming to additive-module-authoring contract.
 * Static by design to guarantee 0 CPU frame-loop overhead (brief: static is acceptable).
 */
export function animateLampFx(_time: number): void {
  // Static is acceptable per brief; no frame-loop CPU overhead.
}
