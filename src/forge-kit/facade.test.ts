import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  buildNorthHouseFacade,
  createFacadeMaterials,
  doorUnit,
  downpipe,
  facadeTriangleCount,
  gutterRun,
  lapSiding,
  shingleRoofSlab,
  windowUnit,
} from './facade';

function attributesAreFinite(root: THREE.Object3D): boolean {
  let ok = true;
  root.traverse((object) => {
    const geometry = (object as THREE.Mesh).geometry;
    if (!geometry) return;
    for (const name of ['position', 'normal'] as const) {
      const attribute = geometry.getAttribute(name);
      if (!attribute) continue;
      for (let index = 0; index < attribute.count * attribute.itemSize; index += 1) {
        if (!Number.isFinite(attribute.array[index])) ok = false;
      }
    }
  });
  return ok;
}

describe('HF-536 facade kit', () => {
  it('builds each requested part with real dimensions and finite geometry', () => {
    const materials = createFacadeMaterials();
    const parts = [
      lapSiding(4, 3, 0.22, materials),
      windowUnit(1.8, 2.2, materials),
      doorUnit(1.2, 2.5, materials),
      gutterRun(6, materials),
      downpipe(4, materials),
      shingleRoofSlab(8, 5, 0.34, materials),
    ];
    expect(parts.every((part) => facadeTriangleCount(part) > 0)).toBe(true);
    expect(attributesAreFinite(new THREE.Group().add(...parts))).toBe(true);
    expect(parts[0]!.userData.courseHeight).toBe(0.22);
    expect(parts[3]!.getObjectByName('gutter-bracket-0')).toBeTruthy();
    expect(parts[5]!.userData.courseHeight).toBe(0.30);
  });

  it('uses the five existing roles plus one bounded inset material and a TSL height field', () => {
    const materials = createFacadeMaterials();
    const facade = buildNorthHouseFacade({ materials });
    const roleNames = new Set<string>();
    facade.traverse((object) => {
      const role = (object as THREE.Mesh).userData.facadeRole;
      if (typeof role === 'string') roleNames.add(role);
    });
    expect([...roleNames].sort()).toEqual(['glass', 'inset', 'painted-metal', 'roof', 'siding', 'trim']);
    const siding = materials.siding as THREE.Material & { normalNode?: unknown; userData: Record<string, unknown> };
    expect(siding.normalNode).toBeTruthy();
    expect(siding.userData.facadeHeightField).toMatchObject({ integerNoisePeriods: [1100, 14] });
    expect(materials.siding.name).toContain('siding');
    expect(materials.trim.name).toContain('trim');
    expect(materials.glass.name).toContain('glass');
    expect(materials.roof.name).toContain('roof');
    expect(materials.paintedMetal.name).toContain('metal');
  });

  it('pins the complete north-house front under the 20,000 triangle budget', () => {
    const facade = buildNorthHouseFacade();
    const triangles = facadeTriangleCount(facade);
    expect(triangles).toBeLessThanOrEqual(20_000);
    expect(triangles).toBeGreaterThan(1_000);
    expect(attributesAreFinite(facade)).toBe(true);
    const bounds = new THREE.Box3().setFromObject(facade);
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(10.9);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(6.1);
  });
});
