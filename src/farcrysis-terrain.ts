/**
 * farcrysis-terrain.ts — Procedural golden-hour tropical beach/cliff terrain,
 * atmospheric lighting, and animated water for the Farcrysis arena.
 *
 * Exports:
 *   buildTerrain(scene)  — custom BufferGeometry elevation, cliffs, rocks, paths
 *   buildLighting(scene) — golden-hour sun, ambient/hemisphere, FogExp2, god rays
 *   buildWater(scene)    — animated tropical water plane with wave animation
 *
 * All procedural — no copied IP. Presentation only (no colliders/gameplay authority).
 * Uses FARCRYSIS_ART_FEEL palette constants from farcrysis-art.ts.
 *
 * Pass 69 extensions (2026-08-05):
 *   - Seeded-noise BufferGeometry heightfield (gentle dunes/hills, playable core flat,
 *     clear lanes, elevation range 0–1.3 m).
 *   - White-sand beach with subtle dune banding in vertex colours.
 *   - Beach boulder clusters (dodecahedron, flat-shaded) near cliff edge.
 *   - Animated lagoon waves with alloc-free vertex update; shoreline foam ring.
 *   - Glossy water reflection hint (canvas CubeTexture envMap when available).
 *   - Extended god rays (halo layer + tower shafts), warmer golden fog, sky dome.
 */

import * as THREE from 'three';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const { minX, maxX, minZ, maxZ } = FARCRYSIS_BOUNDS;
const ARENA_HALF = 32; // 64×64 arena
const SAND_INSET = 10; // sand perimeter extends inward ~10 m from bounds
const TERR_SEGMENTS = 112; // terrain grid resolution (≈12.8 k verts, ≈25 k tris)

/** Seeded RNG so terrain is deterministic. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0xf41c_5155);

/** Smoothstep for elevation blending. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Value noise + fractal Brownian motion (deterministic, no external deps)
// ---------------------------------------------------------------------------

function hash(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 269.5) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const v00 = hash(ix, iy, seed);
  const v10 = hash(ix + 1, iy, seed);
  const v01 = hash(ix, iy + 1, seed);
  const v11 = hash(ix + 1, iy + 1, seed);

  const a = v00 + sx * (v10 - v00);
  const b = v01 + sx * (v11 - v01);
  return a + sy * (b - a);
}

function fbm(x: number, y: number, octaves: number, seed: number): number {
  let value = 0;
  let amplitude = 1;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * freq, y * freq, seed + i * 127);
    max += amplitude;
    freq *= 2;
    amplitude *= 0.5;
  }
  return value / max;
}

// ---------------------------------------------------------------------------
// Terrain elevation function
// ---------------------------------------------------------------------------

/**
 * Elevation at world (x, z). Returns height in metres.
 *
 * Zones:
 *   - Flat playable core   (|x|,|z| ≤ 10):          y = 0
 *   - Clear corridor lanes (|x-20|<4.5, |x+20|<4.5,
 *                           |z-20|<4.5, |z+20|<4.5): y = 0
 *   - White-sand beach     (edgeDist < 12):          gentle dunes, 0 – 0.7 m
 *   - Cliff transition     (edgeDist 12 – 19):       ramp 0 → 1.2 m + jagged
 *   - Inland rolling hills (interior):               fBm hills, 0.2 – 1.3 m
 *
 * All slopes are gentle (≤ ~0.15 m/m) — gameplay-safe.
 */
function terrainHeight(x: number, z: number): number {
  const cx = Math.max(minX, Math.min(maxX, x));
  const cz = Math.max(minZ, Math.min(maxZ, z));

  const dist = Math.sqrt(cx * cx + cz * cz);

  // ---- 1. Flat playable core (|x|,|z| ≤ 10) ----
  const coreHalf = 10;
  if (Math.abs(cx) <= coreHalf && Math.abs(cz) <= coreHalf) return 0;

  // ---- 2. Clear corridor lanes (x/z ≈ ±20, width 4.5) ----
  const pathHW = 4.5;
  const onPathX = Math.abs(Math.abs(cx) - 20) < pathHW;
  const onPathZ = Math.abs(Math.abs(cz) - 20) < pathHW;
  if ((onPathX || onPathZ) && dist > 4) return 0;

  // ---- Compute edge distance for beach / cliff zones ----
  const edgeDist = ARENA_HALF - Math.max(Math.abs(cx), Math.abs(cz));

  // ---- 3. White-sand beach (edgeDist < 12) ----
  if (edgeDist < 12) {
    const t = edgeDist / 12; // 0 at outer edge, 1 at cliff boundary
    // Dune noise — gentle rises, mostly flat
    const dune1 = fbm(cx * 0.3, cz * 0.4, 3, 42) * 0.55;
    const dune2 = Math.sin(cx * 0.55 + cz * 0.38) * 0.25;
    // Dune banding (parallel to shoreline) — subtle ridges
    const band = Math.sin(edgeDist * 1.4 + fbm(cx * 0.2, cz * 0.2, 2, 101) * 3) * 0.1 + 0.5;
    // Blend: near water edge (t→0) sand is flat; near cliff (t→1) dunes build up
    const duneHeight = (dune1 + dune2 * band) * smoothstep(0, 0.4, t) * 0.6;
    return Math.max(0, duneHeight);
  }

  // ---- 4. Cliff transition (edgeDist 12 – 19) ----
  if (edgeDist < 19) {
    const cliffT = (edgeDist - 12) / 7; // 0 at sand edge, 1 at plateau edge
    const baseRamp = cliffT * 1.2; // ramp 0 → 1.2 m
    const jagged = (
      Math.sin(cx * 1.3 + cz * 0.7) * 0.55 +
      Math.cos(cx * 0.9 - cz * 1.1) * 0.45 +
      Math.sin(cx * 2.1) * 0.3 +
      Math.cos(cz * 1.8) * 0.35
    ) * cliffT;
    // Blend zone with noise
    const detail = fbm(cx * 0.6, cz * 0.6, 3, 77) * 0.3 * cliffT;
    return Math.max(0.05, baseRamp + jagged + detail);
  }

  // ---- 5. Inland rolling hills (interior) ----
  const hill = (
    fbm(cx * 0.25, cz * 0.25, 4, 55) * 1.05 +
    fbm(cx * 0.5, cz * 0.5, 3, 133) * 0.35
  );
  // Slightly higher away from centre, gentle dip near the core
  const coreDist = Math.sqrt(cx * cx + cz * cz);
  const coreDip = coreDist < 12 ? smoothstep(0, 12, coreDist) * 0.4 : 0;
  // Keep hills gentle — cap at ~1.3 m
  return Math.max(0.15, Math.min(1.3, hill - coreDip));
}

// ---------------------------------------------------------------------------
// Procedural rock helpers
// ---------------------------------------------------------------------------

/** Create a deformed rock mesh from an IcosahedronGeometry. */
function makeRock(
  radius: number,
  detail: number,
  seed: number,
  material: THREE.Material,
): THREE.Mesh {
  const localRng = mulberry32(seed);
  const geom = new THREE.IcosahedronGeometry(radius, detail);
  const positions = geom.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < positions.count; i++) {
    const vx = positions.getX(i);
    const vy = positions.getY(i);
    const vz = positions.getZ(i);
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    const noise = 1 + (localRng() - 0.5) * 0.45;
    const bulge = localRng() < 0.3 ? 1 + localRng() * 0.3 : 1;
    const n = noise * bulge;
    positions.setXYZ(i, (vx / len) * radius * n, (vy / len) * radius * n, (vz / len) * radius * n);
  }

  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.farcrysisArt = true;
  return mesh;
}

/** Create a boulder from DodecahedronGeometry with vertex jitter (flat-shaded). */
function makeBoulder(
  radius: number,
  seed: number,
  material: THREE.Material,
): THREE.Mesh {
  const localRng = mulberry32(seed);
  const geom = new THREE.DodecahedronGeometry(radius, 1);
  const positions = geom.attributes.position as THREE.BufferAttribute;

  // Jitter vertices for natural, rugged look
  for (let i = 0; i < positions.count; i++) {
    const vx = positions.getX(i);
    const vy = positions.getY(i);
    const vz = positions.getZ(i);
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    // Asymmetric bulge — some vertices push out more than others
    const jitter = 0.7 + localRng() * 0.55;
    positions.setXYZ(i, (vx / len) * radius * jitter, (vy / len) * radius * jitter, (vz / len) * radius * jitter);
  }

  geom.computeVertexNormals();
  // Flat shading for chunky, low-poly natural-rock look
  const mat = material.clone() as THREE.MeshStandardMaterial;
  mat.flatShading = true;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.farcrysisArt = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// God-ray cone helper
// ---------------------------------------------------------------------------

function makeGodRayCone(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  coneAngle: number,
  color: number,
  opacity: number,
): THREE.Mesh {
  const radius = Math.tan(coneAngle) * length;
  const geom = new THREE.ConeGeometry(radius, length, 8, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(geom, mat);
  cone.name = 'farcrysis-god-ray';

  // Position cone: cone tip at origin, base at origin + direction * length
  const midpoint = origin.clone().add(direction.clone().multiplyScalar(length / 2));
  cone.position.copy(midpoint);

  // Orient cone to point along direction
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
  cone.setRotationFromQuaternion(quat);

  cone.renderOrder = 999;
  cone.material.depthTest = true;
  cone.frustumCulled = false;

  return cone;
}

// ---------------------------------------------------------------------------
// Canvas availability guard (for textures created at build time)
// ---------------------------------------------------------------------------

function hasCanvas(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof document.createElement === 'function'
  );
}

function makeCanvas(width: number, height: number): CanvasRenderingContext2D | null {
  if (!hasCanvas()) return null;
  try {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    return ctx ?? null;
  } catch {
    return null;
  }
}

function canvasToTexture(canvas: HTMLCanvasElement, colorSpace?: THREE.ColorSpace): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = colorSpace ?? THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Sky-dome gradient canvas (golden-hour sky)
// ---------------------------------------------------------------------------

let _skyDomeTexture: THREE.Texture | null = null;

function ensureSkyDomeTexture(): THREE.Texture | null {
  if (_skyDomeTexture) return _skyDomeTexture;
  const ctx = makeCanvas(512, 256);
  if (!ctx) return null;

  const img = ctx.createImageData(512, 256);
  const data = img.data;
  for (let py = 0; py < 256; py++) {
    const t = py / 255; // 0 = top (zenith), 1 = bottom (horizon)
    for (let px = 0; px < 512; px++) {
      const i = (py * 512 + px) * 4;

      // Golden hour gradient: warm gold at zenith → orange mid → pale pink horizon → soft teal bottom
      let r: number, g: number, b: number;

      if (t < 0.35) {
        // Zenith: warm golden-blue
        const s = t / 0.35;
        r = 0.55 + s * 0.30;
        g = 0.40 + s * 0.30;
        b = 0.55 - s * 0.25; // slightly less blue at top
      } else if (t < 0.65) {
        // Mid sky: golden-orange
        const s = (t - 0.35) / 0.30;
        r = 0.85 + s * 0.12;
        g = 0.70 + s * 0.10;
        b = 0.30 - s * 0.10;
      } else if (t < 0.88) {
        // Lower sky: warm horizon glow
        const s = (t - 0.65) / 0.23;
        r = 0.97 - s * 0.07;
        g = 0.80 - s * 0.30;
        b = 0.20 - s * 0.08;
      } else {
        // Horizon to water: fade to pale teal
        const s = (t - 0.88) / 0.12;
        r = 0.90 - s * 0.50;
        g = 0.50 - s * 0.20;
        b = 0.12 + s * 0.30;
      }

      // Soft sun glow spot (top-centre-rightish)
      const hx = (px / 512 - 0.65) * 2; // -1..1 centred at ~0.65
      const hy = (t - 0.15) * 3;
      const sunDist = Math.sqrt(hx * hx + hy * hy);
      const sunGlow = sunDist < 1 ? Math.exp(-sunDist * 3.5) * 0.25 : 0;
      r += sunGlow;
      g += sunGlow * 0.85;
      b += sunGlow * 0.4;

      data[i] = Math.round(Math.min(1, r) * 255);
      data[i + 1] = Math.round(Math.min(1, g) * 255);
      data[i + 2] = Math.round(Math.min(1, b) * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _skyDomeTexture = canvasToTexture(ctx.canvas);
  return _skyDomeTexture;
}

// ---------------------------------------------------------------------------
// Water env-map cube faces (simple sky gradient for reflection hint)
// ---------------------------------------------------------------------------

function makeEnvCubeTexture(): THREE.CubeTexture | null {
  if (!hasCanvas()) return null;
  const SIZE = 64;

  // Warm golden sky color for upward faces; pale turquoise for downward
  const faceSky = (_x: number, y: number): [number, number, number] => {
    // y goes 0 (top) → 1 (bottom); gradient warm gold → pale horizon
    const t = y;
    const r = 0.75 - t * 0.4;
    const gB = 0.55 - t * 0.3;
    const bB = 0.30 - t * 0.15;
    return [r, gB, bB];
  };
  const faceHorizon = (): [number, number, number] => [0.85, 0.72, 0.55];
  const faceWater = (_x: number, y: number): [number, number, number] => {
    const t = y; // darker turquoise at bottom
    return [0.12 + t * 0.1, 0.35 + t * 0.1, 0.40 + t * 0.05];
  };

  // Orientation: +Y up, -Y down, +X right, -X left, +Z front, -Z back
  // For PMREM/cube gen we need PX, NX, PY, NY, PZ, NZ
  const faces: Array<HTMLCanvasElement> = [];

  const makeFace = (fn: (x: number, y: number) => [number, number, number]): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx2 = c.getContext('2d')!;
    const img2 = ctx2.createImageData(SIZE, SIZE);
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const ix = (py * SIZE + px) * 4;
        const [r, g, b] = fn(px / SIZE, py / SIZE);
        img2.data[ix] = Math.round(r * 255);
        img2.data[ix + 1] = Math.round(g * 255);
        img2.data[ix + 2] = Math.round(b * 255);
        img2.data[ix + 3] = 255;
      }
    }
    ctx2.putImageData(img2, 0, 0);
    return c;
  };

  // +X (right): horizon
  faces.push(makeFace(faceHorizon));
  // -X (left): horizon
  faces.push(makeFace(faceHorizon));
  // +Y (up): sky
  faces.push(makeFace(faceSky));
  // -Y (down): water
  faces.push(makeFace((_px, py) => faceWater(_px, py)));
  // +Z (front): lowerslight sky
  faces.push(makeFace((_px, _py) => faceSky(_px, 0.6)));
  // -Z (back): horizon
  faces.push(makeFace(faceHorizon));

  const cubeTex = new THREE.CubeTexture(faces);
  cubeTex.needsUpdate = true;
  return cubeTex;
}

// ---------------------------------------------------------------------------
// buildTerrain — custom BufferGeometry elevation terrain
// ---------------------------------------------------------------------------

export function buildTerrain(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  group.name = 'farcrysis-terrain';

  // ---- 1. Custom elevation terrain mesh (BufferGeometry with per-vertex displacement) ----
  const terrainWidth = 64;
  const terrainSegments = TERR_SEGMENTS;
  const terrainGeom = new THREE.PlaneGeometry(terrainWidth, terrainWidth, terrainSegments, terrainSegments);
  terrainGeom.rotateX(-Math.PI / 2);

  const terrainPositions = terrainGeom.attributes.position as THREE.BufferAttribute;

  // Store vertex colours — white sand, cliff grey, jungle green with banding
  const colors = new Float32Array(terrainPositions.count * 3);
  for (let i = 0; i < terrainPositions.count; i++) {
    const x = terrainPositions.getX(i);
    const z = terrainPositions.getZ(i);
    const h = terrainHeight(x, z);
    terrainPositions.setY(i, h);

    // Colour based on zone
    const edgeDist = ARENA_HALF - Math.max(Math.abs(x), Math.abs(z));
    let r: number; let g: number; let b: number;

    if (edgeDist < 12 && h < 0.8) {
      // ---- White-sand beach with dune banding ----
      // Subtle stripe bands parallel to shoreline
      const band = Math.sin(edgeDist * 1.9 + fbm(x * 0.2, z * 0.2, 2, 101) * 2.5) * 0.04;
      // Wet sand near water edge (darker, more saturated)
      const wetness = edgeDist < 1.8 ? (1 - edgeDist / 1.8) * 0.09 : 0;
      r = 0.93 + band - wetness;
      g = 0.86 + band * 0.6 - wetness * 0.6;
      b = 0.72 + band * 0.3 - wetness * 0.4;
      // Dune highlights — brighter on crests
      const duneHighlight = (h > 0.15 ? Math.min(0.08, (h - 0.15) * 0.3) : 0);
      r += duneHighlight;
      g += duneHighlight * 0.8;
      b += duneHighlight * 0.5;
    } else if (edgeDist < 19 && h > 0.8) {
      // ---- Cliff / rock transition — grey-brown ----
      const noise = fbm(x * 0.5, z * 0.5, 3, 77);
      r = 0.44 + noise * 0.08;
      g = 0.40 + noise * 0.06;
      b = 0.36 + noise * 0.04;
    } else if (edgeDist >= 19 || (h >= 0.3 && edgeDist >= 12)) {
      // ---- Jungle plateau / inland hills — green-brown ----
      const noise = fbm(x * 0.4, z * 0.45, 3, 66);
      r = 0.32 + noise * 0.06;
      g = 0.44 + noise * 0.08;
      b = 0.20 + noise * 0.04;
    } else {
      // Fallback — warm dirt
      r = 0.55; g = 0.45; b = 0.32;
    }

    // Clamp and assign
    colors[i * 3 + 0] = Math.max(0, Math.min(1, r));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }
  terrainGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeom.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.03,
  });
  const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
  terrainMesh.name = 'farcrysis-terrain-elevation';
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  terrainMesh.userData.farcrysisArt = true;
  // Slight offset above game-world ground plates to prevent z-fighting
  terrainMesh.position.y = 0.04;
  group.add(terrainMesh);

  // ---- 2. Cliff rock formations (deformed IcosahedronGeometry along the cliff ring) ----
  const rockMat = new THREE.MeshStandardMaterial({
    color: FARCRYSIS_ART_FEEL.caveRock,
    roughness: 0.88,
    metalness: 0.06,
  });

  const cliffRockCount = 28;
  for (let i = 0; i < cliffRockCount; i++) {
    const angle = (i / cliffRockCount) * Math.PI * 2 + rng() * 0.3;
    const rockDist = 18 + rng() * 8;
    const rx = Math.cos(angle) * rockDist;
    const rz = Math.sin(angle) * rockDist;
    const clampedX = Math.max(minX + 2, Math.min(maxX - 2, rx));
    const clampedZ = Math.max(minZ + 2, Math.min(maxZ - 2, rz));
    const baseY = terrainHeight(clampedX, clampedZ);
    const rockRadius = 0.8 + rng() * 1.6;
    const rockDetail = rng() < 0.5 ? 2 : 1;
    const rock = makeRock(rockRadius, rockDetail, 1000 + i, rockMat);
    rock.name = `farcrysis-terrain-cliff-rock-${i}`;
    rock.position.set(clampedX, baseY + rockRadius * 0.5, clampedZ);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    rock.scale.setScalar(0.7 + rng() * 0.6);
    group.add(rock);
  }

  // ---- 3. Plateau rocks (smaller scatter on the jungle floor) ----
  const plateauRockMat = new THREE.MeshStandardMaterial({
    color: 0x7a7268,
    roughness: 0.85,
    metalness: 0.08,
  });
  const plateauRockCount = 18;
  for (let i = 0; i < plateauRockCount; i++) {
    const angle = (i / plateauRockCount) * Math.PI * 2 + rng() * 0.5;
    const placeDist = 5 + rng() * 14;
    let rx = Math.cos(angle) * placeDist;
    let rz = Math.sin(angle) * placeDist;
    rx = Math.max(minX + 3, Math.min(maxX - 3, rx));
    rz = Math.max(minZ + 3, Math.min(maxZ - 3, rz));
    // Skip path corridors
    const onPath = (
      Math.abs(Math.abs(rx) - 20) < 6 ||
      Math.abs(Math.abs(rz) - 20) < 6
    );
    if (onPath && placeDist > 4) continue;
    const baseY = terrainHeight(rx, rz);
    const rockRadius = 0.35 + rng() * 0.75;
    const rock = makeRock(rockRadius, 1, 3000 + i, plateauRockMat);
    rock.name = `farcrysis-terrain-plateau-rock-${i}`;
    rock.position.set(rx, baseY + rockRadius * 0.4, rz);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    group.add(rock);
  }

  // ---- 4. Beach boulder clusters — dodecahedra, flat-shaded, near cliff edge (presentation only) ----
  const boulderMat = new THREE.MeshStandardMaterial({
    color: 0x7a7268,
    roughness: 0.82,
    metalness: 0.04,
    flatShading: true,
  });
  const boulderClusters: Array<{ cx: number; cz: number; count: number; seed: number }> = [
    { cx:  14, cz:  6, count: 5, seed: 7400 },
    { cx:  -6, cz: 14, count: 4, seed: 7401 },
    { cx: -14, cz: -6, count: 5, seed: 7402 },
    { cx:   6, cz:-14, count: 4, seed: 7403 },
  ];

  for (const cluster of boulderClusters) {
    const localRng = mulberry32(cluster.seed);
    for (let j = 0; j < cluster.count; j++) {
      const angle = j * ((Math.PI * 2) / cluster.count) + localRng() * 0.4;
      const offset = 1.5 + localRng() * 3; // cluster radius
      const bx = cluster.cx + Math.cos(angle) * offset;
      const bz = cluster.cz + Math.sin(angle) * offset;
      const clampedX = Math.max(minX + 2, Math.min(maxX - 2, bx));
      const clampedZ = Math.max(minZ + 2, Math.min(maxZ - 2, bz));
      const baseY = terrainHeight(clampedX, clampedZ);
      const bRadius = 1.2 + localRng() * 1.4;
      const boulder = makeBoulder(bRadius, cluster.seed + j * 100, boulderMat);
      boulder.name = `farcrysis-terrain-beach-boulder-${cluster.seed}-${j}`;
      boulder.position.set(clampedX, baseY + bRadius * 0.35, clampedZ);
      boulder.rotation.set(localRng() * Math.PI, localRng() * Math.PI, localRng() * Math.PI);
      boulder.scale.setScalar(0.8 + localRng() * 0.5);
      group.add(boulder);
    }
  }

  // ---- 5. Sand flat ring mesh (decorative overlay, subtle white-sand colour) ----
  const sandRingOuter = ARENA_HALF;
  const sandRingInner = sandRingOuter - SAND_INSET;
  const sandRingShape = new THREE.Shape();
  sandRingShape.moveTo(-sandRingOuter, -sandRingOuter);
  sandRingShape.lineTo(sandRingOuter, -sandRingOuter);
  sandRingShape.lineTo(sandRingOuter, sandRingOuter);
  sandRingShape.lineTo(-sandRingOuter, sandRingOuter);
  sandRingShape.closePath();
  const holePath = new THREE.Path();
  holePath.moveTo(-sandRingInner, -sandRingInner);
  holePath.lineTo(sandRingInner, -sandRingInner);
  holePath.lineTo(sandRingInner, sandRingInner);
  holePath.lineTo(-sandRingInner, sandRingInner);
  holePath.closePath();
  sandRingShape.holes.push(holePath);

  const sandRingGeom = new THREE.ShapeGeometry(sandRingShape);
  sandRingGeom.rotateX(-Math.PI / 2);
  const sandRingMat = new THREE.MeshStandardMaterial({
    color: FARCRYSIS_ART_FEEL.beachSand,
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const sandRing = new THREE.Mesh(sandRingGeom, sandRingMat);
  sandRing.name = 'farcrysis-terrain-sand-ring';
  sandRing.position.y = 0.025; // slightly above terrain base to avoid z-fighting
  sandRing.receiveShadow = true;
  sandRing.userData.farcrysisArt = true;
  group.add(sandRing);

  scene.add(group);
  return group;
}

// ---------------------------------------------------------------------------
// buildLighting — golden-hour sun, ambient, hemisphere, FogExp2, god rays, sky dome
// ---------------------------------------------------------------------------

export function buildLighting(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  godRays: THREE.Group;
  updateGodRays: () => void;
} {
  // ---- 1. Golden-hour DirectionalLight (sun) ----
  const SUN_COLOR = 0xffcc80;
  const SUN_INTENSITY = 2.7;
  const sunPosition = new THREE.Vector3(-18, 20, 25); // low angle from NW

  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.name = 'farcrysis-sun';
  sun.position.copy(sunPosition);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 5; // soft golden-hour penumbra
  scene.add(sun);

  // ---- 1a. Sun disc (visible sphere + halo at the directional-light position) ----
  const sunDiscGroup = new THREE.Group();
  sunDiscGroup.name = 'farcrysis-sun-disc';

  // Inner bright disc
  const sunDiscGeom = new THREE.SphereGeometry(0.7, 16, 12);
  const sunDiscMat = new THREE.MeshBasicMaterial({ color: 0xfffbe0, fog: false });
  const sunDisc = new THREE.Mesh(sunDiscGeom, sunDiscMat);
  sunDisc.name = 'farcrysis-sun-disc-core';
  sunDiscGroup.add(sunDisc);

  // Outer soft halo (additive blend)
  const sunHaloGeom = new THREE.SphereGeometry(2.2, 16, 12);
  const sunHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffcc80,
    transparent: true,
    opacity: 0.18,
    fog: false,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sunHalo = new THREE.Mesh(sunHaloGeom, sunHaloMat);
  sunHalo.name = 'farcrysis-sun-disc-halo';
  sunDiscGroup.add(sunHalo);

  sunDiscGroup.position.copy(sunPosition);
  sunDiscGroup.frustumCulled = false;
  scene.add(sunDiscGroup);

  // ---- 2. Ambient light ----
  const ambient = new THREE.AmbientLight(
    FARCRYSIS_ART_FEEL.ambientColor, // 0x9fbfa8
    FARCRYSIS_ART_FEEL.ambientIntensity, // 0.42
  );
  ambient.name = 'farcrysis-ambient';
  scene.add(ambient);

  // ---- 3. Hemisphere light (sky + ground bounce) ----
  const hemiSky = new THREE.Color(0xffe8cc); // warm sky
  const hemiGround = new THREE.Color(0x4a6b3a); // green ground bounce
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, 0.55);
  hemi.name = 'farcrysis-hemisphere';
  scene.add(hemi);

  // ---- 4. Volumetric fog (FogExp2) — warm golden-hour haze ----
  // Warmer, slightly denser than original for richer atmosphere
  const fogColor = new THREE.Color(0xffd2b0);
  const fogDensity = 0.0030; // subtle haze, visible at mid-long range
  scene.fog = new THREE.FogExp2(fogColor, fogDensity);

  // ---- 5. Sky dome (large BackSide sphere with gradient texture) ----
  const skyTex = ensureSkyDomeTexture();
  if (skyTex) {
    const skyGeom = new THREE.SphereGeometry(200, 32, 24);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const skyDome = new THREE.Mesh(skyGeom, skyMat);
    skyDome.name = 'farcrysis-sky-dome';
    skyDome.renderOrder = -1;
    skyDome.frustumCulled = false;
    skyDome.userData.farcrysisArt = true;
    scene.add(skyDome);
  }

  // ---- 6. Lightweight god-ray cones (main layer + halo layer + tower shafts) ----
  const godRayGroup = new THREE.Group();
  godRayGroup.name = 'farcrysis-god-rays';

  const sunDir = sunPosition.clone().normalize();
  const rays: THREE.Mesh[] = [];

  // --- Main ray layer (scattered origins across the arena) ---
  {
    const rayCount = 14;
    for (let i = 0; i < rayCount; i++) {
      const originAngle = (i / rayCount) * Math.PI * 2;
      const originDist = 7 + (i % 5) * 5;
      const ox = Math.cos(originAngle) * originDist;
      const oz = Math.sin(originAngle) * originDist;
      const oy = 2 + (i % 4) * 4;

      const coneLength = 28 + (i % 3) * 14;
      const coneAngle = 0.035 + (i % 5) * 0.018;
      const coneOpacity = 0.05 + (i % 4) * 0.025;

      const ray = makeGodRayCone(
        new THREE.Vector3(ox, oy, oz),
        sunDir,
        coneLength,
        coneAngle,
        0xfff5e0,
        coneOpacity,
      );
      ray.name = `farcrysis-god-ray-${i}`;
      godRayGroup.add(ray);
      rays.push(ray);
    }
  }

  // --- Halo layer (wider, fainter cones — soft atmospheric glow) ---
  {
    const haloCount = 8;
    for (let i = 0; i < haloCount; i++) {
      const originAngle = (i / haloCount) * Math.PI * 2 + 0.3;
      const originDist = 10 + (i % 3) * 7;
      const ox = Math.cos(originAngle) * originDist;
      const oz = Math.sin(originAngle) * originDist;
      const oy = 3 + (i % 3) * 6;

      const coneLength = 35 + (i % 2) * 18;
      const coneAngle = 0.07 + (i % 3) * 0.03;
      const coneOpacity = 0.025 + (i % 3) * 0.012;

      const halo = makeGodRayCone(
        new THREE.Vector3(ox, oy, oz),
        sunDir,
        coneLength,
        coneAngle,
        0xfff8ed,
        coneOpacity,
      );
      halo.name = `farcrysis-god-ray-halo-${i}`;
      godRayGroup.add(halo);
      rays.push(halo);
    }
  }

  // --- Tower light shafts (vertical beams near the derelict research tower at NW core) ---
  {
    const towerOrigins: Array<[number, number, number]> = [
      [-8, 4.5, -8],
      [-7.5, 3.8, -7],
      [-8.5, 5.2, -8.5],
      [-7, 4.0, -9],
    ];
    for (let i = 0; i < towerOrigins.length; i++) {
      const [ox, oy, oz] = towerOrigins[i];
      // Shafts point slightly upward, converging with the sun direction
      const shaftDir = new THREE.Vector3(ox, oy + 2, oz)
        .normalize().lerp(sunDir, 0.7).normalize();
      const coneLength = 22 + i * 4;
      const coneAngle = 0.03 + i * 0.01;
      const coneOpacity = 0.04 + i * 0.015;

      const shaft = makeGodRayCone(
        new THREE.Vector3(ox, oy, oz),
        shaftDir,
        coneLength,
        coneAngle,
        0xfffbe5,
        coneOpacity,
      );
      shaft.name = `farcrysis-god-ray-tower-${i}`;
      godRayGroup.add(shaft);
      rays.push(shaft);
    }
  }

  // Store base opacities per ray so we can pulse relative to authored value.
  const baseRayOpacities = rays.map((ray) => {
    const mat = ray.material as THREE.MeshBasicMaterial;
    return mat.opacity;
  });

  // Self-driving subtle opacity pulse — feels alive without external wiring.
  const pulsePhases: number[] = [];
  const pulseSpeeds: number[] = [];
  for (let i = 0; i < rays.length; i++) {
    pulsePhases.push((i * 0.7) % (Math.PI * 2));
    pulseSpeeds.push(0.6 + (i % 5) * 0.15); // varied speeds
  }

  godRayGroup.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    for (let i = 0; i < rays.length; i++) {
      const mat = rays[i].material as THREE.MeshBasicMaterial;
      const pulse = 1 + Math.sin(t * pulseSpeeds[i] + pulsePhases[i]) * 0.25;
      mat.opacity = Math.max(0.01, baseRayOpacities[i] * pulse);
    }
  };

  scene.add(godRayGroup);

  // Update god-ray orientations to follow the light direction
  const updateGodRays = (): void => {
    const dir = sun.position.clone().normalize();
    for (const ray of rays) {
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      ray.setRotationFromQuaternion(quat);
    }
  };

  return { sun, godRays: godRayGroup, updateGodRays };
}

// ---------------------------------------------------------------------------
// buildWater — animated tropical water plane with wave simulation and foam
// ---------------------------------------------------------------------------

export function buildWater(scene: THREE.Scene): {
  mesh: THREE.Mesh;
  update: (timeSeconds: number) => void;
} {
  const waterSize = 76;
  const waterSegments = 64;
  const waterGeom = new THREE.PlaneGeometry(waterSize, waterSize, waterSegments, waterSegments);
  waterGeom.rotateX(-Math.PI / 2);

  // Store original positions for animation
  const basePositions = new Float32Array(
    (waterGeom.attributes.position as THREE.BufferAttribute).array,
  );

  // Glossy reflection-hint material — high metalness, low roughness gives sun glints
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2d7f8c,
    roughness: 0.14,
    metalness: 0.52,
    transparent: true,
    opacity: 0.76,
    depthWrite: true,
    envMapIntensity: 0.85,
    emissive: 0x103025,
    emissiveIntensity: 0.35,
    fog: false,
  });

  // Apply sky-coloured envMap for reflection hint (canvas CubeTexture — fallback-safe)
  const envCube = makeEnvCubeTexture();
  if (envCube) {
    waterMat.envMap = envCube;
  }

  const water = new THREE.Mesh(waterGeom, waterMat);
  water.name = 'farcrysis-terrain-water';
  water.position.y = -0.3;
  water.receiveShadow = true;
  water.userData.farcrysisArt = true;
  water.renderOrder = 1;
  scene.add(water);

  // ---- Sparkle points (additive blending dots on water surface) ----
  const sparkleCount = 80;
  const sparklePositions = new Float32Array(sparkleCount * 3);
  for (let i = 0; i < sparkleCount; i++) {
    const angle = (i / sparkleCount) * Math.PI * 2 + Math.random() * 0.5;
    const radius = 18 + Math.random() * 16;
    sparklePositions[i * 3 + 0] = Math.cos(angle) * radius;
    sparklePositions[i * 3 + 1] = -0.29; // just above water surface
    sparklePositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const sparkleGeom = new THREE.BufferGeometry();
  sparkleGeom.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  const sparkleMat = new THREE.PointsMaterial({
    color: FARCRYSIS_ART_FEEL.waterSparkleColor, // 0xd4f0ff
    size: 0.18,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const sparkles = new THREE.Points(sparkleGeom, sparkleMat);
  sparkles.name = 'farcrysis-terrain-water-sparkles';
  sparkles.frustumCulled = false;
  water.add(sparkles);

  // ---- Shoreline foam band (square annular ring at the water–beach lip) ----
  const foamRingOuter = ARENA_HALF + 0.2;
  const foamRingInner = ARENA_HALF - 1.6;
  const foamRingShape = new THREE.Shape();
  foamRingShape.moveTo(-foamRingOuter, -foamRingOuter);
  foamRingShape.lineTo(foamRingOuter, -foamRingOuter);
  foamRingShape.lineTo(foamRingOuter, foamRingOuter);
  foamRingShape.lineTo(-foamRingOuter, foamRingOuter);
  foamRingShape.closePath();
  const foamHole = new THREE.Path();
  foamHole.moveTo(-foamRingInner, -foamRingInner);
  foamHole.lineTo(foamRingInner, -foamRingInner);
  foamHole.lineTo(foamRingInner, foamRingInner);
  foamHole.lineTo(-foamRingInner, foamRingInner);
  foamHole.closePath();
  foamRingShape.holes.push(foamHole);

  const foamGeom = new THREE.ShapeGeometry(foamRingShape);
  foamGeom.rotateX(-Math.PI / 2);
  const foamMat = new THREE.MeshStandardMaterial({
    color: 0xfaf5ee,
    roughness: 0.62,
    metalness: 0.02,
    transparent: true,
    opacity: 0.50,
    depthWrite: true,
    fog: false,
  });
  const foamRing = new THREE.Mesh(foamGeom, foamMat);
  foamRing.name = 'farcrysis-terrain-foam-ring';
  foamRing.position.y = -0.22; // near the water surface
  foamRing.receiveShadow = true;
  foamRing.renderOrder = 2;
  foamRing.userData.farcrysisArt = true;
  water.add(foamRing);

  // ---- Animation updater (alloc-free: no per-frame allocations) ----
  const positions = waterGeom.attributes.position as THREE.BufferAttribute;
  const update = (timeSeconds: number): void => {
    const t = timeSeconds;

    // Gentle multi-octave wave — vertex displacement only (normals stay as-built;
    // surface detail comes from the normal map applied by the textures module.)
    for (let i = 0; i < positions.count; i++) {
      const bx = basePositions[i * 3 + 0];
      const bz = basePositions[i * 3 + 2];
      const dist = Math.sqrt(bx * bx + bz * bz);

      // Lapping shore waves — stronger near the edges, gentler inland
      const edgeDist = ARENA_HALF + 6 - Math.max(Math.abs(bx), Math.abs(bz));
      const shoreFactor = Math.max(0, Math.min(1, edgeDist / 8)); // ramp near shore

      const wave1 = Math.sin(bx * 0.35 + t * 0.55) * Math.cos(bz * 0.30 + t * 0.45) * 0.10;
      const wave2 = Math.sin(bx * 0.65 - t * 0.45) * 0.05;
      const wave3 = Math.cos(bz * 0.55 + t * 0.55) * 0.06;
      const ripple = Math.sin(dist * 0.8 - t * 1.0) * 0.04 * shoreFactor;

      // Waves are gentler further from shore
      const height = (wave1 + wave2 + wave3) * (0.3 + shoreFactor * 0.7) + ripple;
      positions.setY(i, height);
    }
    positions.needsUpdate = true;

    // Animate sparkle opacity
    sparkleMat.opacity = 0.35 + Math.sin(t * 1.2) * 0.12;

    // Animate foam opacity — gentle pulse like advancing/retreating wash
    foamMat.opacity = 0.40 + Math.sin(t * 0.7) * 0.12;
  };

  // Self-driving wave animation — fires every visible frame
  water.onBeforeRender = () => {
    update(performance.now() * 0.001);
  };

  return { mesh: water, update };
}
