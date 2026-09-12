/**
 * terrain.ts — the ridge/forest/coast ring beyond the playable apron, plus
 * boulders and the water depth mask the coastal surface samples.
 *
 * One polar heightfield (dense near the arena, sparse toward the skyline)
 * reads `terrainHeight()` from layout.ts — the same function that plants
 * trees and fills the water depth mask, so nothing floats and the shoreline
 * the water draws is the shoreline the ground has.
 */
import * as THREE from 'three';
import {
  COAST_HALF_ANGLE_DEG,
  TERRAIN_INNER_R,
  TERRAIN_OUTER_R,
  WATER_LEVEL_Y,
  coastalFactor,
  outsidePlayableMargin,
  rockiness,
  terrainHeight,
  waterDepthAt,
} from './layout';
import { createSurfaceMaterial, type NatureUniforms } from './materials';
import { clamp01, fbm2, mulberry32, smoothstep } from './seeded';
import type { NatureTextures } from './textures';

export const TERRAIN_ANGULAR_SEGMENTS = 160;
export const TERRAIN_RADIAL_SEGMENTS = 48;
/** Ground detail tile size in metres (UV = world / this). */
export const GROUND_DETAIL_TILE_M = 11;

export type TerrainRing = Readonly<{
  group: THREE.Group;
  triangles: number;
  drawGroups: number;
  dispose: () => void;
}>;

function groundColour(x: number, z: number, h: number, out: THREE.Color): void {
  const c = coastalFactor(x, z);
  const rock = rockiness(x, z);
  const r = Math.hypot(x, z);
  const patch = fbm2(x * 0.035, z * 0.035, 3, 0x6a11) * 0.5 + 0.5;
  // Meadow / forest floor: kept-lawn green near the fence, mossier further out.
  const meadowR = 0.30 + patch * 0.10;
  const meadowG = 0.42 + patch * 0.10;
  const meadowB = 0.14 + patch * 0.06;
  const floorK = smoothstep(TERRAIN_INNER_R, 120, r);
  let cr = meadowR * (1 - floorK * 0.35);
  let cg = meadowG * (1 - floorK * 0.30);
  let cb = meadowB * (1 - floorK * 0.10);
  // Rock: warm grey with slope-driven exposure.
  const rockR = 0.42 + patch * 0.08;
  const rockG = 0.39 + patch * 0.07;
  const rockB = 0.35 + patch * 0.06;
  cr += (rockR - cr) * rock;
  cg += (rockG - cg) * rock;
  cb += (rockB - cb) * rock;
  // Snow above the line, feathered by altitude and flatness.
  const snow = smoothstep(88, 125, h) * (1 - rock * 0.55) + smoothstep(120, 165, h) * 0.6;
  cr += (0.90 - cr) * clamp01(snow);
  cg += (0.92 - cg) * clamp01(snow);
  cb += (0.97 - cb) * clamp01(snow);
  // Coast: sand above the waterline, darker wet sand at it, silt below.
  const sandR = 0.62 + patch * 0.06;
  const sandG = 0.56 + patch * 0.05;
  const sandB = 0.42 + patch * 0.04;
  const wetBand = 1 - smoothstep(0.0, 0.5, Math.abs(h - WATER_LEVEL_Y) - 0.15);
  const under = smoothstep(WATER_LEVEL_Y, WATER_LEVEL_Y - 6, h);
  const coastR = sandR * (1 - wetBand * 0.3) * (1 - under * 0.55);
  const coastG = sandG * (1 - wetBand * 0.28) * (1 - under * 0.45);
  const coastB = sandB * (1 - wetBand * 0.2) * (1 - under * 0.3);
  const beachK = c * smoothstep(58, 68, r);
  cr += (coastR - cr) * beachK;
  cg += (coastG - cg) * beachK;
  cb += (coastB - cb) * beachK;
  out.setRGB(cr, cg, cb);
}

export function createTerrainRing(textures: NatureTextures, uniforms: NatureUniforms): TerrainRing {
  const group = new THREE.Group();
  group.name = 'world-studio-nature-terrain';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;

  const N = TERRAIN_ANGULAR_SEGMENTS;
  const M = TERRAIN_RADIAL_SEGMENTS;
  const vertexCount = N * (M + 1);
  const positions = new Float32Array(vertexCount * 3);
  const colours = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colour = new THREE.Color();
  for (let i = 0; i <= M; i += 1) {
    const t = i / M;
    const r = TERRAIN_INNER_R + (TERRAIN_OUTER_R - TERRAIN_INNER_R) * Math.pow(t, 1.7);
    for (let j = 0; j < N; j += 1) {
      const a = (j / N) * Math.PI * 2;
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      // The inner rim sits a hair under the root ground plate so the seam
      // never z-fights; everything beyond rises from there.
      const h = i === 0 ? -0.03 : terrainHeight(x, z);
      const v = i * N + j;
      positions[v * 3] = x;
      positions[v * 3 + 1] = h;
      positions[v * 3 + 2] = z;
      groundColour(x, z, h, colour);
      colours[v * 3] = colour.r;
      colours[v * 3 + 1] = colour.g;
      colours[v * 3 + 2] = colour.b;
      uvs[v * 2] = x / GROUND_DETAIL_TILE_M;
      uvs[v * 2 + 1] = z / GROUND_DETAIL_TILE_M;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < M; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const j1 = (j + 1) % N;
      const a = i * N + j;
      const b = i * N + j1;
      const c = (i + 1) * N + j;
      const d = (i + 1) * N + j1;
      // Up-facing winding. With x = sin(a)·r, z = -cos(a)·r the angular
      // direction (a -> b) crossed into the radial direction (a -> c) points
      // -Y, so the CCW-front triangles must run a -> b -> c and b -> d -> c.
      // (The first build had a -> c -> b: every face pointed down, FrontSide
      // culled the whole ring from above and the trees floated on sky.
      // `terrain ring faces up` in index.test.ts falsifies this.)
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name = 'ws-nature-terrain-ring';

  const material = createSurfaceMaterial({
    name: 'ws-nature-terrain',
    map: textures.groundDetail,
    vertexColors: true,
    roughness: 0.94,
    snowResponse: 1,
    wetResponse: 0.4,
  }, uniforms);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ws-nature-terrain-ring';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
  mesh.userData.coastHalfAngleDeg = COAST_HALF_ANGLE_DEG;
  group.add(mesh);

  const boulders = createBoulders(uniforms);
  group.add(boulders.mesh);

  return Object.freeze({
    group,
    triangles: indices.length / 3 + boulders.triangles,
    drawGroups: 2,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      boulders.dispose();
    },
  });
}

// ---------------------------------------------------------------------------
// Boulders — displaced icosahedra, forest floor and shore, out of bounds only
// ---------------------------------------------------------------------------

export const BOULDER_COUNT = 30;

function createBoulders(uniforms: NatureUniforms): { mesh: THREE.InstancedMesh; triangles: number; dispose: () => void } {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = fbm2(x * 1.7 + 3, y * 1.7 + z * 1.3, 3, 0xb0d) * 0.22;
    const s = 1 + n;
    pos.setXYZ(i, x * s * 1.15, y * s * 0.72, z * s);
    const tone = 0.42 + n * 0.5 + fbm2(x * 6, z * 6, 2, 0xb0e) * 0.06;
    const lichen = smoothstep(0.55, 0.9, fbm2(x * 2.2, y * 2.2, 2, 0xb0f) * 0.5 + 0.5) * 0.35 * clamp01(y + 0.4);
    col[i * 3] = tone * (1 - lichen * 0.3);
    col[i * 3 + 1] = tone * 0.96 + lichen * 0.08;
    col[i * 3 + 2] = tone * 0.9 - lichen * 0.05;
  }
  pos.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  geometry.name = 'ws-nature-boulder';

  const material = createSurfaceMaterial({
    name: 'ws-nature-boulder',
    vertexColors: true,
    roughness: 0.9,
    snowResponse: 1,
    wetResponse: 0.45,
  }, uniforms);
  const mesh = new THREE.InstancedMesh(geometry, material, BOULDER_COUNT);
  mesh.name = 'ws-nature-boulders';
  const rng = mulberry32(0xb0_01de);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  let placed = 0;
  let attempts = 0;
  while (placed < BOULDER_COUNT && attempts < BOULDER_COUNT * 80) {
    attempts += 1;
    const shore = placed % 5 === 0;
    const r = shore ? 56 + rng() * 22 : 50 + rng() * 60;
    const a = rng() * Math.PI * 2;
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    if (!outsidePlayableMargin(x, z, 5)) continue;
    const c = coastalFactor(x, z);
    if (shore ? c < 0.6 : c > 0.35) continue;
    if (waterDepthAt(x, z) > 1.2) continue;
    const size = shore ? 0.6 + rng() * 1.3 : 0.5 + rng() * 1.6;
    e.set(rng() * 0.5, rng() * Math.PI * 2, rng() * 0.5);
    q.setFromEuler(e);
    p.set(x, terrainHeight(x, z) - size * 0.35, z);
    s.set(size * (0.8 + rng() * 0.5), size, size * (0.8 + rng() * 0.5));
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    placed += 1;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
  return {
    mesh,
    triangles: (geometry.index ? geometry.index.count / 3 : pos.count / 3) * placed,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Water depth mask — authored shallow mask sampled by the coastal surface
// ---------------------------------------------------------------------------

export const DEPTH_MASK_SIZE = 256;
/** World rectangle the depth mask covers (must match the water plane). */
export const WATER_RECT = Object.freeze({ minX: -900, maxX: 900, minZ: -940, maxZ: -40 });
/** Depth (m) that maps to R = 1 (deep) and G = 1 (out of the shallow band). */
export const DEPTH_MASK_DEEP_M = 14;
export const DEPTH_MASK_SHALLOW_M = 2.5;

export function createWaterDepthMaskData(size = DEPTH_MASK_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j += 1) {
    const z = WATER_RECT.minZ + ((j + 0.5) / size) * (WATER_RECT.maxZ - WATER_RECT.minZ);
    for (let i = 0; i < size; i += 1) {
      const x = WATER_RECT.minX + ((i + 0.5) / size) * (WATER_RECT.maxX - WATER_RECT.minX);
      const depth = waterDepthAt(x, z);
      const k = (j * size + i) * 4;
      data[k] = Math.round(clamp01(depth / DEPTH_MASK_DEEP_M) * 255);
      data[k + 1] = Math.round(clamp01(depth / DEPTH_MASK_SHALLOW_M) * 255);
      data[k + 2] = 0;
      data[k + 3] = 255;
    }
  }
  return data;
}

export function createWaterDepthMask(): THREE.DataTexture {
  const tex = new THREE.DataTexture(createWaterDepthMaskData(), DEPTH_MASK_SIZE, DEPTH_MASK_SIZE, THREE.RGBAFormat);
  tex.name = 'ws-nature-water-depth-mask';
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
