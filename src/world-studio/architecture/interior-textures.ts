/**
 * HF-571 world-studio architecture: interior floor generators.
 *
 * The shared forge (`src/forge/textures`) covers the exterior families. Interiors need two
 * surfaces it does not have - polished terrazzo and loop-pile carpet - so this lane authors
 * them locally against the same primitives and the same rules: pure TypeScript over typed
 * arrays, deterministic from a seed, tileable on the torus, row 0 is v = 1 (the top of the
 * tile) and heights are authored in millimetres.
 *
 * Nothing here touches the shared forge; `materials.ts` consumes these sets exactly the way
 * it consumes a forge family.
 */

import { fieldAt, hash2u, smoothstep, tileableSpeckle, tileableValueNoiseAniso } from '../../forge/textures/noise';
import { normalFromHeight } from '../../forge/textures/normalFromHeight';

export type StudioTextureFamily = 'terrazzo' | 'carpet';

export type StudioTextureSet = Readonly<{
  size: number;
  seed: number;
  metresPerTile: number;
  albedo: Uint8ClampedArray;
  normal: Uint8ClampedArray;
  roughness: Uint8ClampedArray;
}>;

export const TERRAZZO_METRES_PER_TILE = 1.2;
export const CARPET_METRES_PER_TILE = 0.8;

function srgbEncode(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

type Shader = (x: number, y: number, out: Float64Array) => void;

/** Shared render loop: display-space rgb + roughness + height in mm per texel. */
function render(
  size: number,
  seed: number,
  metresPerTile: number,
  normalStrength: number,
  shader: Shader,
): StudioTextureSet {
  const albedo = new Uint8ClampedArray(size * size * 4);
  const roughness = new Uint8ClampedArray(size * size);
  const heightMm = new Float32Array(size * size);
  const out = new Float64Array(5);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      shader(x, y, out);
      const index = y * size + x;
      albedo[index * 4] = Math.round(srgbEncode(out[0]) * 255);
      albedo[index * 4 + 1] = Math.round(srgbEncode(out[1]) * 255);
      albedo[index * 4 + 2] = Math.round(srgbEncode(out[2]) * 255);
      albedo[index * 4 + 3] = 255;
      roughness[index] = Math.round(Math.max(0, Math.min(1, out[3])) * 255);
      heightMm[index] = out[4];
    }
  }
  const normal = normalFromHeight(heightMm, size, (metresPerTile * 1000) / size, normalStrength);
  return { size, seed, metresPerTile, albedo, normal: normal.rgba, roughness };
}

/** Nearest jittered cell centre on the torus: the aggregate chips of a terrazzo pour. */
function voronoi(x: number, y: number, cells: number, size: number, seed: number): { distance: number; id: number } {
  const scale = cells / size;
  const fx = x * scale;
  const fy = y * scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let best = Number.POSITIVE_INFINITY;
  let bestId = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = ix + ox;
      const cy = iy + oy;
      const wx = ((cx % cells) + cells) % cells;
      const wy = ((cy % cells) + cells) % cells;
      const jx = cx + hash2u(wx, wy, seed);
      const jy = cy + hash2u(wx, wy, seed + 91);
      const dx = fx - jx;
      const dy = fy - jy;
      const distance = dx * dx + dy * dy;
      if (distance < best) {
        best = distance;
        bestId = wy * cells + wx;
      }
    }
  }
  return { distance: Math.sqrt(best), id: bestId };
}

/**
 * Polished terrazzo: warm cream matrix, three chip tones at roughly 20 mm, and brass divider
 * strips on a 600 mm grid. Chips are nearly flush; the dividers stand 0.3 mm proud, which is
 * what gives the floor its grazing-light read under root's sun.
 */
export function generateTerrazzo(size = 512, seed = 571): StudioTextureSet {
  const metresPerTile = TERRAZZO_METRES_PER_TILE;
  const tileMm = metresPerTile * 1000;
  const chipCells = Math.max(4, Math.round(tileMm / 20));
  const dividerMm = 600;
  const speckle = tileableSpeckle(size, seed * 17 + 3);
  const grime = tileableValueNoiseAniso(size, 6, 6, seed * 23 + 7);
  const mmPerPx = tileMm / size;

  const shader: Shader = (x, y, out) => {
    const cell = voronoi(x, y, chipCells, size, seed);
    const tone = hash2u(cell.id % chipCells, Math.floor(cell.id / chipCells), seed * 31 + 5);
    const s = fieldAt(speckle, size, x, y);
    // Matrix.
    let r = 0.6;
    let g = 0.565;
    let b = 0.505;
    let rough = 0.32;
    let height = (s - 0.5) * 0.04;

    // Chips occupy the cell interior; the matrix shows through at the cell edges.
    const chip = 1 - smoothstep(0.26, 0.42, cell.distance);
    if (chip > 0) {
      let cr = 0.72;
      let cg = 0.68;
      let cb = 0.62;
      if (tone > 0.82) {
        cr = 0.24; cg = 0.235; cb = 0.23;
      } else if (tone > 0.62) {
        cr = 0.52; cg = 0.3; cb = 0.24;
      } else if (tone > 0.4) {
        cr = 0.36; cg = 0.45; cb = 0.42;
      }
      const jitter = (hash2u(cell.id % chipCells, Math.floor(cell.id / chipCells), seed * 53 + 11) - 0.5) * 0.1;
      r = r * (1 - chip) + (cr + jitter) * chip;
      g = g * (1 - chip) + (cg + jitter) * chip;
      b = b * (1 - chip) + (cb + jitter) * chip;
      rough -= 0.06 * chip;
      height += 0.05 * chip;
    }

    // Brass divider strips on the 600 mm grid, measured on the torus so the tile wraps.
    const xMm = x * mmPerPx;
    const yMm = y * mmPerPx;
    const dx = Math.min(xMm % dividerMm, dividerMm - (xMm % dividerMm));
    const dy = Math.min(yMm % dividerMm, dividerMm - (yMm % dividerMm));
    const divider = Math.max(1 - smoothstep(1.5, 4, dx), 1 - smoothstep(1.5, 4, dy));
    if (divider > 0) {
      r = r * (1 - divider) + 0.58 * divider;
      g = g * (1 - divider) + 0.46 * divider;
      b = b * (1 - divider) + 0.2 * divider;
      rough = rough * (1 - divider) + 0.22 * divider;
      height += 0.3 * divider;
    }

    // Traffic wear: a broad dull field where the polish has gone off.
    const worn = smoothstep(0.55, 0.85, fieldAt(grime, size, x, y));
    rough += 0.22 * worn;
    r *= 1 - 0.05 * worn;
    g *= 1 - 0.05 * worn;
    b *= 1 - 0.04 * worn;

    out[0] = r;
    out[1] = g;
    out[2] = b;
    out[3] = rough;
    out[4] = height;
  };

  return render(size, seed, metresPerTile, 0.55, shader);
}

/**
 * Loop-pile carpet: fibre noise elongated along the pile direction (running with +u), a
 * coarse tuft period near 6 mm, and a very high, slightly varying roughness. Height carries
 * the tuft relief so grazing light picks up the pile rather than looking like painted board.
 */
export function generateCarpet(size = 512, seed = 571): StudioTextureSet {
  const metresPerTile = CARPET_METRES_PER_TILE;
  const tileMm = metresPerTile * 1000;
  const tuftCells = Math.max(4, Math.round(tileMm / 6));
  const tufts = tileableValueNoiseAniso(size, tuftCells, Math.max(4, Math.round(tuftCells / 2)), seed * 13 + 9);
  const fibre = tileableValueNoiseAniso(size, Math.max(4, Math.round(tileMm / 2.5)), 8, seed * 29 + 4);
  const patch = tileableValueNoiseAniso(size, 4, 4, seed * 41 + 6);
  const speckle = tileableSpeckle(size, seed * 7 + 19);

  const shader: Shader = (x, y, out) => {
    const tuft = fieldAt(tufts, size, x, y);
    const strand = fieldAt(fibre, size, x, y);
    const blotch = fieldAt(patch, size, x, y);
    const s = fieldAt(speckle, size, x, y);
    const shade = 0.52 + (tuft - 0.5) * 0.16 + (strand - 0.5) * 0.09 + (blotch - 0.5) * 0.05 + (s - 0.5) * 0.05;
    out[0] = shade * 1.04;
    out[1] = shade * 0.97;
    out[2] = shade * 0.86;
    out[3] = 0.94 + (tuft - 0.5) * 0.05;
    out[4] = (tuft - 0.5) * 1.6 + (strand - 0.5) * 0.5;
  };

  return render(size, seed, metresPerTile, 0.9, shader);
}

export function generateStudioTextureSet(family: StudioTextureFamily, size = 512, seed = 571): StudioTextureSet {
  return family === 'terrazzo' ? generateTerrazzo(size, seed) : generateCarpet(size, seed);
}
