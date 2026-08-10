import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { carveFirstPersonAdsSightBore, trimFirstPersonRearOccluder } from './weapon-presentation';

function occludedSightModel(): THREE.Group {
  const root = new THREE.Group();
  const rear = new THREE.Object3D();
  rear.name = 'rear-sight-socket';
  rear.position.z = -0.4;
  const front = new THREE.Object3D();
  front.name = 'front-sight-socket';
  front.position.z = 0.4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.1, -0.1, 0,
    0.1, -0.1, 0,
    0.1, 0.1, 0,
    -0.1, 0.1, 0,
  ], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const blocker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  blocker.name = 'test_FP_LOD0_Runtime_static_MAT_blocker';
  root.add(rear, front, blocker);
  return root;
}

describe('physical first-person ADS aperture', () => {
  it.each(['carbine', 'mini-uzi'] as const)('degenerates cloned render triangles blocking the %s sight axis', (weapon) => {
    const model = occludedSightModel();
    const geometry = (model.getObjectByName('test_FP_LOD0_Runtime_static_MAT_blocker') as THREE.Mesh).geometry;
    const originalIndexCount = geometry.index?.count;

    const result = carveFirstPersonAdsSightBore(weapon, model);

    expect(result).toMatchObject({
      applied: true,
      contract: 'physical-aperture-spatial-degenerate-v1',
      rayCount: 9,
    });
    expect(result?.suppressedElements).toBeGreaterThanOrEqual(3);
    expect(geometry.index?.count).toBe(originalIndexCount);
    const index = geometry.index!;
    expect(Array.from({ length: index.count / 3 }, (_, triangle) => {
      const element = triangle * 3;
      return new Set([index.getX(element), index.getX(element + 1), index.getX(element + 2)]).size;
    })).toEqual([1, 1]);
  });

  it('does not alter weapons outside the explicit obstructed-sight set', () => {
    const model = occludedSightModel();
    const before = Array.from((model.children[2] as THREE.Mesh).geometry.index!.array);
    expect(carveFirstPersonAdsSightBore('smg', model)).toBeNull();
    expect(Array.from((model.children[2] as THREE.Mesh).geometry.index!.array)).toEqual(before);
  });

  it('removes only merged stock triangles intersecting the bounded rear-sight corridor', () => {
    const model = occludedSightModel();
    const rear = model.getObjectByName('rear-sight-socket')!;
    const front = model.getObjectByName('front-sight-socket')!;
    rear.position.z = 0;
    front.position.z = 0.4;
    const blocker = model.getObjectByName('test_FP_LOD0_Runtime_static_MAT_blocker') as THREE.Mesh;
    blocker.position.z = -0.2;
    const offAxis = blocker.clone();
    offAxis.name = 'test_FP_LOD0_Runtime_static_MAT_off-axis';
    offAxis.geometry = blocker.geometry.clone();
    offAxis.position.set(0.5, 0, -0.2);
    model.add(offAxis);
    const offAxisBefore = Array.from(offAxis.geometry.index!.array);

    const result = trimFirstPersonRearOccluder('carbine', model);

    expect(result).toMatchObject({
      applied: true,
      contract: 'rear-sight-axis-spatial-degenerate-v1',
      suppressedElements: 6,
      rayCount: 9,
    });
    expect(result!.suppressionRatio).toBeLessThan(0.6);
    expect(Array.from(blocker.geometry.index!.array)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(offAxis.geometry.index!.array)).toEqual(offAxisBefore);
  });
});
