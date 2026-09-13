import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { meshComponentCensus } from '../scripts/qa/mesh-component-census';
import { wheelParts } from './vehicle-forge/wheels';

function fixture(): THREE.Mesh {
  const wheel = wheelParts(0.47, 0.14, 'cover');
  const wheelGeometries = [wheel.tyre, wheel.dark].map(g => g.translate(0, 0.47, 0));
  const second = wheelGeometries.map(g => g.clone().translate(0, 0, 2));
  const patch = new THREE.PlaneGeometry(1, 1).toNonIndexed().rotateX(-Math.PI / 2).translate(0, 0.012, 1);
  return new THREE.Mesh(mergeGeometries([...wheelGeometries, ...second, patch])!, new THREE.MeshBasicMaterial());
}
function signature(mesh: THREE.Mesh) {
  return meshComponentCensus([mesh]).map(({ bounds, vertexCount }) => ({
    min: bounds.min.toArray(), max: bounds.max.toArray(), vertexCount,
  }));
}
describe('connected triangle census', () => {
  it('keeps 0.94m tyres whole, distinct from their flat contact dressing, and accounts for every vertex', () => {
    const mesh = fixture(); const components = meshComponentCensus([mesh]);
    expect(components).toHaveLength(3);
    expect(components.filter(c => c.bounds.max.y - c.bounds.min.y >= 0.5)).toHaveLength(2);
    expect(components.reduce((sum, c) => sum + c.vertexCount, 0)).toBe(mesh.geometry.getAttribute('position').count);
    for (const c of components.filter(c => c.bounds.max.y > 0.5)) {
      expect(c.bounds.min.y).toBeCloseTo(0.035, 6);
      expect(c.bounds.max.y).toBeCloseTo(0.94, 6);
    }
  });
  it('does not change membership when triangle or vertex order is reversed', () => {
    const mesh = fixture(); const expected = signature(mesh);
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const values = Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)]);
    position.array.set(values.reverse().flat());
    expect(signature(mesh)).toEqual(expected);
  });
  it('preserves a displaced wheel and elevated stray patch as findings rather than dropping them', () => {
    const mesh = fixture(); const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      if (p.getZ(i) > 1.5) p.setX(i, p.getX(i) + 20);
      if (p.getY(i) < 0.02) p.setY(i, 0.7);
    }
    const components = meshComponentCensus([mesh]);
    expect(components).toHaveLength(3);
    expect(components.some(c => c.bounds.min.x > 19)).toBe(true);
    expect(components.some(c => c.bounds.min.y > 0.69 && c.bounds.max.y - c.bounds.min.y < 0.5)).toBe(true);
  });
  it.each(['NaN', 'infinite-transform', 'indexed', 'missing-position'] as const)('rejects %s rather than making it disappear', kind => {
    const mesh = fixture();
    if (kind === 'NaN') mesh.geometry.getAttribute('position').setX(0, NaN);
    if (kind === 'infinite-transform') mesh.position.x = Infinity;
    if (kind === 'indexed') mesh.geometry.setIndex([0, 1, 2]);
    if (kind === 'missing-position') mesh.geometry.deleteAttribute('position');
    expect(() => meshComponentCensus([mesh])).toThrow();
  });
});
