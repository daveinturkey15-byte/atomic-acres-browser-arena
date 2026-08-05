/**
 * farcrysis-terrain.ts — Procedural golden-hour tropical beach/cliff terrain,
 * atmospheric lighting, volumetric god-rays, atmospheric particles, and
 * custom-shader animated water for the Farcrysis arena.
 *
 * Exports:
 *   buildTerrain(scene)  — custom BufferGeometry elevation, cliffs, rocks, paths
 *   buildLighting(scene) — golden-hour sun (PCFSoft-ready shadows), ambient/hemisphere,
 *                           FogExp2 warm golden haze, volumetric light shafts, fill light,
 *                           atmospheric particles (pollen, fireflies, dust)
 *   buildWater(scene)    — custom-shader water (wave-displaced vertices, specular, fresnel,
 *                           env reflection, shore transparency, procedural foam),
 *                           shoreline foam ring, sparkles, caustic floor projector
 *
 * All procedural — no copied IP. Presentation only (no colliders/gameplay authority).
 * Uses FARCRYSIS_ART_FEEL palette constants from farcrysis-art.ts.
 *
 * Pass 69 extensions (2026-08-05):
 *   - Seeded-noise BufferGeometry heightfield (gentle dunes/hills, playable core flat,
 *     clear lanes, elevation range 0–1.3 m).
 *   - White-sand beach with subtle dune banding in vertex colours.
 *   - Beach boulder clusters (dodecahedron, flat-shaded) near cliff edge.
 *   - Volumetric god-ray shafts (ShaderMaterial; noise-dithered, time-animated).
 *   - Atmospheric particles: pollen motes, lagoon fireflies, sunbeam dust (shader-driven Points).
 *   - Custom water shader: animated normal + wave displacement, specular glints,
 *     fresnel edge-darkening + reflection, shore transparency, procedural foam.
 *   - Caustic light pattern projector on lagoon floor ring.
 *   - Warm exponential-squared fog, cool-blue fill light, tuned golden-hour exposure.
 *   - PCFSoftShadowMap-ready directional-light shadow config (radius-based soft penumbra).
 *   - Animated shoreline foam band (dedicated ShaderMaterial ring hugging the
 *     square shoreline; time-driven wash, drifting noise, sunlit sparkle).
 *   - Natural rock formations (5 seeded displaced-icosahedron clusters, 2–4 m)
 *     at the lagoon perimeter and beside the flooded cave entrance — hand-placed
 *     clear of spawns (±18–26 diagonal corners) and patrol routes, presentation only.
 *   - Water reflection upgrade: sun-tinted sky gradient (warm orange → deep teal)
 *     mixed by fresnel, plus shoreline caustic sparkle — no render targets.
 *   - Sand/dirt path ribbons (3 winding strips) from the beach to the research
 *     tower core — visual flow dressing, no navigation authority.
 *   - Exported animateWater(timeSeconds) — drives every water/foam uniform from
 *     one call (safe per frame; systems also self-drive via onBeforeRender).
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

/**
 * Formation rock — displaced IcosahedronGeometry with two-octave seeded radial
 * noise, slight base flattening, and per-vertex tonal colouring (dry rock,
 * sandy base, faint lichen band). Deterministic (seeded mulberry32 only).
 */
function makeFormationRock(
  radius: number,
  detail: number,
  seed: number,
  material: THREE.Material,
): THREE.Mesh {
  const localRng = mulberry32(seed);
  const geom = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geom.attributes.position as THREE.BufferAttribute;

  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    // Two-octave seeded radial displacement — rugged, natural silhouette
    const n1 = localRng();
    const n2 = localRng();
    const noise = 1 + (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.22;
    // Slight base flattening so the rock settles into the sand
    const flat = vy < 0 ? 1 - Math.min(0.16, (-vy / radius) * 0.5) : 1;
    const r = radius * noise * flat;
    pos.setXYZ(i, (vx / len) * r, (vy / len) * r, (vz / len) * r);

    // Tonal variation: dry grey-brown rock, sandy base, faint lichen band
    const up = vy / (radius * 1.25); // approx -1..1 after displacement
    const t = up * 0.5 + 0.5;        // 0 bottom → 1 top
    let cr = 0.44; let cg = 0.41; let cb = 0.37;
    const v = localRng();
    cr += (v - 0.5) * 0.12;
    cg += (v - 0.5) * 0.10;
    cb += (v - 0.5) * 0.08;
    const lichen = smoothstep(0.25, 0.55, t) * (1 - smoothstep(0.55, 0.9, t));
    cg += lichen * 0.10;
    cr -= lichen * 0.04;
    const baseSand = 1 - smoothstep(0.05, 0.45, t);
    cr += baseSand * 0.10;
    cg += baseSand * 0.09;
    cb += baseSand * 0.06;
    colors[i * 3 + 0] = Math.max(0, Math.min(1, cr));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, cg));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, cb));
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.farcrysisArt = true;
  return mesh;
}

type RockFormationSite = { x: number; z: number; seed: number; scale: number };

/**
 * Build one natural rock formation: a large primary rock flanked by two smaller
 * satellites. Site footprint is fixed (seeded jitter affects shape/size/
 * orientation only, never the safe clearance from spawns/patrol routes).
 */
function buildRockFormation(
  site: RockFormationSite,
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'farcrysis-terrain-rock-formation';
  const localRng = mulberry32(site.seed);

  const primaryRadius = Math.min((1.35 + localRng() * 0.45) * site.scale, 1.95);
  const primary = makeFormationRock(primaryRadius, 2, site.seed + 1, material);
  primary.name = 'farcrysis-terrain-rock-formation-primary';
  primary.position.set(
    site.x,
    terrainHeight(site.x, site.z) + primaryRadius * 0.42,
    site.z,
  );
  primary.rotation.set(localRng() * Math.PI, localRng() * Math.PI, localRng() * Math.PI);
  group.add(primary);

  const satelliteCount = 2;
  for (let j = 0; j < satelliteCount; j++) {
    const angle = (j / satelliteCount) * Math.PI * 2 + localRng() * 0.6;
    const offset = 1.1 + localRng() * 1.1; // ≤ 2.2 m — preserves the ≥4 m spawn/patrol clearance
    const sx = site.x + Math.cos(angle) * offset;
    const sz = site.z + Math.sin(angle) * offset;
    const satRadius = (0.55 + localRng() * 0.4) * site.scale;
    const sat = makeFormationRock(satRadius, 1, site.seed + 10 + j * 7, material);
    sat.name = `farcrysis-terrain-rock-formation-sat-${j}`;
    sat.position.set(sx, terrainHeight(sx, sz) + satRadius * 0.4, sz);
    sat.rotation.set(localRng() * Math.PI, localRng() * Math.PI, localRng() * Math.PI);
    group.add(sat);
  }
  return group;
}

/**
 * Build a winding sand/dirt path ribbon from a centreline of waypoints.
 * The strip follows terrainHeight (+0.06 m) with seeded edge wobble and
 * tonal mottling. Visual only — no colliders, no navigation authority.
 */
function makePathRibbon(
  waypoints: Array<[number, number]>,
  width: number,
  seed: number,
  color: THREE.Color,
): THREE.Mesh {
  const localRng = mulberry32(seed);
  const pts = waypoints.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);

  const SEG = 26;
  const positions: number[] = [];
  const colorsArr: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const p = curve.getPoint(i / SEG);
    const tang = curve.getTangent(i / SEG);
    // Perpendicular offset in the XZ plane
    const perpX = -tang.z;
    const perpZ = tang.x;
    const perpLen = Math.sqrt(perpX * perpX + perpZ * perpZ) || 1;
    const wob = 1 + (localRng() - 0.5) * 0.35; // natural edge wobble
    const halfW = (width / 2) * wob;
    const ax = p.x + (perpX / perpLen) * halfW;
    const az = p.z + (perpZ / perpLen) * halfW;
    const bx = p.x - (perpX / perpLen) * halfW;
    const bz = p.z - (perpZ / perpLen) * halfW;
    positions.push(
      ax, terrainHeight(ax, az) + 0.06, az,
      bx, terrainHeight(bx, bz) + 0.06, bz,
    );
    const mottle = 1 + (localRng() - 0.5) * 0.22;
    const cr = Math.min(1, color.r * mottle);
    const cg = Math.min(1, color.g * mottle);
    const cb = Math.min(1, color.b * mottle);
    colorsArr.push(cr, cg, cb, cr, cg, cb);
    if (i > 0) {
      const base = i * 2;
      indices.push(base - 2, base - 1, base, base - 1, base + 1, base);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colorsArr, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = false;
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
// GLSL noise snippet — shared by volumetric shafts, water, caustic shaders
// ---------------------------------------------------------------------------

const GLSL_NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0,0.0,0.0)), f.x),
        mix(hash13(i + vec3(0.0,1.0,0.0)), hash13(i + vec3(1.0,1.0,0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0,0.0,1.0)), hash13(i + vec3(1.0,0.0,1.0)), f.x),
        mix(hash13(i + vec3(0.0,1.0,1.0)), hash13(i + vec3(1.0,1.0,1.0)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  float v = 0.0; float a = 0.5; vec3 shift = vec3(0.0);
  for (int i = 0; i < 4; i++) { v += a * vnoise(p + shift); p *= 2.0; a *= 0.5; }
  return v;
}
`;

// ---------------------------------------------------------------------------
// Volumetric light-shaft cylinder (ShaderMaterial with noise/dither)
// ---------------------------------------------------------------------------

function makeVolumetricShaft(
  radius: number,
  length: number,
  axisDir: THREE.Vector3,
  center: THREE.Vector3,
  color: THREE.Color,
  alpha: number,
  density: number,
  falloffExp: number,
): THREE.Mesh {
  const geom = new THREE.CylinderGeometry(radius, radius, length, 24, 1, true); // open-ended

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color },
      uAlpha: { value: alpha },
      uDensity: { value: density },
      uFalloff: { value: falloffExp },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vWorld;
      void main() {
        vLocal = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uAlpha;
      uniform float uDensity;
      uniform float uFalloff;
      varying vec3 vLocal;
      varying vec3 vWorld;
      ${GLSL_NOISE}
      void main() {
        float r = length(vLocal.xz);
        float rim = exp(-r * r * uFalloff);
        float band = fbm3(vLocal * 0.055 + vec3(0.0, -uTime * 0.12, 0.0));
        // Animated dither for subtle flicker / heat shimmer
        float dith = hash13(vec3(gl_FragCoord.xy, uTime * 0.45));
        float noiseRim = rim * (0.65 + 0.35 * band);
        float a = noiseRim * uDensity * uAlpha;
        a += dith * rim * 0.08;
        a = clamp(a, 0.0, 1.0);
        if (a < 0.015) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
    fog: false,
  });

  const shaft = new THREE.Mesh(geom, mat);
  shaft.name = 'farcrysis-volumetric-shaft';
  shaft.position.copy(center);
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, axisDir.clone().normalize());
  shaft.setRotationFromQuaternion(quat);
  shaft.renderOrder = 998;
  shaft.frustumCulled = false;
  shaft.userData.farcrysisArt = true;
  return shaft;
}

// ---------------------------------------------------------------------------
// Volumetric cloud cluster helpers (ShaderMaterial + layered noise)
// ---------------------------------------------------------------------------

/** Create a single volumetric cloud puff — large sphere with noise-based transparency. */
function makeVolumetricCloud(
  radius: number,
  position: THREE.Vector3,
  color: THREE.Color,
  opacity: number,
  noiseScale: number,
  detailLevel: number,
): THREE.Mesh {
  const geom = new THREE.SphereGeometry(radius, 16, 12);

  // Flatten the bottom slightly for more natural cloud shape
  const pos = geom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) {
      const flatFactor = 1 + y / radius * 0.5; // flatten bottom 50%
      pos.setY(i, y * (1 + flatFactor * 0.6));
    }
  }
  geom.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: color },
      uOpacity: { value: opacity },
      uNoiseScale: { value: noiseScale },
      uDetail: { value: detailLevel },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      varying vec3 vNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vLocalPos = position;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uNoiseScale;
      uniform float uDetail;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      varying vec3 vNormal;
      ${GLSL_NOISE}
      void main() {
        float r = length(vLocalPos) / (${radius.toFixed(1)} * 0.98);
        // Multi-octave noise for billowy cloud shape
        float n1 = fbm3(vWorldPos * uNoiseScale + vec3(uTime * 0.015, 0.0, uTime * 0.01));
        float n2 = fbm3(vWorldPos * uNoiseScale * 2.5 + vec3(uTime * 0.02, uTime * 0.01, uTime * 0.015));
        float n = n1 * 0.7 + n2 * 0.3;
        n += 0.15 * fbm3(vWorldPos * uNoiseScale * 5.0 + vec3(uTime * 0.03, 0.0, 0.0)) * uDetail;
        n = clamp(n, 0.0, 1.0);
        // Soft radial falloff — cloud fades at edges
        float edge = 1.0 - smoothstep(0.25, 0.95, r);
        float shape = n * edge;
        // Sharpen the cloud silhouette
        shape = smoothstep(0.24, 0.68, shape);
        float a = shape * uOpacity;
        // Rim lighting from above
        float rim = max(0.0, dot(vNormal, vec3(0.0, 1.0, 0.0)));
        vec3 litColor = uColor * (0.75 + 0.25 * rim);
        if (a < 0.02) discard;
        gl_FragColor = vec4(litColor, a);
      }
    `,
    blending: THREE.NormalBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.FrontSide,
    fog: false,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'farcrysis-vol-cloud';
  mesh.position.copy(position);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.userData.farcrysisArt = true;
  return mesh;
}

/** Build a group of volumetric cloud clusters scattered across the sky dome. */
function buildCloudGroup(sunPosition: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.name = 'farcrysis-clouds';

  const cloudRng = mulberry32(0xca11_7c2e);
  const baseColor = new THREE.Color(0xfff5e8); // warm white
  const shadowColor = new THREE.Color(0xffe0c0); // peach shadow

  // High-altitude billowy cloud clusters at varying radii (30-80m)
  // Clusters weighted toward the horizon and sun direction for dramatic golden-hour look
  const skyRadius = 100;
  const cloudCount = 28;

  for (let i = 0; i < cloudCount; i++) {
    // Position clouds on a large spherical shell, biased toward horizon
    const theta = (cloudRng() - 0.5) * Math.PI * 0.8; // ±72° from horizon
    const phi = cloudRng() * Math.PI * 2;
    const dist = skyRadius * (0.7 + cloudRng() * 0.3);

    // Bias some clouds toward the sun side
    const sunPhi = Math.atan2(sunPosition.x, sunPosition.z);
    let cloudPhi = phi;
    if (cloudRng() < 0.4) {
      cloudPhi = sunPhi + (cloudRng() - 0.5) * 1.5;
    }

    const cx = Math.cos(theta) * Math.sin(cloudPhi) * dist;
    const cy = Math.sin(theta) * dist + 15; // elevate above horizon
    const cz = Math.cos(theta) * Math.cos(cloudPhi) * dist;

    const cloudRadius = 12 + cloudRng() * 32;
    const cloudOpacity = 0.28 + cloudRng() * 0.35;
    const noiseScale = 0.08 + cloudRng() * 0.06;
    const detail = cloudRng() < 0.5 ? 1.0 : 0.5;

    // Mix base and shadow colors based on position relative to sun
    const colorMix = cloudRng() * 0.6;
    const cloudColor = baseColor.clone().lerp(shadowColor, colorMix);

    const cloud = makeVolumetricCloud(
      cloudRadius,
      new THREE.Vector3(cx, cy, cz),
      cloudColor,
      cloudOpacity,
      noiseScale,
      detail,
    );
    cloud.name = `farcrysis-cloud-${i}`;
    // Render order: larger/background clouds first
    cloud.renderOrder = 3 + Math.floor(cloudRadius / 15);
    group.add(cloud);
  }

  // Add a few low-horizon cloud wisps (flattened)
  const wispCount = 8;
  for (let i = 0; i < wispCount; i++) {
    const phi = cloudRng() * Math.PI * 2;
    const theta = 0.35 + cloudRng() * 0.2; // near horizon
    const dist = skyRadius * 0.85;
    const wx = Math.cos(theta) * Math.sin(phi) * dist;
    const wy = Math.sin(theta) * dist;
    const wz = Math.cos(theta) * Math.cos(phi) * dist;

    const wisp = makeVolumetricCloud(
      18 + cloudRng() * 25,
      new THREE.Vector3(wx, wy, wz),
      new THREE.Color(0xffedd0),
      0.18 + cloudRng() * 0.22,
      0.05 + cloudRng() * 0.04,
      0.3,
    );
    wisp.name = `farcrysis-cloud-wisp-${i}`;
    wisp.renderOrder = 2;
    // Squash horizontally for wispy horizon clouds
    wisp.scale.set(1.5, 0.4, 1.0);
    group.add(wisp);
  }

  // Self-driving time update
  group.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.includes('farcrysis-vol-cloud')) {
        const m = child.material as THREE.ShaderMaterial;
        if (m.uniforms?.uTime) m.uniforms.uTime.value = t;
      }
    });
  };

  return group;
}

/** Build a low-lying ground fog layer — thin semi-transparent plane with noise-based opacity. */
function buildGroundFogLayer(): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(100, 100, 32, 32);
  geom.rotateX(-Math.PI / 2);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffe0c0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vUv = wp.xz * 0.04;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        // Ground-level haze thicker near water perimeter, thinner in center
        float dist = max(abs(vWorldPos.x), abs(vWorldPos.z));
        float edgeFactor = smoothstep(10.0, 32.0, dist);
        // Animated fog noise
        float n = fbm3(vWorldPos * 0.05 + vec3(uTime * 0.03, 0.0, uTime * 0.02));
        float a = edgeFactor * 0.14 * (0.6 + 0.4 * n);
        a += 0.03 * edgeFactor;
        a = clamp(a, 0.0, 1.0);
        if (a < 0.005) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
    fog: false,
  });

  const plane = new THREE.Mesh(geom, mat);
  plane.name = 'farcrysis-ground-fog';
  plane.position.y = 0.4;
  plane.renderOrder = 5;
  plane.frustumCulled = false;
  plane.userData.farcrysisArt = true;
  return plane;
}

// ---------------------------------------------------------------------------
// Atmospheric particle helpers (shader-driven Points — zero CPU update)
// ---------------------------------------------------------------------------

type ParticleConfig = {
  name: string;
  count: number;
  positions: Float32Array;
  phases: Float32Array;
  speeds: Float32Array;
  amps: Float32Array;
  sizes: Float32Array;
  twinkles: Float32Array;
  color: [number, number, number];
  opacity: number;
  sizeScale: number;
  blinkSharp: number; // 1 = soft, 6 = firefly flash
  driftVert: number; // vertical drift multiplier
};

function makeParticleSystem(cfg: ParticleConfig): THREE.Points {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(cfg.positions, 3));
  geom.setAttribute('aPhase', new THREE.BufferAttribute(cfg.phases, 1));
  geom.setAttribute('aSpeed', new THREE.BufferAttribute(cfg.speeds, 1));
  geom.setAttribute('aAmp', new THREE.BufferAttribute(cfg.amps, 1));
  geom.setAttribute('aSize', new THREE.BufferAttribute(cfg.sizes, 1));
  geom.setAttribute('aTwinkle', new THREE.BufferAttribute(cfg.twinkles, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(...cfg.color) },
      uOpacity: { value: cfg.opacity },
      uSharp: { value: cfg.blinkSharp },
      uDriftVert: { value: cfg.driftVert },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aAmp;
      attribute float aSize;
      attribute float aTwinkle;
      varying float vBlink;
      uniform float uTime;
      uniform float uDriftVert;
      void main() {
        vec3 p = position;
        float t = uTime;
        p.x += sin(t * aSpeed * 0.65 + aPhase) * aAmp;
        p.z += cos(t * aSpeed * 0.52 + aPhase * 1.4) * aAmp;
        p.y += sin(t * aSpeed * 0.38 + aPhase * 2.1) * aAmp * uDriftVert;
        vBlink = 0.5 + 0.5 * sin(t * aTwinkle * 1.5 + aPhase * 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (180.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uSharp;
      varying float vBlink;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float mask = 1.0 - smoothstep(0.3, 0.5, d);
        if (mask < 0.01) discard;
        float blink = pow(max(vBlink, 0.0), uSharp);
        gl_FragColor = vec4(uColor, uOpacity * mask * blink);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });

  const points = new THREE.Points(geom, mat);
  points.name = cfg.name;
  points.userData.farcrysisArt = true;
  points.frustumCulled = false;
  return points;
}

// ---------------------------------------------------------------------------
// Canvas availability guard
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
        const s = t / 0.35;
        r = 0.55 + s * 0.30;
        g = 0.40 + s * 0.30;
        b = 0.55 - s * 0.25;
      } else if (t < 0.65) {
        const s = (t - 0.35) / 0.30;
        r = 0.85 + s * 0.12;
        g = 0.70 + s * 0.10;
        b = 0.30 - s * 0.10;
      } else if (t < 0.88) {
        const s = (t - 0.65) / 0.23;
        r = 0.97 - s * 0.07;
        g = 0.80 - s * 0.30;
        b = 0.20 - s * 0.08;
      } else {
        const s = (t - 0.88) / 0.12;
        r = 0.90 - s * 0.50;
        g = 0.50 - s * 0.20;
        b = 0.12 + s * 0.30;
      }

      // Soft sun glow spot (top-centre-rightish)
      const hx = (px / 512 - 0.65) * 2;
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
// Water env-map cube faces
// ---------------------------------------------------------------------------

function makeEnvCubeTexture(): THREE.CubeTexture | null {
  if (!hasCanvas()) return null;
  const SIZE = 64;

  const faceSky = (_x: number, y: number): [number, number, number] => {
    const t = y;
    const r = 0.75 - t * 0.4;
    const gB = 0.55 - t * 0.3;
    const bB = 0.30 - t * 0.15;
    return [r, gB, bB];
  };
  const faceHorizon = (): [number, number, number] => [0.85, 0.72, 0.55];
  const faceWater = (_x: number, y: number): [number, number, number] => {
    const t = y;
    return [0.12 + t * 0.1, 0.35 + t * 0.1, 0.40 + t * 0.05];
  };

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

  faces.push(makeFace(faceHorizon));                  // +X
  faces.push(makeFace(faceHorizon));                  // -X
  faces.push(makeFace(faceSky));                      // +Y (up)
  faces.push(makeFace((_px, py) => faceWater(_px, py))); // -Y (down)
  faces.push(makeFace((_px, _py) => faceSky(_px, 0.6))); // +Z
  faces.push(makeFace(faceHorizon));                  // -Z

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
      const band = Math.sin(edgeDist * 1.9 + fbm(x * 0.2, z * 0.2, 2, 101) * 2.5) * 0.04;
      const wetness = edgeDist < 1.8 ? (1 - edgeDist / 1.8) * 0.09 : 0;
      r = 0.93 + band - wetness;
      g = 0.86 + band * 0.6 - wetness * 0.6;
      b = 0.72 + band * 0.3 - wetness * 0.4;
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
      r = 0.55; g = 0.45; b = 0.32;
    }

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
      const offset = 1.5 + localRng() * 3;
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

  // ---- 4b. Natural rock formations (seeded displaced-icosahedron clusters) ----
  // Sites are hand-picked on the beach/cliff edge, clear of spawns (±18–26
  // diagonal corners) and patrol routes by ≥4 m, incl. beside the flooded cave
  // entrance (26, 16). Presentation only — never colliders.
  const formationMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });
  const formationSites: RockFormationSite[] = [
    { x: 23.0, z: 12.5, seed: 0x9101, scale: 1.15 },  // beside the flooded cave entrance
    { x: 29.5, z: 11.5, seed: 0x9102, scale: 0.95 },  // lagoon perimeter, SE of cave
    { x: -28.5, z: -14.5, seed: 0x9103, scale: 1.05 }, // NW beach/cliff edge
    { x: -22.0, z: 27.0, seed: 0x9104, scale: 1.0 },   // W beach
    { x: 27.0, z: -11.0, seed: 0x9105, scale: 1.1 },   // E beach
  ];
  for (let i = 0; i < formationSites.length; i++) {
    const formation = buildRockFormation(formationSites[i], formationMat);
    formation.name = `farcrysis-terrain-rock-formation-${i}`;
    group.add(formation);
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
  sandRing.position.y = 0.025;
  sandRing.receiveShadow = true;
  sandRing.userData.farcrysisArt = true;
  group.add(sandRing);

  // ---- 5b. Jungle path ribbons (visual flow dressing, beach → research tower) ----
  // Three winding sand/dirt strips marking the intended flow routes from the
  // beach ring to the research-station core (-8.5, -8.5). Visual only — no
  // colliders, no navigation changes.
  const pathRibbons: Array<{
    waypoints: Array<[number, number]>;
    width: number;
    seed: number;
    color: number;
  }> = [
    {
      waypoints: [
        [-4, -31.5], [-9, -27.5], [-15, -23], [-18.5, -19.5],
        [-16.5, -15], [-12.5, -11.5], [-8.5, -9], [-7.5, -8.5],
      ],
      width: 2.0, seed: 0x81a0, color: 0xcbb07a, // sand trail, NW beach → tower
    },
    {
      waypoints: [
        [31.5, -14], [27, -15.5], [22.5, -15], [18, -12],
        [13.5, -9], [9, -6.5], [4, -6], [-1.5, -7], [-6, -8],
      ],
      width: 1.8, seed: 0x81a1, color: 0xa98a60, // dirt trail, E beach → tower
    },
    {
      waypoints: [
        [-31.5, 8], [-27.5, 10.5], [-22.5, 11], [-17.5, 9],
        [-13, 6], [-9.5, 2.5], [-8.5, -2], [-8, -6.5],
      ],
      width: 1.9, seed: 0x81a2, color: 0xbfa26e, // packed-earth trail, W beach → tower
    },
  ];
  for (let i = 0; i < pathRibbons.length; i++) {
    const ribbon = makePathRibbon(
      pathRibbons[i].waypoints,
      pathRibbons[i].width,
      pathRibbons[i].seed,
      new THREE.Color(pathRibbons[i].color),
    );
    ribbon.name = `farcrysis-terrain-path-ribbon-${i}`;
    group.add(ribbon);
  }

  scene.add(group);
  return group;
}

// ---------------------------------------------------------------------------
// buildLighting — golden-hour sun, ambient, hemisphere, FogExp2,
//                volumetric shafts, fill light, atmospheric particles, sky dome
// ---------------------------------------------------------------------------

export function buildLighting(scene: THREE.Scene): {
  sun: THREE.DirectionalLight;
  godRays: THREE.Group;
  atmosphere: THREE.Group;
  updateGodRays: () => void;
  updateAtmosphere: (timeSeconds: number) => void;
} {
  // ---- 1. Golden-hour DirectionalLight (sun) — PCFSoftShadowMap-ready config ----
  const SUN_COLOR = 0xffc880;
  const SUN_INTENSITY = 2.45; // tuned to avoid washout; fill + hemi carry the rest
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
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 7; // soft penumbra — effective when host renderer uses PCFSoftShadowMap
  scene.add(sun);

  // ---- 1a. Sun disc (visible sphere + halo at the directional-light position) ----
  const sunDiscGroup = new THREE.Group();
  sunDiscGroup.name = 'farcrysis-sun-disc';

  const sunDiscGeom = new THREE.SphereGeometry(0.7, 16, 12);
  const sunDiscMat = new THREE.MeshBasicMaterial({ color: 0xfffbe0, fog: false });
  const sunDisc = new THREE.Mesh(sunDiscGeom, sunDiscMat);
  sunDisc.name = 'farcrysis-sun-disc-core';
  sunDiscGroup.add(sunDisc);

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
    FARCRYSIS_ART_FEEL.ambientColor,
    FARCRYSIS_ART_FEEL.ambientIntensity,
  );
  ambient.name = 'farcrysis-ambient';
  scene.add(ambient);

  // ---- 3. Hemisphere light (sky + ground bounce) ----
  const hemiSky = new THREE.Color(0xffe8cc);
  const hemiGround = new THREE.Color(0x4a6b3a);
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, 0.50);
  hemi.name = 'farcrysis-hemisphere';
  scene.add(hemi);

  // ---- 3a. Cool-blue secondary fill light — shadow-side illumination ----
  const FILL_COLOR = 0x7d9cc9;
  const FILL_INTENSITY = 0.28;
  const fillPosition = new THREE.Vector3(6, 10, -20); // roughly opposite the sun
  const fillLight = new THREE.DirectionalLight(FILL_COLOR, FILL_INTENSITY);
  fillLight.name = 'farcrysis-fill';
  fillLight.position.copy(fillPosition);
  fillLight.castShadow = false; // secondary; no extra shadow pass
  scene.add(fillLight);

  // ---- 4. Volumetric fog (FogExp2) — warm golden-hour haze ----
  // Walk parent chain to find the real THREE.Scene so the renderer picks up fog.
  const fogColor = new THREE.Color(0xffd4b3);
  const fogDensity = 0.0028;
  let fogOwner: THREE.Object3D = scene as unknown as THREE.Object3D;
  while (fogOwner && !(fogOwner instanceof THREE.Scene)) fogOwner = fogOwner.parent as THREE.Object3D;
  const fogTarget = (fogOwner instanceof THREE.Scene ? fogOwner : scene) as THREE.Scene;
  fogTarget.fog = new THREE.FogExp2(fogColor, fogDensity);

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

  // ---- 5a. Volumetric clouds + ground haze (golden-hour sky layer) ----
  // Cloud group self-drives its uTime via onBeforeRender; ground fog is static noise.
  const cloudGroup = buildCloudGroup(sunPosition);
  scene.add(cloudGroup);
  const groundFog = buildGroundFogLayer();
  scene.add(groundFog);

  // ---- 6. Lightweight god-ray cones (subtle atmospheric layer — kept for near-ground rays) ----
  const godRayGroup = new THREE.Group();
  godRayGroup.name = 'farcrysis-god-rays';

  const sunDir = sunPosition.clone().normalize();
  const rays: THREE.Mesh[] = [];

  // --- Main ray layer (scattered origins across the arena) — reduced opacity to let volumetric shafts dominate ---
  {
    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
      const originAngle = (i / rayCount) * Math.PI * 2;
      const originDist = 7 + (i % 4) * 5;
      const ox = Math.cos(originAngle) * originDist;
      const oz = Math.sin(originAngle) * originDist;
      const oy = 2 + (i % 3) * 4;

      const coneLength = 26 + (i % 3) * 12;
      const coneAngle = 0.032 + (i % 4) * 0.015;
      const coneOpacity = 0.03 + (i % 3) * 0.015;

      const ray = makeGodRayCone(
        new THREE.Vector3(ox, oy, oz),
        sunDir, coneLength, coneAngle, 0xfff5e0, coneOpacity,
      );
      ray.name = `farcrysis-god-ray-${i}`;
      godRayGroup.add(ray);
      rays.push(ray);
    }
  }

  // --- Halo layer (wider, fainter) ---
  {
    const haloCount = 6;
    for (let i = 0; i < haloCount; i++) {
      const originAngle = (i / haloCount) * Math.PI * 2 + 0.3;
      const originDist = 10 + (i % 2) * 7;
      const ox = Math.cos(originAngle) * originDist;
      const oz = Math.sin(originAngle) * originDist;
      const oy = 3 + (i % 2) * 6;

      const coneLength = 32 + (i % 2) * 16;
      const coneAngle = 0.06 + (i % 2) * 0.03;
      const coneOpacity = 0.018 + (i % 2) * 0.01;

      const halo = makeGodRayCone(
        new THREE.Vector3(ox, oy, oz),
        sunDir, coneLength, coneAngle, 0xfff8ed, coneOpacity,
      );
      halo.name = `farcrysis-god-ray-halo-${i}`;
      godRayGroup.add(halo);
      rays.push(halo);
    }
  }

  // --- Tower light shafts (near research tower) ---
  {
    const towerOrigins: Array<[number, number, number]> = [
      [-8, 4.5, -8], [-7.5, 3.8, -7], [-8.5, 5.2, -8.5], [-7, 4.0, -9],
    ];
    for (let i = 0; i < towerOrigins.length; i++) {
      const [ox, oy, oz] = towerOrigins[i];
      const shaftDir = new THREE.Vector3(ox, oy + 2, oz)
        .normalize().lerp(sunDir, 0.7).normalize();
      const coneLength = 20 + i * 4;
      const coneAngle = 0.025 + i * 0.008;
      const coneOpacity = 0.03 + i * 0.012;

      const shaft = makeGodRayCone(
        new THREE.Vector3(ox, oy, oz),
        shaftDir, coneLength, coneAngle, 0xfffbe5, coneOpacity,
      );
      shaft.name = `farcrysis-god-ray-tower-${i}`;
      godRayGroup.add(shaft);
      rays.push(shaft);
    }
  }

  // Base opacities for pulse animation
  const baseRayOpacities = rays.map((ray) => {
    const mat = ray.material as THREE.MeshBasicMaterial;
    return mat.opacity;
  });

  const pulsePhases: number[] = [];
  const pulseSpeeds: number[] = [];
  for (let i = 0; i < rays.length; i++) {
    pulsePhases.push((i * 0.7) % (Math.PI * 2));
    pulseSpeeds.push(0.6 + (i % 5) * 0.15);
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

  // ---- 7. Volumetric light shafts (noise-dithered cylinders along sun direction) ----
  const shaftGroup = new THREE.Group();
  shaftGroup.name = 'farcrysis-volumetric-shafts';

  // Wide atmospheric shaft
  const shaftCenter1 = sunPosition.clone().addScaledVector(sunDir, -27);
  const wideShaft = makeVolumetricShaft(
    19, 58, sunDir, shaftCenter1,
    new THREE.Color(0xfff5e0), 0.48, 0.55, 0.018,
  );
  wideShaft.name = 'farcrysis-vol-shaft-wide';
  shaftGroup.add(wideShaft);

  // Narrow bright core shaft
  const shaftCenter2 = sunPosition.clone().addScaledVector(sunDir, -25);
  const coreShaft = makeVolumetricShaft(
    11, 54, sunDir, shaftCenter2,
    new THREE.Color(0xfffbe6), 0.60, 0.65, 0.032,
  );
  coreShaft.name = 'farcrysis-vol-shaft-core';
  shaftGroup.add(coreShaft);

  // Faint secondary shaft at slight offset for broken-cloud look
  const shaftDir2 = sunDir.clone().add(
    new THREE.Vector3(0.08, -0.03, -0.04),
  ).normalize();
  const shaftCenter3 = sunPosition.clone().addScaledVector(shaftDir2, -29);
  const offsetShaft = makeVolumetricShaft(
    14, 60, shaftDir2, shaftCenter3,
    new THREE.Color(0xffeed5), 0.28, 0.35, 0.022,
  );
  offsetShaft.name = 'farcrysis-vol-shaft-offset';
  shaftGroup.add(offsetShaft);

  scene.add(shaftGroup);

  // Time update for volumetric shafts and cones
  const updateShafts = (): void => {
    const t = performance.now() * 0.001;
    for (const child of shaftGroup.children) {
      const m = (child as THREE.Mesh).material as THREE.ShaderMaterial;
      if (m.uniforms && m.uniforms.uTime) m.uniforms.uTime.value = t;
    }
  };

  // ---- 8. Atmospheric particle systems ----
  const atmosphereGroup = new THREE.Group();
  atmosphereGroup.name = 'farcrysis-atmosphere';

  // --- 8a. Pollen motes — floating warm motes across the arena ---
  {
    const PC = 140;
    const pos = new Float32Array(PC * 3);
    const ph = new Float32Array(PC);
    const sp = new Float32Array(PC);
    const amp = new Float32Array(PC);
    const sz = new Float32Array(PC);
    const twk = new Float32Array(PC);
    for (let i = 0; i < PC; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 52;
      pos[i * 3 + 1] = 0.5 + Math.random() * 5.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 52;
      ph[i] = Math.random() * Math.PI * 2;
      sp[i] = 0.3 + Math.random() * 1.5;
      amp[i] = 0.4 + Math.random() * 2.2;
      sz[i] = 0.6 + Math.random() * 1.8;
      twk[i] = 0.3 + Math.random() * 1.2;
    }
    const cfg: ParticleConfig = {
      name: 'farcrysis-atmosphere-pollen',
      count: PC,
      positions: pos,
      phases: ph,
      speeds: sp,
      amps: amp,
      sizes: sz,
      twinkles: twk,
      color: [1.0, 0.92, 0.68],
      opacity: 0.38,
      sizeScale: 1.0,
      blinkSharp: 1.4,
      driftVert: 0.45,
    };
    const pollen = makeParticleSystem(cfg);
    pollen.renderOrder = 1001;
    atmosphereGroup.add(pollen);
  }

  // --- 8b. Fireflies along lagoon edges — emissive blinking, larger ---
  {
    const FC = 55;
    const pos = new Float32Array(FC * 3);
    const ph = new Float32Array(FC);
    const sp = new Float32Array(FC);
    const amp = new Float32Array(FC);
    const sz = new Float32Array(FC);
    const twk = new Float32Array(FC);
    for (let i = 0; i < FC; i++) {
      const angle = (i / FC) * Math.PI * 2 + Math.random() * 0.6;
      const radius = 30 + Math.random() * 7;
      pos[i * 3 + 0] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = 0.2 + Math.random() * 1.3;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
      ph[i] = Math.random() * Math.PI * 2;
      sp[i] = 2.5 + Math.random() * 6.0;
      amp[i] = 0.15 + Math.random() * 0.5;
      sz[i] = 2.5 + Math.random() * 4.5;
      twk[i] = 1.8 + Math.random() * 4.5;
    }
    const cfg: ParticleConfig = {
      name: 'farcrysis-atmosphere-fireflies',
      count: FC,
      positions: pos,
      phases: ph,
      speeds: sp,
      amps: amp,
      sizes: sz,
      twinkles: twk,
      color: [0.84, 0.98, 0.42],
      opacity: 0.7,
      sizeScale: 1.0,
      blinkSharp: 7.0, // sharp on/off flash
      driftVert: 0.12,
    };
    const fireflies = makeParticleSystem(cfg);
    fireflies.renderOrder = 1002;
    atmosphereGroup.add(fireflies);
  }

  // --- 8c. Dust motes in sunbeams — concentrated along sun axis ---
  {
    const DC = 90;
    const pos = new Float32Array(DC * 3);
    const ph = new Float32Array(DC);
    const sp = new Float32Array(DC);
    const amp = new Float32Array(DC);
    const sz = new Float32Array(DC);
    const twk = new Float32Array(DC);
    // Sample points in a cylinder along the sun direction within the arena bounds
    const sunAxis = sunDir.clone();
    const sunPerp1 = new THREE.Vector3(-sunAxis.z, 0, sunAxis.x).normalize();
    if (sunPerp1.lengthSq() < 0.1) sunPerp1.set(0, 0, 1);
    const sunPerp2 = new THREE.Vector3().crossVectors(sunAxis, sunPerp1).normalize();
    const shaftRadius = 16;
    const shaftHalfLen = 30;
    const midpoint = new THREE.Vector3(0, 6, 0);
    for (let i = 0; i < DC; i++) {
      const r = Math.random() * shaftRadius;
      const angle = Math.random() * Math.PI * 2;
      const along = (Math.random() - 0.5) * shaftHalfLen * 2;
      const px = midpoint.x + sunPerp1.x * Math.cos(angle) * r + sunPerp2.x * Math.sin(angle) * r + sunAxis.x * along;
      const py = midpoint.y + sunPerp1.y * Math.cos(angle) * r + sunPerp2.y * Math.sin(angle) * r + sunAxis.y * along;
      const pz = midpoint.z + sunPerp1.z * Math.cos(angle) * r + sunPerp2.z * Math.sin(angle) * r + sunAxis.z * along;
      pos[i * 3 + 0] = px;
      pos[i * 3 + 1] = Math.max(0.2, Math.min(18, py));
      pos[i * 3 + 2] = pz;
      ph[i] = Math.random() * Math.PI * 2;
      sp[i] = 0.4 + Math.random() * 1.8;
      amp[i] = 0.2 + Math.random() * 1.1;
      sz[i] = 0.4 + Math.random() * 1.4;
      twk[i] = 0.5 + Math.random() * 2.5;
    }
    const cfg: ParticleConfig = {
      name: 'farcrysis-atmosphere-dust',
      count: DC,
      positions: pos,
      phases: ph,
      speeds: sp,
      amps: amp,
      sizes: sz,
      twinkles: twk,
      color: [1.0, 0.90, 0.65],
      opacity: 0.30,
      sizeScale: 1.0,
      blinkSharp: 1.2,
      driftVert: 0.35,
    };
    const dust = makeParticleSystem(cfg);
    dust.renderOrder = 1003;
    atmosphereGroup.add(dust);
  }

  scene.add(atmosphereGroup);

  // Time update for atmosphere particles
  const updateAtmosphere = (timeSeconds: number): void => {
    atmosphereGroup.traverse((child) => {
      if (child instanceof THREE.Points) {
        const m = (child as THREE.Points).material as THREE.ShaderMaterial;
        if (m.uniforms && m.uniforms.uTime) {
          m.uniforms.uTime.value = timeSeconds;
        }
      }
    });
  };

  // Also drive atmosphere by onBeforeRender for self-driving
  atmosphereGroup.onBeforeRender = () => {
    updateAtmosphere(performance.now() * 0.001);
    updateShafts();
  };

  // Update god-ray orientations to follow the light direction
  const updateGodRays = (): void => {
    const dir = sun.position.clone().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    for (const ray of rays) {
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      ray.setRotationFromQuaternion(quat);
    }
    // Also re-aim volumetric shafts
    for (const child of shaftGroup.children) {
      const quat2 = new THREE.Quaternion().setFromUnitVectors(up, dir);
      child.setRotationFromQuaternion(quat2);
    }
    updateShafts();
  };

  return { sun, godRays: godRayGroup, atmosphere: atmosphereGroup, updateGodRays, updateAtmosphere };
}

// ---------------------------------------------------------------------------
// Shared water animation driver
// ---------------------------------------------------------------------------

type WaterAnimator = (timeSeconds: number) => void;
const _waterAnimators: WaterAnimator[] = [];

/**
 * Drive every animated water/foam uniform from one call. Safe to invoke every
 * frame (idempotent — systems also self-drive via onBeforeRender when the host
 * render loop does not call this). No-op when buildWater has not run.
 */
export function animateWater(timeSeconds: number): void {
  for (let i = 0; i < _waterAnimators.length; i++) {
    _waterAnimators[i](timeSeconds);
  }
}

// ---------------------------------------------------------------------------
// buildWater — custom-shader animated tropical water
//   Features: wave-displaced vertices, computed normals, specular glints,
//   fresnel reflection + env map + sun-tinted sky gradient, transparency near
//   shore, procedural foam, animated shoreline foam band, shoreline sparkle
// ---------------------------------------------------------------------------

export function buildWater(scene: THREE.Scene): {
  mesh: THREE.Mesh;
  causticPlane: THREE.Mesh;
  update: (timeSeconds: number) => void;
} {
  const waterSize = 76;
  const waterSegments = 72;
  const waterGeom = new THREE.PlaneGeometry(waterSize, waterSize, waterSegments, waterSegments);
  waterGeom.rotateX(-Math.PI / 2);

  // Precomputed shore factor per vertex (attribute to avoid per-fragment shore calc)
  const positions = waterGeom.attributes.position as THREE.BufferAttribute;
  const shoreFactors = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const m = Math.max(Math.abs(x), Math.abs(z));
    // 0 = deep ocean (m→0), 1 = shore (m→32+)
    shoreFactors[i] = Math.max(0, Math.min(1, (m - 15) / 22));
  }
  waterGeom.setAttribute('aShore', new THREE.BufferAttribute(shoreFactors, 1));

  // Env map (optional)
  const envCube = makeEnvCubeTexture();
  const envTexPresent = envCube ? 1.0 : 0.0;

  const waterUniforms = {
    uTime: { value: 0 },
    uDeepColor: { value: new THREE.Color(0x0d4a5c) },
    uShallowColor: { value: new THREE.Color(0x19a3a8) },
    uSkyColor: { value: new THREE.Color(0xffe0b0) },
    uSunColor: { value: new THREE.Color(0xffd9a0) },
    uSunDir: { value: sunDirFromLightPosition().clone() },
    uCameraPos: { value: new THREE.Vector3(0, 5, 25) },
    uFresnelPow: { value: 3.2 },
    uFoamColor: { value: new THREE.Color(1.0, 1.0, 0.98) },
    uSkyGradTop: { value: new THREE.Color(0xffb469) }, // sun-tinted warm zenith
    uSkyGradBot: { value: new THREE.Color(0x0b4a5a) }, // deep teal horizon/water
    uEnvMap: { value: envCube },
    uEnvTexPresent: { value: envTexPresent },
  };

  // Wave height function also used by caustic plane + normal computation
  // Replicated in GLSL; kept in sync with the JS terrainHeight for the water shader only.
  const waterVertShader = /* glsl */ `
    attribute float aShore;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    varying float vShore;

    uniform float uTime;

    float waveHeight(vec2 xz, float t) {
      float dist = length(xz);
      float w1 = sin(xz.x * 0.35 + t * 0.55) * cos(xz.y * 0.30 + t * 0.45) * 0.11;
      float w2 = sin(xz.x * 0.65 - t * 0.45) * 0.06;
      float w3 = cos(xz.y * 0.55 + t * 0.55) * 0.07;
      float ri = sin(dist * 0.80 - t * 1.0) * 0.05;
      return w1 + w2 + w3 + ri;
    }

    void main() {
      vec3 pos = (modelMatrix * vec4(position, 1.0)).xyz;
      float h = waveHeight(pos.xz, uTime);
      float eps = 0.45;
      float hx = waveHeight(pos.xz + vec2(eps, 0.0), uTime);
      float hz = waveHeight(pos.xz + vec2(0.0, eps), uTime);
      vec3 n = normalize(vec3(-(hx - h) / eps, 1.0, -(hz - h) / eps));
      vNormalW = normalize(mat3(modelMatrix) * n);
      vWorldPos = pos + vec3(0.0, h, 0.0);
      vShore = aShore;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
    }
  `;

  const waterFragShader = /* glsl */ `
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    varying float vShore;

    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform vec3 uSkyColor;
    uniform vec3 uSunColor;
    uniform vec3 uSunDir;
    uniform vec3 uCameraPos;
    uniform float uFresnelPow;
    uniform vec3 uFoamColor;
    uniform vec3 uSkyGradTop;
    uniform vec3 uSkyGradBot;
    uniform float uTime;
    uniform float uEnvTexPresent;
    uniform samplerCube uEnvMap;

    ${GLSL_NOISE}

    void main() {
      vec3 N = normalize(vNormalW);
      vec3 viewDir = normalize(uCameraPos - vWorldPos);
      float NdotV = max(dot(N, viewDir), 0.0);

      // Fresnel
      float fresnel = pow(1.0 - NdotV, uFresnelPow);

      // Specular highlights from sun
      vec3 H = normalize(viewDir + uSunDir);
      float spec = pow(max(dot(N, H), 0.0), 90.0) * 2.5;
      float specWide = pow(max(dot(N, H), 0.0), 14.0) * 0.35;

      // Reflection
      vec3 R = reflect(-viewDir, N);
      vec3 envCol = uEnvTexPresent > 0.5 ? textureCube(uEnvMap, R).rgb : uSkyColor;

      // Base colour: deep lagoon → bright aqua near shore
      float shoreMix = clamp(vShore * 0.85 + fresnel * 0.15, 0.0, 1.0);
      vec3 base = mix(uDeepColor, uShallowColor, shoreMix);

      // Procedural shoreline foam
      float foamNoise = fbm3(vWorldPos * 1.2 + vec3(0.0, uTime * 0.25, 0.0));
      float waveCrest = abs(sin(vWorldPos.x * 0.55 + vWorldPos.z * 0.45 - uTime * 0.9));
      float shoreBand = smoothstep(0.28, 0.55, vShore) * (1.0 - smoothstep(0.58, 0.75, vShore));
      float foam = shoreBand * waveCrest * (0.55 + 0.45 * foamNoise) * 1.1;

      // Fresnel darkens edges + reflects sky
      vec3 color = base;
      color += envCol * fresnel * 0.55;
      // Sun-tinted sky gradient reflection (warm zenith → deep teal horizon),
      // mixed by fresnel — one cheap mix, no render targets
      float skyMix = clamp(R.y * 0.55 + 0.5, 0.0, 1.0);
      color += mix(uSkyGradBot, uSkyGradTop, pow(skyMix, 1.6)) * fresnel * 0.5;
      // Shoreline caustic sparkle — sunlit glints where waves break near the beach
      float caust = pow(fbm3(vWorldPos * 2.6 + vec3(uTime * 0.45, 0.0, uTime * 0.3)), 7.0);
      float shoreGlint = vShore * caust * (0.55 + 0.45 * sin(uTime * 2.0 + vWorldPos.x * 2.4));
      color += uSunColor * shoreGlint * 0.8;
      color += uSunColor * (spec + specWide);
      color += uFoamColor * foam * 0.7;

      // Alpha: transparent near shore (sand visible), opaque in deeper water
      float alpha = mix(0.55, 0.84, smoothstep(0.05, 0.45, vShore));

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: waterVertShader,
    fragmentShader: waterFragShader,
    transparent: true,
    depthWrite: true,
    blending: THREE.NormalBlending,
    fog: false,
  });

  const water = new THREE.Mesh(waterGeom, waterMat);
  water.name = 'farcrysis-terrain-water';
  water.position.y = -0.3;
  water.receiveShadow = true;
  water.userData.farcrysisArt = true;
  water.renderOrder = 1;
  scene.add(water);

  // ---- Sparkle points (additive blending dots on water surface) ----
  const sparkleCount = 100;
  const sparklePositions = new Float32Array(sparkleCount * 3);
  // Concentrate sparkles in the visible ring (just beyond terrain edge)
  for (let i = 0; i < sparkleCount; i++) {
    const angle = (i / sparkleCount) * Math.PI * 2 + Math.random() * 0.5;
    const radius = 33 + Math.random() * 5;
    sparklePositions[i * 3 + 0] = Math.cos(angle) * radius;
    sparklePositions[i * 3 + 1] = -0.28;
    sparklePositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const sparkleGeom = new THREE.BufferGeometry();
  sparkleGeom.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  const sparkleMat = new THREE.PointsMaterial({
    color: FARCRYSIS_ART_FEEL.waterSparkleColor,
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

  // ---- Shoreline foam ring mesh (animated alpha) ----
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
    opacity: 0.45,
    depthWrite: true,
    fog: false,
  });
  const foamRing = new THREE.Mesh(foamGeom, foamMat);
  foamRing.name = 'farcrysis-terrain-foam-ring';
  foamRing.position.y = -0.22;
  foamRing.receiveShadow = true;
  foamRing.renderOrder = 2;
  foamRing.userData.farcrysisArt = true;
  water.add(foamRing);

  // ---- Foam particle ring (additive Points along shoreline) ----
  {
    const FPC = 160;
    const fpos = new Float32Array(FPC * 3);
    for (let i = 0; i < FPC; i++) {
      const angle = (i / FPC) * Math.PI * 2 + Math.random() * 0.3;
      // Distribute along a ~1.5m-wide band at the shore lip
      const dist = ARENA_HALF + (Math.random() - 0.5) * 2.0;
      fpos[i * 3 + 0] = Math.cos(angle) * dist;
      fpos[i * 3 + 1] = -0.21;
      fpos[i * 3 + 2] = Math.sin(angle) * dist;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    const fm = new THREE.PointsMaterial({
      color: 0xfaf5ee,
      size: 0.22,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const fps = new THREE.Points(fg, fm);
    fps.name = 'farcrysis-terrain-foam-particles';
    fps.renderOrder = 3;
    fps.frustumCulled = false;
    fps.userData.farcrysisArt = true;
    water.add(fps);
  }

  // ---- Caustic floor projector (RingGeometry at lagoon floor, additive shader) ----
  const causticGeom = new THREE.RingGeometry(31.5, 38.5, 80);
  causticGeom.rotateX(-Math.PI / 2);

  const causticUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x80e8d0) },
    uOpacity: { value: 0.30 },
  };

  const causticMat = new THREE.ShaderMaterial({
    uniforms: causticUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec2 vUv;
      void main() {
        vLocal = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vUv = wp.xz * 0.065;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main() {
        // Animated caustic pattern (two-layer fbm with time distortion)
        vec2 uv1 = vUv * 3.5 + vec2(uTime * 0.18, uTime * 0.22);
        vec2 uv2 = vUv * 5.2 - vec2(uTime * 0.14, uTime * 0.26);
        float caust1 = fbm3(vec3(uv1, 0.0));
        float caust2 = fbm3(vec3(uv2, 0.5));
        float caust = caust1 * 0.7 + caust2 * 0.3;
        // Sharpen peaks
        caust = smoothstep(0.35, 0.72, caust);
        // Fade toward the center so caustics are only visible in the outer ring
        float ring = 1.0 - smoothstep(0.15, 0.55, abs(vUv.x) + abs(vUv.y) * 0.25);
        float a = caust * uOpacity * ring;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor, a * 0.9);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });

  const causticPlane = new THREE.Mesh(causticGeom, causticMat);
  causticPlane.name = 'farcrysis-terrain-caustics';
  causticPlane.position.y = 0.03;
  causticPlane.renderOrder = 4;
  causticPlane.userData.farcrysisArt = true;
  water.add(causticPlane);

  // ---- Animated shoreline foam band (ShaderMaterial ring, time-driven wash) ----
  // A thin ring straddling the square shoreline (33.2 → 29.0): over water on the
  // outside, lapping up onto the sand lip inside. Vertex heights hug the
  // shoreline contour so the band reads as waves breaking on the beach.
  const foamBandOuter = ARENA_HALF + 1.2;
  const foamBandInner = ARENA_HALF - 3.0;
  const foamBandShape = new THREE.Shape();
  foamBandShape.moveTo(-foamBandOuter, -foamBandOuter);
  foamBandShape.lineTo(foamBandOuter, -foamBandOuter);
  foamBandShape.lineTo(foamBandOuter, foamBandOuter);
  foamBandShape.lineTo(-foamBandOuter, foamBandOuter);
  foamBandShape.closePath();
  const foamBandHole = new THREE.Path();
  foamBandHole.moveTo(-foamBandInner, -foamBandInner);
  foamBandHole.lineTo(foamBandInner, -foamBandInner);
  foamBandHole.lineTo(foamBandInner, foamBandInner);
  foamBandHole.lineTo(-foamBandInner, foamBandInner);
  foamBandHole.closePath();
  foamBandShape.holes.push(foamBandHole);

  const foamBandGeom = new THREE.ShapeGeometry(foamBandShape);
  foamBandGeom.rotateX(-Math.PI / 2);
  {
    // Hug the shoreline contour: sand-side just above the beach, water-side at
    // wave level. Geometry is parented to `water` (y = -0.3), so add +0.3.
    const fbPos = foamBandGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fbPos.count; i++) {
      const x = fbPos.getX(i);
      const z = fbPos.getZ(i);
      const edgeDist = ARENA_HALF - Math.max(Math.abs(x), Math.abs(z));
      const sandY = terrainHeight(x, z) + 0.05;
      const waterY = -0.16;
      const blend = smoothstep(-0.8, 0.8, edgeDist);
      fbPos.setY(i, waterY + (sandY - waterY) * blend + 0.3);
    }
  }

  const foamBandUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xfaf6ee) },
    uOpacity: { value: 0.55 },
  };

  const foamBandMat = new THREE.ShaderMaterial({
    uniforms: foamBandUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vWorldPos;
      ${GLSL_NOISE}
      void main() {
        // Distance from the square shoreline (negative = over water, positive = onto sand)
        float edgeDist = 32.0 - max(abs(vWorldPos.x), abs(vWorldPos.z));
        float band = smoothstep(-1.6, 0.1, edgeDist) * (1.0 - smoothstep(0.3, 3.4, edgeDist));
        // Slow drifting foam noise + advancing/retreating wash line
        float n = fbm3(vWorldPos * 0.9 + vec3(0.0, uTime * 0.22, uTime * 0.13));
        float wash = 0.5 + 0.5 * sin(edgeDist * 2.6 - uTime * 1.15 + n * 5.0);
        float foamDetail = fbm3(vWorldPos * 2.4 + vec3(uTime * 0.4, 0.0, uTime * 0.3));
        float alpha = uOpacity * band * (0.30 + 0.70 * wash) * (0.55 + 0.45 * foamDetail);
        // Sunlit sparkle concentrated along the wash front
        float sp = pow(fbm3(vWorldPos * 3.2 + vec3(0.0, uTime * 0.55, 0.0)), 9.0);
        alpha += sp * band * 0.35 * (0.5 + 0.5 * wash);
        alpha = clamp(alpha, 0.0, 0.85);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    fog: false,
  });

  const foamBand = new THREE.Mesh(foamBandGeom, foamBandMat);
  foamBand.name = 'farcrysis-terrain-foam-band';
  foamBand.renderOrder = 2;
  foamBand.userData.farcrysisArt = true;
  water.add(foamBand);

  // ---- Animation updater (alloc-free) ----
  const update = (timeSeconds: number): void => {
    const t = timeSeconds;
    waterMat.uniforms.uTime.value = t;

    // Animate sparkle opacity
    sparkleMat.opacity = 0.35 + Math.sin(t * 1.2) * 0.12;

    // Animate foam ring opacity — gentle pulse like advancing/retreating wash
    foamMat.opacity = 0.38 + Math.sin(t * 0.7) * 0.14;

    // Animate caustics
    causticMat.uniforms.uTime.value = t;

    // Animate shoreline foam band wash
    foamBandMat.uniforms.uTime.value = t;

    // Animate foam particles
    for (const child of water.children) {
      if (child instanceof THREE.Points && child.name.includes('foam-particles')) {
        const fm2 = child.material as THREE.PointsMaterial;
        fm2.opacity = 0.28 + Math.sin(t * 0.85) * 0.10;
      }
    }
  };

  // Self-driving wave animation — fires every visible frame
  water.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    update(t);
  };

  // Register with the shared animateWater() driver (idempotent with update())
  _waterAnimators.push((t) => { waterMat.uniforms.uTime.value = t; });
  _waterAnimators.push((t) => { causticMat.uniforms.uTime.value = t; });
  _waterAnimators.push((t) => { foamBandMat.uniforms.uTime.value = t; });

  return { mesh: water, causticPlane, update };
}

// ---- Helper: extract sun direction from the light position used in buildLighting ----
function sunDirFromLightPosition(): THREE.Vector3 {
  return new THREE.Vector3(-18, 20, 25).normalize();
}
