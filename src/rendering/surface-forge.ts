/**
 * Surface forge - one authored surface function, a full PBR texture set.
 *
 * Owner brief 2026-08-30 ("we need a deeper recreation actually using some of
 * the x.com and other techniques we ingested"). Implements, in our own code,
 * the two techniques the extraction doc rates highest for our two new maps:
 *
 *   docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md
 *     - "Sobel height-to-normal with physically scaled slope" (adopt: yes)
 *     - "Two shared maps for the whole game: one micro detail tile and one
 *        4-band macro variation tile" (adopt: yes)
 *     - "detailWorld - the micro tooth is pinned to a fixed physical size"
 *     - "Nyquist discipline - every noise band is budgeted in texels"
 *
 * The measured problem it fixes: src/test-maps-art.ts paints 13 canvas
 * textures and binds only `material.map`. Every hardpan, plywood, cinderblock
 * and travertine surface in Test1/Test2 is a flat painted plane - no
 * grazing-angle break-up, no sun catch, no relief.
 *
 * SINGLE SOURCE OF TRUTH
 * ----------------------
 * A surface is authored ONCE as a `SurfaceDescription`: for a normalised
 * (u, v) it returns { albedo, height, roughness, ao }. From that one function
 * the forge derives albedo, a tangent-space normal, roughness and AO. Callers
 * never paint four textures by hand and the four maps can never disagree.
 *
 * CONTRACTS
 * ---------
 * - PRESENTATION ONLY. This module produces textures and materials. It adds no
 *   colliders, shot surfaces, spawns or navigation, and holds no gameplay
 *   authority. Nothing here may be used to derive collision.
 * - DETERMINISTIC. Every value comes from a seeded integer hash. No
 *   Math.random, no Date, no iteration-order dependence: the same seed
 *   produces byte-identical rasters on every peer, every run.
 * - HEADLESS-SAFE. `rasterizeSurface` is pure CPU and always works (the vitest
 *   suites and the collider/visual parity audit run in plain Node).
 *   `forgeSurface` probes for a real 2D canvas first and returns an
 *   all-null set when there is none, so callers fall back to flat colours -
 *   the same discipline as `paintedTexture` in src/test-maps-art.ts:36-65.
 *   Nothing in this file throws on a missing DOM.
 * - MeshStandardMaterial only. No ShaderMaterial in art paths.
 *
 * UV / SIGN CONVENTION (the trap the extraction doc flags at line 215)
 * -------------------------------------------------------------------
 * We emit CanvasTextures, which inherit `Texture.flipY = true`, so texture
 * coordinate v = 1 is the canvas's TOP row. The description therefore receives
 * v as the coordinate a shader will sample with (v up), and the rasteriser maps
 * it to canvas row y via `v = 1 - (y + 0.5) / size`.
 *
 * A tangent-space (OpenGL/three.js convention) normal is
 * `normalize(-dH/du, -dH/dv, 1)`. Because dv = -dy_canvas, the canvas-space
 * form is `normalize(-slopeU, +slopeV_canvasDown, 1)`, which is what the
 * encoder below writes.
 *
 * Note for anyone auditing the other two normal producers in this repo: they
 * disagree in sign but both are CORRECT, because they ship different texture
 * types. src/farcrysis-ground-materials.ts:209-211 writes (-dx, -dy) into a
 * DataTexture, whose flipY defaults to false, so v = 0 is data row 0.
 * scripts/generate-art-textures.py:365-368 writes (-dx, +dy) into a PNG, which
 * TextureLoader loads with flipY = true, so v = 1 is image row 0. The sign
 * follows flipY; there is no bug to fix in either.
 *
 * NYQUIST BUDGET (extraction doc: "Nyquist discipline", adopt: yes)
 * ----------------------------------------------------------------
 * Shared micro tile:  256 px over 0.25 m  = 0.98 mm/texel.
 *   Finest authored band 32 cells = 8.0 texels/cell (7.8 mm). >= 5 texels: OK.
 * Shared macro tile:  256 px, low-frequency only, finest band 24 cells
 *   = 10.7 texels/cell. >= 5 texels: OK.
 * Per-surface tiles declare `tileMetres`, so `metresPerTexel` is derivable and
 * a surface author can budget their own bands. `surfaceTexelBudget()` reports
 * it; keep every authored band at or above 5 texels per cycle.
 *
 * COST
 * ----
 * Zero draw calls, zero triangles, no per-frame work. Build-time CPU only.
 * Memory per forged surface at the default 512 px is 4 x 1 MB of RGBA plus its
 * mip chain (~5.6 MB resident). The two shared 256 px maps are 256 KB each
 * plus mips and are built at most once for the whole game.
 *
 * MEASURED bake time (Node 22, dave-gaming-pc, 4-octave fbm + Worley height):
 * shared micro tile 19.9 ms once; one 512 px surface 105 ms; one 1024 px
 * surface 358 ms. Boot cost is therefore roughly 0.1 s per surface at the
 * default size - budget it. Prefer 512, keep Worley to one band, and do not
 * raise a surface to 1024 without a Nyquist reason (`surfaceTexelBudget`).
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Deterministic, tileable noise
// ---------------------------------------------------------------------------

/**
 * Sin-free integer hash. Sin-based hashes band badly at high lattice
 * coordinates; this is a Wang-style avalanche mix over three Math.imul rounds.
 */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function wrapIndex(index: number, period: number): number {
  const wrapped = index % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

/**
 * The noise toolkit handed to a `SurfaceDescription`.
 *
 * Every function is PERIODIC BY CONSTRUCTION: the lattice is wrapped by
 * `period` (in cells), so a field evaluated over u,v in [0,1) with
 * `p = uv * period` tiles seamlessly with no mirroring and no seam-repair
 * pass. `fbm` doubles frequency AND period per octave so the whole stack stays
 * seamless. This is the property the canvas painters in src/test-maps-art.ts
 * lack - `fbmMottle` draws radial gradients at random positions, so blobs near
 * an edge are clipped and every tile shows a seam grid at high repeat counts.
 */
export interface SurfaceNoise {
  /** Deterministic value in [0,1) for a lattice cell. */
  hash(ix: number, iy: number): number;
  /** Smooth-interpolated periodic value noise in [0,1). */
  noise(x: number, y: number, period: number): number;
  /** Periodic fbm in [0,1). `period` is the base octave's period in cells. */
  fbm(x: number, y: number, period: number, octaves?: number, gain?: number): number;
  /** Periodic domain warp: fbm sampled through an fbm-displaced coordinate. */
  warp(x: number, y: number, period: number, amount: number): number;
  /** Periodic Worley/cellular F1 distance in [0,1); 0 at a feature point. */
  worley(x: number, y: number, period: number): number;
}

/** Builds the seeded noise toolkit. Exported so tileability can be tested. */
export function createSurfaceNoise(seed: number): SurfaceNoise {
  const base = seed | 0;

  const noise = (x: number, y: number, period: number, salt = 0): number => {
    const cells = Math.max(1, Math.round(period));
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const x0 = wrapIndex(xi, cells);
    const x1 = wrapIndex(xi + 1, cells);
    const y0 = wrapIndex(yi, cells);
    const y1 = wrapIndex(yi + 1, cells);
    const s = base + salt;
    const a = hash2(x0, y0, s);
    const b = hash2(x1, y0, s);
    const c = hash2(x0, y1, s);
    const d = hash2(x1, y1, s);
    const top = a + (b - a) * u;
    const bottom = c + (d - c) * u;
    return top + (bottom - top) * v;
  };

  const fbm = (x: number, y: number, period: number, octaves = 4, gain = 0.5): number => {
    let sum = 0;
    let norm = 0;
    let amplitude = 1;
    let frequency = 1;
    let cells = Math.max(1, Math.round(period));
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += amplitude * noise(x * frequency, y * frequency, cells, octave * 101);
      norm += amplitude;
      amplitude *= gain;
      frequency *= 2;
      cells *= 2;
    }
    return norm > 0 ? sum / norm : 0;
  };

  return {
    hash: (ix, iy) => hash2(ix, iy, base),
    noise: (x, y, period) => noise(x, y, period),
    fbm,
    warp: (x, y, period, amount) => {
      // Warping by a field of the SAME period keeps the result periodic.
      const dx = (fbm(x, y, period, 2) - 0.5) * amount;
      const dy = (fbm(x + 7.13, y + 3.71, period, 2) - 0.5) * amount;
      return fbm(x + dx, y + dy, period, 3);
    },
    worley: (x, y, period) => {
      const cells = Math.max(1, Math.round(period));
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      let best = 1e9;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const cx = xi + ox;
          const cy = yi + oy;
          const wx = wrapIndex(cx, cells);
          const wy = wrapIndex(cy, cells);
          const px = cx + hash2(wx, wy, base + 17);
          const py = cy + hash2(wx, wy, base + 31);
          const dx = px - x;
          const dy = py - y;
          const distance = dx * dx + dy * dy;
          if (distance < best) best = distance;
        }
      }
      return Math.min(1, Math.sqrt(best));
    },
  };
}

// ---------------------------------------------------------------------------
// Authored surface description
// ---------------------------------------------------------------------------

/** One texel of an authored surface. All channels are 0..1. */
export interface SurfaceSample {
  /** Base colour, sRGB-encoded (the value that lands in the albedo texture). */
  albedo: readonly [number, number, number];
  /** Relief, 0 = trough, 1 = crest. Scaled to metres by `reliefMetres`. */
  height: number;
  /** Perceptual roughness. */
  roughness: number;
  /** Ambient occlusion; 1 (unoccluded) when omitted. */
  ao?: number;
}

/**
 * The single authored function for a surface.
 *
 * `u` and `v` are texture coordinates as a shader will sample them (v up).
 * The forge COPIES the returned sample immediately, so a description may
 * return one reused scratch object rather than allocating per texel.
 */
export type SurfaceDescription = (u: number, v: number, noise: SurfaceNoise) => SurfaceSample;

/** Two-scale detail settings. See "detailWorld" in the extraction doc. */
export interface MicroDetailOptions {
  /**
   * Repetitions of the shared 0.25 m micro tile inside one surface tile.
   * Omit to DERIVE it from `tileMetres` so the tooth keeps a fixed physical
   * size regardless of how the surface is mapped - the load-bearing fix the
   * doc records, where authoring "tiles per base tile" silently tied the micro
   * layer's world scale to the macro layer's and made it filter away.
   */
  tiles?: number;
  /** Slope contribution of the micro layer. 0 disables the micro normal. */
  strength?: number;
  /** How much micro relief darkens AO, so aggregate reads as depth. */
  aoAmount?: number;
  /** How much micro relief speckles albedo. */
  albedoAmount?: number;
}

export interface SurfaceForgeOptions {
  /** Texture edge length in px. Power of two. Default 512. */
  size?: number;
  /** Deterministic seed. Default `DEFAULT_SURFACE_SEED`. */
  seed?: number;
  /** Peak-to-trough relief of the height field, in metres. Default 0.006. */
  reliefMetres?: number;
  /** World metres one tile spans at its authored repeat. Default 2. */
  tileMetres?: number;
  /** Extra artistic multiplier on the derived slope. Default 1. */
  normalStrength?: number;
  /** Texture repeat applied to every map in the set. Default [1, 1]. */
  repeat?: readonly [number, number];
  /** Anisotropic filtering taps. Default 4. */
  anisotropy?: number;
  /** Two-scale micro detail. `false` bakes the macro scale only. */
  micro?: MicroDetailOptions | false;
}

/** CPU rasters. Always produced, DOM or not. */
export interface SurfaceRaster {
  size: number;
  /** RGBA, sRGB-encoded. Alpha is always 255 - see note below. */
  albedo: Uint8ClampedArray;
  /** RGBA tangent-space normal, linear data. */
  normal: Uint8ClampedArray;
  /** RGBA greyscale roughness, linear data. */
  roughness: Uint8ClampedArray;
  /** RGBA greyscale ambient occlusion, linear data. */
  ao: Uint8ClampedArray;
  /** The raw macro height field, 0..1, for callers that want it. */
  height: Float32Array;
  /** Micro repetitions actually baked in (0 when micro detail is off). */
  microTiles: number;
}

/**
 * We deliberately do NOT pack height into albedo.alpha (upstream's
 * three-texture contract). Our slot-detection path in material-compatibility
 * can flip `transparent` on a material whose map carries non-unit alpha, and a
 * see-through wall is a far worse failure than one extra fetch. Height is
 * exposed on the raster instead.
 */
export interface ForgedSurface {
  readonly name: string;
  readonly size: number;
  /** False when there is no usable 2D canvas; every map is then null. */
  readonly available: boolean;
  readonly map: THREE.CanvasTexture | null;
  readonly normalMap: THREE.CanvasTexture | null;
  readonly roughnessMap: THREE.CanvasTexture | null;
  readonly aoMap: THREE.CanvasTexture | null;
  /** Physically derived normal strength, `reliefMetres / tileMetres`. */
  readonly reliefRatio: number;
  readonly tileMetres: number;
}

export const DEFAULT_SURFACE_SEED = 0x5eed_10a5 | 0;
const DEFAULT_SIZE = 512;
const DEFAULT_TILE_METRES = 2;
const DEFAULT_RELIEF_METRES = 0.006;

/** The shared micro tile's authored physical size. Never change one alone. */
export const MICRO_TILE_METRES = 0.25;
const MICRO_SIZE = 256;
const MICRO_RELIEF_METRES = 0.0016;
const MACRO_SIZE = 256;

// ---------------------------------------------------------------------------
// Sobel height -> tangent normal, with a physically scaled slope
// ---------------------------------------------------------------------------

/**
 * Fills `outU`/`outV` with the surface slope in metres per metre.
 *
 * The 3x3 Sobel response is normalised by the kernel weight (8) to become a
 * per-texel delta, then divided by the texel size (1 / size) to become a
 * gradient across the whole tile, then scaled by `reliefRatio` = relief metres
 * over tile metres. The result is physical, not resolution-dependent: a 5 mm
 * mortar recess on a 1.35 m tile produces exactly the slope 5 mm over 1.35 m
 * implies, at 256 px or at 2048 px.
 *
 * `outV` is the slope in the CANVAS-DOWN direction. The encoder negates dv for
 * the flipY convention documented in the module header.
 */
function sobelSlopes(
  height: Float32Array,
  size: number,
  reliefRatio: number,
  outU: Float32Array,
  outV: Float32Array,
): void {
  const scale = size * reliefRatio;
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1) + size) % size;
    const down = (y + 1) % size;
    const rowUp = up * size;
    const rowMid = y * size;
    const rowDown = down * size;
    for (let x = 0; x < size; x += 1) {
      const left = ((x - 1) + size) % size;
      const right = (x + 1) % size;

      const lu = height[rowUp + left]!;
      const cu = height[rowUp + x]!;
      const ru = height[rowUp + right]!;
      const lm = height[rowMid + left]!;
      const rm = height[rowMid + right]!;
      const ld = height[rowDown + left]!;
      const cd = height[rowDown + x]!;
      const rd = height[rowDown + right]!;

      const gx = ((ru + 2 * rm + rd) - (lu + 2 * lm + ld)) / 8;
      const gy = ((ld + 2 * cd + rd) - (lu + 2 * cu + ru)) / 8;

      outU[rowMid + x] = gx * scale;
      outV[rowMid + x] = gy * scale;
    }
  }
}

/** Wrapped bilinear read of a periodic float field. */
function sampleWrapped(field: Float32Array, size: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const xa = wrapIndex(x0, size);
  const xb = wrapIndex(x0 + 1, size);
  const ya = wrapIndex(y0, size) * size;
  const yb = wrapIndex(y0 + 1, size) * size;
  const top = field[ya + xa]! + (field[ya + xb]! - field[ya + xa]!) * fx;
  const bottom = field[yb + xa]! + (field[yb + xb]! - field[yb + xa]!) * fx;
  return top + (bottom - top) * fy;
}

// ---------------------------------------------------------------------------
// Shared micro detail - built once for the entire game
// ---------------------------------------------------------------------------

interface MicroDetailRaster {
  size: number;
  height: Float32Array;
  slopeU: Float32Array;
  slopeV: Float32Array;
  /** RGB micro albedo variation about mid-grey, A = micro height. */
  rgba: Uint8ClampedArray;
}

let microRaster: MicroDetailRaster | null = null;

/**
 * The shared micro-detail raster: aggregate tooth at a FIXED physical size of
 * 0.25 m, so it can be tiled at whatever frequency each surface needs without
 * its world scale drifting.
 *
 * Bands are Nyquist-budgeted against 256 px / 0.25 m = 0.98 mm/texel:
 * a 10-cell base (25.6 texels) with 2 octaves down to 20 cells (12.8 texels),
 * plus a 32-cell grain band (8.0 texels, 7.8 mm). Nothing finer is authored.
 */
export function sharedMicroDetailRaster(): MicroDetailRaster {
  if (microRaster) return microRaster;
  const size = MICRO_SIZE;
  const noise = createSurfaceNoise(0x4d1c_20a1 | 0);
  const height = new Float32Array(size * size);
  const rgba = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const bed = noise.fbm(u * 10, v * 10, 10, 2, 0.5);
      const grain = noise.noise(u * 32, v * 32, 32);
      const stone = 1 - noise.worley(u * 14, v * 14, 14);
      const h = Math.min(1, Math.max(0, bed * 0.5 + grain * 0.28 + stone * 0.22));
      const index = y * size + x;
      height[index] = h;
      // Micro albedo variation is stored about mid-grey and is DATA, never
      // colour - it must be sampled in NoColorSpace or a 0.5 reads back as
      // 0.21 linear and the (d - 0.5) term becomes a constant darkening tint.
      const variation = Math.round((0.5 + (h - 0.5) * 0.45) * 255);
      const offset = index * 4;
      rgba[offset] = variation;
      rgba[offset + 1] = variation;
      rgba[offset + 2] = variation;
      rgba[offset + 3] = Math.round(h * 255);
    }
  }

  const slopeU = new Float32Array(size * size);
  const slopeV = new Float32Array(size * size);
  sobelSlopes(height, size, MICRO_RELIEF_METRES / MICRO_TILE_METRES, slopeU, slopeV);

  microRaster = { size, height, slopeU, slopeV, rgba };
  return microRaster;
}

let macroRaster: Uint8ClampedArray | null = null;

/**
 * The shared 4-band macro variation raster: R very-low fbm, G warped blotches,
 * B mid fbm, A fine fbm. Sampled in WORLD space at a low repeat, it is what
 * stops a 12 m siding run or a [7, 5.4] hardpan plane reading as one flat
 * value at range. Linear data, never colour.
 */
export function sharedMacroVariationRaster(): Uint8ClampedArray {
  if (macroRaster) return macroRaster;
  const size = MACRO_SIZE;
  const noise = createSurfaceNoise(0x9a3b_71c5 | 0);
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(noise.fbm(u * 2, v * 2, 2, 2, 0.5) * 255);
      rgba[offset + 1] = Math.round(noise.warp(u * 3, v * 3, 3, 0.6) * 255);
      rgba[offset + 2] = Math.round(noise.fbm(u * 6, v * 6, 6, 2, 0.5) * 255);
      rgba[offset + 3] = Math.round(noise.fbm(u * 12, v * 12, 12, 2, 0.5) * 255);
    }
  }
  macroRaster = rgba;
  return macroRaster;
}

// ---------------------------------------------------------------------------
// Headless-safe canvas texture construction
// ---------------------------------------------------------------------------

let canvasSupport: boolean | null = null;

/**
 * True only when a real, readable 2D canvas exists. The parity audit's shimmed
 * context swallows draw calls, so we verify a written pixel actually reads
 * back rather than trusting `getContext('2d') !== null`.
 */
export function surfaceForgeCanvasAvailable(): boolean {
  if (canvasSupport !== null) return canvasSupport;
  canvasSupport = false;
  try {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (
      !context
      || typeof context.createImageData !== 'function'
      || typeof context.putImageData !== 'function'
      || typeof context.getImageData !== 'function'
    ) {
      return false;
    }
    const image = context.createImageData(1, 1);
    if (!image?.data || image.data.length < 4) return false;
    image.data[0] = 17;
    image.data[1] = 71;
    image.data[2] = 113;
    image.data[3] = 255;
    context.putImageData(image, 0, 0);
    const probe = context.getImageData(0, 0, 1, 1);
    canvasSupport = Boolean(
      probe?.data
      && probe.data.length >= 4
      && probe.data[0] === 17
      && probe.data[1] === 71
      && probe.data[2] === 113
      && probe.data[3] === 255,
    );
    return canvasSupport;
  } catch {
    canvasSupport = false;
    return false;
  }
}

function canvasTexture(
  name: string,
  rgba: Uint8ClampedArray,
  size: number,
  colorSpace: THREE.ColorSpace,
  repeat: readonly [number, number],
  anisotropy: number,
): THREE.CanvasTexture | null {
  try {
    if (!surfaceForgeCanvasAvailable()) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const image = context.createImageData(size, size);
    if (!image?.data || image.data.length !== rgba.length) return null;
    image.data.set(rgba);
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = name;
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rasterisation - the pure, always-available half
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255);
}

/**
 * Derives the micro repetition count from the surface's physical footprint so
 * the tooth keeps a fixed real-world size. Capped so one micro repeat never
 * gets fewer than 64 surface texels, which would alias the 8-texel grain band
 * into salt-and-pepper (extraction doc, "Nyquist discipline").
 */
function deriveMicroTiles(tileMetres: number, size: number): number {
  const ideal = Math.max(1, Math.round(tileMetres / MICRO_TILE_METRES));
  return Math.max(1, Math.min(ideal, Math.floor(size / 64) || 1));
}

/**
 * Turns one `SurfaceDescription` into four RGBA rasters plus the height field.
 * Pure CPU: no DOM, no renderer, never throws on a headless host.
 */
export function rasterizeSurface(
  description: SurfaceDescription,
  options: SurfaceForgeOptions = {},
): SurfaceRaster {
  const size = Math.max(4, Math.round(options.size ?? DEFAULT_SIZE));
  const seed = options.seed ?? DEFAULT_SURFACE_SEED;
  const tileMetres = Math.max(1e-4, options.tileMetres ?? DEFAULT_TILE_METRES);
  const reliefMetres = Math.max(0, options.reliefMetres ?? DEFAULT_RELIEF_METRES);
  const normalStrength = options.normalStrength ?? 1;
  const noise = createSurfaceNoise(seed);

  const texels = size * size;
  const albedo = new Uint8ClampedArray(texels * 4);
  const roughness = new Uint8ClampedArray(texels * 4);
  const ao = new Uint8ClampedArray(texels * 4);
  const normal = new Uint8ClampedArray(texels * 4);
  const height = new Float32Array(texels);
  const albedoLinearish = new Float32Array(texels * 3);
  const aoField = new Float32Array(texels);

  // Pass 1: evaluate the authored surface once per texel.
  for (let y = 0; y < size; y += 1) {
    const v = 1 - (y + 0.5) / size;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const index = y * size + x;
      const sample = description(u, v, noise);
      height[index] = clamp01(sample.height);
      albedoLinearish[index * 3] = clamp01(sample.albedo[0]);
      albedoLinearish[index * 3 + 1] = clamp01(sample.albedo[1]);
      albedoLinearish[index * 3 + 2] = clamp01(sample.albedo[2]);
      aoField[index] = clamp01(sample.ao ?? 1);
      const offset = index * 4;
      roughness[offset] = toByte(sample.roughness);
      roughness[offset + 1] = roughness[offset]!;
      roughness[offset + 2] = roughness[offset]!;
      roughness[offset + 3] = 255;
    }
  }

  // Pass 2: macro slope from the height field.
  const slopeU = new Float32Array(texels);
  const slopeV = new Float32Array(texels);
  sobelSlopes(height, size, (reliefMetres / tileMetres) * normalStrength, slopeU, slopeV);

  // Pass 3: fold in the shared micro layer, then encode.
  const micro = options.micro === false ? null : (options.micro ?? {});
  const microTiles = micro ? (micro.tiles ?? deriveMicroTiles(tileMetres, size)) : 0;
  const microStrength = micro ? (micro.strength ?? 0.85) : 0;
  const microAo = micro ? (micro.aoAmount ?? 0.22) : 0;
  const microAlbedo = micro ? (micro.albedoAmount ?? 0.07) : 0;
  const detail = micro && microTiles > 0 ? sharedMicroDetailRaster() : null;
  const microScale = detail ? (microTiles * detail.size) / size : 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const offset = index * 4;

      let du = slopeU[index]!;
      let dv = slopeV[index]!;
      let occlusion = aoField[index]!;
      let tint = 1;

      if (detail) {
        const mx = (x + 0.5) * microScale - 0.5;
        const my = (y + 0.5) * microScale - 0.5;
        du += sampleWrapped(detail.slopeU, detail.size, mx, my) * microStrength;
        dv += sampleWrapped(detail.slopeV, detail.size, mx, my) * microStrength;
        const microHeight = sampleWrapped(detail.height, detail.size, mx, my);
        // Micro relief darkens the cavity term so the aggregate reads as depth
        // rather than as a wash, and speckles albedo by the same field.
        occlusion *= 1 - microAo * (1 - microHeight);
        tint = 1 + microAlbedo * (microHeight - 0.5) * 2;
      }

      albedo[offset] = toByte(albedoLinearish[index * 3]! * tint);
      albedo[offset + 1] = toByte(albedoLinearish[index * 3 + 1]! * tint);
      albedo[offset + 2] = toByte(albedoLinearish[index * 3 + 2]! * tint);
      albedo[offset + 3] = 255;

      ao[offset] = toByte(occlusion);
      ao[offset + 1] = ao[offset]!;
      ao[offset + 2] = ao[offset]!;
      ao[offset + 3] = 255;

      // Tangent-space (OpenGL) normal. dv is canvas-down; flipY = true makes
      // texture v increase upward, so -dH/dv is +dv here.
      const inverse = 1 / Math.hypot(du, dv, 1);
      normal[offset] = Math.round((-du * inverse * 0.5 + 0.5) * 255);
      normal[offset + 1] = Math.round((dv * inverse * 0.5 + 0.5) * 255);
      normal[offset + 2] = Math.round((inverse * 0.5 + 0.5) * 255);
      normal[offset + 3] = 255;
    }
  }

  return { size, albedo, normal, roughness, ao, height, microTiles };
}

// ---------------------------------------------------------------------------
// The forge: cached, headless-safe texture sets
// ---------------------------------------------------------------------------

const surfaceCache = new Map<string, ForgedSurface>();

function unavailableSurface(name: string, size: number, tileMetres: number, reliefRatio: number): ForgedSurface {
  return Object.freeze({
    name,
    size,
    available: false,
    map: null,
    normalMap: null,
    roughnessMap: null,
    aoMap: null,
    reliefRatio,
    tileMetres,
  });
}

/**
 * Forges the full PBR set for one authored surface, cached by `name`.
 *
 * Repeat calls with the same name return the IDENTICAL object, so callers may
 * forge freely at build time; the name must therefore be unique per
 * (description, options) pair, exactly like the `textureCache` key discipline
 * in src/test-maps-art.ts:34.
 *
 * On a headless host every map is null and `available` is false: callers must
 * fall back to a flat colour. This function never throws.
 */
export function forgeSurface(
  name: string,
  description: SurfaceDescription,
  options: SurfaceForgeOptions = {},
): ForgedSurface {
  const cached = surfaceCache.get(name);
  if (cached) return cached;

  const size = Math.max(4, Math.round(options.size ?? DEFAULT_SIZE));
  const tileMetres = Math.max(1e-4, options.tileMetres ?? DEFAULT_TILE_METRES);
  const reliefMetres = Math.max(0, options.reliefMetres ?? DEFAULT_RELIEF_METRES);
  const reliefRatio = reliefMetres / tileMetres;
  const repeat = options.repeat ?? ([1, 1] as const);
  const anisotropy = options.anisotropy ?? 4;

  // Probe BEFORE rasterising: the parity audit and the vitest suites build
  // every arena headless and must not pay for a bake nobody can see.
  if (!surfaceForgeCanvasAvailable()) {
    const empty = unavailableSurface(name, size, tileMetres, reliefRatio);
    surfaceCache.set(name, empty);
    return empty;
  }

  let forged: ForgedSurface;
  try {
    const raster = rasterizeSurface(description, options);
    const map = canvasTexture(`${name}-albedo`, raster.albedo, size, THREE.SRGBColorSpace, repeat, anisotropy);
    const normalMap = canvasTexture(`${name}-normal`, raster.normal, size, THREE.NoColorSpace, repeat, anisotropy);
    const roughnessMap = canvasTexture(`${name}-roughness`, raster.roughness, size, THREE.NoColorSpace, repeat, anisotropy);
    const aoMap = canvasTexture(`${name}-ao`, raster.ao, size, THREE.NoColorSpace, repeat, anisotropy);
    forged = Object.freeze({
      name,
      size,
      available: map !== null,
      map,
      normalMap,
      roughnessMap,
      aoMap,
      reliefRatio,
      tileMetres,
    });
  } catch {
    forged = unavailableSurface(name, size, tileMetres, reliefRatio);
  }

  surfaceCache.set(name, forged);
  return forged;
}

/** The two shared maps for the whole game. Null-safe and built at most once. */
export interface SharedSurfaceMaps {
  /** Micro tooth: RGB variation about mid-grey, A = height. NoColorSpace. */
  readonly microDetailMap: THREE.CanvasTexture | null;
  /** 4-band low-frequency variation. NoColorSpace. */
  readonly macroVariationMap: THREE.CanvasTexture | null;
  /** Repeat that gives the micro map its authored 0.25 m footprint. */
  readonly microRepeatFor: (tileMetres: number) => number;
}

let sharedMaps: SharedSurfaceMaps | null = null;

/**
 * Two textures for the entire game, not two per surface.
 *
 * The micro layer is ALSO baked into every forged normal and AO map (see
 * `rasterizeSurface`), because MeshStandardMaterial has a single normalMap
 * slot and cannot blend two tangent normals - that bake is what puts close-up
 * tooth on screen today. These textures expose the same two shared sources for
 * callers that can bind them directly (a second UV layer, or a future
 * MeshStandardNodeMaterial `normalNode`/`colorNode` path).
 */
export function sharedSurfaceMaps(): SharedSurfaceMaps {
  if (sharedMaps) return sharedMaps;
  let microDetailMap: THREE.CanvasTexture | null = null;
  let macroVariationMap: THREE.CanvasTexture | null = null;
  if (surfaceForgeCanvasAvailable()) {
    const detail = sharedMicroDetailRaster();
    microDetailMap = canvasTexture('surface-forge-micro-detail', detail.rgba, detail.size, THREE.NoColorSpace, [1, 1], 4);
    macroVariationMap = canvasTexture('surface-forge-macro-variation', sharedMacroVariationRaster(), MACRO_SIZE, THREE.NoColorSpace, [1, 1], 1);
  }
  sharedMaps = Object.freeze({
    microDetailMap,
    macroVariationMap,
    microRepeatFor: (tileMetres: number) => Math.max(1, Math.round(tileMetres / MICRO_TILE_METRES)),
  });
  return sharedMaps;
}

// ---------------------------------------------------------------------------
// Material helper
// ---------------------------------------------------------------------------

export interface SurfaceMaterialOptions {
  /** Flat colour used when the forge is unavailable, and as the map tint. */
  color?: THREE.ColorRepresentation;
  /** Base roughness, used when the surface has no roughness map. */
  roughness?: number;
  metalness?: number;
  /** Tangent normal scale. Relief is already physical; this is artistic. */
  normalScale?: number;
  aoMapIntensity?: number;
  side?: THREE.Side;
  /**
   * Overrides the repeat on every map in the set. Because a forged set is
   * cached by name and its textures are shared, all users of a given surface
   * name must agree on the repeat - prefer setting it once via
   * `SurfaceForgeOptions.repeat`.
   */
  repeat?: readonly [number, number];
}

/**
 * Builds a MeshStandardMaterial from a forged set with the correct colour
 * spaces already carried by the textures (albedo sRGB; normal, roughness and
 * AO in NoColorSpace) and one repeat across every map.
 *
 * When the set is unavailable the material is a plain flat colour, which is
 * the headless / parity-audit path.
 */
export function surfaceStandardMaterial(
  forged: ForgedSurface,
  options: SurfaceMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? 0xffffff,
    roughness: options.roughness ?? 0.9,
    metalness: options.metalness ?? 0,
    side: options.side ?? THREE.FrontSide,
  });
  material.name = `${forged.name}-standard`;

  const repeat = options.repeat;
  const apply = (texture: THREE.Texture | null): void => {
    if (!texture || !repeat) return;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.needsUpdate = true;
  };

  if (forged.map) {
    material.map = forged.map;
    apply(forged.map);
  }
  if (forged.normalMap) {
    material.normalMap = forged.normalMap;
    material.normalScale = new THREE.Vector2(options.normalScale ?? 1, options.normalScale ?? 1);
    apply(forged.normalMap);
  }
  if (forged.roughnessMap) {
    material.roughnessMap = forged.roughnessMap;
    // The map MULTIPLIES material.roughness, so the scalar must be 1 or the
    // authored roughness field is scaled away.
    material.roughness = 1;
    apply(forged.roughnessMap);
  }
  if (forged.aoMap) {
    material.aoMap = forged.aoMap;
    material.aoMapIntensity = options.aoMapIntensity ?? 1;
    apply(forged.aoMap);
  }
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------------------
// Diagnostics and lifecycle
// ---------------------------------------------------------------------------

/**
 * Nyquist budget for a surface, so an author can check a band before shipping
 * it. Keep every authored feature at or above ~5 texels per cycle; anything
 * finer bakes as white noise at mip 0 and flat grey by mip 1.
 */
export function surfaceTexelBudget(options: SurfaceForgeOptions = {}): {
  size: number;
  tileMetres: number;
  millimetresPerTexel: number;
  texelsPerCell: (cells: number) => number;
} {
  const size = Math.max(4, Math.round(options.size ?? DEFAULT_SIZE));
  const tileMetres = Math.max(1e-4, options.tileMetres ?? DEFAULT_TILE_METRES);
  return {
    size,
    tileMetres,
    millimetresPerTexel: (tileMetres * 1000) / size,
    texelsPerCell: (cells: number) => size / Math.max(1, cells),
  };
}

/** Drops every cached set and disposes its textures. For tests and teardown. */
export function disposeSurfaceForge(): void {
  for (const forged of surfaceCache.values()) {
    forged.map?.dispose();
    forged.normalMap?.dispose();
    forged.roughnessMap?.dispose();
    forged.aoMap?.dispose();
  }
  surfaceCache.clear();
  sharedMaps?.microDetailMap?.dispose();
  sharedMaps?.macroVariationMap?.dispose();
  sharedMaps = null;
  microRaster = null;
  macroRaster = null;
  canvasSupport = null;
}
