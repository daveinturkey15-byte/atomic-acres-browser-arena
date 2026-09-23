import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { loftBody, stationRing, collectStations } from './geometry';
import { SEDAN_SPEC } from './specs';
import { buildForgedVehicle, type ForgedVehicleMaterials } from './build';

const materials = Object.fromEntries(['paint', 'glass', 'lining', 'groove', 'chrome', 'accent', 'tyre', 'headLamp', 'tailLamp'].map(key => [key, new THREE.MeshBasicMaterial()])) as unknown as ForgedVehicleMaterials;

describe('rounded saloon skin and attached roof trim', () => {
  it('gives hood and deck a visible rolled shoulder without changing the body envelope', () => {
    for (const z of [0.3, 1.2, 3.52, 4.12]) {
      const ring = stationRing(SEDAN_SPEC, z);
      expect(ring.yTop - ring.points[9]![1], `edge radius at ${z}`).toBeGreaterThanOrEqual(0.1);
    }
    for (const z of collectStations(SEDAN_SPEC)) {
      const ring = stationRing(SEDAN_SPEC, z);
      for (const [x, y] of ring.points) {
        expect(Math.abs(x)).toBeLessThanOrEqual(0.95);
        expect(y).toBeGreaterThanOrEqual(0.22);
        expect(y).toBeLessThanOrEqual(1.88);
      }
    }
    expect(SEDAN_SPEC.length).toBe(4.4);
    expect(SEDAN_SPEC.wheelZ).toEqual([0.7, 3.7]);
    expect(SEDAN_SPEC.wheelRadius).toBe(0.34);
  });

  it('narrows and crowns the greenhouse while retaining the same station topology', () => {
    const roof = stationRing(SEDAN_SPEC, 2.9);
    expect(roof.points[9]![0]).toBeCloseTo(0.75, 8);
    expect(roof.points[12]![1] - roof.yTop).toBeCloseTo(0.025, 8);
    const flat = { ...SEDAN_SPEC, shoulderDepthM: undefined, roofCrownM: 0 };
    expect(collectStations(SEDAN_SPEC)).toEqual(collectStations(flat));
    const curved = loftBody(SEDAN_SPEC), before = loftBody(flat);
    for (const key of ['body', 'glass', 'lining', 'groove'] as const) {
      expect(curved[key]!.getAttribute('position').count).toBe(before[key]!.getAttribute('position').count);
    }
  });

  it('keeps four gutter bars attached to the new roof with outward winding', () => {
    const dressed = buildForgedVehicle(SEDAN_SPEC, { wheelStyle: 'cover', gutters: { x: 0.78, y: 1.78, z0: 1.9, z1: 3.0 } }, materials);
    const bare = buildForgedVehicle(SEDAN_SPEC, { wheelStyle: 'cover' }, materials);
    const gutters = dressed.partBounds.filter(part => part.part === 'detail.saloon.roof-gutter');
    expect(gutters).toHaveLength(4);
    expect(dressed.triangles - bare.triangles).toBe(128);
    for (const part of gutters) {
      const z = (part.min[2] + part.max[2]) / 2;
      const arc = stationRing(SEDAN_SPEC, z).points[10]!;
      const x = Math.abs((part.min[0] + part.max[0]) / 2);
      const y = (part.min[1] + part.max[1]) / 2;
      expect(Math.hypot(x - arc[0], y - arc[1])).toBeLessThan(0.02);
      expect(part.min[2]).toBeGreaterThan(2.12);
      expect(part.max[2]).toBeLessThan(2.9);
    }
    const chrome = dressed.group.children.find(child => child.userData.forgeBucket === 'chrome') as THREE.Mesh;
    const p = chrome.geometry.getAttribute('position'), n = chrome.geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i += 3) {
      if (p.getY(i) < 1.6) continue;
      const a = new THREE.Vector3().fromBufferAttribute(p, i);
      const face = new THREE.Vector3().fromBufferAttribute(p, i + 1).sub(a).cross(new THREE.Vector3().fromBufferAttribute(p, i + 2).sub(a));
      const normal = new THREE.Vector3().fromBufferAttribute(n, i);
      expect(face.dot(normal)).toBeGreaterThanOrEqual(-1e-8);
    }
  });
});

