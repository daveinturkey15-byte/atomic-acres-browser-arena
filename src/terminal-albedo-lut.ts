/**
 * terminal-albedo-lut.ts — skyline-terminal look pass: one shared, CPU-generated,
 * tileable value-noise table for albedo variation on the terminal's largest flat
 * surfaces (tarmac, concourse floor, walls).
 *
 * PATTERN REUSED, NOT VENDORED. This is the same pattern as
 * `src/nuketown2-materials/noise-lut.ts` on
 * `origin/contrib/dave-gaming-pc/claude/perf-hitl5` (read with `git show`,
 * re-implemented here for a CPU-canvas consumer): a deterministic integer-lattice
 * value-noise field generated once, shared by every material, tileable under
 * repeat because every octave period is an integer. The nuketown2 tile feeds a
 * TSL `texture()` node per fragment; the terminal's surfaces are classic
 * `MeshStandardMaterial` + `CanvasTexture`, so this module feeds the canvas
 * painter instead — sampled on the CPU at arena-build time, baked into the
 * texture, zero per-frame cost, no new render pipeline.
 *
 * WHY ALBEDO AND WHY THESE THREE. The Pass 60 reskin left the tarmac, the
 * terrazzo floor and the panel walls as single flat swatches with only a
 * geometric speckle/line pattern. A photograph shows tonal drift at metre
 * scale on every one of them, and one flat value across a 76 m apron is a CG
 * tell. The variation is SMALL on purpose: these are clean, maintained
 * surfaces, not weathered Nuke Town asphalt.
 */

/** LUT edge in texels. Small: it carries metre-scale drift, not grain. */
export const TERMINAL_ALBEDO_LUT_SIZE = 256;
/** Base-octave lattice cells across the tile. Integer, so the tile repeats. */
export const TERMINAL_ALBEDO_LUT_CELLS = 32;

/**
 * UNIFORM STRENGTH. The one knob, shared by every terminal surface that takes
 * albedo variation: peak albedo multiplier swing is +/- this fraction. 0.07
 * keeps the full swing (14% peak-to-peak on the largest apron) clearly visible
 * against a flat swatch without touching the readability ceiling — variation
 * multiplies the authored colour, it never darkens toward a hiding place.
 */
export const TERMINAL_ALBEDO_VARIATION_STRENGTH = 0.07;

/** Deterministic hash of an integer lattice point to [0, 1). */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smoothstep-interpolated value noise on a lattice wrapping every `period`. */
function valueNoise(x: number, y: number, period: number): number {
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
  const a = hash(x0, y0);
  const b = hash(x1, y0);
  const c = hash(x0, y1);
  const d = hash(x1, y1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

/** Fill the tile. Pure, deterministic; runs once. */
export function generateTerminalAlbedoLutData(
  size = TERMINAL_ALBEDO_LUT_SIZE,
  cells = TERMINAL_ALBEDO_LUT_CELLS,
): Uint8Array {
  const data = new Uint8Array(size * size);
  const cellsPerTexel = cells / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Two octaves of fBm: the base drift plus one doubling for edge breakup.
      const px = x * cellsPerTexel;
      const py = y * cellsPerTexel;
      const coarse = valueNoise(px, py, cells);
      const fine = valueNoise(px * 2, py * 2, cells * 2);
      data[y * size + x] = Math.round((coarse * 0.65 + fine * 0.35) * 255);
    }
  }
  return data;
}

let shared: Uint8Array | null = null;

/** The one shared table. Built on first use; never rebuilt. */
export function terminalAlbedoLut(): Uint8Array {
  if (shared) return shared;
  shared = generateTerminalAlbedoLutData();
  return shared;
}

/** Test seam: drop the shared table so a test can prove it is rebuilt lazily. */
export function resetTerminalAlbedoLutForTests(): void {
  shared = null;
}

/**
 * Sample the table at UV in [0, 1), with repeat. Returns [0, 1].
 * Nearest-sample: the table is 8 texels per lattice cell, so the smoothstep
 * interpolant baked into it already reads as continuous drift at canvas scale.
 */
export function sampleTerminalAlbedo(u: number, v: number, size = TERMINAL_ALBEDO_LUT_SIZE): number {
  const lut = terminalAlbedoLut();
  const x = ((Math.floor(u * size) % size) + size) % size;
  const y = ((Math.floor(v * size) % size) + size) % size;
  return lut[y * size + x]! / 255;
}

/**
 * Albedo multiplier for a noise sample: 1 +/- strength, centred. Pure, so the
 * canvas painter and the unit test share exactly this expression.
 */
export function terminalAlbedoMultiplier(
  noise01: number,
  strength = TERMINAL_ALBEDO_VARIATION_STRENGTH,
): number {
  return 1 + (noise01 * 2 - 1) * strength;
}
