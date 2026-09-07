import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWeaponModel, optimizeAttachedWeapon } from './art-kit';
import { importedWeaponAnimatedNodeNames } from './weapon-model';
import { WEAPON_IDS } from './protocol';

/**
 * Exact rendered bounds: every vertex is transformed by its own world matrix.
 * The union of per-mesh AABBs is NOT usable here - merging a rotated part
 * tightens its AABB, which reads as drift even when nothing moved.
 */
function renderedVertexBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !effectivelyVisible(node, root)) return;
    const position = node.geometry.getAttribute('position');
    if (!position) return;
    for (let index = 0; index < position.count; index += 1) {
      bounds.expandByPoint(vertex.fromBufferAttribute(position, index).applyMatrix4(node.matrixWorld));
    }
  });
  return bounds;
}

function effectivelyVisible(node: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = node; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === root) return true;
  }
  return true;
}

function visibleMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && effectivelyVisible(node, root)) meshes.push(node);
  });
  return meshes;
}

/**
 * The authored Pass 65 firearm layout, reproduced from m14-ebr-fp-lod0.glb /
 * slug-shotgun-fp-lod0.glb: sockets hang off the delivery root, and the ENTIRE
 * frame hangs off `weapon-action-driver`, the node every authored clip
 * translates. The optic lens and the action are semantic nodes inside it.
 */
function buildAuthoredStyleWeapon(): {
  root: THREE.Group;
  driver: THREE.Object3D;
  muzzleSocket: THREE.Object3D;
} {
  const material = new THREE.MeshStandardMaterial({ color: 0x4b555a });
  const root = new THREE.Group();
  root.name = 'probe-pass65-first-person-model';
  const visual = new THREE.Group();
  visual.name = 'probe-pass65-first-person-visual';
  // The delivery root carries the authored Z-up to Y-up correction.
  visual.rotation.x = -Math.PI / 2;
  root.add(visual);

  const muzzleSocket = new THREE.Object3D();
  muzzleSocket.name = 'muzzle-socket';
  muzzleSocket.position.set(0, 0.1, 1.02);
  visual.add(muzzleSocket);
  const gripSocket = new THREE.Object3D();
  gripSocket.name = 'grip-socket-r';
  gripSocket.position.set(0, -0.39, -0.22);
  visual.add(gripSocket);

  const driver = new THREE.Object3D();
  driver.name = 'weapon-action-driver';
  visual.add(driver);
  const frame = new THREE.Object3D();
  frame.name = 'weapon-frame';
  driver.add(frame);

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.9), material.clone());
  receiver.name = 'Probe_FP_LOD0_Runtime_static_MAT_Primary_PBR';
  receiver.position.set(0, 0.042, 0.3675);
  frame.add(receiver);
  // The rib the owner watched float: authored above the receiver, static.
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 1.1), material.clone());
  rib.name = 'Probe_FP_LOD0_Runtime_static_MAT_Gunmetal';
  rib.position.set(0, 0.139, 0.376);
  frame.add(rib);
  // The semantic optic window is excluded from batching by instantiateWeaponAsset.
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), material.clone());
  lens.name = 'Probe_FP_LOD0_Runtime_static_MAT_Lens';
  lens.position.set(0, 0.33, 0.365);
  lens.userData.dynamic = true;
  frame.add(lens);

  const action = new THREE.Object3D();
  action.name = 'weapon-action';
  frame.add(action);
  const actionMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), material.clone());
  actionMesh.name = 'Probe_FP_LOD0_Runtime_action_MAT_Gunmetal';
  actionMesh.position.set(0.0995, -0.0466, -0.0053);
  action.add(actionMesh);

  const magazine = new THREE.Object3D();
  magazine.name = 'weapon-magazine';
  frame.add(magazine);
  const magazineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.12), material.clone());
  magazineMesh.name = 'Probe_FP_LOD0_Runtime_magazine_MAT_Accent';
  magazineMesh.position.set(0, -0.24, 0.0626);
  magazine.add(magazineMesh);

  // The authored clip set: every one of them translates the driver. Values are
  // the real fire-clip extremes decoded from slug-shotgun-fp-lod0.glb.
  const mixer = new THREE.AnimationMixer(visual);
  const fire = new THREE.AnimationClip('fire', 0.29, [
    new THREE.VectorKeyframeTrack(
      'weapon-action-driver.position',
      [0, 0.145, 0.29],
      [0, 0, 0, 0, 0.0205, -0.0708, 0, 0, 0],
    ),
  ]);
  root.userData.importedWeaponRuntime = {
    mixer,
    actions: new Map([['fire', mixer.clipAction(fire)]]),
    weapon: 'slug-shotgun',
    crossbowLoadedBolt: null,
  };
  return { root, driver, muzzleSocket };
}

describe('authored weapon part attachment', () => {
  it('reports every node the authored clips drive', () => {
    const { root } = buildAuthoredStyleWeapon();
    expect([...importedWeaponAnimatedNodeNames(root)]).toEqual(['weapon-action-driver']);
    // A procedural model has no authored clips and therefore no driven nodes.
    expect(importedWeaponAnimatedNodeNames(buildWeaponModel('scattergun', false, false)).size).toBe(0);
  });

  it('keeps every batched part under the node the authored clips animate', () => {
    const { root, driver } = buildAuthoredStyleWeapon();
    optimizeAttachedWeapon(root, 'texture-lit');

    expect(root.userData.attachedWeaponBatchDestination).toBe('weapon-action-driver');
    const meshes = visibleMeshes(root);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      let parentedToDriver = false;
      for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
        if (node === driver) { parentedToDriver = true; break; }
      }
      // A part merged into the model root (or any node above the driver) stops
      // following the clip while its siblings keep moving - that is exactly
      // how the M14's optic and the Benelli's rib came off the gun.
      expect({ mesh: mesh.name, parentedToDriver }).toEqual({ mesh: mesh.name, parentedToDriver: true });
    }
  });

  it('moves the whole weapon with the driver instead of leaving the merged body behind', () => {
    const { root, driver } = buildAuthoredStyleWeapon();
    optimizeAttachedWeapon(root, 'texture-lit');
    const before = renderedVertexBounds(root);
    const meshesBefore = visibleMeshes(root)
      .map((mesh) => ({ mesh, world: mesh.getWorldPosition(new THREE.Vector3()) }));

    // The melee clip's authored peak; unequip reaches 0.400 m in the same units.
    driver.position.set(0, 0.0903, 0);
    const after = renderedVertexBounds(root);
    // driver Y maps to world -Z through the authored Z-up correction.
    const expected = new THREE.Vector3(0, 0, -0.0903);
    expect(after.min.clone().sub(before.min).distanceTo(expected)).toBeLessThan(1e-9);
    expect(after.max.clone().sub(before.max).distanceTo(expected)).toBeLessThan(1e-9);
    for (const { mesh, world } of meshesBefore) {
      const moved = mesh.getWorldPosition(new THREE.Vector3()).sub(world);
      expect({ mesh: mesh.name, detached: moved.distanceTo(expected) > 1e-9 })
        .toEqual({ mesh: mesh.name, detached: false });
    }
  });

  it('leaves authored sockets exactly where the delivery put them', () => {
    const { root, muzzleSocket } = buildAuthoredStyleWeapon();
    root.updateMatrixWorld(true);
    const before = muzzleSocket.getWorldPosition(new THREE.Vector3());
    optimizeAttachedWeapon(root, 'texture-lit');
    root.updateMatrixWorld(true);
    expect(root.getObjectByName('muzzle-socket')).toBe(muzzleSocket);
    expect(root.getObjectByName('grip-socket-r')).toBeDefined();
    expect(muzzleSocket.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeLessThan(1e-9);
  });
});

describe('procedural weapon part attachment', () => {
  it.each(WEAPON_IDS)('does not move any rendered vertex of %s when it batches', (id) => {
    const model = buildWeaponModel(id, false, false);
    const before = renderedVertexBounds(model);
    optimizeAttachedWeapon(model, 'vertex-lit');
    const after = renderedVertexBounds(model);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-6);
  });

  it('keeps a compound magazine at its authored offset instead of dropping it by that offset again', () => {
    // Regression: batchStaticMeshes baked WORLD matrices and then added the
    // merged result under the magazine, applying the magazine's own local
    // offset twice. Measured drops before the fix: carbine 0.222 m, SMG
    // 0.273 m, LMG 0.277 m, pistol 0.302 m, machine pistol 0.352 m.
    for (const [id, magazineName] of [
      ['carbine', 'curved-magazine'],
      ['smg', 'straight-magazine'],
      ['pistol', 'pistol-magazine'],
      ['machine-pistol', 'pistol-magazine'],
      ['lmg', 'lmg-box-magazine'],
    ] as const) {
      const model = buildWeaponModel(id, false, false);
      const magazine = model.getObjectByName(magazineName);
      expect(magazine, `${id} is missing ${magazineName}`).toBeDefined();
      const before = renderedVertexBounds(magazine!);
      optimizeAttachedWeapon(model, 'vertex-lit');
      const after = renderedVertexBounds(magazine!);
      expect(after.min.distanceTo(before.min), `${id} ${magazineName} min`).toBeLessThan(1e-6);
      expect(after.max.distanceTo(before.max), `${id} ${magazineName} max`).toBeLessThan(1e-6);
    }
  });

  it('never parents a weapon part outside the weapon it belongs to', () => {
    const scene = new THREE.Scene();
    for (const id of WEAPON_IDS) {
      const model = buildWeaponModel(id, false, false);
      scene.add(model);
      optimizeAttachedWeapon(model, 'vertex-lit');
      for (const mesh of visibleMeshes(model)) {
        let root: THREE.Object3D = mesh;
        while (root.parent && root.parent !== scene) root = root.parent;
        expect({ id, mesh: mesh.name, root: root === model })
          .toEqual({ id, mesh: mesh.name, root: true });
      }
    }
  });
});
