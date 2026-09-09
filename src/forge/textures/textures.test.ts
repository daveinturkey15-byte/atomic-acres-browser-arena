/**
 * Mechanical proof suite for the procedural texture forge (HF-536).
 *
 * Every claim is measured here, in Node, against the generated buffers:
 * - Wrap: the built-in shader wrap gate runs on every generation (left==right,
 *   top==bottom within 1/255), and the neighbouring tile rendered at pixel origin
 *   (size, size) must be BYTE-IDENTICAL - the strongest seam proof.
 * - Albedo statistics inside per-family authored bands (measured, then pinned).
 * - Authored feature-scale bands from ART-FORGE-RULESET 1.1: grain 0.5-1.5 mm,
 *   scuff 20-80 mm, traffic 0.5-3 m; headline features produce >= 10 % albedo steps.
 * - Normal map unit-length and mostly +Z; determinism; 512-by-parameter; timing.
 */

import { describe, expect, it } from 'vitest';
import { generateTextureSet, TEXTURE_FAMILIES } from './index';
import { tileableValueNoise } from './noise';
import { assertBuffersEqual } from './tile';
import type { TextureFamily, TextureSet } from './types';

const STAT_SIZE = 256;
const WRAP_SIZE = 512;
const TIMING_SIZE = 1024;
const TIMING_BUDGET_MS = 400;

function lumaStats(set: TextureSet): { mean: number; sd: number } {
  const n = set.size * set.size;
  const lum = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const l =
      (0.2126 * set.albedo[i * 4] + 0.7152 * set.albedo[i * 4 + 1] + 0.0722 * set.albedo[i * 4 + 2]) / 255;
    lum[i] = l;
    sum += l;
  }
  const mean = sum / n;
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += (lum[i] - mean) ** 2;
  return { mean, sd: Math.sqrt(sumSq / n) };
}

function meanLumaWhere(set: TextureSet, predicate: (px: number, py: number) => boolean): number {
  let sum = 0;
  let count = 0;
  for (let py = 0; py < set.size; py++) {
    for (let px = 0; px < set.size; px++) {
      if (predicate(px, py)) {
        const i = py * set.size + px;
        sum += (0.2126 * set.albedo[i * 4] + 0.7152 * set.albedo[i * 4 + 1] + 0.0722 * set.albedo[i * 4 + 2]) / 255;
        count++;
      }
    }
  }
  expect(count).toBeGreaterThan(200);
  return sum / count;
}

function meanRoughnessWhere(set: TextureSet, predicate: (px: number, py: number) => boolean): number {
  let sum = 0;
  let count = 0;
  for (let py = 0; py < set.size; py++) {
    for (let px = 0; px < set.size; px++) {
      if (predicate(px, py)) {
        sum += set.roughness[py * set.size + px] / 255;
        count++;
      }
    }
  }
  expect(count).toBeGreaterThan(200);
  return sum / count;
}

/** yLocal inside a course of the given pitch, measured from the tile top (row 0 = v=1). */
function localMm(set: TextureSet, py: number, pitchMm: number): number {
  return ((py * set.mmPerPx) % pitchMm + pitchMm) % pitchMm;
}

const ALBEDO_BANDS: Record<TextureFamily, { mean: [number, number]; sd: [number, number] }> = {
  asphalt: { mean: [0.23, 0.28], sd: [0.035, 0.055] },
  brick: { mean: [0.39, 0.45], sd: [0.045, 0.07] },
  lapSiding: { mean: [0.6, 0.69], sd: [0.055, 0.085] },
  shingle: { mean: [0.24, 0.29], sd: [0.02, 0.038] },
  concrete: { mean: [0.54, 0.6], sd: [0.015, 0.032] },
};

const statSets = new Map<TextureFamily, TextureSet>();
function statSet(family: TextureFamily): TextureSet {
  let set = statSets.get(family);
  if (!set) {
    set = generateTextureSet(family, { size: STAT_SIZE, seed: 1 });
    statSets.set(family, set);
  }
  return set;
}

describe('HF-536 texture forge: wrap proof', () => {
  it('generates every family without tripping the shader wrap gate (left==right, top==bottom, 1/255)', () => {
    for (const family of TEXTURE_FAMILIES) {
      expect(() => generateTextureSet(family, { size: WRAP_SIZE, seed: 3 })).not.toThrow();
    }
  });
  it('renders the neighbouring tile (origin size,size) byte-identically for every family', () => {

    for (const family of TEXTURE_FAMILIES) {
      const home = generateTextureSet(family, { size: WRAP_SIZE, seed: 5 });
      const neighbour = generateTextureSet(family, {
        size: WRAP_SIZE,
        seed: 5,
        originXPx: WRAP_SIZE,
        originYPx: WRAP_SIZE,
      });
      assertBuffersEqual(home.albedo, neighbour.albedo, `${family} albedo offset tile`);
      assertBuffersEqual(home.normal, neighbour.normal, `${family} normal offset tile`);
      assertBuffersEqual(home.roughness, neighbour.roughness, `${family} roughness offset tile`);
      expect(Array.from(home.heightMm.slice(0, 8))).toEqual(Array.from(neighbour.heightMm.slice(0, 8)));
    }
  });

  it('rejects fractional noise periods (fractional period = NaN = black)', () => {
    expect(() => tileableValueNoise(64, 10.5, 1)).toThrow(/integer period/);
  });

  it('rejects tile geometries whose pattern counts are not integral', () => {
    expect(() => generateTextureSet('brick', { size: 64, metresPerTile: 1.0 })).toThrow(/multiple of/);
    expect(() => generateTextureSet('shingle', { size: 64, metresPerTile: 1.5 })).toThrow(/multiple of/);
    expect(() => generateTextureSet('concrete', { size: 64, metresPerTile: 2.0 })).toThrow(/multiple of/);
    expect(() => generateTextureSet('lapSiding', { size: 64, metresPerTile: 1.0 })).toThrow(/multiple of/);
    expect(() => generateTextureSet('asphalt', { size: 1000 })).toThrow(/power of two/);
  });
});

describe('HF-536 texture forge: albedo statistics and authored bands', () => {
  it('keeps albedo mean and stddev inside each family band', () => {
    for (const family of TEXTURE_FAMILIES) {
      const stats = lumaStats(statSet(family));
      const band = ALBEDO_BANDS[family];
      expect(stats.mean, `${family} mean`).toBeGreaterThan(band.mean[0]);
      expect(stats.mean, `${family} mean`).toBeLessThan(band.mean[1]);
      expect(stats.sd, `${family} sd`).toBeGreaterThan(band.sd[0]);
      expect(stats.sd, `${family} sd`).toBeLessThan(band.sd[1]);
    }
  });

  it('authors grain features inside 0.5-1.5 mm and reports the texel honestly', () => {
    for (const family of TEXTURE_FAMILIES) {
      const authored = statSet(family).authored;
      if (authored.grainMm !== undefined) {
        expect(authored.grainMm, `${family} grain`).toBeGreaterThanOrEqual(0.5);
        expect(authored.grainMm, `${family} grain`).toBeLessThanOrEqual(1.5);
      }
      expect(authored.texelMm, `${family} texel`).toBeGreaterThan(0);
    }
  });

  it('authors scuff features inside 20-80 mm and traffic features inside 0.5-3 m', () => {
    const siding = statSet('lapSiding').authored;
    expect(siding.wearBlotchMm).toBeGreaterThanOrEqual(20);
    expect(siding.wearBlotchMm).toBeLessThanOrEqual(80);
    const concrete = statSet('concrete').authored;
    expect(concrete.floatMarkShortMm).toBeGreaterThanOrEqual(20);
    expect(concrete.floatMarkLongMm).toBeLessThanOrEqual(80);
    expect(concrete.stainMm).toBeGreaterThanOrEqual(500);
    expect(concrete.stainMm).toBeLessThanOrEqual(3000);
    const asphalt = statSet('asphalt').authored;
    expect(asphalt.mottleBaseMm).toBeGreaterThanOrEqual(500);
    expect(asphalt.mottleBaseMm).toBeLessThanOrEqual(3000);
    expect(asphalt.polishGapM).toBeGreaterThanOrEqual(0.5);
    expect(asphalt.polishGapM).toBeLessThanOrEqual(3);
    // Brick chips are discrete defects pinned at 9-19 mm (brief names them without a scale).
    const brick = statSet('brick').authored;
    expect(brick.chipRatePercent).toBeGreaterThan(0);
  });
});

describe('HF-536 texture forge: headline features are visible albedo steps', () => {
  it('asphalt: tar seam is >= 10 % darker and wheel paths drop roughness by ~0.25', () => {
    const set = statSet('asphalt');
    const seamUMm = set.metresPerTile * 1000 * 0.075;
    const seamWidthMm = set.authored.seamWidthMm;
    const overall = lumaStats(set).mean;
    const seam = meanLumaWhere(set, (px) => {
      const d = Math.abs(px * set.mmPerPx - seamUMm) % (set.metresPerTile * 1000);
      return Math.min(d, set.metresPerTile * 1000 - d) < seamWidthMm * 0.25;
    });
    expect((seam - overall) / overall).toBeLessThan(-0.1);
    const bandCenter = set.metresPerTile * 1000 * 0.25;
    const inBand = meanRoughnessWhere(set, (_px, py) => {
      const v = py * set.mmPerPx;
      const d = Math.min(Math.abs(v - bandCenter), Math.abs(v - 3 * bandCenter));
      return d < 250;
    });
    const outBand = meanRoughnessWhere(set, (_px, py) => {
      const v = py * set.mmPerPx;
      const d = Math.min(Math.abs(v - bandCenter), Math.abs(v - 3 * bandCenter));
      return d > 350;
    });
    expect(outBand - inBand).toBeGreaterThan(0.15);
  });

  it('brick: mortar reads as a >= 10 % albedo step against the brick face', () => {
    const set = statSet('brick');
    const brick = meanLumaWhere(set, (_px, py) => localMm(set, py, 75) < 65);
    const mortar = meanLumaWhere(set, (_px, py) => localMm(set, py, 75) >= 65);
    expect(Math.abs(mortar - brick) / brick).toBeGreaterThan(0.1);
  });

  it('lapSiding: the 12 mm shadow gap is a strong albedo step and recessed in height', () => {
    const set = statSet('lapSiding');
    const face = meanLumaWhere(set, (_px, py) => localMm(set, py, 220) < 208);
    const gap = meanLumaWhere(set, (_px, py) => localMm(set, py, 220) >= 208);
    expect((gap - face) / face).toBeLessThan(-0.2);
    let gapMin = Number.POSITIVE_INFINITY;
    let faceMax = -Number.POSITIVE_INFINITY;
    for (let py = 0; py < set.size; py++) {
      const inGap = localMm(set, py, 220) >= 209 && localMm(set, py, 220) <= 219;
      const inFace = localMm(set, py, 220) >= 20 && localMm(set, py, 220) <= 180;
      for (let px = 0; px < set.size; px++) {
        const h = set.heightMm[py * set.size + px];
        if (inGap && h < gapMin) gapMin = h;
        if (inFace && h > faceMax) faceMax = h;
      }
    }
    expect(faceMax - gapMin).toBeGreaterThan(3);
  });

  it('shingle: the lifted-edge reveal is >= 12 % darker than the shingle face', () => {
    const set = statSet('shingle');
    const face = meanLumaWhere(set, (_px, py) => {
      const yl = localMm(set, py, 300);
      return yl > 40 && yl < 260;
    });
    const reveal = meanLumaWhere(set, (_px, py) => localMm(set, py, 300) < 10);
    expect((reveal - face) / face).toBeLessThan(-0.12);
  });

  it('concrete: expansion joints are >= 8 % darker on the joint centreline', () => {
    const set = statSet('concrete');
    const overall = lumaStats(set).mean;
    const joint = meanLumaWhere(set, (_px, py) => {
      const y = py * set.mmPerPx;
      const yj = y % 1500;
      return Math.min(yj, 1500 - yj) < 1.2;
    });
    expect((joint - overall) / overall).toBeLessThan(-0.08);
  });
});

describe('HF-536 texture forge: normal maps', () => {
  it('is unit-length and mostly +Z for every family', () => {
    for (const family of TEXTURE_FAMILIES) {
      const set = statSet(family);
      let maxErr = 0;
      let minZ = 1;
      for (let i = 0; i < set.size * set.size; i++) {
        const nx = set.normal[i * 4] / 127.5 - 1;
        const ny = set.normal[i * 4 + 1] / 127.5 - 1;
        const nz = set.normal[i * 4 + 2] / 127.5 - 1;
        const err = Math.abs(Math.sqrt(nx * nx + ny * ny + nz * nz) - 1);
        if (err > maxErr) maxErr = err;
        if (nz < minZ) minZ = nz;
      }
      expect(maxErr, `${family} normal length`).toBeLessThan(0.02);
      expect(minZ, `${family} normal z`).toBeGreaterThan(0);
      expect(set.fractionMostlyZ, `${family} mostly +Z`).toBeGreaterThan(0.9);
    }
  });
});

describe('HF-536 texture forge: determinism, sizes, timing', () => {
  it('same seed is byte-identical, a different seed is not', () => {
    const a = generateTextureSet('asphalt', { size: 256, seed: 42 });
    const b = generateTextureSet('asphalt', { size: 256, seed: 42 });
    assertBuffersEqual(a.albedo, b.albedo, 'same-seed albedo');
    assertBuffersEqual(a.normal, b.normal, 'same-seed normal');
    assertBuffersEqual(a.roughness, b.roughness, 'same-seed roughness');
    const c = generateTextureSet('asphalt', { size: 256, seed: 43 });
    let differs = false;
    for (let i = 0; i < a.albedo.length; i++) {
      if (a.albedo[i] !== c.albedo[i]) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it('generates 512 by parameter with no clamped-black output and finite heights', () => {
    for (const family of TEXTURE_FAMILIES) {
      const set = generateTextureSet(family, { size: 512, seed: 9 });
      expect(set.albedo.length).toBe(512 * 512 * 4);
      expect(set.roughness.length).toBe(512 * 512);
      expect(set.heightMm.length).toBe(512 * 512);
      let maxLuma = 0;
      for (let i = 0; i < 512 * 512; i++) {
        expect(Number.isFinite(set.heightMm[i]), `${family} finite height`).toBe(true);
        const l = set.albedo[i * 4];
        if (l > maxLuma) maxLuma = l;
      }
      expect(maxLuma, `${family} not clamped black`).toBeGreaterThan(30);
    }
  });

  it('generates a 1024^2 set for every family under 400 ms (median of 3, Node on this machine)', () => {
    const medians: Record<string, number> = {};
    for (const family of TEXTURE_FAMILIES) {
      const times: number[] = [];
      for (let run = 0; run < 3; run++) {
        times.push(generateTextureSet(family, { size: TIMING_SIZE, seed: 1 }).generateMs);
      }
      times.sort((x, y) => x - y);
      medians[family] = times[1];
      expect(times[1], `${family} 1024^2 median ms`).toBeLessThan(TIMING_BUDGET_MS);
    }
    // eslint-disable-next-line no-console
    console.log('HF-536 texture timing medians (ms):', JSON.stringify(medians));
  });
});
