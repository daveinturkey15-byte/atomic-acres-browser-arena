/**
 * nuketown2-materials/noise-lut.ts — ONE shared, CPU-generated, tileable
 * value-noise lookup texture for every Nuke Town wear graph.
 *
 * WHY THIS EXISTS (HF-491, perf lane HITL 5). The wear engine evaluated
 * lattice value noise PER FRAGMENT: one to three octaves, each four `sin`
 * hashes and three `mix`es, on every one of the fifty `nuketown2-*` node
 * materials. Stripping those graphs in a live session took p50 16.0 -> 14.7 ms
 * on this machine (docs/evidence/pass94/perf-hitl5/REPORT.md). The noise is a
 * function of the surface coordinate only, so it is a TEXTURE - one that a
 * real material author would have painted and tiled in the first place.
 *
 * WHAT IT IS. A 512 x 512 RGBA8 `DataTexture`, generated once on the CPU the
 * first time a Nuke Town material asks for it and shared by every material
 * afterwards. It is GENERATED, not loaded: no file, no fetch, no decode, and
 * the materials test that pins "loads no texture" still holds (it checks the
 * classic map slots; a TSL `texture()` node is a generated sample).
 *
 *   R = one octave of value noise
 *   G = two octaves (fBm)
 *   B = three octaves (fBm)
 *   A = three octaves of RIDGED fBm (creases; the asphalt crack field)
 *
 * The tile holds `NOISE_LUT_CELLS` lattice cells of the base octave at
 * `NOISE_LUT_SIZE / NOISE_LUT_CELLS` texels per cell, so the smoothstep
 * interpolant of the shader version is baked in and the sampler's bilinear
 * filter only has to bridge the eight texels between lattice points. Every
 * octave is an INTEGER multiple of the tile, which is what makes it seamless
 * under `RepeatWrapping`; the octaves are decorrelated by seed rather than by
 * the shader's domain rotation (a rotated lattice cannot tile), which at these
 * feature sizes the eye does not separate.
 *
 * PERIOD. The shader version wrapped on 256 cells; this tile wraps on 64. A
 * 1 mm grain therefore repeats every 6.4 cm, a 60 mm scuff every 3.8 m and a
 * 2.4 m traffic gradient every 154 m - beyond the arena, so the term that
 * carries the big shapes still never repeats in view.
 */
import * as THREE from 'three';
import * as TSL from 'three/tsl';

/** One cast boundary for the TSL DSL, the idiom the rest of this directory uses. */
const { float, texture, vec2 } = TSL as unknown as Record<string, any>;

export const NOISE_LUT_SIZE = 512;
export const NOISE_LUT_CELLS = 64;
const OCTAVE_SEEDS = [0.0, 17.31, 41.07] as const;

/** Deterministic hash of an integer lattice point to [0, 1) - the shader's hash, in doubles. */
function hash(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
  return s - Math.floor(s);
}

/** Smoothstep-interpolated value noise on a lattice that wraps every `period` cells. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % period) + period) % period;
  const y0 = ((iy % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

function fbm(x: number, y: number, cells: number, octaves: number, ridged: boolean): number {
  let sum = 0;
  let norm = 0;
  let amp = 0.5;
  for (let octave = 0; octave < octaves; octave += 1) {
    const scale = 2 ** octave;
    // Each octave's lattice period is the tile's own cell count times its
    // frequency - an integer, which is the whole tileability condition.
    const n = valueNoise(x * scale, y * scale, cells * scale, OCTAVE_SEEDS[octave]!);
    sum += (ridged ? (1 - Math.abs(n * 2 - 1)) ** 2 : n) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Fill the RGBA8 tile. Pure, deterministic, ~250 k texels; runs once. */
export function generateNoiseLutData(size = NOISE_LUT_SIZE, cells = NOISE_LUT_CELLS): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const cellsPerTexel = cells / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x * cellsPerTexel;
      const py = y * cellsPerTexel;
      const i = (y * size + x) * 4;
      data[i] = Math.round(fbm(px, py, cells, 1, false) * 255);
      data[i + 1] = Math.round(fbm(px, py, cells, 2, false) * 255);
      data[i + 2] = Math.round(fbm(px, py, cells, 3, false) * 255);
      data[i + 3] = Math.round(fbm(px, py, cells, 3, true) * 255);
    }
  }
  return data;
}

let shared: THREE.DataTexture | null = null;

/** The one shared tile. Built on first use; never rebuilt. */
export function noiseLutTexture(): THREE.DataTexture {
  if (shared) return shared;
  const lut = new THREE.DataTexture(generateNoiseLutData(), NOISE_LUT_SIZE, NOISE_LUT_SIZE, THREE.RGBAFormat);
  lut.name = 'nuketown2-noise-lut';
  lut.colorSpace = THREE.NoColorSpace;
  lut.wrapS = THREE.RepeatWrapping;
  lut.wrapT = THREE.RepeatWrapping;
  lut.magFilter = THREE.LinearFilter;
  lut.minFilter = THREE.LinearFilter;
  lut.generateMipmaps = false;
  lut.flipY = false;
  lut.needsUpdate = true;
  shared = lut;
  return shared;
}

/** Test seam: drop the shared tile so a test can prove it is rebuilt lazily. */
export function resetNoiseLutForTests(): void {
  shared = null;
}

/**
 * [0, 1] fBm of a 2D coordinate IN LATTICE CELLS - the drop-in for
 * `map3/noise` `fbm2(p, octaves)` / `valueNoise2(p)` inside a Nuke Town graph.
 * One texture fetch, whatever the octave count.
 */
export function lutFbm(p: any, octaves: 1 | 2 | 3 = 2): any {
  const sample = texture(noiseLutTexture(), p.mul(float(1 / NOISE_LUT_CELLS)));
  // One swizzle off the texture node, never a chain: Chrome 153 Tint
  // (webgpu-tint-swizzle-shim.ts) is the reason this is spelled out.
  return octaves === 1 ? sample.r : octaves === 2 ? sample.g : sample.b;
}

/** [0, 1] ridged three-octave fBm - the drop-in for `ridgedFbm2(p, 3)`. */
export function lutRidgedFbm(p: any): any {
  return texture(noiseLutTexture(), p.mul(float(1 / NOISE_LUT_CELLS))).a;
}

/** A lattice-cell coordinate from two scalar nodes, kept here so families do not open a second cast boundary. */
export function lutUv(x: any, y: any): any {
  return vec2(x, y);
}
