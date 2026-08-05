/**
 * farcrysis-ground-textures.ts — procedural canvas-based ground textures for
 * the Farcrysis arena floor plates (Pass 69 re-authored art layer).
 *
 * Generates tiling textures entirely in code — no external assets:
 *   - sand:      warm golden beach sand (FARCRYSIS_ART_FEEL.beachSand) with
 *                per-pixel grain (±8% per channel) and faint horizontal
 *                wind-ripple banding
 *   - wetSand:   the same sand darkened to 70% brightness for the waterline
 *   - earth:     dark brown-green soil with broad mottling + pebble specks
 *   - roughness: 256×256 noise height field for micro-surface detail
 *
 * Exports:
 *   generateSandTextures(): FarcrysisGroundTextures
 *   applyGroundTextures(scene: THREE.Scene): void
 *   FARCRYSIS_GROUND_TEXTURE_STATS(): { generated: boolean; textureCount: number }
 *
 * Mesh-name contract (matches buildFarcrysis in farcrysis.ts):
 *   'farcrysis-ground-plate' → sand texture,  roughness 0.85
 *   'farcrysis-beach-ring'   → wet sand,      roughness 0.60
 *   'farcrysis-jungle-floor' → earth texture, roughness 0.90
 *
 * Presentation only — never adds colliders, spawns, or gameplay authority.
 * The Canvas API is browser-only: in headless/test environments the
 * generators return null textures and applyGroundTextures() no-ops safely.
 */

import * as THREE from 'three';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';

// ---------------------------------------------------------------------------
// Ground mesh contract
// ---------------------------------------------------------------------------

const GROUND_PLATE = 'farcrysis-ground-plate';
const BEACH_RING = 'farcrysis-beach-ring';
const JUNGLE_FLOOR = 'farcrysis-jungle-floor';

// ---------------------------------------------------------------------------
// Canvas availability guard (browser-only API)
// ---------------------------------------------------------------------------

function hasCanvas(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof document.createElement === 'function'
  );
}

/** Create a blank canvas; returns null in test/headless environments. */
function makeCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (!hasCanvas()) return null;
  try {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Seeded PRNG + value noise (deterministic: same seed → same texture)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + sx * (b - a) + sy * (c + sx * (d - c) - a - sx * (b - a));
}

/** Fractal (multi-octave) value noise, output in [0, 1]. */
function fbmNoise(x: number, y: number, octaves: number, seed: number): number {
  let value = 0;
  let amplitude = 1;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * smoothNoise(x * freq, y * freq, seed + i * 101);
    max += amplitude;
    freq *= 2;
    amplitude *= 0.5;
  }
  return value / max;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// ---------------------------------------------------------------------------
// Texture generation
// ---------------------------------------------------------------------------

const SAND_SIZE = 512; // color-map resolution
const ROUGHNESS_SIZE = 256; // roughness height-field resolution
const SAND_SEED = 0x5a57;
const EARTH_SEED = 0xe4a2;
const ROUGH_SEED = 0x7089;
const WET_BRIGHTNESS = 0.7; // wet sand renders at 70% brightness

export interface FarcrysisGroundTextures {
  sandTex: THREE.CanvasTexture | null;
  wetSandTex: THREE.CanvasTexture | null;
  earthTex: THREE.CanvasTexture | null;
  roughnessTex: THREE.CanvasTexture | null;
}

/** Per-pixel filler for a tiling color map. */
type PixelFn = (nx: number, ny: number, rng: () => number) => [number, number, number];

function fillColorMap(
  width: number,
  height: number,
  seed: number,
  pixel: PixelFn,
  colorSpace: THREE.ColorSpace,
  repeat: number,
): THREE.CanvasTexture | null {
  const canvas = makeCanvas(width, height);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(width, height);
  const data = img.data;
  const rng = mulberry32(seed);
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const [r, g, b] = pixel(nx, ny, rng);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = colorSpace;
  tex.repeat.set(repeat, repeat);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Golden-sand pixel factory: palette base colour, broad tonal drift, faint
 * horizontal wind-ripple bands, and ±8% per-channel grain. `brightness`
 * darkens the whole swatch (used for the wet-sand variant).
 */
function sandPixel(brightness: number, seed: number): PixelFn {
  const base = new THREE.Color(FARCRYSIS_ART_FEEL.beachSand);
  const baseR = base.r * 255 * brightness;
  const baseG = base.g * 255 * brightness;
  const baseB = base.b * 255 * brightness;
  return (nx, ny, rng) => {
    // Large-scale tonal drift so a 64 m plate never reads as a flat fill
    const drift = fbmNoise(nx * 3, ny * 3, 3, seed + 7) - 0.5;
    // Wind ripples: horizontal stripes that undulate slowly along X so they
    // look like dune ripples rather than scanlines
    const ripplePhase =
      ny * 26 +
      Math.sin(nx * 4.2 + ny * 5) * 1.4 +
      fbmNoise(nx * 5, ny * 9, 3, seed + 11) * 3.0;
    const ripple = Math.sin(ripplePhase) * 0.07; // ±7% band brightness
    // Fine grain: ±8% per channel
    const grainR = (rng() - 0.5) * 0.16 * 255;
    const grainG = (rng() - 0.5) * 0.16 * 255;
    const grainB = (rng() - 0.5) * 0.16 * 255;
    const scale = 1 + drift * 0.06 + ripple;
    return [clamp255(baseR * scale + grainR), clamp255(baseG * scale + grainG), clamp255(baseB * scale + grainB)];
  };
}

/** Dark brown-green soil: broad mottling, green-tinged patches, pebble specks. */
function earthPixel(nx: number, ny: number, rng: () => number): [number, number, number] {
  const n = fbmNoise(nx * 8, ny * 8, 4, EARTH_SEED);
  const patch = fbmNoise(nx * 3.5, ny * 3.5, 3, EARTH_SEED + 13) - 0.5;
  let r = (0.32 + n * 0.1 + patch * 0.06) * 255;
  let g = (0.24 + n * 0.12 + patch * 0.12) * 255;
  let b = (0.16 + n * 0.08 + patch * 0.05) * 255;
  // Scattered dark pebbles
  if (fbmNoise(nx * 42, ny * 42, 2, EARTH_SEED + 29) > 0.62) {
    r *= 0.78;
    g *= 0.78;
    b *= 0.78;
  }
  const grain = (rng() - 0.5) * 0.06 * 255;
  return [clamp255(r + grain), clamp255(g + grain), clamp255(b + grain)];
}

/** Grayscale height-field noise for the roughness map (green channel sampled by three). */
function roughnessPixel(nx: number, ny: number, rng: () => number): [number, number, number] {
  const n = fbmNoise(nx * 48, ny * 48, 4, ROUGH_SEED);
  const micro = (rng() - 0.5) * 0.05;
  const v = Math.min(1, Math.max(0, 0.82 + (n - 0.5) * 0.24 + micro));
  const c = Math.round(v * 255);
  return [c, c, c];
}

let _cached: FarcrysisGroundTextures | null = null;
let _generated = false;

/**
 * Generate (once, cached) the procedural ground texture set.
 * Fields are null when the Canvas API is unavailable (headless/tests).
 */
export function generateSandTextures(): FarcrysisGroundTextures {
  if (_cached) return _cached;
  const sandTex = fillColorMap(SAND_SIZE, SAND_SIZE, SAND_SEED, sandPixel(1, SAND_SEED), THREE.SRGBColorSpace, 4);
  const wetSandTex = fillColorMap(
    SAND_SIZE,
    SAND_SIZE,
    SAND_SEED + 3,
    sandPixel(WET_BRIGHTNESS, SAND_SEED + 3),
    THREE.SRGBColorSpace,
    4,
  );
  const earthTex = fillColorMap(SAND_SIZE, SAND_SIZE, EARTH_SEED, earthPixel, THREE.SRGBColorSpace, 4);
  const roughnessTex = fillColorMap(ROUGHNESS_SIZE, ROUGHNESS_SIZE, ROUGH_SEED, roughnessPixel, THREE.NoColorSpace, 4);
  _cached = { sandTex, wetSandTex, earthTex, roughnessTex };
  _generated = Boolean(sandTex || wetSandTex || earthTex);
  return _cached;
}

export function FARCRYSIS_GROUND_TEXTURE_STATS(): { generated: boolean; textureCount: number } {
  const set = _cached;
  const count = set
    ? [set.sandTex, set.wetSandTex, set.earthTex, set.roughnessTex].filter((t) => t !== null).length
    : 0;
  return { generated: _generated, textureCount: count };
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

interface GroundTextureSpec {
  tex: THREE.CanvasTexture | null;
  roughness: number;
}

/** Map a ground mesh name to its texture + roughness contract. */
function groundSpec(name: string, set: FarcrysisGroundTextures): GroundTextureSpec | null {
  switch (name) {
    case GROUND_PLATE:
      return { tex: set.sandTex, roughness: 0.85 };
    case BEACH_RING:
      return { tex: set.wetSandTex, roughness: 0.6 };
    case JUNGLE_FLOOR:
      return { tex: set.earthTex, roughness: 0.9 };
    default:
      return null;
  }
}

/**
 * Apply the procedural ground textures to the arena floor plates, matched by
 * mesh name. Safe no-op when canvas generation is unavailable.
 */
export function applyGroundTextures(scene: THREE.Scene): void {
  const set = generateSandTextures();
  if (!set.sandTex && !set.wetSandTex && !set.earthTex) return; // headless / no canvas

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const spec = groundSpec(obj.name, set);
    if (!spec) return;

    const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      if (spec.tex) {
        mat.map = spec.tex;
        // The canvas texture is authoritative — neutralise the legacy flat tint
        mat.color.set(0xffffff);
      }
      mat.roughness = spec.roughness;
      if (set.roughnessTex) mat.roughnessMap = set.roughnessTex;
      mat.needsUpdate = true;
    }
  });
}
