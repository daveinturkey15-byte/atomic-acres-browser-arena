import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createNuketown2CarPaintMaterial,
  createNuketown2ChromeMaterial,
  createNuketown2CoachMaterial,
  createNuketown2TireMaterial,
  createNuketown2TruckBoxMaterial,
  createNuketown2TruckCabMaterial,
  createNuketown2VehicleGlassMaterial,
} from './nuketown2-vehicle-materials';
import { assertSpec, WEAR_BANDS } from './nuketown2-materials/spec';

const NON_SHADER_KEYS = new Set([
  'id', 'uuid', '_uuid', '_cacheKey', '_cacheKeyVersion', 'parents', '_beforeNodes', 'stackTrace',
]);

function graphSignature(value: unknown, seen = new Map<object, string>()): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  const object = value as Record<string, unknown>;
  if ((object as { isNode?: boolean }).isNode !== true) {
    if (object instanceof THREE.Color) return 'color';
    if (object instanceof THREE.Vector3) return `vector:${(object as THREE.Vector3).x},${(object as THREE.Vector3).y},${(object as THREE.Vector3).z}`;
    return `object:${object.constructor?.name ?? 'unknown'}`;
  }
  const prior = seen.get(object);
  if (prior) return prior;
  seen.set(object, '<recursive>');
  const parts = [(object as { type?: string }).type ?? object.constructor?.name ?? '?'];
  for (const key of Object.keys(object).sort()) {
    if (NON_SHADER_KEYS.has(key) || typeof object[key] === 'function') continue;
    if ((object as { isUniformNode?: boolean }).isUniformNode && key === 'value') {
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

describe('day2-night-materials-house-vehicles vehicle surfaces', () => {
  it('gives every owned opaque surface a relief normal', () => {
    const materials = [
      createNuketown2CarPaintMaterial(0x3d6f80, 'nuketown2-car-aqua'),
      createNuketown2ChromeMaterial(),
      createNuketown2TireMaterial(),
      createNuketown2CoachMaterial(),
      createNuketown2TruckCabMaterial(),
      createNuketown2TruckBoxMaterial(),
    ];
    for (const material of materials) {
      expect(material.normalNode?.isNode, `${material.name} carries a normalNode`).toBe(true);
    }
  });

  it('declares a valid three-scale spec on every owned opaque surface', () => {
    const materials = [
      createNuketown2CarPaintMaterial(0x3d6f80, 'nuketown2-car-aqua'),
      createNuketown2ChromeMaterial(),
      createNuketown2TireMaterial(),
      createNuketown2CoachMaterial(),
      createNuketown2TruckCabMaterial(),
      createNuketown2TruckBoxMaterial(),
    ];
    for (const material of materials) {
      const spec = material.userData.nuketown2Spec;
      expect(spec, `${material.name} stashes its spec for the census`).toBeDefined();
      expect(() => assertSpec(spec), `${material.name} spec passes assertSpec`).not.toThrow();
      expect(spec.grain.sizeM, `${material.name} grain in band`).toBeGreaterThanOrEqual(WEAR_BANDS.grain.minM);
      expect(spec.grain.sizeM, `${material.name} grain in band`).toBeLessThanOrEqual(WEAR_BANDS.grain.maxM);
      expect(spec.scuff.sizeM, `${material.name} scuff in band`).toBeGreaterThanOrEqual(WEAR_BANDS.scuff.minM);
      expect(spec.scuff.sizeM, `${material.name} scuff in band`).toBeLessThanOrEqual(WEAR_BANDS.scuff.maxM);
      expect(spec.traffic.sizeM, `${material.name} traffic in band`).toBeGreaterThanOrEqual(WEAR_BANDS.traffic.minM);
      expect(spec.traffic.sizeM, `${material.name} traffic in band`).toBeLessThanOrEqual(WEAR_BANDS.traffic.maxM);
    }
  });

  it('builds car paint as a physical dielectric with a clearcoat lobe', () => {
    for (const [hex, name] of [[0x3d6f80, 'nuketown2-car-aqua'], [0x27394f, 'nuketown2-car-saloon-navy'], [0x2f8f77, 'nuketown2-car-classic-jade']] as const) {
      const paint = createNuketown2CarPaintMaterial(hex, name);
      expect(paint.metalness, `${name} dielectric`).toBeLessThanOrEqual(0.05);
      expect(paint.clearcoat, `${name} clearcoat lobe`).toBeGreaterThan(0);
      // Physical node material, tagged the way the forge tags its paints.
      expect(paint.isMeshPhysicalNodeMaterial, `${name} physical node`).toBe(true);
    }
  });

  it('keeps the three car paints on one uniform-carried graph (HF-477 deploy fence)', () => {
    const aqua = createNuketown2CarPaintMaterial(0x3d6f80, 'nuketown2-car-aqua');
    const navy = createNuketown2CarPaintMaterial(0x27394f, 'nuketown2-car-saloon-navy');
    const jade = createNuketown2CarPaintMaterial(0x2f8f77, 'nuketown2-car-classic-jade');
    expect(materialGraphKey(navy)).toBe(materialGraphKey(aqua));
    expect(materialGraphKey(jade)).toBe(materialGraphKey(aqua));
  });

  it('keeps vehicle glass a flat dielectric', () => {
    const glass = createNuketown2VehicleGlassMaterial();
    expect(glass.metalness).toBeLessThanOrEqual(0.02);
  });

  it('sets no classic texture slots on any vehicle material', () => {
    const materials = [
      createNuketown2CarPaintMaterial(0x3d6f80, 'nuketown2-car-aqua'),
      createNuketown2ChromeMaterial(),
      createNuketown2TireMaterial(),
      createNuketown2TruckBoxMaterial(),
      createNuketown2VehicleGlassMaterial(),
    ];
    for (const material of materials) {
      const slots = material as unknown as Record<string, unknown>;
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'emissiveMap', 'bumpMap', 'displacementMap']) {
        expect(slots[slot], `${material.name} ${slot}`).toBeNull();
      }
    }
  });
});
