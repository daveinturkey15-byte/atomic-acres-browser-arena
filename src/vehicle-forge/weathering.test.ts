import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import {
  createForgeMaterialSet,
  createForgeSharedMaterials,
} from './build';
import {
  measureChromePitCoverage,
  vehicleWeatheringProfile,
  dustBandWeight,
  weatheringDetailFalloff,
  VEHICLE_ANCHOR_QUANTUM_M,
  VEHICLE_CHROME_PIT_FEATURE_MAX_M,
  VEHICLE_CHROME_PIT_FEATURE_MIN_M,
  VEHICLE_CHROME_PIT_ROUGHNESS_MAX,
  VEHICLE_CHROME_PIT_ROUGHNESS_MIN,
  VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MAX,
  VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MIN,
  VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MAX,
  VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MIN,
  VEHICLE_DUST_BAND_HEIGHT_M,
  VEHICLE_DUST_BAND_MIX,
  VEHICLE_DUST_BAND_ROUGHNESS,
  VEHICLE_DUST_SPATTER_FEATURE_MAX_M,
  VEHICLE_DUST_SPATTER_FEATURE_MIN_M,
  VEHICLE_PAINT_SATURATION_LOSS_MAX,
  VEHICLE_PAINT_SATURATION_LOSS_MIN,
  VEHICLE_PAINT_VALUE_LIFT_MAX,
  VEHICLE_PAINT_VALUE_LIFT_MIN,
  VEHICLE_TRIM_GRIME_OFFSET_MAX_M,
  VEHICLE_TRIM_GRIME_OFFSET_MIN_M,
} from './materials';

// Keep this census structurally identical to the one in the pipeline-budget
// gate. Uniform values are intentionally excluded: livery and placement data
// must not multiply the shared program set.
const NON_SHADER_KEYS = new Set([
  'id', 'uuid', '_uuid', '_cacheKey', '_cacheKeyVersion', 'parents', '_beforeNodes', 'stackTrace',
]);

function graphSignature(value: unknown, seen = new Map<object, string>()): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  const object = value as Record<string, any>;
  if (object.isNode !== true) {
    if (object instanceof THREE.Color) return 'color';
    if (object instanceof THREE.Vector3) return `vector:${object.x},${object.y},${object.z}`;
    return `object:${object.constructor?.name ?? 'unknown'}`;
  }
  const prior = seen.get(object);
  if (prior) return prior;
  seen.set(object, '<recursive>');
  const parts = [object.type ?? object.constructor?.name ?? '?'];
  for (const key of Object.keys(object).sort()) {
    if (NON_SHADER_KEYS.has(key) || typeof object[key] === 'function') continue;
    if (object.isUniformNode && key === 'value') {
      parts.push(`${key}=<uniform>`);
      continue;
    }
    const child = object[key];
    parts.push(`${key}=${Array.isArray(child)
      ? `[${child.map((entry) => graphSignature(entry, seen)).join(',')}]`
      : graphSignature(child, seen)}`);
  }
  const result = `(${parts.join(' ')})`;
  seen.set(object, result);
  return result;
}

function materialGraphKey(material: THREE.Material): string {
  const slots = material as unknown as Record<string, unknown>;
  const nodes = Object.keys(slots)
    .filter((key) => key.endsWith('Node') && (slots[key] as { isNode?: boolean } | null)?.isNode === true)
    .sort();
  return `${material.type}|${nodes.map((key) => `${key}=${graphSignature(slots[key])}`).join('|')}`;
}

function textureSlots(material: THREE.Material): unknown[] {
  const slots = material as unknown as Record<string, unknown>;
  return ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'alphaMap']
    .map((key) => slots[key]);
}

describe('HF-536 vehicle weathering', () => {
  it('keeps the weathering constants inside the authored scale contract', () => {
    expect(VEHICLE_ANCHOR_QUANTUM_M).toBe(0.001);
    expect(VEHICLE_PAINT_SATURATION_LOSS_MIN).toBeGreaterThanOrEqual(0.08);
    expect(VEHICLE_PAINT_SATURATION_LOSS_MAX).toBeLessThanOrEqual(0.15);
    expect(VEHICLE_PAINT_VALUE_LIFT_MIN).toBeGreaterThanOrEqual(0.03);
    expect(VEHICLE_PAINT_VALUE_LIFT_MAX).toBeLessThanOrEqual(0.08);
    expect(VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MIN).toBe(0.25);
    expect(VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MAX).toBe(0.35);
    expect(VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MIN).toBe(0.5);
    expect(VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MAX).toBe(0.6);
    expect(VEHICLE_DUST_BAND_HEIGHT_M).toBe(0.35);
    expect(VEHICLE_DUST_BAND_MIX).toBeCloseTo(0.35, 6);
    expect(VEHICLE_DUST_BAND_ROUGHNESS).toBeCloseTo(0.85, 6);
    expect(VEHICLE_DUST_SPATTER_FEATURE_MIN_M).toBeGreaterThanOrEqual(0.02);
    expect(VEHICLE_DUST_SPATTER_FEATURE_MAX_M).toBeLessThanOrEqual(0.06);
    expect(VEHICLE_CHROME_PIT_FEATURE_MIN_M).toBeGreaterThanOrEqual(0.003);
    expect(VEHICLE_CHROME_PIT_FEATURE_MAX_M).toBeLessThanOrEqual(0.008);
    expect(VEHICLE_CHROME_PIT_ROUGHNESS_MIN).toBeCloseTo(0.08, 6);
    expect(VEHICLE_CHROME_PIT_ROUGHNESS_MAX).toBeCloseTo(0.35, 6);
    expect(VEHICLE_TRIM_GRIME_OFFSET_MIN_M).toBeCloseTo(0.015, 6);
    expect(VEHICLE_TRIM_GRIME_OFFSET_MAX_M).toBeCloseTo(0.025, 6);
  });

  it('gives three placed vehicles distinct deterministic enamel profiles', () => {
    const placedAnchors = [
      [0.66249, -2.65], // coach after the Nuke Town handedness transform
      [3.16249, 2.75], // truck cab/bogie anchor
      [-8.8, 3.2], // saloon
    ] as const;
    const profiles = placedAnchors.map(([x, z]) => vehicleWeatheringProfile(x, z));
    expect(profiles).toEqual(placedAnchors.map(([x, z]) => vehicleWeatheringProfile(x, z)));
    expect(new Set(profiles.map((profile) => profile.hash)).size).toBe(3);
    expect(new Set(profiles.map((profile) => profile.saturationLoss)).size).toBe(3);
    for (const profile of profiles) {
      expect(profile.anchor[0] / VEHICLE_ANCHOR_QUANTUM_M)
        .toBeCloseTo(Math.round(profile.anchor[0] / VEHICLE_ANCHOR_QUANTUM_M), 8);
      expect(profile.anchor[1] / VEHICLE_ANCHOR_QUANTUM_M)
        .toBeCloseTo(Math.round(profile.anchor[1] / VEHICLE_ANCHOR_QUANTUM_M), 8);
      expect(profile.saturationLoss).toBeGreaterThanOrEqual(VEHICLE_PAINT_SATURATION_LOSS_MIN);
      expect(profile.saturationLoss).toBeLessThanOrEqual(VEHICLE_PAINT_SATURATION_LOSS_MAX);
      expect(profile.valueLift).toBeGreaterThanOrEqual(VEHICLE_PAINT_VALUE_LIFT_MIN);
      expect(profile.valueLift).toBeLessThanOrEqual(VEHICLE_PAINT_VALUE_LIFT_MAX);
    }
  });

  it('keeps the road-dust band at 0.35 and clears it at 0.35 m', () => {
    expect(dustBandWeight(0)).toBeCloseTo(0.35, 6);
    expect(dustBandWeight(-0.1)).toBeCloseTo(0.35, 6);
    expect(dustBandWeight(VEHICLE_DUST_BAND_HEIGHT_M)).toBe(0);
    expect(dustBandWeight(0.5)).toBe(0);
    expect(dustBandWeight(10)).toBe(0);
  });

  it('keeps chrome pitting at 10-20% and authored 3-8 mm scale', () => {
    const coverage = measureChromePitCoverage();
    expect(coverage).toBeGreaterThanOrEqual(0.1);
    expect(coverage).toBeLessThanOrEqual(0.2);
    expect(VEHICLE_CHROME_PIT_FEATURE_MIN_M).toBeGreaterThanOrEqual(0.003);
    expect(VEHICLE_CHROME_PIT_FEATURE_MAX_M).toBeLessThanOrEqual(0.008);
  });

  it('fades microdetail by 1.2-3 m, leaving no 10 m aliasing', () => {
    expect(weatheringDetailFalloff(1.2)).toBeCloseTo(1, 6);
    expect(weatheringDetailFalloff(2.1)).toBeGreaterThan(0);
    expect(weatheringDetailFalloff(3)).toBe(0);
    expect(weatheringDetailFalloff(10)).toBe(0);
  });

  it('changes the shared paint/chrome graphs without adding buckets or samplers', () => {
    const shared = createForgeSharedMaterials();
    const before = Object.values(createForgeMaterialSet(0x173451, 'weathering-before', 0xf4eee0, 0.2, shared));
    const after = Object.values(createForgeMaterialSet(0x173451, 'weathering-after', 0xf4eee0, 0.2, shared));
    expect(before).toHaveLength(9);
    expect(after).toHaveLength(9);
    expect(new Set(before).size).toBe(9);
    expect(new Set(after).size).toBe(9);
    expect(new Set(before.map(materialGraphKey)).size).toBe(new Set(after.map(materialGraphKey)).size);
    expect(materialGraphKey(before[0]!)).toBe(materialGraphKey(before[1]!));

    const legacyPaint = new MeshPhysicalNodeMaterial();
    legacyPaint.colorNode = TSL.uniform(new THREE.Vector3(0.1, 0.2, 0.3));
    legacyPaint.roughnessNode = TSL.float(0.2);
    expect(materialGraphKey(before[0]!)).not.toBe(materialGraphKey(legacyPaint));
    expect(before.flatMap(textureSlots).filter((slot) => slot instanceof THREE.Texture)).toHaveLength(0);
    expect(after.flatMap(textureSlots).filter((slot) => slot instanceof THREE.Texture)).toHaveLength(0);
  });
});
