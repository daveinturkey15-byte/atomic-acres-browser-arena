/**
 * farcrysis-textures.ts — Procedural PBR Canvas-based texture generation
 * for the Farcrysis jungle arena (Pass 69).
 *
 * Generates 6 texture families at runtime via HTML Canvas:
 *   1. Beach sand  (color + roughness)
 *   2. Jungle rock (color + roughness)
 *   3. Palm bark   (color + roughness + bump)
 *   4. Frond alpha (alpha map + green-gold tint)
 *   5. Water       (normal map + tropical colour)
 *   6. Wood crate  (colour + roughness)
 *
 * Exports:
 *   applyFarcrysisTextures(root: THREE.Group): void
 *   FARCRYSIS_TEXTURE_STATS(): { textureCount: number }
 *
 * Presentation only — never adds colliders, spawns, or gameplay authority.
 * Canvas textures are generated once and cached. Headless / test-safe:
 * canvas creation is gated; when unavailable stats report 0 and apply is a no-op.
 */
import * as THREE from 'three';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';

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

/** Create a 2D canvas; returns null in test/headless environments. */
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

/** Wrap a filled canvas into a repeat-wrapped Three.js texture. */
function wrapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
  wrap = THREE.RepeatWrapping,
): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

let _generated = false;
let _textureCount = 0;

export function FARCRYSIS_TEXTURE_STATS(): { textureCount: number } {
  return { textureCount: _textureCount };
}

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Noise generators (value noise + fractal)
// ---------------------------------------------------------------------------

/** Simple gradient-noise-like value at integer lattice. */
function valueNoise(x: number, y: number, seed: number): number {
  const s = x * 374761393 + y * 668265263 + seed * 15485863;
  const n = Math.sin(s) * 10000;
  return n - Math.floor(n);
}

/** Smooth interpolation between lattice points. */
function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx); // smoothstep
  const sy = fy * fy * (3 - 2 * fy);

  const v00 = valueNoise(ix, iy, seed);
  const v10 = valueNoise(ix + 1, iy, seed);
  const v01 = valueNoise(ix, iy + 1, seed);
  const v11 = valueNoise(ix + 1, iy + 1, seed);

  const a = v00 + sx * (v10 - v00);
  const b = v01 + sx * (v11 - v01);
  return a + sy * (b - a);
}

/** Fractal / octave noise. */
function fbmNoise(x: number, y: number, octaves: number, seed: number): number {
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
// Texture caches
// ---------------------------------------------------------------------------

const T = 512; // base texture resolution

let _sandColor: THREE.Texture | null = null;
let _sandRoughness: THREE.Texture | null = null;
let _rockColor: THREE.Texture | null = null;
let _rockRoughness: THREE.Texture | null = null;
let _barkColor: THREE.Texture | null = null;
let _barkRoughness: THREE.Texture | null = null;
let _barkBump: THREE.Texture | null = null;
let _frondAlpha: THREE.Texture | null = null;
let _waterColor: THREE.Texture | null = null;
let _waterNormal: THREE.Texture | null = null;
let _crateColor: THREE.Texture | null = null;
let _crateRoughness: THREE.Texture | null = null;

// ---------------------------------------------------------------------------
// 1. Beach sand — warm golden-white noise
// ---------------------------------------------------------------------------

function genBeachSand(): void {
  const ctx = makeCanvas(T, T);
  if (!ctx) return;

  const img = ctx.createImageData(T, T);
  const data = img.data;
  const rng = mulberry32(0x5bea);

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const nx = x / T;
      const ny = y / T;

      // Fractal noise for grain
      const n = fbmNoise(nx * 24, ny * 24, 4, 0x5bea);

      // Warm beige palette: mix tan, cream, light brown
      const baseR = 0.78 + n * 0.12;
      const baseG = 0.65 + n * 0.14;
      const baseB = 0.42 + n * 0.12;

      // Fine grain: high-frequency variation
      const grain = (rng() - 0.5) * 0.06;
      const r = Math.min(1, Math.max(0, baseR + grain));
      const g = Math.min(1, Math.max(0, baseG + grain));
      const b = Math.min(1, Math.max(0, baseB + grain));

      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _sandColor = wrapTexture(ctx.canvas);

  // Roughness map: sand is generally rough (light grey) with subtle variation
  const rCtx = makeCanvas(T, T);
  if (!rCtx) return;
  const rImg = rCtx.createImageData(T, T);
  const rData = rImg.data;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const n = fbmNoise((x / T) * 18, (y / T) * 18, 3, 0xcafe);
      const val = Math.round((0.78 + n * 0.18) * 255);
      rData[i] = val;
      rData[i + 1] = val;
      rData[i + 2] = val;
      rData[i + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  _sandRoughness = wrapTexture(rCtx.canvas, THREE.NoColorSpace);

  _textureCount += 2;
}

// ---------------------------------------------------------------------------
// 2. Jungle rock/cliff — dark grey-brown with micro-detail
// ---------------------------------------------------------------------------

function genJungleRock(): void {
  const ctx = makeCanvas(T, T);
  if (!ctx) return;

  const img = ctx.createImageData(T, T);
  const data = img.data;

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const nx = x / T;
      const ny = y / T;

      // Base rock tone — dark grey-brown
      const n1 = fbmNoise(nx * 16, ny * 16, 4, 0x7abc);
      const n2 = fbmNoise(nx * 32, ny * 32, 3, 0xdef1);

      // Darker base with lighter cracks / highlights
      const base = 0.28 + n1 * 0.18 + n2 * 0.06;

      // Slight colour variation: grey → brown
      const rTint = base * 0.96;
      const gTint = base * 0.94;
      const bTint = base * 0.90;

      const r = Math.min(1, Math.max(0, rTint));
      const g = Math.min(1, Math.max(0, gTint));
      const b = Math.min(1, Math.max(0, bTint));

      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _rockColor = wrapTexture(ctx.canvas);

  // Roughness: high roughness with variation (cracks are smoother)
  const rCtx = makeCanvas(T, T);
  if (!rCtx) return;
  const rImg = rCtx.createImageData(T, T);
  const rData = rImg.data;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const n = fbmNoise((x / T) * 20, (y / T) * 20, 4, 0x1111);
      const val = Math.round((0.72 + n * 0.28) * 255);
      rData[i] = val;
      rData[i + 1] = val;
      rData[i + 2] = val;
      rData[i + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  _rockRoughness = wrapTexture(rCtx.canvas, THREE.NoColorSpace);

  _textureCount += 2;
}

// ---------------------------------------------------------------------------
// 3. Palm bark — vertical striations, brown tones
// ---------------------------------------------------------------------------

function genPalmBark(): void {
  const ctx = makeCanvas(T, T);
  if (!ctx) return;

  const img = ctx.createImageData(T, T);
  const data = img.data;
  const rng = mulberry32(0xb4b4);

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const nx = x / T;
      const ny = y / T;

      // Vertical striations — sine waves along X
      const stripe = Math.sin(nx * 28 + fbmNoise(ny * 4, 0, 2, 0xb0b) * 6) * 0.5 + 0.5;

      // Additional irregular horizontal banding and knots
      const band = fbmNoise(ny * 8, nx * 3, 3, 0xd0d) * 0.15;
      const knot = smoothNoise(nx * 18, ny * 22, 0xe0e) > 0.55 ? 0.08 : 0;

      // Base bark brown
      const baseLum = 0.35 + stripe * 0.22 + band + knot;
      const rTint = baseLum * 1.10; // slightly redder
      const gTint = baseLum * 0.92;
      const bTint = baseLum * 0.72;

      const grain = (rng() - 0.5) * 0.04;
      const r = Math.min(1, Math.max(0, rTint + grain));
      const g = Math.min(1, Math.max(0, gTint + grain));
      const b = Math.min(1, Math.max(0, bTint + grain));

      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _barkColor = wrapTexture(ctx.canvas);

  // Roughness: variable, stripe ridges are slightly smoother
  const rCtx = makeCanvas(T, T);
  if (!rCtx) return;
  const rImg = rCtx.createImageData(T, T);
  const rData = rImg.data;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const nx = x / T;
      const ny = y / T;
      const stripe = Math.sin(nx * 32) * 0.5 + 0.5;
      const n = fbmNoise(nx * 14 + ny * 3, ny * 12, 3, 0xf00d);
      const rough = 0.78 + n * 0.16 - stripe * 0.08; // ridges smoother
      const val = Math.round(Math.min(1, Math.max(0, rough)) * 255);
      rData[i] = val;
      rData[i + 1] = val;
      rData[i + 2] = val;
      rData[i + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  _barkRoughness = wrapTexture(rCtx.canvas, THREE.NoColorSpace);

  // Bump map: height field from stripe + noise
  const bCtx = makeCanvas(T, T);
  if (!bCtx) return;
  const bImg = bCtx.createImageData(T, T);
  const bData = bImg.data;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const nx = x / T;
      const ny = y / T;
      const stripe = (Math.sin(nx * 28 + fbmNoise(ny * 4, 0, 2, 0xb0b) * 6) * 0.5 + 0.5) * 0.6;
      const n = fbmNoise(nx * 12, ny * 8, 3, 0xabcd) * 0.4;
      const bump = stripe + n;
      const val = Math.round(Math.min(1, Math.max(0, bump)) * 255);
      bData[i] = val;
      bData[i + 1] = val;
      bData[i + 2] = val;
      bData[i + 3] = 255;
    }
  }
  bCtx.putImageData(bImg, 0, 0);
  _barkBump = wrapTexture(bCtx.canvas, THREE.NoColorSpace);

  _textureCount += 3;
}

// ---------------------------------------------------------------------------
// 4. Frond alpha — leaf silhouette, green-yellow gradient
// ---------------------------------------------------------------------------

function genFrondAlpha(): void {
  const ctx = makeCanvas(T, T);
  if (!ctx) return;

  const img = ctx.createImageData(T, T);
  const data = img.data;

  // Create a radial dappled-leaf pattern: tile a 4x4 grid of palm-frond-like
  // shapes (elongated ellipses) with transparency at the tips.
  const tilesU = 4;
  const tilesV = 4;

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;

      // Map to tile local coordinates [-1, 1]
      const tileW = T / tilesU;
      const tileH = T / tilesV;
      const u = ((x % tileW) / tileW) * 2 - 1; // -1..1
      const v = ((y % tileH) / tileH) * 2 - 1; // -1..1

      // Palm frond: elongated along U, wider at base (v=1), narrow at tip (v=-1)
      const frondWidth = 0.35 + (v + 1) * 0.4; // wider at bottom, narrow at top
      const inFrond = Math.abs(u) < frondWidth;
      const edgeFade = inFrond ? (1 - Math.abs(u) / (frondWidth + 0.02)) : 0;

      // Soft edges
      const alpha = Math.min(1, Math.max(0, edgeFade * 1.5));

      // Green with golden-yellow gradient tip (at v = -1)
      const greenR = 0.15;
      const greenG = 0.55 + (1 - Math.abs(v)) * 0.25;
      const greenB = 0.18;

      const goldR = 0.72;
      const goldG = 0.68;
      const goldB = 0.22;

      const t = Math.max(0, (-v + 1) / 2); // 0 at bottom, 1 at tip
      const r = greenR + (goldR - greenR) * t;
      const g = greenG + (goldG - greenG) * t;
      const b = greenB + (goldB - greenB) * t;

      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  _frondAlpha = wrapTexture(ctx.canvas, THREE.SRGBColorSpace);
  // Reset wrap mode for alpha so leaf pattern is distinct per face
  _frondAlpha.wrapS = THREE.RepeatWrapping;
  _frondAlpha.wrapT = THREE.RepeatWrapping;

  _textureCount += 1;
}

// ---------------------------------------------------------------------------
// 5. Water — gentle wave normal map + tropical tint
// ---------------------------------------------------------------------------

function genWater(): void {
  // Colour map: tropical blue-turquoise with caustic-like noise
  const ctx = makeCanvas(T, T);
  if (!ctx) return;

  const img = ctx.createImageData(T, T);
  const data = img.data;

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const nx = x / T;
      const ny = y / T;

      // Soft wave noise
      const wave = fbmNoise(nx * 8, ny * 8, 3, 0x04ef) * 0.12;
      const caustic = fbmNoise(nx * 22, ny * 22, 2, 0x04e0) * 0.06;

      const r = Math.max(0, Math.min(1, 0.18 + wave * 0.5 + caustic));
      const g = Math.max(0, Math.min(1, 0.50 + wave * 0.6 + caustic));
      const b = Math.max(0, Math.min(1, 0.55 + wave * 0.7 + caustic));

      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _waterColor = wrapTexture(ctx.canvas);

  // Normal map: derive from heightfield
  const normalCtx = makeCanvas(T, T);
  if (!normalCtx) return;

  // Compute height field first
  const heightField = new Float32Array(T * T);
  const STRENGTH = 2.5; // normal intensity
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const nx = x / T;
      const ny = y / T;
      heightField[y * T + x] = fbmNoise(nx * 10, ny * 10, 4, 0x1337);
    }
  }

  const nImg = normalCtx.createImageData(T, T);
  const nData = nImg.data;

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;

      // Central difference to compute gradient
      const xL = x > 0 ? heightField[y * T + (x - 1)] : heightField[y * T + x];
      const xR = x < T - 1 ? heightField[y * T + (x + 1)] : heightField[y * T + x];
      const yD = y > 0 ? heightField[(y - 1) * T + x] : heightField[y * T + x];
      const yU = y < T - 1 ? heightField[(y + 1) * T + x] : heightField[y * T + x];

      const gradX = (xR - xL) * STRENGTH;
      const gradY = (yU - yD) * STRENGTH;

      // Normal map encoding: N = (-gradX, -gradY, 1) normalized → RGB
      const len = Math.sqrt(gradX * gradX + gradY * gradY + 1);
      const nx = (-gradX / len) * 0.5 + 0.5;
      const ny = (-gradY / len) * 0.5 + 0.5;
      const nz = (1 / len) * 0.5 + 0.5;

      nData[i] = Math.round(nx * 255);
      nData[i + 1] = Math.round(ny * 255);
      nData[i + 2] = Math.round(nz * 255);
      nData[i + 3] = 255;
    }
  }
  normalCtx.putImageData(nImg, 0, 0);
  _waterNormal = wrapTexture(normalCtx.canvas, THREE.NoColorSpace);

  _textureCount += 2;
}

// ---------------------------------------------------------------------------
// 6. Wood crate — rough wood grain, brown/orange tint
// ---------------------------------------------------------------------------

function genWoodCrate(): void {
  const ctx = makeCanvas(T, T);
  if (!ctx) return;

  const img = ctx.createImageData(T, T);
  const data = img.data;
  const rng = mulberry32(0xc47e);

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const nx = x / T;
      const ny = y / T;

      // Wood grain: horizontal growth rings
      const ring = Math.sin(ny * 42 + fbmNoise(nx * 6, ny * 3, 3, 0xc0ff) * 8) * 0.5 + 0.5;
      const fine = fbmNoise(nx * 18, ny * 24, 3, 0x1337) * 0.08;

      // Knots: darker spots
      const knotX = (nx * T - T * 0.3) / 60;
      const knotY = (ny * T - T * 0.55) / 60;
      const knotDist = Math.sqrt(knotX * knotX + knotY * knotY);
      const knot = knotDist < 1 ? (1 - knotDist) * 0.2 : 0;

      const baseLum = 0.42 + ring * 0.20 + fine - knot;

      // Brown/orange tint
      const rTint = baseLum * 1.05 + 0.06;
      const gTint = baseLum * 0.85;
      const bTint = baseLum * 0.55;

      const grain = (rng() - 0.5) * 0.05;
      const r = Math.min(1, Math.max(0, rTint + grain));
      const g = Math.min(1, Math.max(0, gTint + grain));
      const b = Math.min(1, Math.max(0, bTint + grain));

      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _crateColor = wrapTexture(ctx.canvas);

  // Roughness: rough with grain (ridges rougher)
  const rCtx = makeCanvas(T, T);
  if (!rCtx) return;
  const rImg = rCtx.createImageData(T, T);
  const rData = rImg.data;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const ny = y / T;
      const ring = Math.sin(ny * 42) * 0.5 + 0.5;
      const n = fbmNoise((x / T) * 14, (y / T) * 10, 3, 0xbeef);
      const rough = 0.70 + n * 0.18 + ring * 0.08;
      const val = Math.round(Math.min(1, Math.max(0, rough)) * 255);
      rData[i] = val;
      rData[i + 1] = val;
      rData[i + 2] = val;
      rData[i + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  _crateRoughness = wrapTexture(rCtx.canvas, THREE.NoColorSpace);

  _textureCount += 2;
}

// ---------------------------------------------------------------------------
// One-time generation
// ---------------------------------------------------------------------------

function ensureTextures(): void {
  if (_generated) return;
  _generated = true;
  if (!hasCanvas()) return;

  genBeachSand();
  genJungleRock();
  genPalmBark();
  genFrondAlpha();
  genWater();
  genWoodCrate();
}

// ---------------------------------------------------------------------------
// Mesh classification
// ---------------------------------------------------------------------------

type TextureCategory =
  | 'sand'
  | 'rock'
  | 'palm-bark'
  | 'frond'
  | 'water'
  | 'crate';

/** Classify a mesh into a texture category based on name, userData, and material colour. */
function classifyMesh(mesh: THREE.Mesh): TextureCategory | null {
  const name = mesh.name.toLowerCase();

  // 1. Water — names containing 'water' or 'lagoon'
  if (name.includes('water') || name.includes('lagoon')) return 'water';

  // 2. Crate — names containing 'crate'
  if (name.includes('crate')) return 'crate';

  // 3. Rock / cliff / cave
  if (name.includes('rock') || name.includes('cliff') || name.includes('cave')) return 'rock';

  // 4. Palm bark — trunk of palm or canopy
  if (name.includes('trunk') && (name.includes('palm') || name.includes('canopy'))) return 'palm-bark';

  // 5. Frond — palm leaves / fronds
  if (name.includes('frond')) return 'frond';

  // 6. Sand / beach
  if (name.includes('beach') || name.includes('sand')) return 'sand';

  // Fallback: check material colour against FARCRYSIS_ART_FEEL for art-layer meshes
  if (mesh.userData.farcrysisArt) {
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | null;
    if (mat && mat instanceof THREE.MeshStandardMaterial && 'color' in mat) {
      const col = mat.color.getHex();
      if (col === FARCRYSIS_ART_FEEL.beachSand) return 'sand';
      if (col === FARCRYSIS_ART_FEEL.palmTrunk) return 'palm-bark';
      if (col === FARCRYSIS_ART_FEEL.palmFrond) return 'frond';
      if (col === FARCRYSIS_ART_FEEL.caveRock) return 'rock';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Material augmentation (in-place, no new materials)
// ---------------------------------------------------------------------------

function augmentMaterial(
  mat: THREE.Material,
  category: TextureCategory,
): void {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;

  // Respect existing textures — don't overwrite
  switch (category) {
    case 'sand':
      if (!mat.map && _sandColor) mat.map = _sandColor;
      if (!mat.roughnessMap && _sandRoughness) mat.roughnessMap = _sandRoughness;
      break;

    case 'rock':
      if (!mat.map && _rockColor) mat.map = _rockColor;
      if (!mat.roughnessMap && _rockRoughness) mat.roughnessMap = _rockRoughness;
      break;

    case 'palm-bark':
      if (!mat.map && _barkColor) mat.map = _barkColor;
      if (!mat.roughnessMap && _barkRoughness) mat.roughnessMap = _barkRoughness;
      if (!mat.bumpMap && _barkBump) {
        mat.bumpMap = _barkBump;
        mat.bumpScale = 0.04;
      }
      break;

    case 'frond':
      if (_frondAlpha) {
        mat.alphaMap = _frondAlpha;
        mat.transparent = true;
        mat.alphaTest = 0.1;
        mat.needsUpdate = true;
      }
      break;

    case 'water':
      if (!mat.map && _waterColor) mat.map = _waterColor;
      if (!mat.normalMap && _waterNormal) {
        mat.normalMap = _waterNormal;
        mat.normalScale = new THREE.Vector2(0.8, 0.8);
        // Water surfaces benefit from lower roughness for reflectivity
        if (mat.roughness > 0.3) mat.roughness = 0.22;
      }
      break;

    case 'crate':
      if (!mat.map && _crateColor) mat.map = _crateColor;
      if (!mat.roughnessMap && _crateRoughness) mat.roughnessMap = _crateRoughness;
      break;
  }

  mat.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Main entry: walk the scene and apply textures
// ---------------------------------------------------------------------------

export function applyFarcrysisTextures(root: THREE.Group): void {
  ensureTextures();
  if (_textureCount === 0) return; // canvas not available (test / headless)

  root.traverse((obj) => {
    // InstancedMesh is a subclass of Mesh, so check it first for clarity
    if (!(obj instanceof THREE.Mesh)) return;

    const mesh = obj;
    const category = classifyMesh(mesh);
    if (!category) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      augmentMaterial(mat, category);
    }
  });
}
