/**
 * nuketown-hedge-foliage.ts — Pass 81 art: the hedge-family colliders (front
 * garden hedges + rear yard hedges) rendered as flat textured boxes, which
 * read as painted slabs at player eye height. This module breaks every
 * exposed hedge face up with instanced flat-shaded leaf blobs — the
 * vegetation skill's InstancedMesh-per-family recipe — derived FROM the
 * layout constants so the foliage moves with the hedges automatically.
 *
 * COMBAT SAFETY: presentation only (no colliders, no shot surfaces). Blobs
 * protrude at most ~0.15 m beyond the authored AABB face, the same class of
 * cosmetic fuzz as real hedge trim: the collider core still owns movement
 * and gunfire exactly as authored. Deterministic: fixed-seed mulberry32.
 */
import * as THREE from 'three';
import {
  FRONT_HEDGE_LAYOUT,
  FRONT_HEDGE_SIZE,
  REAR_YARD_CLOSURE_LAYOUT,
  REAR_YARD_CLOSURE_SIZE,
} from './arena-layout';

const SEED = 0x3f8c_29d1;
/** Blobs per square metre of exposed hedge face. First cut at 4.2/m2 read
 * as light barnacles on a dark slab (reviewed on the west-garden cam);
 * trimmed-hedge coverage needs the blobs dense and tone-matched. */
const DENSITY_PER_M2 = 9;
const BLOB_RADIUS_M = 0.16;

export interface NuketownHedgeFoliageStats {
  blobs: number;
  triangles: number;
}

export interface NuketownHedgeFoliage {
  group: THREE.Group;
  stats: Readonly<NuketownHedgeFoliageStats>;
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

type HedgeBox = Readonly<{ x: number; z: number; sizeX: number; sizeZ: number; height: number }>;

function hedgeBoxes(): HedgeBox[] {
  const boxes: HedgeBox[] = [];
  for (const hedge of FRONT_HEDGE_LAYOUT) {
    boxes.push({ x: hedge.x, z: hedge.z, sizeX: hedge.length, sizeZ: FRONT_HEDGE_SIZE.depth, height: FRONT_HEDGE_SIZE.height });
  }
  const [closureWidth, closureHeight, closureDepth] = REAR_YARD_CLOSURE_SIZE;
  for (const [x, z] of REAR_YARD_CLOSURE_LAYOUT) {
    boxes.push({ x, z, sizeX: closureWidth, sizeZ: closureDepth, height: closureHeight });
  }
  return boxes;
}

/** Leaf-green tonal spread around the hedge material's sage base. */
const LEAF_TONES = [0x55704a, 0x4a6540, 0x5f7a52, 0x435c3b, 0x66805a];

export function buildNuketownHedgeFoliage(parent: THREE.Object3D): NuketownHedgeFoliage {
  const group = new THREE.Group();
  group.name = 'nuketown-hedge-foliage';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;

  const rng = mulberry32(SEED);
  type Slot = { x: number; y: number; z: number; scale: number; tone: number; yaw: number };
  const slots: Slot[] = [];

  for (const hedge of hedgeBoxes()) {
    const halfX = hedge.sizeX / 2;
    const halfZ = hedge.sizeZ / 2;
    // Exposed surfaces: the two long faces, the two ends, and the top. Each
    // face gets an area-proportional seeded scatter; blob centres sit just
    // inside the face so roughly half the blob protrudes.
    const faces: Array<{ area: number; place: () => [number, number, number] }> = [
      {
        area: hedge.sizeX * hedge.height,
        place: () => [hedge.x - halfX + rng() * hedge.sizeX, 0.25 + rng() * (hedge.height - 0.35), hedge.z - halfZ - 0.02],
      },
      {
        area: hedge.sizeX * hedge.height,
        place: () => [hedge.x - halfX + rng() * hedge.sizeX, 0.25 + rng() * (hedge.height - 0.35), hedge.z + halfZ + 0.02],
      },
      {
        area: hedge.sizeZ * hedge.height,
        place: () => [hedge.x - halfX - 0.02, 0.25 + rng() * (hedge.height - 0.35), hedge.z - halfZ + rng() * hedge.sizeZ],
      },
      {
        area: hedge.sizeZ * hedge.height,
        place: () => [hedge.x + halfX + 0.02, 0.25 + rng() * (hedge.height - 0.35), hedge.z - halfZ + rng() * hedge.sizeZ],
      },
      {
        area: hedge.sizeX * hedge.sizeZ,
        place: () => [hedge.x - halfX + rng() * hedge.sizeX, hedge.height + 0.02, hedge.z - halfZ + rng() * hedge.sizeZ],
      },
    ];
    for (const face of faces) {
      const count = Math.max(2, Math.round(face.area * DENSITY_PER_M2));
      for (let index = 0; index < count; index += 1) {
        const [x, y, z] = face.place();
        slots.push({
          x, y, z,
          scale: 0.55 + rng() * 0.5,
          tone: Math.floor(rng() * LEAF_TONES.length) % LEAF_TONES.length,
          yaw: rng() * Math.PI * 2,
        });
      }
    }
  }

  const geometry = new THREE.IcosahedronGeometry(BLOB_RADIUS_M, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, // per-instance colour carries the tone
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, slots.length);
  mesh.name = 'nuketown-hedge-foliage-blobs';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const color = new THREE.Color();
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    euler.set(slot.yaw * 0.3, slot.yaw, slot.yaw * 0.17);
    quaternion.setFromEuler(euler);
    position.set(slot.x, slot.y, slot.z);
    scaleVec.set(slot.scale, slot.scale * 0.82, slot.scale);
    matrix.compose(position, quaternion, scaleVec);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.setHex(LEAF_TONES[slot.tone]));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
  group.add(mesh);
  parent.add(group);

  const triangles = slots.length * 20;
  return {
    group,
    stats: { blobs: slots.length, triangles },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
