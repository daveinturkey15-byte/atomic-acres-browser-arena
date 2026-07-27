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
});
