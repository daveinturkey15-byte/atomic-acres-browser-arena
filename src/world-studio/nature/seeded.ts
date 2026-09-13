/**
 * seeded.ts — deterministic number sources for the world-studio nature lane.
 *
 * Every placement, texture texel and terrain sample in this folder derives
 * from these functions with fixed seeds, so every peer and every build gets
 * the same surround. No Math.random anywhere in the lane.
 */

/** mulberry32 stream — the same idiom the grass field and forest ring use. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer-lattice hash in [0, 1). Pure function of (ix, iy, seed). */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (seed | 0) * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Value noise in [-1, 1]. `period` (optional) wraps the lattice so a texture
 * sampled over one period tiles seamlessly; it MUST be an integer — a
 * fractional period yields a seam, so it is asserted here.
 */
export function valueNoise2(x: number, y: number, seed: number, period?: number): number {
  if (period !== undefined && !Number.isInteger(period)) {
    throw new Error(`valueNoise2: period must be an integer, got ${period}`);
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const wrap = (v: number): number => (period === undefined ? v : ((v % period) + period) % period);
  const a = hash2(wrap(x0), wrap(y0), seed);
  const b = hash2(wrap(x0 + 1), wrap(y0), seed);
  const c = hash2(wrap(x0), wrap(y0 + 1), seed);
  const d = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return (top + (bottom - top) * fy) * 2 - 1;
}

/** Fractal Brownian motion of valueNoise2, normalised to roughly [-1, 1]. */
export function fbm2(
  x: number,
  y: number,
  octaves: number,
  seed: number,
  period?: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    const p = period === undefined ? undefined : period * freq;
    sum += valueNoise2(x * freq, y * freq, seed + o * 101, p) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1]: sharp crests, soft valleys — mountain skylines. */
export function ridged2(x: number, y: number, octaves: number, seed: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let weight = 1;
  for (let o = 0; o < octaves; o += 1) {
    let n = 1 - Math.abs(valueNoise2(x * freq, y * freq, seed + o * 37));
    n *= n * weight;
    weight = Math.min(1, Math.max(0, n * 2));
    sum += n * amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return Math.min(1, sum);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep(e0: number, e1: number, v: number): number {
  return smooth(clamp01((v - e0) / (e1 - e0)));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
