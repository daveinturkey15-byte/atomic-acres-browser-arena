/**
 * Deterministic, exactly-tileable value noise for the Atomic Acres texture forge (HF-536).
 *
 * Rules honoured here (ART-FORGE-RULESET 1.1, photoreal-procedural-scene-forge skill):
 * - Every noise period is an INTEGER number of lattice cells across the tile. A fractional
 *   period yields NaN and turns every map black; `assertIntegerPeriod` throws instead.
 * - Sampling uses u = (x * cells) / size with integer x, so u(x + size) = u(x) + cells
 *   exactly in float64 (integer multiply is exact, dividing by a power of two is exact).
 *   Lattice lookups wrap with modulo, therefore field(x + size) === field(x) bit-exact.
 * - No Math.random anywhere: same seed -> byte-identical output.
 */

/** 32-bit integer hash of two lattice coordinates plus a seed, mapped to [0, 1). */
export function hash2u(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Throws unless the lattice period is a positive integer (fractional period = NaN = black). */
export function assertIntegerPeriod(cells: number, what: string): void {
  if (!Number.isInteger(cells) || cells < 1) {
    throw new Error(`texture forge: ${what} must be a positive integer period, got ${cells}`);
  }
}

/** Throws unless the tile is a power-of-two size (fast wrap via x & (size - 1)). */
export function assertPowerOfTwoSize(size: number): void {
  if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) {
    throw new Error(`texture forge: size must be a power of two >= 2, got ${size}`);
  }
}

/**
 * Tileable value noise: `cells` x `cells` lattice over the tile, quintic interpolation.
 * Output in [0, 1), length size * size, row-major. Wraps at all four edges by construction.
 */
export function tileableValueNoise(size: number, cells: number, seed: number): Float32Array {
  assertPowerOfTwoSize(size);
  assertIntegerPeriod(cells, 'value-noise cells');
  const out = new Float32Array(size * size);
  const lattice = new Float32Array(cells * cells);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      lattice[y * cells + x] = hash2u(x, y, seed);
    }
  }
  for (let y = 0; y < size; y++) {
    const v = (y * cells) / size;
    const iy = Math.floor(v);
    const fy = v - iy;
    const row0 = (iy % cells) * cells;
    const row1 = ((iy + 1) % cells) * cells;
    const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const outRow = y * size;
    for (let x = 0; x < size; x++) {
      const u = (x * cells) / size;
      const ix = Math.floor(u);
      const fx = u - ix;
      const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
      const a = lattice[row0 + (ix % cells)];
      const b = lattice[row0 + ((ix + 1) % cells)];
      const c = lattice[row1 + (ix % cells)];
      const d = lattice[row1 + ((ix + 1) % cells)];
      out[outRow + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

/** Hermite smoothstep from 0 at edge0 to 1 at edge1 (edge0 < edge1). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Tileable anisotropic value noise: independent integer periods along u and v.
 * Used for wood grain ridges elongated along a siding course.
 */
export function tileableValueNoiseAniso(
  size: number,
  cellsU: number,
  cellsV: number,
  seed: number,
): Float32Array {
  assertPowerOfTwoSize(size);
  assertIntegerPeriod(cellsU, 'aniso cellsU');
  assertIntegerPeriod(cellsV, 'aniso cellsV');
  const out = new Float32Array(size * size);
  const lattice = new Float32Array(cellsU * cellsV);
  for (let y = 0; y < cellsV; y++) {
    for (let x = 0; x < cellsU; x++) {
      lattice[y * cellsU + x] = hash2u(x, y, seed);
    }
  }
  for (let y = 0; y < size; y++) {
    const v = (y * cellsV) / size;
    const iy = Math.floor(v);
    const fy = v - iy;
    const row0 = (iy % cellsV) * cellsU;
    const row1 = ((iy + 1) % cellsV) * cellsU;
    const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const outRow = y * size;
    for (let x = 0; x < size; x++) {
      const u = (x * cellsU) / size;
      const ix = Math.floor(u);
      const fx = u - ix;
      const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
      const a = lattice[row0 + (ix % cellsU)];
      const b = lattice[row0 + ((ix + 1) % cellsU)];
      const c = lattice[row1 + (ix % cellsU)];
      const d = lattice[row1 + ((ix + 1) % cellsU)];
      out[outRow + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

/**
 * Tileable fractal Brownian motion on `tileableValueNoise`. Octave o uses cells * 2^o
 * (still an integer period, so every octave wraps). Octaves whose lattice is finer than
 * ~3 px per cell are skipped: they alias to per-pixel noise and only cost time.
 * Output normalised to [0, 1).
 */
export function tileableFbm(
  size: number,
  cells: number,
  octaves: number,
  seed: number,
  gain = 0.5,
): Float32Array {
  assertIntegerPeriod(cells, 'fbm base cells');
  const out = new Float32Array(size * size);
  let amplitude = 1;
  let total = 0;
  let octaveCells = cells;
  for (let octave = 0; octave < octaves; octave++) {
    if (octave > 0 && size / octaveCells < 3) break;
    const noise = tileableValueNoise(size, octaveCells, seed + octave * 1013);
    for (let i = 0; i < out.length; i++) out[i] += amplitude * noise[i];
    total += amplitude;
    amplitude *= gain;
    octaveCells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/**
 * Per-pixel speckle: the sub-pixel grain carrier. When the authored grain (0.5-1.5 mm)
 * is smaller than a texel, lattice noise would alias anyway; a per-pixel hash IS the
 * honest rendering of sub-texel aggregate. Period is `size` pixels (integer), so it wraps.
 */
export function tileableSpeckle(size: number, seed: number): Float32Array {
  assertPowerOfTwoSize(size);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[y * size + x] = hash2u(x, y, seed);
    }
  }
  return out;
}

/** Nearest cell of `valueNoise`-style field at arbitrary (possibly negative) pixel coords. */
export function fieldAt(field: Float32Array, size: number, x: number, y: number): number {
  const mask = size - 1;
  return field[(y & mask) * size + (x & mask)];
}
