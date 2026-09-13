import { describe, expect, it } from 'vitest';
import { Matrix4, Mesh, Vector3 } from 'three';
import { createStudioInteriors, STUDIO_INTERIOR_BUDGET, type StudioInteriorAnchor } from './index';

const rows: [string, string, number, number, number, number, [number, number]][] = [
  ['sofa', 'living', 5.4, 0.06, -4.4, -Math.PI / 2, [2.2, 0.9]],
  ['coffee-table', 'living', 3.6, 0.06, -4.4, 0, [1.2, 0.6]],
  ['tv-unit', 'living', 1, 0.06, -4.4, Math.PI / 2, [1.6, 0.5]],
  ['dining-table', 'dining', -3.4, 0.06, -3.4, 0, [1.6, 1]],
  ['kitchen-run', 'kitchen', -6.2, 0.06, 5.2, Math.PI / 2, [4.4, 0.65]],
  ['bed', 'bedroom', 4.6, 3.3, -5.2, -Math.PI / 2, [2, 1.9]],
  ['wardrobe', 'bedroom', 1, 3.3, -7.4, Math.PI / 2, [1.8, 0.6]],
  ['desk', 'study', -5.8, 3.3, -6, Math.PI / 2, [1.6, 0.7]],
  ['bed2', 'bedroom2', -5.4, 3.3, 6.6, Math.PI / 2, [1.9, 1.4]],
  ['workbench', 'garage', -3, 0.06, 11.5, Math.PI / 2, [2.4, 0.7]],
];
function anchors(): StudioInteriorAnchor[] {
  return [-1, 1].flatMap(side => rows.map(([id, room, x, y, z, yaw, footprint]) => ({
    id: `house-${side}-${id}`, room, position: [side * 20 + side * x, y, z] as [number, number, number],
    yaw: side > 0 ? yaw : Math.PI - yaw, footprint,
  })));
}
describe('World Studio interior factories', () => {
  it('builds all twenty authored furniture anchors within frozen CPU budgets', () => {
    const { root, solids } = createStudioInteriors(anchors());
    expect(root.userData.cost.triangles).toBeLessThanOrEqual(STUDIO_INTERIOR_BUDGET.triangles);
    expect(root.userData.cost.drawGroups).toBeLessThanOrEqual(STUDIO_INTERIOR_BUDGET.drawGroups);
    expect(root.children).toHaveLength(8);
    expect(new Set(solids.map(s => s.id)).size).toBe(solids.length);
    expect(solids.length).toBeGreaterThan(50);
    for (const child of root.children) {
      expect(child).toBeInstanceOf(Mesh);
      const mesh = child as Mesh;
      for (const attribute of Object.values(mesh.geometry.attributes))
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      expect(mesh.geometry.index).toBeNull();
      expect(mesh.geometry.groups).toHaveLength(0);
    }
  });
  it('keeps every visible part inside the exact local anchor footprint, including mirrored yaw', () => {
    const list = anchors(), { root } = createStudioInteriors(list);
    for (const component of root.userData.components) {
      const anchor = list.find(a => a.id === component.anchorId)!;
      expect(Math.abs(component.local[0]) + component.size[0] / 2).toBeLessThanOrEqual(anchor.footprint[0] / 2 + 1e-6);
      expect(Math.abs(component.local[2]) + component.size[2] / 2).toBeLessThanOrEqual(anchor.footprint[1] / 2 + 1e-6);
    }
  });
  it('rotates each authority OBB around its own world centre and leaves table leg space open', () => {
    const list = anchors(), { root, solids } = createStudioInteriors(list);
    for (const solid of solids) {
      const anchor = list.find(a => solid.id.startsWith(a.id + '-'))!;
      expect(solid.bounds.rotation).toEqual([0, anchor.yaw, 0]);
      const centre = new Vector3((solid.bounds.minX + solid.bounds.maxX) / 2,
        (solid.bounds.minY! + solid.bounds.maxY!) / 2, (solid.bounds.minZ + solid.bounds.maxZ) / 2);
      const component = root.userData.components.find((c: { id: string }) => c.id === solid.id);
      const expected = new Vector3(...component.local as [number, number, number])
        .applyMatrix4(new Matrix4().makeRotationY(anchor.yaw)).add(new Vector3(...anchor.position));
      expect(centre.distanceTo(expected)).toBeLessThan(1e-7);
      expect(root.children).toContain(solid.mesh);
      const local = centre.clone().sub(new Vector3(...anchor.position)).applyMatrix4(new Matrix4().makeRotationY(-anchor.yaw));
      expect(Math.abs(local.x)).toBeLessThanOrEqual(anchor.footprint[0] / 2);
      expect(Math.abs(local.z)).toBeLessThanOrEqual(anchor.footprint[1] / 2);
    }
    const table = solids.filter(s => s.id.startsWith('house-1-coffee-table-'));
    expect(table).toHaveLength(5);
    expect(table.some(s => s.id.endsWith('tabletop'))).toBe(true);
    expect(table.every(s => s.id.includes('-leg-') || s.id.endsWith('-tabletop'))).toBe(true);
  });
  it('uses separate cushions, bedding and functional cabinet details with original procedural materials', () => {
    const { root } = createStudioInteriors(anchors());
    const names = root.userData.components.map((c: { id: string }) => c.id) as string[];
    for (const part of ['seat-cushion-2', 'back-cushion-2', 'duvet', 'pillow-1', 'sink-basin', 'tap-spout', 'cabinet-pull-6', 'television-glass'])
      expect(names.some(name => name.endsWith(part))).toBe(true);
    const textured = root.children.filter(child => Boolean(((child as Mesh).material as any).map));
    expect(textured).toHaveLength(4);
    for (const child of textured) {
      const material = (child as Mesh).material as any;
      expect(material.map.image.data.length).toBe(128 * 128 * 4);
      expect(material.normalMap).toBeTruthy();
      expect(material.roughnessMap).toBeTruthy();
    }
  });
  it('rejects malformed, duplicated, unsupported and too-small anchors', () => {
    const one = anchors()[0]!;
    expect(() => createStudioInteriors([one, one])).toThrow(/duplicate/);
    expect(() => createStudioInteriors([{ ...one, yaw: NaN }])).toThrow(/Invalid/);
    expect(() => createStudioInteriors([{ ...one, id: 'unknown' }])).toThrow(/Unsupported/);
    expect(() => createStudioInteriors([{ ...one, footprint: [0.1, 0.1] }])).toThrow();
  });
});
