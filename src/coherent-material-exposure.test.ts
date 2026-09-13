import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import {
  VEHICLE_PAINT_SATURATION_LOSS_MIN,
  VEHICLE_PAINT_SATURATION_LOSS_MAX,
  VEHICLE_PAINT_VALUE_LIFT_MIN,
  VEHICLE_PAINT_VALUE_LIFT_MAX,
  VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MIN,
  VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MAX,
  VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MIN,
  VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MAX,
  VEHICLE_DUST_BAND_HEIGHT_M,
  VEHICLE_DUST_BAND_MIX,
  createForgePaintMaterial,
  createForgeGlassMaterial,
  createForgeChromeMaterial,
  dustBandWeight,
  weatheringDetailFalloff,
} from './vehicle-forge/materials';
import { createForgeMaterialSet, createForgeSharedMaterials } from './vehicle-forge/build';
import {
  SIDING_COURSE_M,
  SIDING_LAP_PROUD_M,
  createSidingMaterial,
} from './nuketown2-materials/families/siding';
import { definition as nuketown2Definition } from './rendering/arenas/nuketown2';
import { definition as atomicAcresDefinition } from './rendering/arenas/atomic-acres';

describe('coherent material exposure candidate 2026-09-10', () => {
  it('keeps controls finite and inside the pinned weathering contract', () => {
    for (const v of [
      VEHICLE_PAINT_SATURATION_LOSS_MIN,
      VEHICLE_PAINT_SATURATION_LOSS_MAX,
      VEHICLE_PAINT_VALUE_LIFT_MIN,
      VEHICLE_PAINT_VALUE_LIFT_MAX,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.2);
    }
    // Pinned floor/ceiling directions from weathering.test.ts still hold;
    // the candidate only narrows the worst-case wash, never the floor.
    expect(VEHICLE_PAINT_SATURATION_LOSS_MIN).toBeGreaterThanOrEqual(0.08);
    expect(VEHICLE_PAINT_SATURATION_LOSS_MAX).toBeLessThanOrEqual(0.15);
    expect(VEHICLE_PAINT_VALUE_LIFT_MIN).toBeGreaterThanOrEqual(0.03);
    expect(VEHICLE_PAINT_VALUE_LIFT_MAX).toBeLessThanOrEqual(0.08);
    expect(VEHICLE_PAINT_SATURATION_LOSS_MIN).toBeLessThanOrEqual(VEHICLE_PAINT_SATURATION_LOSS_MAX);
    expect(VEHICLE_PAINT_VALUE_LIFT_MIN).toBeLessThanOrEqual(VEHICLE_PAINT_VALUE_LIFT_MAX);
    // Clearcoat separation contract is byte-exact and untouched.
    expect(VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MIN).toBe(0.25);
    expect(VEHICLE_CLEARCOAT_UPPER_ROUGHNESS_MAX).toBe(0.35);
    expect(VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MIN).toBe(0.5);
    expect(VEHICLE_CLEARCOAT_FLANK_ROUGHNESS_MAX).toBe(0.6);
    expect(VEHICLE_DUST_BAND_HEIGHT_M).toBe(0.35);
    expect(VEHICLE_DUST_BAND_MIX).toBeCloseTo(0.35, 6);
    expect(dustBandWeight(0)).toBeCloseTo(0.35, 6);
    expect(weatheringDetailFalloff(1.2)).toBeCloseTo(1, 6);
    expect(weatheringDetailFalloff(3)).toBe(0);
  });

  it('preserves factory swatch separation at roughness 0.2', () => {
    const navy = createForgePaintMaterial({ color: 0x173451, name: 'coherent-navy', roughness: 0.2 });
    const cream = createForgePaintMaterial({ color: 0xf4eee0, name: 'coherent-cream', roughness: 0.2 });
    const expectedNavy = new THREE.Color().setHex(0x173451, THREE.SRGBColorSpace);
    expect(navy.color.r).toBeCloseTo(expectedNavy.r, 10);
    expect(navy.color.g).toBeCloseTo(expectedNavy.g, 10);
    expect(navy.color.b).toBeCloseTo(expectedNavy.b, 10);
    // No arbitrary lift erases the dark-blue livery: navy stays much darker than cream.
    const luma = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(luma(navy.color)).toBeLessThan(luma(cream.color) * 0.5);
    expect(navy.color.getHexString()).not.toBe(cream.color.getHexString());
    for (const m of [navy, cream]) {
      expect(m.metalness).toBe(0);
      expect(m.specularIntensity).toBe(0.08);
      expect(m.userData.forgeRole).toBe('paint');
      expect(m.userData.forgePaintUniform).toBe(true);
      expect(m.colorNode).toBeDefined();
      expect(m.roughnessNode).toBeDefined();
      expect(m.normalNode).toBeDefined();
      const slots = m as unknown as Record<string, unknown>;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        expect(slots[key]).toBeFalsy();
      }
    }
  });

  it('keeps dielectric properties and view-space Fresnel graph references', () => {
    const glass = createForgeGlassMaterial('coherent-glass');
    expect(glass.metalness).toBe(0);
    expect(glass.roughness).toBe(0.06);
    expect(glass.clearcoat).toBe(1);
    expect(glass.side).toBe(THREE.DoubleSide);
    expect(glass.depthWrite).toBe(false);
    expect(glass.opacityNode).toBeDefined();
    expect(glass.roughnessNode).toBeDefined();
    const has = (root: unknown, target: unknown, seen = new Set<object>()): boolean => {
      if (root === target) return true;
      if (typeof root !== 'object' || root === null || seen.has(root as object)) return false;
      seen.add(root as object);
      return Object.values(root as Record<string, unknown>).some((v) => has(v, target, seen));
    };
    expect(has(glass.opacityNode, TSL.normalView)).toBe(true);
    expect(has(glass.opacityNode, TSL.positionViewDirection)).toBe(true);
    expect(has(glass.opacityNode, TSL.normalWorld)).toBe(false);
  });

  it('keeps siding relief constants and distinct factory swatches', () => {
    expect(SIDING_COURSE_M).toBeCloseTo(0.184, 6);
    expect(SIDING_LAP_PROUD_M / SIDING_COURSE_M).toBeLessThan(0.1);
    const orange = createSidingMaterial(0x9f6147, 'coherent-siding-orange');
    const cream = createSidingMaterial(0xeae3cf, 'coherent-siding-cream');
    expect(orange.color.getHex()).toBe(0x9f6147);
    expect(cream.color.getHex()).toBe(0xeae3cf);
    for (const m of [orange, cream]) {
      expect(m.metalness).toBe(0);
      expect(m.colorNode).toBeDefined();
      expect(m.roughnessNode).toBeDefined();
      expect(m.normalNode).toBeDefined();
    }
  });

  it('checks the Nuke Town rig and Atomic Acres exposure definitions', () => {
    expect(nuketown2Definition.colorPipeline.exposure).toBe(1.08);
    expect(nuketown2Definition.lighting.sunIntensity).toBe(3.2);
    expect(nuketown2Definition.lighting.ambientIntensity).toBe(0.42);
    expect(atomicAcresDefinition.colorPipeline.exposure).toBe(1.08);
  });

  it('checks the shared forge material slot count and chrome role', () => {
    const shared = createForgeSharedMaterials();
    const set = createForgeMaterialSet(0x173451, 'coherent-set', 0xf4eee0, 0.2, shared);
    expect(Object.values(set)).toHaveLength(9);
    const chrome = createForgeChromeMaterial();
    expect(chrome.userData.forgeRole).toBe('chrome');
  });
});
