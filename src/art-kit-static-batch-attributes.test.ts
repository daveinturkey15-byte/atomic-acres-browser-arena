import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { batchStaticMeshes } from './art-kit';

/**
 * HF-536 night regression: the frozen night head's boot smoke failed on
 * "THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index
 * 9 ... make sure \"forgeVehicleAnchor\" attribute exists among all
 * geometries". The vehicle-forge buckets carry a per-vertex placement anchor
 * for the shared weathering graph; kit boxes on the same shared material do
 * not. `batchStaticMeshes` keyed groups by material alone, so the mixed group
 * failed to merge, logged, and was left unbatched.
 */
describe('batchStaticMeshes attribute-signature grouping (preserve mode)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { errorSpy.mockRestore(); });

  function box(material: THREE.Material, x: number, extra = false): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    if (extra) {
      const count = geometry.getAttribute('position').count;
      geometry.setAttribute('forgeVehicleAnchor', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = x;
    mesh.updateMatrix();
    return mesh;
  }

  it('batches geometries with different attribute sets on one material into separate batches without a merge error', () => {
    const root = new THREE.Group();
    const shared = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (let index = 0; index < 9; index += 1) root.add(box(shared, index));
    root.add(box(shared, 9, true));
    root.add(box(shared, 10, true));
    const stats = batchStaticMeshes(root, root, () => '', 'preserve');
    const mergeErrors = errorSpy.mock.calls.filter((call: unknown[]) => String(call[0]).includes('mergeGeometries'));
    expect(mergeErrors, 'no mergeGeometries failure may be logged').toEqual([]);
    expect(stats.batches, 'plain boxes and anchored boxes form two batches').toBe(2);
    expect(stats.sourceMeshes, 'every source mesh is batched').toBe(11);
    const hidden = root.children.filter((child) => child.userData?.staticBatchRendered === true);
    expect(hidden.length, 'all eleven sources are hidden behind their batches').toBe(11);
  });
});
