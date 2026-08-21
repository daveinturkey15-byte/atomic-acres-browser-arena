/**
 * farcrysis-textures.ts — PBR texture application for the Farcrysis jungle/beach arena.
 *
 * Uses high-quality AI-generated 1024×1024 PBR image textures (color, normal, roughness)
 * loaded asynchronously from public/assets/original/textures/farcrysis-*.png.
 *
 * Immediate synchronous presentation via procedural Canvas textures (the legacy
 * noise-based generators) provides a seamless fallback in headless environments,
 * during network delays, and while images load.  When the image set for a material
 * family finishes loading, registered materials are upgraded in-place.
 *
 * Exports:
 *   applyFarcrysisTextures(root: THREE.Group): void
 *   FARCRYSIS_TEXTURE_STATS(): { textureCount: number }
 *
 * Presentation only — never adds colliders, spawns, or gameplay authority.
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

function valueNoise(x: number, y: number, seed: number): number {
  const s = x * 374761393 + y * 668265263 + seed * 15485863;
  const n = Math.sin(s) * 10000;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const v00 = valueNoise(ix, iy, seed);
  const v10 = valueNoise(ix + 1, iy, seed);
  const v01 = valueNoise(ix, iy + 1, seed);
  const v11 = valueNoise(ix + 1, iy + 1, seed);

  const a = v00 + sx * (v10 - v00);
  const b = v01 + sx * (v11 - v01);
  return a + sy * (b - a);
}

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
// Procedural texture caches (fallback)
// ---------------------------------------------------------------------------

const T = 512;

let _sandColor: THREE.Texture | null = null;
let _sandRoughness: THREE.Texture | null = null;
let _sandNormal: THREE.Texture | null = null;
let _rockColor: THREE.Texture | null = null;
let _rockRoughness: THREE.Texture | null = null;
let _rockNormal: THREE.Texture | null = null;
let _barkColor: THREE.Texture | null = null;
let _barkRoughness: THREE.Texture | null = null;
let _barkNormal: THREE.Texture | null = null;
let _barkBump: THREE.Texture | null = null;
let _frondAlpha: THREE.Texture | null = null;
let _waterColor: THREE.Texture | null = null;
let _waterNormal: THREE.Texture | null = null;
let _crateColor: THREE.Texture | null = null;
let _crateRoughness: THREE.Texture | null = null;

// ---------------------------------------------------------------------------
// 1. Beach sand (procedural fallback)
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
      const n = fbmNoise(nx * 24, ny * 24, 4, 0x5bea);
      const baseR = 0.78 + n * 0.12;
      const baseG = 0.65 + n * 0.14;
      const baseB = 0.42 + n * 0.12;
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
// 2. Jungle rock (procedural fallback)
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
      const n1 = fbmNoise(nx * 16, ny * 16, 4, 0x7abc);
      const n2 = fbmNoise(nx * 32, ny * 32, 3, 0xdef1);
      const base = 0.28 + n1 * 0.18 + n2 * 0.06;
      const rTint = base * 0.96;
      const gTint = base * 0.94;
      const bTint = base * 0.90;
      data[i] = Math.round(Math.min(1, Math.max(0, rTint)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, gTint)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, bTint)) * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _rockColor = wrapTexture(ctx.canvas);

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
// 3. Palm bark (procedural fallback)
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
      const stripe = Math.sin(nx * 28 + fbmNoise(ny * 4, 0, 2, 0xb0b) * 6) * 0.5 + 0.5;
      const band = fbmNoise(ny * 8, nx * 3, 3, 0xd0d) * 0.15;
      const knot = smoothNoise(nx * 18, ny * 22, 0xe0e) > 0.55 ? 0.08 : 0;
      const baseLum = 0.35 + stripe * 0.22 + band + knot;
      const rTint = baseLum * 1.10;
      const gTint = baseLum * 0.92;
      const bTint = baseLum * 0.72;
      const grain = (rng() - 0.5) * 0.04;
      data[i] = Math.round(Math.min(1, Math.max(0, rTint + grain)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, gTint + grain)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, bTint + grain)) * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _barkColor = wrapTexture(ctx.canvas);

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
      const rough = 0.78 + n * 0.16 - stripe * 0.08;
      rData[i] = Math.round(Math.min(1, Math.max(0, rough)) * 255);
      rData[i + 1] = rData[i];
      rData[i + 2] = rData[i];
      rData[i + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  _barkRoughness = wrapTexture(rCtx.canvas, THREE.NoColorSpace);

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
// 3b. Tangent-space normal maps (procedural PBR polish — sand / rock / bark)
//     Gradient of a tileable height field → tangent-space normal, encoded as
//     RGB (X/Y/Z) with NoColorSpace. Toroidal neighbour sampling keeps the
//     map perfectly seamless, matching the tiling color/roughness maps.
// ---------------------------------------------------------------------------

function genNormalMap(
  height: (nx: number, ny: number) => number,
  strength: number,
): THREE.Texture | null {
  const ctx = makeCanvas(T, T);
  if (!ctx) return null;

  const field = new Float32Array(T * T);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      field[y * T + x] = height(x / T, y / T);
    }
  }

  const img = ctx.createImageData(T, T);
  const data = img.data;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      // Toroidal wrap so gradients are seamless across tile edges
      const xL = field[y * T + ((x + T - 1) % T)];
      const xR = field[y * T + ((x + 1) % T)];
      const yD = field[((y + T - 1) % T) * T + x];
      const yU = field[((y + 1) % T) * T + x];
      const gradX = (xR - xL) * strength;
      const gradY = (yU - yD) * strength;
      const len = Math.sqrt(gradX * gradX + gradY * gradY + 1);
      data[i] = Math.round((-gradX / len) * 127.5 + 127.5);
      data[i + 1] = Math.round((-gradY / len) * 127.5 + 127.5);
      data[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return wrapTexture(ctx.canvas, THREE.NoColorSpace);
}

/** Sand normal: fine grain + faint wind-ripple bands (matches genBeachSand). */
function genSandNormal(): void {
  const tex = genNormalMap((nx, ny) => {
    const n = fbmNoise(nx * 18, ny * 18, 3, 0x51a7);
    const ripple = Math.sin(ny * 26 + Math.sin(nx * 4.2 + ny * 5) * 1.4) * 0.12;
    return n * 0.7 + ripple * 0.5;
  }, 1.4);
  if (!tex) return;
  _sandNormal = tex;
  _textureCount += 1;
}

/** Rock normal: broad crag relief + fine pitting (matches genJungleRock). */
function genRockNormal(): void {
  const tex = genNormalMap((nx, ny) => {
    const n1 = fbmNoise(nx * 16, ny * 16, 4, 0x7abc);
    const n2 = fbmNoise(nx * 32, ny * 32, 3, 0xdef1);
    return n1 * 0.7 + n2 * 0.3;
  }, 2.2);
  if (!tex) return;
  _rockNormal = tex;
  _textureCount += 1;
}

/** Bark normal: vertical striation ridges + knots (matches genPalmBark). */
function genBarkNormal(): void {
  const tex = genNormalMap((nx, ny) => {
    const stripe = Math.sin(nx * 28 + fbmNoise(ny * 4, 0, 2, 0xb0b) * 6) * 0.5 + 0.5;
    const n = fbmNoise(nx * 12, ny * 8, 3, 0xabcd);
    return stripe * 0.7 + n * 0.3;
  }, 2.6);
  if (!tex) return;
  _barkNormal = tex;
  _textureCount += 1;
}

// ---------------------------------------------------------------------------
// 4. Frond alpha (procedural fallback)
// ---------------------------------------------------------------------------

function genFrondAlpha(): void {
  const ctx = makeCanvas(T, T);
  if (!ctx) return;

  const img = ctx.createImageData(T, T);
  const data = img.data;
  const tilesU = 4;
  const tilesV = 4;

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const tileW = T / tilesU;
      const tileH = T / tilesV;
      const u = ((x % tileW) / tileW) * 2 - 1;
      const v = ((y % tileH) / tileH) * 2 - 1;
      const frondWidth = 0.35 + (v + 1) * 0.4;
      const inFrond = Math.abs(u) < frondWidth;
      const edgeFade = inFrond ? (1 - Math.abs(u) / (frondWidth + 0.02)) : 0;
      const alpha = Math.min(1, Math.max(0, edgeFade * 1.5));
      const greenR = 0.15;
      const greenG = 0.55 + (1 - Math.abs(v)) * 0.25;
      const greenB = 0.18;
      const goldR = 0.72;
      const goldG = 0.68;
      const goldB = 0.22;
      const t = Math.max(0, (-v + 1) / 2);
      data[i] = Math.round((greenR + (goldR - greenR) * t) * 255);
      data[i + 1] = Math.round((greenG + (goldG - greenG) * t) * 255);
      data[i + 2] = Math.round((greenB + (goldB - greenB) * t) * 255);
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  _frondAlpha = wrapTexture(ctx.canvas, THREE.SRGBColorSpace);
  _frondAlpha.wrapS = THREE.RepeatWrapping;
  _frondAlpha.wrapT = THREE.RepeatWrapping;
  _textureCount += 1;
}

// ---------------------------------------------------------------------------
// 5. Water (procedural fallback)
// ---------------------------------------------------------------------------

function genWater(): void {
  const ctx = makeCanvas(T, T);
  if (!ctx) return;

  const img = ctx.createImageData(T, T);
  const data = img.data;

  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const nx = x / T;
      const ny = y / T;
      const wave = fbmNoise(nx * 8, ny * 8, 3, 0x04ef) * 0.12;
      const caustic = fbmNoise(nx * 22, ny * 22, 2, 0x04e0) * 0.06;
      data[i] = Math.round(Math.min(1, Math.max(0, 0.18 + wave * 0.5 + caustic)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, 0.50 + wave * 0.6 + caustic)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, 0.55 + wave * 0.7 + caustic)) * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _waterColor = wrapTexture(ctx.canvas);

  const normalCtx = makeCanvas(T, T);
  if (!normalCtx) return;
  const heightField = new Float32Array(T * T);
  const STRENGTH = 2.5;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      heightField[y * T + x] = fbmNoise((x / T) * 10, (y / T) * 10, 4, 0x1337);
    }
  }
  const nImg = normalCtx.createImageData(T, T);
  const nData = nImg.data;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const i = (y * T + x) * 4;
      const xL = x > 0 ? heightField[y * T + (x - 1)] : heightField[y * T + x];
      const xR = x < T - 1 ? heightField[y * T + (x + 1)] : heightField[y * T + x];
      const yD = y > 0 ? heightField[(y - 1) * T + x] : heightField[y * T + x];
      const yU = y < T - 1 ? heightField[(y + 1) * T + x] : heightField[y * T + x];
      const gradX = (xR - xL) * STRENGTH;
      const gradY = (yU - yD) * STRENGTH;
      const len = Math.sqrt(gradX * gradX + gradY * gradY + 1);
      nData[i] = Math.round((-gradX / len) * 0.5 * 255 + 127.5);
      nData[i + 1] = Math.round((-gradY / len) * 0.5 * 255 + 127.5);
      nData[i + 2] = Math.round((1 / len) * 0.5 * 255 + 127.5);
      nData[i + 3] = 255;
    }
  }
  normalCtx.putImageData(nImg, 0, 0);
  _waterNormal = wrapTexture(normalCtx.canvas, THREE.NoColorSpace);

  _textureCount += 2;
}

// ---------------------------------------------------------------------------
// 6. Wood crate (procedural fallback)
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
      const ring = Math.sin(ny * 42 + fbmNoise(nx * 6, ny * 3, 3, 0xc0ff) * 8) * 0.5 + 0.5;
      const fine = fbmNoise(nx * 18, ny * 24, 3, 0x1337) * 0.08;
      const knotX = (nx * T - T * 0.3) / 60;
      const knotY = (ny * T - T * 0.55) / 60;
      const knotDist = Math.sqrt(knotX * knotX + knotY * knotY);
      const knot = knotDist < 1 ? (1 - knotDist) * 0.2 : 0;
      const baseLum = 0.42 + ring * 0.20 + fine - knot;
      const rTint = baseLum * 1.05 + 0.06;
      const gTint = baseLum * 0.85;
      const bTint = baseLum * 0.55;
      const grain = (rng() - 0.5) * 0.05;
      data[i] = Math.round(Math.min(1, Math.max(0, rTint + grain)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, gTint + grain)) * 255);
      data[i + 2] = Math.round(Math.min(1, Math.max(0, bTint + grain)) * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  _crateColor = wrapTexture(ctx.canvas);

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
// One-time generation of procedural fallbacks
// ---------------------------------------------------------------------------

function ensureTextures(): void {
  if (_generated) return;
  _generated = true;
  if (!hasCanvas()) return;

  genBeachSand();
  genJungleRock();
  genPalmBark();
  genSandNormal();
  genRockNormal();
  genBarkNormal();
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

function classifyMesh(mesh: THREE.Mesh): TextureCategory | null {
  const name = mesh.name.toLowerCase();
  if (name.includes('water') || name.includes('lagoon')) return 'water';
  if (name.includes('crate')) return 'crate';
  if (name.includes('rock') || name.includes('cliff') || name.includes('cave')) return 'rock';
  if (name.includes('trunk') && (name.includes('palm') || name.includes('canopy'))) return 'palm-bark';
  if (name.includes('frond')) return 'frond';
  if (name.includes('beach') || name.includes('sand')) return 'sand';

  // Fallback: check material colour against FARCRYSIS_ART_FEEL
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
// Material augmentation registry (for async image-texture upgrade)
// ---------------------------------------------------------------------------

interface ImageTextureSet {
  color?: THREE.Texture;
  normal?: THREE.Texture;
  roughness?: THREE.Texture;
  alpha?: THREE.Texture;
}

const REGISTRY = new Map<THREE.MeshStandardMaterial, TextureCategory>();
const _imageSets: Partial<Record<TextureCategory, ImageTextureSet>> = {};
let _imageLoaderInitiated = false;

const TEXTURE_PATH = './assets/original/textures/farcrysis';

/** Wrap a loaded texture for tiled PBR use. */
function configurePBRTexture(
  tex: THREE.Texture,
  colorSpace: THREE.ColorSpace,
): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Apply loaded image textures to all registered materials of a given category. */
function upgradeRegistered(category: TextureCategory, set: ImageTextureSet): void {
  REGISTRY.forEach((cat, mat) => {
    if (cat !== category) return;

    switch (category) {
      case 'sand':
        if (set.color) mat.map = set.color;
        if (set.normal) {
          mat.normalMap = set.normal;
          mat.normalScale = new THREE.Vector2(0.7, 0.7);
        }
        if (set.roughness) mat.roughnessMap = set.roughness;
        break;
      case 'rock':
        if (set.color) mat.map = set.color;
        if (set.normal) {
          mat.normalMap = set.normal;
          mat.normalScale = new THREE.Vector2(0.8, 0.8);
        }
        if (set.roughness) mat.roughnessMap = set.roughness;
        break;
      case 'palm-bark':
        if (set.color) mat.map = set.color;
        if (set.roughness) mat.roughnessMap = set.roughness;
        if (set.normal) {
          mat.normalMap = set.normal;
          mat.normalScale = new THREE.Vector2(0.55, 0.55);
          // Clear procedural bump if present
          mat.bumpMap = null;
          mat.bumpScale = 1;
        }
        break;
      case 'frond':
        if (set.color) {
          mat.map = set.color;
          mat.transparent = true;
          mat.alphaTest = 0.05;
          // Frond image has embedded alpha channel
          mat.alphaMap = set.color;
        }
        break;
      case 'water':
        if (set.color) mat.map = set.color;
        if (set.normal) {
          mat.normalMap = set.normal;
          mat.normalScale = new THREE.Vector2(0.8, 0.8);
        }
        if (set.roughness) mat.roughnessMap = set.roughness;
        if (mat.roughness > 0.3) mat.roughness = 0.22;
        break;
      case 'crate':
        if (set.color) mat.map = set.color;
        if (set.roughness) mat.roughnessMap = set.roughness;
        break;
    }

    mat.needsUpdate = true;
  });
}

/** Load a single texture family's image set via THREE.TextureLoader. */
function loadImageSet(stem: string, category: TextureCategory): void {
  if (!hasCanvas()) return; // no document → TextureLoader will fail

  const loader = new THREE.TextureLoader();
  const basePath = `${TEXTURE_PATH}-${stem}`;
  const set: ImageTextureSet = {};

  let pending = 3;
  function onDone(): void {
    pending--;
    if (pending === 0) {
      _imageSets[category] = set;
      upgradeRegistered(category, set);
    }
  }

  // Color map (sRGB color space)
  loader.load(
    `${basePath}.png`,
    (tex) => { set.color = configurePBRTexture(tex, THREE.SRGBColorSpace); onDone(); },
    undefined,
    () => onDone(),
  );

  // Normal map (linear)
  loader.load(
    `${basePath}-normal.png`,
    (tex) => { set.normal = configurePBRTexture(tex, THREE.NoColorSpace); onDone(); },
    undefined,
    () => onDone(),
  );

  // Roughness map (linear)
  loader.load(
    `${basePath}-roughness.png`,
    (tex) => { set.roughness = configurePBRTexture(tex, THREE.NoColorSpace); onDone(); },
    undefined,
    () => onDone(),
  );
}

/** Initiate async loading of all 6 image texture sets. */
function loadAllImageTextures(): void {
  if (_imageLoaderInitiated) return;
  _imageLoaderInitiated = true;
  if (!hasCanvas()) return;

  loadImageSet('sand', 'sand');
  loadImageSet('rock', 'rock');
  loadImageSet('bark', 'palm-bark');
  loadImageSet('frond', 'frond');
  loadImageSet('water', 'water');
  loadImageSet('crate', 'crate');
}

// ---------------------------------------------------------------------------
// Procedural augmentation (immediate, synchronous)
// ---------------------------------------------------------------------------

function augmentProcedural(mat: THREE.Material, category: TextureCategory): void {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;

  switch (category) {
    case 'sand':
      if (!mat.map && _sandColor) mat.map = _sandColor;
      if (!mat.normalMap && _sandNormal) {
        mat.normalMap = _sandNormal;
        mat.normalScale = new THREE.Vector2(0.7, 0.7);
      }
      if (!mat.roughnessMap && _sandRoughness) mat.roughnessMap = _sandRoughness;
      break;
    case 'rock':
      if (!mat.map && _rockColor) mat.map = _rockColor;
      if (!mat.normalMap && _rockNormal) {
        mat.normalMap = _rockNormal;
        mat.normalScale = new THREE.Vector2(0.8, 0.8);
      }
      if (!mat.roughnessMap && _rockRoughness) mat.roughnessMap = _rockRoughness;
      break;
    case 'palm-bark':
      if (!mat.map && _barkColor) mat.map = _barkColor;
      if (!mat.roughnessMap && _barkRoughness) mat.roughnessMap = _barkRoughness;
      // Prefer the procedural tangent-space normal over the legacy bump map
      if (!mat.normalMap && _barkNormal) {
        mat.normalMap = _barkNormal;
        mat.normalScale = new THREE.Vector2(0.5, 0.5);
        mat.bumpMap = null;
        mat.bumpScale = 1;
      } else if (!mat.normalMap && !mat.bumpMap && _barkBump) {
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
// Main entry: walk the scene, apply procedural textures, register for images
// ---------------------------------------------------------------------------

export function applyFarcrysisTextures(root: THREE.Group): void {
  ensureTextures();
  if (_textureCount === 0) return; // canvas not available (test / headless)

  // 1. Walk scene: apply procedural textures immediately + register for image upgrade
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    const mesh = obj;
    const category = classifyMesh(mesh);
    if (!category) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      // Apply immediate procedural textures
      augmentProcedural(mat, category);
      // Register for async image-texture upgrade
      if (mat instanceof THREE.MeshStandardMaterial) {
        REGISTRY.set(mat, category);
      }
    }
  });

  // 2. Kick off async loading of high-resolution image textures
  loadAllImageTextures();
}

// ---------------------------------------------------------------------------
// PBR map stats — counts of canvas-generated normal/roughness maps available.
// Call after applyFarcrysisTextures (or any time; generation is cached).
// ---------------------------------------------------------------------------

export function buildProceduralPBRMaps(): { normalMaps: number; roughnessMaps: number } {
  ensureTextures();
  return {
    normalMaps: [_sandNormal, _rockNormal, _barkNormal, _waterNormal].filter((t) => t !== null).length,
    roughnessMaps: [_sandRoughness, _rockRoughness, _barkRoughness, _crateRoughness].filter((t) => t !== null).length,
  };
}
