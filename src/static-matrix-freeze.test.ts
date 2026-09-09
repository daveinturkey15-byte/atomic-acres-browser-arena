/**
 * HF-491 perf lane (HITL 5): `freezeStaticArenaMatrices` stops the per-frame
 * matrix recompose for the parts of a mounted arena that never move, and ONLY
 * those. The falsifier is the thing that would break gameplay if it were
 * wrong: a dynamic subtree (a door, a shard cluster) must stay live, and a
 * frozen node must still carry the world matrix it had when it was frozen.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { freezeMatrixWorldWalk, freezeStaticArenaMatrices } from './static-matrix-freeze';

function mesh(name: string): THREE.Mesh {
  const node = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  node.name = name;
  return node;
}

describe('freezeStaticArenaMatrices', () => {
  it('freezes batch-hidden sources, render batches and LOD subtrees; leaves dynamic and live nodes alone', () => {
    const root = new THREE.Group();
    root.name = 'arena';
    root.position.set(3, 0, -2);

    const hiddenSource = mesh('wall');
    hiddenSource.position.set(1, 2, 3);
    hiddenSource.visible = false;
    hiddenSource.userData.staticBatchRendered = true;

    const liveMesh = mesh('shard-cluster');
    liveMesh.position.set(4, 0, 0);

    const batches = new THREE.Group();
    batches.name = 'arena-render-batches';
    const batch = mesh('batch');
    batches.add(batch);

    const lod = new THREE.LOD();
    lod.position.set(-5, 0, 5);
    const level0 = mesh('hedge-L0');
    const level1 = mesh('hedge-L1');
    lod.addLevel(level0, 0);
    lod.addLevel(level1, 20);

    const door = new THREE.Group();
    door.name = 'door';
    door.userData.dynamic = true;
    const doorLeaf = mesh('door-leaf');
    doorLeaf.userData.staticBatchRendered = true;
    doorLeaf.visible = false;
    door.add(doorLeaf);

    root.add(hiddenSource, liveMesh, batches, lod, door);

    const frozen = freezeStaticArenaMatrices(root);

    // hidden source (1) + batches group and its mesh (2) + LOD and two levels (3).
    expect(frozen).toBe(6);
    expect(hiddenSource.matrixAutoUpdate).toBe(false);
    expect(batches.matrixAutoUpdate).toBe(false);
    expect(batch.matrixAutoUpdate).toBe(false);
    expect(lod.matrixAutoUpdate).toBe(false);
    expect(level0.matrixAutoUpdate).toBe(false);
    expect(level1.matrixAutoUpdate).toBe(false);
    // Live and dynamic content keeps its per-frame dynamics.
    expect(liveMesh.matrixAutoUpdate).toBe(true);
    expect(root.matrixAutoUpdate).toBe(true);
    expect(door.matrixAutoUpdate).toBe(true);
    expect(doorLeaf.matrixAutoUpdate, 'a dynamic subtree is skipped entirely').toBe(true);

    // The frozen local matrix is the one composed from the authored transform,
    // and the routine walk (no walk-skip installed) still lands the correct
    // world matrix on every frozen node.
    root.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    hiddenSource.getWorldPosition(world);
    expect(world.toArray()).toEqual([4, 2, 1]);
    level0.getWorldPosition(world);
    expect(world.toArray()).toEqual([-2, 0, 3]);
    expect(Object.prototype.hasOwnProperty.call(lod, 'updateMatrixWorld')).toBe(false);

    // Idempotent: a second pass finds nothing left to freeze.
    expect(freezeStaticArenaMatrices(root)).toBe(0);
  });
});

describe('freezeMatrixWorldWalk', () => {
  it('turns a dormant presentation root into an explicit-update boundary', () => {
    const scene = new THREE.Scene();
    const boundary = new THREE.Group();
    const child = mesh('live-child');
    boundary.position.set(2, 0, 0);
    child.position.set(0, 0, 3);
    boundary.add(child);
    scene.add(boundary);

    scene.updateMatrixWorld(true);
    const before = child.getWorldPosition(new THREE.Vector3()).toArray();
    freezeMatrixWorldWalk(boundary);
    boundary.position.x = 9;
    scene.updateMatrixWorld(true);

    expect(boundary.matrixAutoUpdate).toBe(false);
    expect(boundary.matrixWorldAutoUpdate).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(boundary, 'updateMatrixWorld')).toBe(true);
    expect(child.getWorldPosition(new THREE.Vector3()).toArray()).toEqual(before);

    // The owning presentation may still refresh a live child explicitly.
    boundary.matrixWorld.copy(new THREE.Matrix4().makeTranslation(9, 0, 0));
    child.updateWorldMatrix(false, false, true);
    expect(child.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([9, 0, 3]);
  });
});
