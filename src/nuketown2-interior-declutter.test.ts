import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildNuketown2 } from './nuketown2-arena';
import type { ArenaMap } from './map';

function hasColliderMatch(box3: THREE.Box3, colliders: ArenaMap['colliders']): boolean {
  for (const c of colliders) {
    if (
      Math.abs(c.minX - box3.min.x) <= 1e-3 &&
      Math.abs(c.maxX - box3.max.x) <= 1e-3 &&
      Math.abs(c.minZ - box3.min.z) <= 1e-3 &&
      Math.abs(c.maxZ - box3.max.z) <= 1e-3
    ) {
      if (c.minY !== undefined) {
        if (Math.abs(c.minY - box3.min.y) <= 1e-3) return true;
      } else {
        return true;
      }
    }
  }
  return false;
}

describe('nuketown2 interior declutter behavioral contracts', () => {
  it('ensures no kit mesh in house or garage interior carries a collider or ballistic surface', () => {
    const map = buildNuketown2(new THREE.Scene());
    map.root.updateMatrixWorld(true);

    const violations: string[] = [];
    map.root.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = mesh.name || '';
      if (!name.includes('house interior') && !name.includes('garage interior')) return;

      const box3 = new THREE.Box3().setFromObject(mesh);
      const hasCollider = hasColliderMatch(box3, map.colliders);
      const hasBallistic = typeof mesh.userData?.ballisticSurfaceId === 'string';

      if (hasCollider || hasBallistic) {
        violations.push(`${name} (hasCollider: ${hasCollider}, hasBallistic: ${hasBallistic})`);
      }
    });

    expect(violations, 'interior kit meshes must remain pure presentation').toEqual([]);
  });

  it('preserves the six gameplay cover solids on both north and south sides with collider and ballistic authority', () => {
    const map = buildNuketown2(new THREE.Scene());
    map.root.updateMatrixWorld(true);

    const requiredSolids = [
      'house front room counter',
      'house kitchen island',
      'house back room bench',
      'house living couch',
      'house upper crate',
      'house upper bed',
    ];

    for (const side of ['north', 'south'] as const) {
      for (const authoredName of requiredSolids) {
        const expectedName = `nuketown2 ${side} ${authoredName}`;
        const mesh = map.root.getObjectByName(expectedName) as THREE.Mesh | undefined;
        expect(mesh, `solid body ${expectedName} must exist`).toBeDefined();

        const box3 = new THREE.Box3().setFromObject(mesh!);
        const hasCollider = hasColliderMatch(box3, map.colliders);
        const hasBallistic = typeof mesh!.userData?.ballisticSurfaceId === 'string';

        expect(hasCollider, `${expectedName} must carry a matching collider`).toBe(true);
        expect(hasBallistic, `${expectedName} must carry ballistic surface authority`).toBe(true);
      }
    }
  });

  it('counts meshes with visible === false and userData.staticBatchRendered === true as present in declutter sweeps', () => {
    const map = buildNuketown2(new THREE.Scene());
    map.root.updateMatrixWorld(true);

    let batchRenderedHiddenCount = 0;
    map.root.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.visible === false && mesh.userData?.staticBatchRendered === true) {
        batchRenderedHiddenCount++;
      }
    });

    // Falsifier for §2.4(a): batch-merged boxes are set visible = false by batchPresentationOnlyBoxes
    // but remain in the scene graph with staticBatchRendered = true.
    expect(
      batchRenderedHiddenCount,
      'batch-rendered hidden source meshes must exist in the graph and not be ignored',
    ).toBeGreaterThan(0);
  });
});
