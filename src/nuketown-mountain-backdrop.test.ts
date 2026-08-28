/**
 * Pass 82 contract tests for the Nuke Town mountain backdrop.
 *
 *   1. OUTSIDE THE ARENA — every ridge vertex sits radially beyond the
 *      boundary fence's far corner, so no sightline inside the arena can
 *      intersect the backdrop. The ground skirt stays BELOW the arena ground
 *      plane everywhere.
 *   2. INSIDE THE CAMERA ENVELOPE — the whole backdrop stays within the
 *      atomic-acres 180 m camera far plane from every reachable position.
 *   3. ART-ONLY — no colliders, no shot surfaces, no shadow passes, fog on;
 *      building it does not mutate the constructed arena's authority.
 *   4. DETERMINISM + BUDGET — two builds are byte-identical; the whole ring
 *      costs three draws and a bounded triangle count.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildArena } from './map';
import {
  buildNuketownMountainBackdrop,
  NUKETOWN_BACKDROP_MAX_HEIGHT_M,
  NUKETOWN_BACKDROP_MAX_RADIAL_M,
  NUKETOWN_BACKDROP_MIN_RADIAL_M,
  NUKETOWN_BACKDROP_SKIRT_Y_M,
} from './nuketown-mountain-backdrop';

/** Boundary fence far corner: |x| 31.3 + 0.3 half depth, |z| 31.8 + 0.3. */
const FENCE_CORNER_RADIAL_M = Math.hypot(31.6, 32.1);
/** atomic-acres camera far plane (legacy-main: non-water arenas run 180). */
const ARENA_CAMERA_FAR_M = 180;
/** Furthest reachable camera from the origin (arena bounds corner). */
const CAMERA_CORNER_RADIAL_M = Math.hypot(31, 31.5);

function ridgeMeshes(group: THREE.Group): THREE.Mesh[] {
  return group.children.filter(
    (node): node is THREE.Mesh => node instanceof THREE.Mesh && node.name !== 'nuketown-backdrop-ground-skirt',
  );
}

describe('Nuke Town mountain backdrop (Pass 82)', () => {
  it('keeps every ridge vertex outside the boundary fence and inside the camera envelope', () => {
    expect(NUKETOWN_BACKDROP_MIN_RADIAL_M).toBeGreaterThan(FENCE_CORNER_RADIAL_M + 10);
    expect(NUKETOWN_BACKDROP_MAX_RADIAL_M + CAMERA_CORNER_RADIAL_M).toBeLessThan(ARENA_CAMERA_FAR_M);

    const parent = new THREE.Group();
    const backdrop = buildNuketownMountainBackdrop(parent);
    for (const mesh of ridgeMeshes(backdrop.group)) {
      const positions = mesh.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        const radial = Math.hypot(positions.getX(index), positions.getZ(index));
        expect(radial).toBeGreaterThanOrEqual(NUKETOWN_BACKDROP_MIN_RADIAL_M - 0.01);
        expect(radial).toBeLessThanOrEqual(NUKETOWN_BACKDROP_MAX_RADIAL_M + 0.01);
        expect(positions.getY(index)).toBeLessThanOrEqual(NUKETOWN_BACKDROP_MAX_HEIGHT_M + 0.01);
      }
    }
  });

  it('keeps the ground skirt below the arena ground plane everywhere', () => {
    const parent = new THREE.Group();
    const backdrop = buildNuketownMountainBackdrop(parent);
    const skirt = backdrop.group.getObjectByName('nuketown-backdrop-ground-skirt') as THREE.Mesh;
    expect(skirt).toBeDefined();
    expect(NUKETOWN_BACKDROP_SKIRT_Y_M).toBeLessThanOrEqual(-0.3);
    skirt.updateWorldMatrix(true, false);
    const positions = skirt.geometry.getAttribute('position');
    const world = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 1) {
      world.fromBufferAttribute(positions, index).applyMatrix4(skirt.matrixWorld);
      expect(world.y).toBeLessThanOrEqual(NUKETOWN_BACKDROP_SKIRT_Y_M + 0.01);
      expect(Math.hypot(world.x, world.z)).toBeLessThanOrEqual(NUKETOWN_BACKDROP_MAX_RADIAL_M + 0.01);
    }
  });

  it('is art-only: no colliders registered, no shadow passes, fog left on, arena authority untouched', () => {
    const scene = new THREE.Scene();
    const arena = buildArena(scene);
    const collidersBefore = arena.colliders.length;
    const physicsBefore = arena.physicsColliders.length;
    const shotSurfacesBefore = arena.shotSurfaces.length;
    const raycastBefore = arena.raycastMeshes.length;

    const backdrop = buildNuketownMountainBackdrop(scene);
    expect(arena.colliders.length).toBe(collidersBefore);
    expect(arena.physicsColliders.length).toBe(physicsBefore);
    expect(arena.shotSurfaces.length).toBe(shotSurfacesBefore);
    expect(arena.raycastMeshes.length).toBe(raycastBefore);

    expect(backdrop.group.userData.presentationOnly).toBe(true);
    expect(backdrop.group.userData.blocksShots).toBe(false);
    backdrop.group.traverse((node) => {
      expect(node.name).not.toMatch(/collider/i);
      expect(node.userData.collisionProxy).toBeUndefined();
      expect(node.userData.collisionAuthorityFor).toBeUndefined();
      if (node instanceof THREE.Mesh) {
        expect(node.castShadow).toBe(false);
        expect(node.userData.blocksShots).toBe(false);
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) expect(material.fog).not.toBe(false);
      }
    });
  });

  it('is deterministic and stays inside a three-draw, bounded-triangle budget', () => {
    const first = buildNuketownMountainBackdrop(new THREE.Group());
    const second = buildNuketownMountainBackdrop(new THREE.Group());
    expect(first.stats).toEqual(second.stats);
    expect(first.stats.meshes).toBe(3);
    expect(first.stats.triangles).toBeLessThan(3_000);
    const firstMeshes = ridgeMeshes(first.group);
    const secondMeshes = ridgeMeshes(second.group);
    expect(firstMeshes.length).toBe(secondMeshes.length);
    for (let index = 0; index < firstMeshes.length; index += 1) {
      expect(Array.from(firstMeshes[index].geometry.getAttribute('position').array))
        .toEqual(Array.from(secondMeshes[index].geometry.getAttribute('position').array));
    }
  });
});
