/**
 * nuketown-forest-surround.ts — DECLUTTER 2026-08-29: the owner called the
 * corner earth-bank ellipsoids out by sight ("strange oval and round
 * splat/piles at the edges") and asked for "the immediate surrounds more like
 * a woods/forest with decent threejs skills". This module plants that forest
 * in the annulus between the boundary fence and the mountain foothills using
 * the ingested vegetation-skill recipes:
 *
 *   - golden-angle ring distribution with seeded jitter (clump-free, natural);
 *   - multi-component instanced trees: conifers (merged trunk+two cone tiers,
 *     ONE InstancedMesh) and broadleafs (trunk mesh + double-blob canopy mesh);
 *   - an understory scatter of flat-shaded scrub blobs between the trunks;
 *   - per-instance scale/yaw variation and tonal instance colours.
 *
 * ART-ONLY BY CONSTRUCTION: every candidate must fall OUTSIDE the boundary
 * rectangle inflated by a margin and INSIDE the foothill inner radius, so no
 * sightline or traversal inside the arena can meet it; no colliders, no shot
 * surfaces, fog stays on. Deterministic: fixed-seed mulberry32 streams.
 */
import * as THREE from 'three';
import { ARENA_BOUNDS } from './arena-layout';

/** Trees never spawn closer to the arena than this rectangle inflation. */
export const FOREST_RECT_MARGIN_M = 3.2;
/** ... and never beyond the foothill footline. */
export const FOREST_MAX_RADIAL_M = 62;

const SEED = 0x7d31_44b9;

export interface NuketownForestStats {
  conifers: number;
  broadleafs: number;
  understory: number;
  meshes: number;
  triangles: number;
}

export interface NuketownForestSurround {
  group: THREE.Group;
  stats: Readonly<NuketownForestStats>;
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

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Ground level of the backdrop skirt the forest stands on. */
const FOREST_FLOOR_Y = -0.42;

function insideForestBand(x: number, z: number): boolean {
  const inflatedMinX = ARENA_BOUNDS.minX - FOREST_RECT_MARGIN_M;
  const inflatedMaxX = ARENA_BOUNDS.maxX + FOREST_RECT_MARGIN_M;
  const inflatedMinZ = ARENA_BOUNDS.minZ - FOREST_RECT_MARGIN_M;
  const inflatedMaxZ = ARENA_BOUNDS.maxZ + FOREST_RECT_MARGIN_M;
  const insideRect = x > inflatedMinX && x < inflatedMaxX && z > inflatedMinZ && z < inflatedMaxZ;
  if (insideRect) return false;
  return Math.hypot(x, z) < FOREST_MAX_RADIAL_M;
}

type TreeSlot = { x: number; z: number; yaw: number; scale: number; tone: number };

function ringSlots(count: number, innerRadius: number, outerRadius: number, seed: number, minSeparation: number): TreeSlot[] {
  const rng = mulberry32(seed);
  const slots: TreeSlot[] = [];
  let attempts = 0;
  const maxAttempts = count * 40;
  let index = 0;
  while (slots.length < count && attempts < maxAttempts) {
    attempts += 1;
    index += 1;
    const t = (index % count + 0.5) / count;
    const radius = innerRadius + (outerRadius - innerRadius) * (t * 0.6 + rng() * 0.4);
    const theta = index * GOLDEN_ANGLE + rng() * 0.5;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    if (!insideForestBand(x, z)) continue;
    let tooClose = false;
    for (const other of slots) {
      if (Math.hypot(x - other.x, z - other.z) < minSeparation) { tooClose = true; break; }
    }
    if (tooClose) continue;
    slots.push({ x, z, yaw: rng() * Math.PI * 2, scale: 0.72 + rng() * 0.6, tone: rng() });
  }
  return slots;
}

/** Merge helper (vegetation skill): non-indexed accumulate with transforms. */
function mergeParts(parts: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }>, name: string): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const part of parts) {
    const clone = part.geometry.clone();
    clone.applyMatrix4(part.matrix);
    const nonIndexed = clone.index ? clone.toNonIndexed() : clone;
    const attribute = nonIndexed.getAttribute('position');
    for (let i = 0; i < attribute.count; i += 1) positions.push(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
    clone.dispose();
    if (nonIndexed !== clone) nonIndexed.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  merged.name = name;
  return merged;
}

function triCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.index;
  if (index) return index.count / 3;
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}

export function buildNuketownForestSurround(parent: THREE.Object3D): NuketownForestSurround {
  const group = new THREE.Group();
  group.name = 'nuketown-forest-surround';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;
  group.userData.nuketownForest = true;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const color = new THREE.Color();
  const disposables: Array<{ dispose(): void }> = [];
  const stats: NuketownForestStats = { conifers: 0, broadleafs: 0, understory: 0, meshes: 0, triangles: 0 };

  const register = (mesh: THREE.InstancedMesh): void => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); // instance bounds, not geometry origin
    mesh.castShadow = false; // distant scenery: shadow maps buy nothing
    mesh.receiveShadow = false;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    group.add(mesh);
    stats.meshes += 1;
    stats.triangles += triCount(mesh.geometry) * mesh.count;
  };

  // ---- conifers: merged trunk + two cone tiers, one instanced draw --------
  const coniferParts: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 7);
  const tierA = new THREE.ConeGeometry(2.6, 5.6, 8);
  const tierB = new THREE.ConeGeometry(1.9, 4.4, 8);
  coniferParts.push({ geometry: trunkGeometry, matrix: new THREE.Matrix4().makeTranslation(0, 1.1, 0) });
  coniferParts.push({ geometry: tierA, matrix: new THREE.Matrix4().makeTranslation(0, 4.6, 0) });
  coniferParts.push({ geometry: tierB, matrix: new THREE.Matrix4().makeTranslation(0, 7.2, 0) });
  const coniferGeometry = mergeParts(coniferParts, 'forest-conifer');
  for (const part of [trunkGeometry, tierA, tierB]) part.dispose();
  const coniferMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, flatShading: true });
  disposables.push(coniferGeometry, coniferMaterial);

  const coniferSlots = ringSlots(340, 38, FOREST_MAX_RADIAL_M, SEED, 3.4);
  const conifers = new THREE.InstancedMesh(coniferGeometry, coniferMaterial, coniferSlots.length);
  conifers.name = 'forest-conifers';
  const coniferTones = [0x2e4a30, 0x39573a, 0x27412b, 0x435f41];
  coniferSlots.forEach((slot, index) => {
    euler.set(0, slot.yaw, 0);
    quaternion.setFromEuler(euler);
    position.set(slot.x, FOREST_FLOOR_Y, slot.z);
    scaleVec.set(slot.scale, slot.scale * (0.9 + slot.tone * 0.45), slot.scale);
    matrix.compose(position, quaternion, scaleVec);
    conifers.setMatrixAt(index, matrix);
    conifers.setColorAt(index, color.setHex(coniferTones[Math.floor(slot.tone * coniferTones.length) % coniferTones.length]));
  });
  register(conifers);
  stats.conifers = coniferSlots.length;

  // ---- broadleafs: trunk instances + double-blob canopy instances ---------
  const broadTrunkGeometry = new THREE.CylinderGeometry(0.28, 0.42, 3.4, 7);
  const canopyGeometry = mergeParts([
    { geometry: new THREE.IcosahedronGeometry(2.3, 1), matrix: new THREE.Matrix4().makeTranslation(0, 0, 0) },
    { geometry: new THREE.IcosahedronGeometry(1.6, 1), matrix: new THREE.Matrix4().makeTranslation(1.2, 0.9, 0.5) },
  ], 'forest-broadleaf-canopy');
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 0.96, metalness: 0 });
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, flatShading: true });
  disposables.push(broadTrunkGeometry, canopyGeometry, trunkMaterial, canopyMaterial);

  const broadleafSlots = ringSlots(180, 37, 56, SEED ^ 0x00ff_1234, 4.2);
  const broadTrunks = new THREE.InstancedMesh(broadTrunkGeometry, trunkMaterial, broadleafSlots.length);
  const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, broadleafSlots.length);
  broadTrunks.name = 'forest-broadleaf-trunks';
  canopies.name = 'forest-broadleaf-canopies';
  const canopyTones = [0x4d6b3a, 0x5d7a42, 0x6b8549, 0x455f35];
  broadleafSlots.forEach((slot, index) => {
    euler.set(0, slot.yaw, 0);
    quaternion.setFromEuler(euler);
    position.set(slot.x, FOREST_FLOOR_Y, slot.z);
    scaleVec.set(slot.scale, slot.scale, slot.scale);
    matrix.compose(position, quaternion, scaleVec);
    broadTrunks.setMatrixAt(index, matrix);
    position.set(slot.x, FOREST_FLOOR_Y + 4.3 * slot.scale, slot.z);
    matrix.compose(position, quaternion, scaleVec);
    canopies.setMatrixAt(index, matrix);
    canopies.setColorAt(index, color.setHex(canopyTones[Math.floor(slot.tone * canopyTones.length) % canopyTones.length]));
  });
  register(broadTrunks);
  register(canopies);
  stats.broadleafs = broadleafSlots.length;

  // ---- understory scrub between the trunks --------------------------------
  const scrubGeometry = new THREE.IcosahedronGeometry(0.9, 0);
  const scrubMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0, flatShading: true });
  disposables.push(scrubGeometry, scrubMaterial);
  const scrubSlots = ringSlots(260, 36.5, 58, SEED ^ 0x5a5a_9c9c, 1.9);
  const scrub = new THREE.InstancedMesh(scrubGeometry, scrubMaterial, scrubSlots.length);
  scrub.name = 'forest-understory';
  const scrubTones = [0x55663d, 0x64744a, 0x707c52, 0x4a5c38];
  scrubSlots.forEach((slot, index) => {
    euler.set(slot.yaw * 0.2, slot.yaw, 0);
    quaternion.setFromEuler(euler);
    position.set(slot.x, FOREST_FLOOR_Y + 0.28 * slot.scale, slot.z);
    scaleVec.set(slot.scale, slot.scale * 0.68, slot.scale);
    matrix.compose(position, quaternion, scaleVec);
    scrub.setMatrixAt(index, matrix);
    scrub.setColorAt(index, color.setHex(scrubTones[Math.floor(slot.tone * scrubTones.length) % scrubTones.length]));
  });
  register(scrub);
  stats.understory = scrubSlots.length;

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
