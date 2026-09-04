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
let sharedData: Uint8Array | null = null;
let sharedMeans: readonly [number, number, number, number] | null = null;
let sharedSigmas: readonly [number, number, number, number] | null = null;

/** The generated tile's bytes, generated once and reused by the texture and the CPU gates. */
function lutData(): Uint8Array {
  if (!sharedData) sharedData = generateNoiseLutData();
  return sharedData;
}

/**
 * The MEASURED mean of each channel over the whole tile, in [0, 1].
 *
 * WHY A MEASUREMENT AND NOT 0.5 (HF-503, pass 96). A signed field written as
 * `sample * 2 - 1` is only zero-mean if the sample's mean is exactly one half,
 * and this tile's is not: value noise on a finite lattice, folded through
 * three octaves, quantised to eight bits and - for the ridged channel -
 * squared, lands a fraction of a per cent off. That fraction IS what the
 * mean-preservation gate measures, so the variation terms subtract the
 * measured mean rather than the assumed one, and the arena's authored base
 * colours stay the MEAN of each surface rather than its ceiling.
 */
export function noiseLutChannelMeans(): readonly [number, number, number, number] {
  if (sharedMeans) return sharedMeans;
  const data = lutData();
  const sums = [0, 0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    sums[0] += data[i];
    sums[1] += data[i + 1];
    sums[2] += data[i + 2];
    sums[3] += data[i + 3];
  }
  const texels = data.length / 4;
  sharedMeans = [
    sums[0] / texels / 255,
    sums[1] / texels / 255,
    sums[2] / texels / 255,
    sums[3] / texels / 255,
  ] as const;
  return sharedMeans;
}

/**
 * The MEASURED standard deviation of each channel over the whole tile.
 *
 * WHY THIS AND NOT THE HALF-RANGE. fBm is concentrated: three octaves of value
 * noise almost never reach 0 or 1, so normalising a signed field by its
 * extremes would leave the authored "6 per cent macro swing" showing about two
 * per cent across most of a wall - which is the HF-486 finding restated. The
 * variation terms therefore normalise by TWO SIGMA and clamp, so the authored
 * number is a real 95th-percentile swing and the gate can measure it.
 */
export function noiseLutChannelSigmas(): readonly [number, number, number, number] {
  if (sharedSigmas) return sharedSigmas;
  const data = lutData();
  const means = noiseLutChannelMeans();
  const sums = [0, 0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 4; c += 1) {
      const d = data[i + c] / 255 - means[c];
      sums[c] += d * d;
    }
  }
  const texels = data.length / 4;
  sharedSigmas = [
    Math.sqrt(sums[0] / texels),
    Math.sqrt(sums[1] / texels),
    Math.sqrt(sums[2] / texels),
    Math.sqrt(sums[3] / texels),
  ] as const;
  return sharedSigmas;
}

/** The one shared tile. Built on first use; never rebuilt. */
export function noiseLutTexture(): THREE.DataTexture {
  if (shared) return shared;
  const lut = new THREE.DataTexture(lutData(), NOISE_LUT_SIZE, NOISE_LUT_SIZE, THREE.RGBAFormat);
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

/** Test seam: drop the shared tiles so a test can prove they are rebuilt lazily. */
export function resetNoiseLutForTests(): void {
  shared = null;
  sharedData = null;
  sharedMeans = null;
  sharedSigmas = null;
  sharedGradientRms = null;
  sharedGradient = null;
  sharedGradientData = null;
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


/* ------------------------------------------------------------------------ *
 * The GRADIENT tile (HF-503, pass 96) - the second LUT, generated the same way.
 * ------------------------------------------------------------------------ */

/**
 * WHY A SECOND TILE. A surface reads as a surface partly because its NORMAL
 * moves. Render a wall with a perfectly flat normal and no amount of albedo
 * detail stops it reading as a painted plane, because the specular lobe and
 * the ambient occlusion term both stay constant across it - which is exactly
 * the HF-486 finding that GTAO, SSR and bloom are invisible on our surfaces.
 *
 * The perturbation wanted here is the DERIVATIVE of a height field, and a
 * derivative is either several extra texture fetches per fragment at runtime
 * or ONE fetch of a tile that already holds it. It is the second one,
 * generated on the CPU exactly the way the value tile is: nothing is loaded,
 * decoded, or fetched over the network, and the "loads no texture" gate holds.
 *
 *   R = d(height)/du, encoded to [0, 1] about 0.5
 *   G = d(height)/dv, encoded the same way
 *   B = the height itself, so a caller wanting a cavity term gets it free
 *   A = 255 (reserved)
 *
 * SIZE. 256 x 256 over 32 lattice cells - half the value tile's resolution,
 * because a perturbation bounded to a few degrees is a low-frequency signal
 * and a bigger tile would only cost boot time and cache. The slope is stored
 * in units of height per lattice cell, saturating at `GRADIENT_LUT_RANGE`;
 * `noise-lut.test.ts` measures the clipped fraction rather than assuming it.
 */
export const GRADIENT_LUT_SIZE = 256;
export const GRADIENT_LUT_CELLS = 32;
/** Slope, in height per lattice cell, at which the encoding saturates. */
export const GRADIENT_LUT_RANGE = 2.0;

/** Fill the gradient tile. Pure, deterministic; runs once. */
export function generateGradientLutData(size = GRADIENT_LUT_SIZE, cells = GRADIENT_LUT_CELLS): Uint8Array {
  const height = new Float32Array(size * size);
  const cellsPerTexel = cells / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      height[y * size + x] = fbm(x * cellsPerTexel, y * cellsPerTexel, cells, 2, false);
    }
  }
  // Central differences ON THE TILE, wrapped - so the gradient tiles exactly
  // as the height does. Differencing the analytic fBm instead would be no more
  // accurate at this texel spacing and would cost four evaluations per texel.
  const data = new Uint8Array(size * size * 4);
  const perCell = 1 / (2 * cellsPerTexel);
  const encode = (slope: number): number =>
    Math.round(Math.min(1, Math.max(0, slope / (2 * GRADIENT_LUT_RANGE) + 0.5)) * 255);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const xm = (x + size - 1) % size;
      const xp = (x + 1) % size;
      const ym = (y + size - 1) % size;
      const yp = (y + 1) % size;
      const du = (height[y * size + xp] - height[y * size + xm]) * perCell;
      const dv = (height[yp * size + x] - height[ym * size + x]) * perCell;
      const i = (y * size + x) * 4;
      data[i] = encode(du);
      data[i + 1] = encode(dv);
      data[i + 2] = Math.round(height[y * size + x] * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

let sharedGradient: THREE.DataTexture | null = null;
let sharedGradientData: Uint8Array | null = null;

/** The one shared gradient tile. Built on first use; never rebuilt. */
export function gradientLutTexture(): THREE.DataTexture {
  if (sharedGradient) return sharedGradient;
  if (!sharedGradientData) sharedGradientData = generateGradientLutData();
  const lut = new THREE.DataTexture(sharedGradientData, GRADIENT_LUT_SIZE, GRADIENT_LUT_SIZE, THREE.RGBAFormat);
  lut.name = 'nuketown2-gradient-lut';
  lut.colorSpace = THREE.NoColorSpace;
  lut.wrapS = THREE.RepeatWrapping;
  lut.wrapT = THREE.RepeatWrapping;
  lut.magFilter = THREE.LinearFilter;
  lut.minFilter = THREE.LinearFilter;
  lut.generateMipmaps = false;
  lut.flipY = false;
  lut.needsUpdate = true;
  sharedGradient = lut;
  return sharedGradient;
}

/**
 * The height field's slope at a lattice-cell coordinate, signed, in height per
 * cell. ONE texture fetch; two SINGLE swizzles off the same node, never a
 * chain (webgpu-tint-swizzle-shim.ts, Chrome 153 Tint).
 */
export function lutGradient(p: any): any {
  const sample = texture(gradientLutTexture(), p.mul(float(1 / GRADIENT_LUT_CELLS)));
  const decode = (channel: any): any => channel.sub(float(0.5)).mul(float(2 * GRADIENT_LUT_RANGE));
  return vec2(decode(sample.r), decode(sample.g));
}

/**
 * One [0, 1] sample of the shared value tile, returned as the NODE so a caller
 * can take more than one channel off a single fetch.
 *
 * This exists so a family that wants a tonal field and a decorrelated tint
 * field AT THE SAME SCALE pays for one texture fetch rather than two: the
 * three-octave fBm is `.b` and the ridged field is `.a`, and the two look
 * nothing like each other because one is folded and the other is not.
 */
export function lutSample(p: any): any {
  return texture(noiseLutTexture(), p.mul(float(1 / NOISE_LUT_CELLS)));
}

let sharedGradientRms: number | null = null;

/**
 * RMS gradient magnitude over the gradient tile, in height per lattice cell.
 *
 * The normal perturbation divides by this, so a family authors its bump as an
 * ANGLE in degrees and gets that angle at the typical slope rather than at
 * whatever magnitude the generator happened to produce.
 */
export function gradientLutRms(): number {
  if (sharedGradientRms !== null) return sharedGradientRms;
  if (!sharedGradientData) sharedGradientData = generateGradientLutData();
  const data = sharedGradientData;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const du = (data[i] / 255 - 0.5) * 2 * GRADIENT_LUT_RANGE;
    const dv = (data[i + 1] / 255 - 0.5) * 2 * GRADIENT_LUT_RANGE;
    sum += du * du + dv * dv;
  }
  sharedGradientRms = Math.sqrt(sum / (data.length / 4));
  return sharedGradientRms;
}
