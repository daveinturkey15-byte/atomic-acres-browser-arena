import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildNuketownForestSurround,
  FOREST_CONIFER_HEIGHT_M,
  FOREST_MAX_RADIAL_M,
  FOREST_RECT_MARGIN_M,
} from './nuketown-forest-surround';
import { ARENA_BOUNDS } from './arena-layout';
import { buildArena } from './map';

/**
 * Same discipline as nuketown-mountain-backdrop.test.ts: the forest is ART
 * ONLY by construction. Every instance must stand outside the inflated
 * boundary rectangle (so no in-arena sightline or traversal can meet it) and
 * inside the camera-far envelope the backdrop already proves; nothing may
 * register colliders or shot surfaces; two builds must be byte-identical.
 */
describe('Nuke Town forest surround', () => {
  it('plants every instance outside the inflated bounds and inside the foothill radius', () => {
    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);
    expect(forest.stats.conifers).toBeGreaterThan(200); // a forest, not a hedge
    expect(forest.stats.broadleafs).toBeGreaterThan(80);
    const matrix = new THREE.Matrix4();
    const positionVec = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    for (const child of forest.group.children) {
      const mesh = child as THREE.InstancedMesh;
      expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        matrix.decompose(positionVec, quaternion, scaleVec);
        const insideRect = positionVec.x > ARENA_BOUNDS.minX - FOREST_RECT_MARGIN_M
          && positionVec.x < ARENA_BOUNDS.maxX + FOREST_RECT_MARGIN_M
          && positionVec.z > ARENA_BOUNDS.minZ - FOREST_RECT_MARGIN_M
          && positionVec.z < ARENA_BOUNDS.maxZ + FOREST_RECT_MARGIN_M;
        expect(insideRect, `${mesh.name}[${index}] inside the arena rect`).toBe(false);
        expect(Math.hypot(positionVec.x, positionVec.z)).toBeLessThanOrEqual(FOREST_MAX_RADIAL_M + 0.01);
      }
    }
    forest.dispose();
  });

  it('is art-only: arena authority untouched, every mesh presentation-tagged', () => {
    const scene = new THREE.Scene();
    const arena = buildArena(scene);
    const collidersBefore = arena.colliders.length;
    const shotSurfacesBefore = arena.shotSurfaces.length;
    const raycastBefore = arena.raycastMeshes.length;
    const forest = buildNuketownForestSurround(scene);
    expect(arena.colliders.length).toBe(collidersBefore);
    expect(arena.shotSurfaces.length).toBe(shotSurfacesBefore);
    expect(arena.raycastMeshes.length).toBe(raycastBefore);
    forest.group.traverse((node) => {
      if (node !== forest.group) expect((node as THREE.Mesh).isMesh).toBe(true);
      expect(node.userData.presentationOnly).toBe(true);
      expect(node.userData.blocksShots).toBe(false);
      expect(node.castShadow).toBe(false);
    });
    forest.dispose();
  });

  it('is deterministic: two builds produce identical instance streams', () => {
    const first = buildNuketownForestSurround(new THREE.Group());
    const second = buildNuketownForestSurround(new THREE.Group());
    expect(first.stats).toEqual(second.stats);
    for (let meshIndex = 0; meshIndex < first.group.children.length; meshIndex += 1) {
      const a = first.group.children[meshIndex] as THREE.InstancedMesh;
      const b = second.group.children[meshIndex] as THREE.InstancedMesh;
      expect(Array.from(a.instanceMatrix.array)).toEqual(Array.from(b.instanceMatrix.array));
    }
    first.dispose();
    second.dispose();
  });

  it('varies the treeline silhouette with standouts above the line (DAY-VISUAL-B)', () => {
    const parent = new THREE.Group();
    const forest = buildNuketownForestSurround(parent);
    const conifers = forest.group.children.find(
      (child) => (child as THREE.InstancedMesh).name === 'forest-conifers',
    ) as THREE.InstancedMesh;
    // Leader spire tip: the prototype grows from 9.4 m to FOREST_CONIFER_HEIGHT_M.
    conifers.geometry.computeBoundingBox();
    expect(conifers.geometry.boundingBox!.max.y).toBeGreaterThan(FOREST_CONIFER_HEIGHT_M - 0.01);
    expect(conifers.geometry.boundingBox!.max.y).toBeLessThan(FOREST_CONIFER_HEIGHT_M + 0.01);
    const matrix = new THREE.Matrix4();
    const positionVec = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();
    let minY = Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < conifers.count; index += 1) {
      conifers.getMatrixAt(index, matrix);
      matrix.decompose(positionVec, quaternion, scaleVec);
      minY = Math.min(minY, scaleVec.y);
      maxY = Math.max(maxY, scaleVec.y);
    }
    // Varied heights with a few standouts: world-height spread at least 10 m,
    // and at least one tree growing near twice the prototype.
    expect((maxY - minY) * FOREST_CONIFER_HEIGHT_M).toBeGreaterThanOrEqual(10);
    expect(maxY).toBeGreaterThanOrEqual(1.9);
    // The ring stays a small share of the arena budget (measured 66,713).
    expect(forest.stats.triangles).toBeLessThan(80_000);
    forest.dispose();
});
  });
