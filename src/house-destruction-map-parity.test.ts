import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HOUSE_DESTRUCTION_DEFINITION_SET_ID } from './house-destruction';
import { InteractiveWorldRuntime } from './interactive-world-runtime';
import { buildArena } from './map';

describe('Atomic map preauthored house-fragment replacement', () => {
  it('keeps standalone static evidence but removes it from live Physics in favor of runtime authority', () => {
    const map = buildArena(new THREE.Scene());
    const binding = map.houseDestruction!;
    expect(binding.definitions).toHaveLength(10);
    expect(binding.staticColliders).toHaveLength(8);
    expect(binding.staticBallisticSurfaceIds).toHaveLength(8);
    for (const collider of binding.staticColliders) {
      expect(map.colliders).toContain(collider);
      expect(map.physicsColliders).not.toContain(collider);
    }
    const boundSurfaces = map.shotSurfaces.filter((surface) => binding.staticBallisticSurfaceIds.includes(surface.id));
    expect(boundSurfaces).toHaveLength(8);
    for (const surface of boundSurfaces) {
      expect(surface.houseFragment?.definitionSetId).toBe(HOUSE_DESTRUCTION_DEFINITION_SET_ID);
    }
    const boundMeshes: THREE.Object3D[] = [];
    map.root.traverse((node) => {
      if (node.userData.dynamicAuthorityReplacement === true) boundMeshes.push(node);
    });
    expect(boundMeshes).toHaveLength(8);
    expect(boundMeshes.every((mesh) => mesh.visible === false)).toBe(true);
    expect(boundMeshes.every((mesh) => map.raycastMeshes.includes(mesh))).toBe(true);

    const runtime = new InteractiveWorldRuntime(
      'atomic-acres', 51, [], true, undefined, undefined, binding.definitions,
    );
    const replaced = new Set(binding.staticColliders);
    const liveColliders = [
      ...map.colliders.filter((collider) => !replaced.has(collider)),
      ...runtime.collisions().movementColliders,
    ];
    expect(liveColliders).toHaveLength(map.colliders.length - 8 + 10);
    expect(runtime.collisions().ballisticSurfaces.filter((surface) => surface.houseFragment)).toHaveLength(10);
    runtime.dispose();
  });

  it('renders a runtime replacement instance exactly where every hidden pre-authored fragment collider lives', () => {
    // Pass 79 invisible-geometry lane: hiding a pre-authored house fragment
    // (map.ts bindPreauthoredFragment) is only legal if the interactive-world
    // runtime spawns a VISIBLE replacement at the same world transform.
    // A missing or drifted replacement is precisely the owner's "invisible
    // geometry" complaint: a wall you collide with but cannot see.
    const map = buildArena(new THREE.Scene());
    const binding = map.houseDestruction!;
    const hidden: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      if (node.userData.dynamicAuthorityReplacement === true && node instanceof THREE.Mesh) hidden.push(node);
    });
    expect(hidden).toHaveLength(8);

    const runtime = new InteractiveWorldRuntime(
      'atomic-acres', 7, [], true, undefined, undefined, binding.definitions,
    );
    type Instance = {
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      halfExtents: THREE.Vector3;
    };
    const instances: Instance[] = [];
    runtime.root.traverse((node) => {
      if (!(node instanceof THREE.InstancedMesh)) return;
      node.updateWorldMatrix(true, false);
      const parent = new THREE.Matrix4().copy(node.matrixWorld);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      for (let index = 0; index < node.count; index += 1) {
        node.getMatrixAt(index, matrix);
        matrix.premultiply(parent).decompose(position, quaternion, scale);
        // Presentation geometry is a 2x2x2 box scaled by half extents.
        if (scale.x > 1e-6 && scale.y > 1e-6 && scale.z > 1e-6) {
          instances.push({
            position: position.clone(),
            quaternion: quaternion.clone(),
            halfExtents: scale.clone(),
          });
        }
      }
    });
    // All 10 definitions render while attached (8 replace pre-authored
    // meshes, 2 are runtime-only furniture lockers).
    expect(instances).toHaveLength(10);

    const consumed = new Set<number>();
    for (const mesh of hidden) {
      mesh.updateWorldMatrix(true, false);
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      mesh.matrixWorld.decompose(position, quaternion, scale);
      let best = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      instances.forEach((instance, index) => {
        if (consumed.has(index)) return;
        const distance = instance.position.distanceTo(position);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
      });
      expect(best, `no runtime replacement near hidden fragment ${mesh.name}`).toBeGreaterThanOrEqual(0);
      const match = instances[best];
      expect(bestDistance, `replacement for ${mesh.name} drifted ${bestDistance.toFixed(3)}m`).toBeLessThan(0.01);
      // Authored boxes bake their size into the geometry, so derive world
      // half extents from bounds x scale rather than the scale alone.
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const boundsSize = new THREE.Vector3();
      mesh.geometry.boundingBox!.getSize(boundsSize);
      const halfExtents = boundsSize.multiply(scale).multiplyScalar(0.5);
      expect(match.halfExtents.x).toBeCloseTo(halfExtents.x, 3);
      expect(match.halfExtents.y).toBeCloseTo(halfExtents.y, 3);
      expect(match.halfExtents.z).toBeCloseTo(halfExtents.z, 3);
      const angle = match.quaternion.angleTo(quaternion);
      expect(angle, `replacement for ${mesh.name} rotated ${angle.toFixed(3)}rad`).toBeLessThan(0.01);
      consumed.add(best);
    }
    runtime.dispose();
  });
});
