import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { proveTriangleShotCoverage } from '../scripts/qa/triangle-shot-coverage';
import type { BallisticSurface } from './ballistics';

const box: BallisticSurface = { id: 'box', name: 'box', material: 'thin-metal', classification: 'explicit',
  bounds: { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -0.1, maxZ: 0.1 } };
const triangle = [new THREE.Vector3(-0.5, 0.5, 0), new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(0, 1.5, 0)];
describe('complete physical triangle coverage', () => {
  it('proves a complete triangle and retains the actual authority identity', () => {
    expect(proveTriangleShotCoverage(triangle, [box])).toEqual({ triangles: 1, surfaceIds: ['box'] });
  });
  it('rejects a triangle bridging separate boxes even though every vertex is covered somewhere', () => {
    const boxes = triangle.map((v, i) => ({ ...box, id: `${i}`, bounds: { minX: v.x - .01, maxX: v.x + .01,
      minY: v.y - .01, maxY: v.y + .01, minZ: -.01, maxZ: .01 } }));
    expect(proveTriangleShotCoverage(triangle, boxes)).toBeNull();
  });
  it('uses the rotated convex volume, not its larger world bounding rectangle', () => {
    const rotated = { ...box, bounds: { ...box.bounds, rotation: [0, Math.PI / 4, 0] as [number, number, number] } };
    const corner = triangle.map(v => new THREE.Vector3(.6 + v.x * .1, v.y, .6));
    expect(proveTriangleShotCoverage(corner, [rotated])).toBeNull();
    const transformed = triangle.map(v => v.clone().sub(new THREE.Vector3(0, 1, 0))
      .applyEuler(new THREE.Euler(0, Math.PI / 4, 0)).add(new THREE.Vector3(0, 1, 0)));
    expect(proveTriangleShotCoverage(transformed, [rotated])?.triangles).toBe(1);
  });
  it.each(['empty', 'partial', 'nonfinite', 'missing-box', 'invalid-box'] as const)('fails closed on %s', kind => {
    const vertices = triangle.map(v => v.clone()); let boxes = [box];
    if (kind === 'empty') vertices.length = 0;
    if (kind === 'partial') vertices.pop();
    if (kind === 'nonfinite') vertices[0]!.x = NaN;
    if (kind === 'missing-box') boxes = [];
    if (kind === 'invalid-box') boxes = [{ ...box, bounds: { ...box.bounds, minX: 2 } }];
    expect(proveTriangleShotCoverage(vertices, boxes)).toBeNull();
  });
});
