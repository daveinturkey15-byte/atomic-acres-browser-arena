/**
 * nuketown-garden-dressing.ts — Pass 81 art: the two END GARDENS are where
 * every round starts (2026-08-29 redesign), and after the rotate they were
 * bare lawn behind a flat timber box. This module dresses them with the
 * vegetation skill's instanced recipes, all deterministic and presentation
 * only:
 *
 *   - fence plank relief: the spawn fences read as built plank runs (vertical
 *     board instances + a cap rail per segment) instead of one extruded box;
 *   - flower borders: low instanced bloom clusters along the garden face of
 *     each fence, per-instance colour from a fixed cottage palette;
 *   - a paver path from each fence's central trail mouth into the garden;
 *   - a merged three-lobe shrub (mergeTransformed recipe, computed inline) at
 *     each door gap's garden-side corner.
 *
 * COMBAT SAFETY: no colliders, no raycast/shot registration; every mesh is
 * tagged presentationOnly + blocksShots:false. The planks sit flush ON the
 * authored fence collider so the collider/visual parity audit explains them
 * by the fence's own movement authority. Determinism: one fixed-seed
 * mulberry32 stream per subsystem — identical on every peer.
 */
import * as THREE from 'three';
import {
  SPAWN_END_FENCE_SEGMENTS,
  SPAWN_END_FENCE_SIZE,
  SPAWN_END_FENCE_X,
} from './arena-layout';

const PLANK_SEED = 0x9a4d_11c3;
const BLOOM_SEED = 0x5e21_77af;

export interface NuketownGardenDressingStats {
  planks: number;
  blooms: number;
  pavers: number;
  shrubs: number;
  triangles: number;
}

export interface NuketownGardenDressing {
  group: THREE.Group;
  stats: Readonly<NuketownGardenDressingStats>;
  dispose(): void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function markPresentation(object: THREE.Object3D): void {
  object.userData.presentationOnly = true;
  object.userData.blocksShots = false;
}

function triCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.index;
  if (index) return index.count / 3;
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}

/** Cottage-garden bloom palette (fixed order; per-instance pick is seeded). */
const BLOOM_COLORS = [0xd9534f, 0xe8a33d, 0xd070b8, 0xf2ead0, 0xc4574e, 0x9a63c9];

export function buildNuketownGardenDressing(parent: THREE.Object3D): NuketownGardenDressing {
  const group = new THREE.Group();
  group.name = 'nuketown-garden-dressing';
  markPresentation(group);

  const stats: NuketownGardenDressingStats = { planks: 0, blooms: 0, pavers: 0, shrubs: 0, triangles: 0 };
  const disposables: Array<{ dispose(): void }> = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3(1, 1, 1);

  const fenceHeight = SPAWN_END_FENCE_SIZE.height;
  const fenceDepth = SPAWN_END_FENCE_SIZE.depth;

  // ---- fence plank relief ------------------------------------------------
  // Boards on BOTH faces of every run; each board leans a seeded hair so the
  // runs read hand-built. Flush on the collider (face +/- 0.04 m).
  const plankGeometry = new THREE.BoxGeometry(0.055, fenceHeight * 0.94, 0.15);
  const plankMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6844, roughness: 0.92, metalness: 0.02 });
  disposables.push(plankGeometry, plankMaterial);
  const plankRng = mulberry32(PLANK_SEED);
  const plankSlots: Array<{ x: number; z: number; lean: number; tone: number }> = [];
  for (const sign of [1, -1] as const) {
    for (const [zCentre, zLength] of SPAWN_END_FENCE_SEGMENTS) {
      const z0 = sign * zCentre - zLength / 2;
      const boards = Math.floor(zLength / 0.17);
      for (const face of [1, -1] as const) {
        const x = sign * SPAWN_END_FENCE_X + face * (fenceDepth / 2 + 0.04);
        for (let board = 0; board < boards; board += 1) {
          plankSlots.push({
            x,
            z: z0 + (board + 0.5) * (zLength / boards),
            lean: (plankRng() - 0.5) * 0.05,
            tone: 0.86 + plankRng() * 0.28,
          });
        }
      }
      // Cap rail across the top of the run, one per face pair.
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(fenceDepth + 0.14, 0.09, zLength + 0.06),
        plankMaterial,
      );
      rail.position.set(sign * SPAWN_END_FENCE_X, fenceHeight + 0.045, sign * zCentre);
      rail.castShadow = false;
      rail.receiveShadow = true;
      markPresentation(rail);
      stats.triangles += 12;
      group.add(rail);
      disposables.push(rail.geometry);
    }
  }
  const planks = new THREE.InstancedMesh(plankGeometry, plankMaterial, plankSlots.length);
  planks.name = 'nuketown-garden-fence-planks';
  const plankColor = new THREE.Color();
  for (let index = 0; index < plankSlots.length; index += 1) {
    const slot = plankSlots[index];
    euler.set(0, 0, slot.lean);
    quaternion.setFromEuler(euler);
    position.set(slot.x, (fenceHeight * 0.94) / 2, slot.z);
    matrix.compose(position, quaternion, scaleVec);
    planks.setMatrixAt(index, matrix);
    planks.setColorAt(index, plankColor.setScalar(slot.tone));
  }
  planks.instanceMatrix.needsUpdate = true;
  if (planks.instanceColor) planks.instanceColor.needsUpdate = true;
  planks.computeBoundingSphere();
  planks.castShadow = false;
  planks.receiveShadow = true;
  markPresentation(planks);
  group.add(planks);
  stats.planks = plankSlots.length;
  stats.triangles += plankSlots.length * triCount(plankGeometry);

  // ---- flower borders ----------------------------------------------------
  // Bloom clusters hugging the garden face of each fence run: a low stem box
  // + petal icosahedron merged per instance would cost normals work; instead
  // two instanced meshes (stems, petals) share the slot list — the vegetation
  // skill's multi-component pattern.
  const bloomRng = mulberry32(BLOOM_SEED);
  const bloomSlots: Array<{ x: number; z: number; scale: number; color: number }> = [];
  for (const sign of [1, -1] as const) {
    for (const [zCentre, zLength] of SPAWN_END_FENCE_SEGMENTS) {
      const z0 = sign * zCentre - zLength / 2;
      const clusters = Math.floor(zLength / 0.55);
      // Garden face only (spawn side): the street face stays clean fence.
      const x = sign * (SPAWN_END_FENCE_X + fenceDepth / 2 + 0.28);
      for (let cluster = 0; cluster < clusters; cluster += 1) {
        if (bloomRng() < 0.22) continue; // seeded gaps so the border breathes
        bloomSlots.push({
          x: x + (bloomRng() - 0.5) * 0.22,
          z: z0 + (cluster + 0.5) * (zLength / clusters) + (bloomRng() - 0.5) * 0.3,
          scale: 0.75 + bloomRng() * 0.5,
          color: BLOOM_COLORS[Math.floor(bloomRng() * BLOOM_COLORS.length) % BLOOM_COLORS.length],
        });
      }
    }
  }
  const stemGeometry = new THREE.BoxGeometry(0.045, 0.34, 0.045);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x3f6b33, roughness: 0.9, metalness: 0 });
  const petalGeometry = new THREE.IcosahedronGeometry(0.085, 0);
  const petalMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
  disposables.push(stemGeometry, stemMaterial, petalGeometry, petalMaterial);
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, bloomSlots.length);
  const petals = new THREE.InstancedMesh(petalGeometry, petalMaterial, bloomSlots.length);
  stems.name = 'nuketown-garden-flower-stems';
  petals.name = 'nuketown-garden-flower-petals';
  const petalColor = new THREE.Color();
  quaternion.identity();
  for (let index = 0; index < bloomSlots.length; index += 1) {
    const slot = bloomSlots[index];
    scaleVec.setScalar(slot.scale);
    position.set(slot.x, 0.17 * slot.scale, slot.z);
    matrix.compose(position, quaternion, scaleVec);
    stems.setMatrixAt(index, matrix);
    position.set(slot.x, 0.4 * slot.scale, slot.z);
    matrix.compose(position, quaternion, scaleVec);
    petals.setMatrixAt(index, matrix);
    petals.setColorAt(index, petalColor.setHex(slot.color));
  }
  for (const mesh of [stems, petals]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    markPresentation(mesh);
    group.add(mesh);
  }
  stats.blooms = bloomSlots.length;
  stats.triangles += bloomSlots.length * (triCount(stemGeometry) + triCount(petalGeometry));

  // ---- paver paths through the trail mouths ------------------------------
  const paverGeometry = new THREE.BoxGeometry(0.52, 0.025, 0.42);
  const paverMaterial = new THREE.MeshStandardMaterial({ color: 0xb9b0a1, roughness: 0.86, metalness: 0.02 });
  disposables.push(paverGeometry, paverMaterial);
  const paverSlots: Array<{ x: number; z: number; yaw: number }> = [];
  for (const sign of [1, -1] as const) {
    for (let step = 0; step < 9; step += 1) {
      paverSlots.push({
        x: sign * (SPAWN_END_FENCE_X + 2.2 - step * 0.62),
        z: (step % 2 === 0 ? 0.11 : -0.11) * sign,
        yaw: (step % 2 === 0 ? 0.07 : -0.06),
      });
    }
  }
  const pavers = new THREE.InstancedMesh(paverGeometry, paverMaterial, paverSlots.length);
  pavers.name = 'nuketown-garden-trail-pavers';
  scaleVec.set(1, 1, 1);
  for (let index = 0; index < paverSlots.length; index += 1) {
    const slot = paverSlots[index];
    euler.set(0, slot.yaw, 0);
    quaternion.setFromEuler(euler);
    position.set(slot.x, 0.0125, slot.z);
    matrix.compose(position, quaternion, scaleVec);
    pavers.setMatrixAt(index, matrix);
  }
  pavers.instanceMatrix.needsUpdate = true;
  pavers.computeBoundingSphere();
  pavers.castShadow = false;
  pavers.receiveShadow = true;
  markPresentation(pavers);
  group.add(pavers);
  stats.pavers = paverSlots.length;
  stats.triangles += paverSlots.length * triCount(paverGeometry);

  // ---- door-gap corner shrubs (merged three-lobe recipe) -----------------
  const lobe = new THREE.IcosahedronGeometry(0.42, 1);
  const lobeOffsets: Array<[number, number, number, number]> = [
    [0, 0.34, 0, 1], [0.26, 0.3, 0.12, 0.78], [-0.22, 0.28, -0.16, 0.72],
  ];
  const shrubPositions: number[] = [];
  const shrubIndices: number[] = [];
  for (const [ox, oy, oz, lobeScale] of lobeOffsets) {
    const part = lobe.clone().toNonIndexed();
    part.scale(lobeScale, lobeScale * 0.78, lobeScale);
    part.translate(ox, oy, oz);
    const base = shrubPositions.length / 3;
    const pos = part.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) shrubPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    for (let i = 0; i < pos.count; i += 1) shrubIndices.push(base + i);
    part.dispose();
  }
  lobe.dispose();
  const shrubGeometry = new THREE.BufferGeometry();
  shrubGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shrubPositions, 3));
  shrubGeometry.setIndex(shrubIndices);
  shrubGeometry.computeVertexNormals();
  const shrubMaterial = new THREE.MeshStandardMaterial({ color: 0x4a7042, roughness: 0.94, metalness: 0, flatShading: true });
  disposables.push(shrubGeometry, shrubMaterial);
  // One shrub at the garden side of each door gap (gaps at z = +/-10.5 per
  // end), offset INTO the garden clear of the doorway itself.
  const shrubSlots: Array<{ x: number; z: number; yaw: number; scale: number }> = [];
  for (const sign of [1, -1] as const) {
    for (const doorZ of [10.5, -10.5]) {
      shrubSlots.push({
        x: sign * (SPAWN_END_FENCE_X + 0.9),
        z: sign * doorZ + (doorZ > 0 ? 1.75 : -1.75),
        yaw: sign * doorZ * 0.37,
        scale: 0.9 + 0.25 * Math.abs(Math.sin(sign * doorZ)),
      });
    }
  }
  const shrubs = new THREE.InstancedMesh(shrubGeometry, shrubMaterial, shrubSlots.length);
  shrubs.name = 'nuketown-garden-door-shrubs';
  for (let index = 0; index < shrubSlots.length; index += 1) {
    const slot = shrubSlots[index];
    euler.set(0, slot.yaw, 0);
    quaternion.setFromEuler(euler);
    scaleVec.setScalar(slot.scale);
    position.set(slot.x, 0, slot.z);
    matrix.compose(position, quaternion, scaleVec);
    shrubs.setMatrixAt(index, matrix);
  }
  shrubs.instanceMatrix.needsUpdate = true;
  shrubs.computeBoundingSphere();
  shrubs.castShadow = true;
  shrubs.receiveShadow = true;
  markPresentation(shrubs);
  group.add(shrubs);
  stats.shrubs = shrubSlots.length;
  stats.triangles += shrubSlots.length * triCount(shrubGeometry);

  stats.triangles = Math.round(stats.triangles);
  parent.add(group);
  return {
    group,
    stats,
    dispose: () => {
      for (const disposable of disposables) disposable.dispose();
    },
  };
}
