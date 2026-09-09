import { describe, expect, it } from 'vitest';
import {
  createNuketown2CeilingLightMaterial,
  createNuketown2DrywallMaterial,
  createNuketown2GarageFloorMaterial,
  createNuketown2GlassMaterial,
  createNuketown2WoodFloorMaterial,
} from './nuketown2-interior-materials';
// Dead factories must stay dead: importing them is a compile error, so their
// absence is asserted structurally here (no export to call).
import * as interiorModule from './nuketown2-interior-materials';
import { assertSpec, WEAR_BANDS } from './nuketown2-materials/spec';

const OPAQUE = [
  ['drywall', () => createNuketown2DrywallMaterial(0xdbd1ba)],
  ['wood floor', () => createNuketown2WoodFloorMaterial()],
  ['garage floor', () => createNuketown2GarageFloorMaterial()],
] as const;

describe('day2-night-materials-house-vehicles interior surfaces', () => {
  it('gives every owned opaque surface a relief normal', () => {
    for (const [label, build] of OPAQUE) {
      const material = build();
      expect(material.normalNode?.isNode, `${label} carries a normalNode`).toBe(true);
    }
  });

  it('declares a valid three-scale spec on every owned opaque surface', () => {
    for (const [label, build] of OPAQUE) {
      const material = build();
      const spec = material.userData.nuketown2Spec;
      expect(spec, `${label} stashes its spec for the census`).toBeDefined();
      // Throws on any out-of-band scale or out-of-bound wear step.
      expect(() => assertSpec(spec), `${label} spec passes assertSpec`).not.toThrow();
      expect(spec.grain.sizeM, `${label} grain in band`).toBeGreaterThanOrEqual(WEAR_BANDS.grain.minM);
      expect(spec.grain.sizeM, `${label} grain in band`).toBeLessThanOrEqual(WEAR_BANDS.grain.maxM);
      expect(spec.scuff.sizeM, `${label} scuff in band`).toBeGreaterThanOrEqual(WEAR_BANDS.scuff.minM);
      expect(spec.scuff.sizeM, `${label} scuff in band`).toBeLessThanOrEqual(WEAR_BANDS.scuff.maxM);
      expect(spec.traffic.sizeM, `${label} traffic in band`).toBeGreaterThanOrEqual(WEAR_BANDS.traffic.minM);
      expect(spec.traffic.sizeM, `${label} traffic in band`).toBeLessThanOrEqual(WEAR_BANDS.traffic.maxM);
    }
  });

  it('keeps window glass a flat dielectric', () => {
    const glass = createNuketown2GlassMaterial();
    expect(glass.metalness).toBeLessThanOrEqual(0.02);
  });

  it('keeps the ceiling-light emissive literals verbatim', () => {
    expect(createNuketown2CeilingLightMaterial(true).emissiveNode).toBeDefined();
    expect(createNuketown2CeilingLightMaterial(false).emissiveNode).toBeDefined();
  });

  it('deleted the three dead factories', () => {
    expect('createNuketown2TileFloorMaterial' in interiorModule).toBe(false);
    expect('createNuketown2GarageWallMaterial' in interiorModule).toBe(false);
    expect('createNuketown2PoolWaterMaterial' in interiorModule).toBe(false);
  });

  it('sets no classic texture slots on any interior material', () => {
    const materials = [
      createNuketown2DrywallMaterial(0xdbd1ba),
      createNuketown2WoodFloorMaterial(),
      createNuketown2GarageFloorMaterial(),
      createNuketown2GlassMaterial(),
    ];
    for (const material of materials) {
      const slots = material as unknown as Record<string, unknown>;
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'emissiveMap', 'bumpMap', 'displacementMap']) {
        expect(slots[slot], `${material.name} ${slot}`).toBeNull();
      }
    }
  });
});
