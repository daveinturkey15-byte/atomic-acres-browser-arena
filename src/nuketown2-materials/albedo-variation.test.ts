/**
 * albedo-variation.test.ts — the gate for HF-503 / pass 96, materials lane 2.
 *
 * WHAT THIS EXISTS TO CATCH, stated as the finding it answers. HF-486 measured
 * the quality bar and reported that the arena already runs nine of eleven look
 * techniques while showing near-zero albedo variation on its surfaces, which is
 * why GTAO, SSR and bloom read as if they were switched off: each of those
 * modulates a surface, and a surface with nothing on it has nothing to
 * modulate. `spec.ts` already pinned a 10 % albedo wear step — but look at
 * where the three authored scales live once the distance falloffs apply:
 *
 *   grain   0.5-1.5 mm  gone by  3 m
 *   scuff   20 -80  mm  gone by 18 m
 *   traffic 0.5-3   m   never fades
 *
 * At the 10-30 m a player actually fights across this map, two of the three are
 * at exactly zero and the surviving one is a single field. One field is a
 * gradient, not a texture. So the gate below is NOT "does the spec table
 * contain large numbers" — the old gate already asserted that and passed on a
 * map that read flat. It measures what survives at combat distance, and it
 * measures it against the tile the shader actually samples.
 *
 * Every number here is a MEASUREMENT of the generated tile, taken through the
 * same `centred()` normalisation the node graph uses (`wear.ts`), never a
 * restatement of the authored constant.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  MAX_ALBEDO_DARKENING,
  MAX_NORMAL_DEGREES,
  MAX_TINT_SPREAD,
  VARIATION_BANDS,
  albedoWearStep,
  variationOf,
} from './spec';
import type { Nuketown2MaterialSpec } from './spec';
import { centredFieldStats, linearRgb, variationStatistics } from './wear';
import {
  GRADIENT_LUT_CELLS,
  GRADIENT_LUT_SIZE,
  generateGradientLutData,
  gradientLutRms,
  noiseLutChannelMeans,
  noiseLutChannelSigmas,
} from './noise-lut';
import { createNuketown2MaterialRegistry, NUKETOWN2_MATERIAL_ROLES } from './index';
import { sidingSpec } from './families/siding';
import { roofSpec } from './families/roof';
import { asphaltSpec, markingSpec } from './families/asphalt';
import { concreteSpec } from './families/concrete';
import { timberSpec } from './families/timber';
import { paintedMetalSpec } from './families/painted-metal';
import { lawnSpec } from './families/lawn';
import { glassSpec } from './families/glass';

/**
 * The LARGE FLAT SURFACES of Nuke Town — the ones HF-486 named. These are the
 * rows that must clear the visible-variation floor; glass is held to the band
 * floor deliberately and is listed separately below.
 */
const LARGE_FLAT: ReadonlyArray<{ readonly label: string; readonly spec: Nuketown2MaterialSpec }> = [
  { label: 'siding A (north, blue)', spec: sidingSpec('nuketown2-siding-north-blue', 0x46809f) },
  { label: 'siding B (south, yellow)', spec: sidingSpec('nuketown2-siding-south-yellow', 0xf4be36) },
  { label: 'roof deck (shingle)', spec: roofSpec() },
  { label: 'asphalt (carriageway)', spec: asphaltSpec() },
  { label: 'lane marking (decal)', spec: markingSpec() },
  { label: 'kerb', spec: concreteSpec('nuketown2-kerb', 0x9a978a) },
  { label: 'concrete path / apron', spec: concreteSpec('nuketown2-drive', 0x8b8879) },
  { label: 'blockwork', spec: concreteSpec('nuketown2-block', 0x9d9a8c) },
  { label: 'fence timber', spec: timberSpec('nuketown2-timber-fence', 0x673b24, 'fence') },
  { label: 'painted trim (wainscot)', spec: timberSpec('nuketown2-trim', 0xf0e4c9, 'painted-trim') },
  { label: 'garage door metal', spec: paintedMetalSpec('nuketown2-garage-door', 0xaebdc1) },
  { label: 'vehicle paint band', spec: paintedMetalSpec('nuketown2-coach-trim', 0xa8382c) },
  { label: 'lawn turf', spec: lawnSpec('nuketown2-lawn-decal', 0x496438, 'turf') },
  { label: 'lawn dirt / scrub plain', spec: lawnSpec('nuketown2-ground-scrub', 0x515642, 'scrub', undefined, 55) },
  { label: 'hedge / planter', spec: lawnSpec('nuketown2-planter', 0x415a33, 'hedge') },
];

const AT_BAND_FLOOR: ReadonlyArray<{ readonly label: string; readonly spec: Nuketown2MaterialSpec }> = [
  { label: 'coach glazing', spec: glassSpec('nuketown2-coach-glass-band', 0x2b3d47) },
];

const ALL_ROWS = [...LARGE_FLAT, ...AT_BAND_FLOOR];

/**
 * The floor a large flat surface must clear, as RMS luminance variation.
 *
 * 1.5 %, not 2 %, and the difference is the point: the brief's "2-6 %" is the
 * authored PEAK swing, and a field normalised to two sigma shows about half of
 * its peak as RMS. Asserting the authored number against the measured RMS
 * would pass only by accident. This floor is what the eye actually needs on a
 * large flat surface, and the ceiling below is the readability side of it.
 */
const MIN_RMS_LUMINANCE = 0.015;
const MAX_RMS_LUMINANCE = 0.050;

describe('HF-503 combat-distance albedo variation', () => {
  it('prints the measured per-family table', () => {
    const rows = ALL_ROWS.map(({ label, spec }) => {
      const stats = variationStatistics(spec);
      const v = variationOf(spec);
      return {
        family: label,
        macroM: v.macro.sizeM,
        microM: v.micro.sizeM,
        'rms %': +(stats.rms * 100).toFixed(2),
        'p95 p2p %': +(stats.p95Band * 100).toFixed(2),
        'worst p2p %': +(stats.worstBand * 100).toFixed(2),
        'mean err %': +((stats.mean - 1) * 100).toFixed(3),
        'tint peak %': +(stats.tintPeak * 100).toFixed(2),
        'normal deg': stats.normalDegrees,
        'peak dark %': +(albedoWearStep(spec) * 100).toFixed(1),
      };
    });
    // eslint-disable-next-line no-console
    console.table(rows);
    // eslint-disable-next-line no-console
    console.log('lut channel means ', noiseLutChannelMeans().map((m) => +m.toFixed(5)).join(' '));
    // eslint-disable-next-line no-console
    console.log('lut channel sigmas', noiseLutChannelSigmas().map((m) => +m.toFixed(5)).join(' '));
    // eslint-disable-next-line no-console
    console.log('gradient rms      ', +gradientLutRms().toFixed(5));
    expect(rows).toHaveLength(ALL_ROWS.length);
  });

  it.each(LARGE_FLAT)('$label carries visible macro + micro variation at combat distance', ({ spec }) => {
    const stats = variationStatistics(spec);
    expect(stats.rms, 'RMS luminance variation').toBeGreaterThanOrEqual(MIN_RMS_LUMINANCE);
    expect(stats.rms, 'RMS luminance variation').toBeLessThanOrEqual(MAX_RMS_LUMINANCE);
  });

  it.each(ALL_ROWS)('$label authors both scales inside their bands', ({ spec }) => {
    const v = variationOf(spec);
    expect(v.macro.sizeM).toBeGreaterThanOrEqual(VARIATION_BANDS.macro.minM);
    expect(v.macro.sizeM).toBeLessThanOrEqual(VARIATION_BANDS.macro.maxM);
    expect(v.macro.albedo).toBeGreaterThanOrEqual(VARIATION_BANDS.macro.minAlbedo);
    expect(v.macro.albedo).toBeLessThanOrEqual(VARIATION_BANDS.macro.maxAlbedo);
    expect(v.micro.sizeM).toBeGreaterThanOrEqual(VARIATION_BANDS.micro.minM);
    expect(v.micro.sizeM).toBeLessThanOrEqual(VARIATION_BANDS.micro.maxM);
    expect(v.micro.albedo).toBeGreaterThanOrEqual(VARIATION_BANDS.micro.minAlbedo);
    expect(v.micro.albedo).toBeLessThanOrEqual(VARIATION_BANDS.micro.maxAlbedo);
  });

  /**
   * THE ONE THAT MATTERS MOST, because it is the one a "make it look better"
   * pass silently breaks. Adding a one-sided term — a wash, a stain, a lift —
   * is the easy way to make a surface look varied, and it walks the surface off
   * the hex an artist pinned. HF-477 pinned these; the fidelity gate reads
   * `material.color` and would still pass while every fragment shipped darker.
   */
  it.each(ALL_ROWS)('$label keeps its pinned base colour as the MEAN, within 1 %', ({ spec }) => {
    const stats = variationStatistics(spec);
    expect(Math.abs(stats.mean - 1), 'mean luminance multiplier error').toBeLessThanOrEqual(0.01);
    const [r, g, b] = linearRgb(spec.baseSrgb);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shipped = luminance * stats.mean;
    expect(Math.abs(shipped - luminance) / Math.max(luminance, 1e-6)).toBeLessThanOrEqual(0.01);
  });

  it.each(ALL_ROWS)('$label stays inside the combat-readability ceiling with the new scales folded in', ({ spec }) => {
    expect(albedoWearStep(spec)).toBeLessThanOrEqual(MAX_ALBEDO_DARKENING);
  });

  it.each(ALL_ROWS)('$label correlates roughness with the wear mask in both directions', ({ spec }) => {
    const v = variationOf(spec);
    // Dirt collects in the recesses and dirt is rough.
    expect(v.soilRoughness, 'soiled recesses rougher').toBeGreaterThan(0);
    // Traffic polishes what it touches.
    expect(v.polishRoughness, 'worn surface smoother').toBeGreaterThan(0);
    expect(v.macro.roughness, 'macro roughness swing').toBeGreaterThan(0);
    expect(v.micro.roughness, 'micro roughness swing').toBeGreaterThan(0);
  });

  it.each(ALL_ROWS)('$label keeps its tint luminance-preserving and bounded', ({ spec }) => {
    const v = variationOf(spec);
    expect(v.tintSpread).toBeGreaterThan(0);
    expect(v.tintSpread).toBeLessThanOrEqual(MAX_TINT_SPREAD);
    // vec3(1 + t, 1 - 0.14 t, 1 - t) against Rec. 709: the residual luminance
    // move is an order below the 1 % the mean gate allows.
    const t = variationStatistics(spec).tintPeak;
    const residual = Math.abs(0.2126 * t - 0.7152 * 0.14 * t - 0.0722 * t);
    expect(residual, 'tint luminance residual').toBeLessThan(0.002);
  });

  it('bounds every normal perturbation so silhouettes stay flat', () => {
    for (const { label, spec } of ALL_ROWS) {
      expect(variationOf(spec).normalDegrees, `${label} normal tilt`).toBeLessThanOrEqual(MAX_NORMAL_DEGREES);
      expect(variationOf(spec).normalDegrees, `${label} normal tilt`).toBeGreaterThanOrEqual(0);
    }
    // Only the three families the brief names take a shading normal at all.
    const withNormal = ALL_ROWS.filter(({ spec }) => variationOf(spec).normalDegrees > 0).map(({ spec }) => spec.family);
    expect(new Set(withNormal)).toEqual(new Set(['siding', 'concrete', 'asphalt']));
  });
});

describe('HF-503 the shared tiles the variation is sampled from', () => {
  it('measures the value tile rather than assuming it is centred on a half', () => {
    const means = noiseLutChannelMeans();
    const sigmas = noiseLutChannelSigmas();
    for (let c = 0; c < 4; c += 1) {
      expect(means[c]!, `channel ${c} mean`).toBeGreaterThan(0.2);
      expect(means[c]!, `channel ${c} mean`).toBeLessThan(0.8);
      expect(sigmas[c]!, `channel ${c} sigma`).toBeGreaterThan(0.01);
    }
    // The centred field is zero-mean BY MEASUREMENT, which is what makes the
    // mean-preservation gate above a real assertion rather than an assumption.
    for (const channel of [0, 2, 3] as const) {
      expect(Math.abs(centredFieldStats(channel).mean), `channel ${channel} centred mean`).toBeLessThan(0.005);
    }
  });

  it('keeps the +-1 clamp off all but the tails', () => {
    for (const channel of [0, 2, 3] as const) {
      expect(centredFieldStats(channel).clipped, `channel ${channel} clipped fraction`).toBeLessThan(0.10);
    }
  });

  it('generates a gradient tile that wraps, so the normal perturbation tiles with the height', () => {
    const size = 64;
    const cells = 8;
    const data = generateGradientLutData(size, cells);
    expect(data).toHaveLength(size * size * 4);
    // A wrapped central difference means the first and last columns are real
    // neighbours; if the generator had differenced without wrapping, the tile
    // would carry a seam here and every wall would show a grid of them.
    let worstSeam = 0;
    for (let y = 0; y < size; y += 1) {
      const left = data[(y * size + 0) * 4]!;
      const right = data[(y * size + (size - 1)) * 4]!;
      worstSeam = Math.max(worstSeam, Math.abs(left - right));
    }
    expect(worstSeam, 'column 0 vs column N-1 gradient step').toBeLessThan(48);
  });

  it('clips almost none of the encoded slope, and reports a usable RMS', () => {
    const data = generateGradientLutData(GRADIENT_LUT_SIZE, GRADIENT_LUT_CELLS);
    let clipped = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 0 || data[i] === 255 || data[i + 1] === 0 || data[i + 1] === 255) clipped += 1;
    }
    expect(clipped / (data.length / 4), 'saturated slope fraction').toBeLessThan(0.01);
    expect(gradientLutRms()).toBeGreaterThan(0.05);
    expect(gradientLutRms()).toBeLessThan(4.0);
  });
});

describe('HF-503 per-instance data stays uniform-only', () => {
  it('carries every variation knob as a plain uniform value on the material, not in the graph', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const knobs = [
      'macroFrequency', 'macroAlbedo', 'macroRoughness',
      'microFrequency', 'microAlbedo', 'microRoughness',
      'tintSpread', 'soilRoughness', 'polishRoughness', 'normalStrength', 'edgeWear',
    ];
    for (const role of NUKETOWN2_MATERIAL_ROLES) {
      const values = (registry[role] as THREE.Material & { userData: Record<string, any> })
        .userData.nuketown2Uniforms as Record<string, unknown> | undefined;
      expect(values, `${role} carries its uniform values`).toBeDefined();
      for (const knob of knobs) {
        const value = values![knob];
        expect(typeof value, `${role}.${knob} is a scalar uniform`).toBe('number');
        expect(Number.isFinite(value as number), `${role}.${knob} is finite`).toBe(true);
      }
    }
  });

  it('varies those values BETWEEN materials of one family, which is the whole point of the uniform', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const read = (role: string, knob: string): unknown =>
      ((registry[role] as THREE.Material & { userData: Record<string, any> })
        .userData.nuketown2Uniforms as Record<string, unknown>)[knob];
    // Same family, different roles, different authored values - and (asserted
    // by nuketown2-pipeline-budget.test.ts) still one graph.
    expect(read('asphalt', 'macroFrequency')).not.toBe(read('trimDecal', 'macroFrequency'));
    expect(read('sidingA', 'baseColor')).not.toBe(read('sidingB', 'baseColor'));
    // The backdrop plain still resolves both new scales at the 55 m it is read
    // from - a 3.4 m field is 100 px there and a 0.20 m field is 5.9 px - so
    // neither is switched off, which is what the old grain and scuff terms are.
    expect(read('ground', 'macroAlbedo')).toBeGreaterThan(0);
    expect(read('ground', 'microAlbedo')).toBeGreaterThan(0);
    expect(read('ground', 'grainEnabled')).toBe(0);
  });

  it('gives the three named families a shading normal and nothing else one', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const withNormal = NUKETOWN2_MATERIAL_ROLES.filter(
      (role) => (registry[role] as unknown as { normalNode?: unknown }).normalNode != null,
    );
    expect(new Set(withNormal)).toEqual(new Set([
      'asphalt', 'kerb', 'drive', 'driveDecal', 'trimDecal', 'block', 'sidingA', 'sidingB',
    ]));
  });
});
