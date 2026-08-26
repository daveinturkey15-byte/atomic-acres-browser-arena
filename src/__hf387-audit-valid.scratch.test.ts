import * as THREE from 'three';
import { describe, it } from 'vitest';
import { buildArena, type ArenaMap } from './map';
import { buildHighSeas } from './high-seas';
import { CharacterPhysics, STANCE_SHAPES } from './physics';
import { deriveGlassDynamicColliders } from './glass-collider-bounds';

/**
 * HF-387 player-body audit: march the REAL CharacterPhysics into every
 * wall-like visible surface, then measure how close the live eye position
 * gets to visible triangle geometry. The live first-person camera is
 * PerspectiveCamera(76, 1, 0.08, 180) — near plane 0.08 m. Includes the same
 * dynamic glass movement colliders the live game syncs.
 *
 * Scratch diagnostic: delete before handoff.
 */

const NEAR_PLANE = 0.08;
const CONTROLLER_OFFSET = 0.025;
/** Validity gate: a capsule whose feet sit below the world plane is an
 * artifact of probe marching, never a live-reachable pose. */
const MINIMUM_FOOT_Y = -0.15;

type Triangles = { mesh: THREE.Mesh; tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]>; box: THREE.Box3 };
type Offence = { arena: string; stance: string; mesh: string; inside: boolean; minDist: number; eye: THREE.Vector3 };

function collectWallLikeVisuals(root: THREE.Object3D): Triangles[] {
  const out: Triangles[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    let visible = true;
    for (let ancestor: THREE.Object3D | null = mesh; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) visible = false;
    }
    if (!mesh.isMesh || !visible) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const railLike = mesh.name.toLowerCase().includes('rail');
    const wallLike = railLike || (size.y >= 0.35 && Math.min(size.x, size.z) <= 5.7);
    if (!wallLike) return;
    mesh.updateMatrixWorld(true);
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const index = geometry.getIndex();
    const triCount = Math.floor((index ? index.count : position.count) / 3);
    const tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
    for (let t = 0; t < triCount; t += 1) {
      const corners: THREE.Vector3[] = [];
      for (let k = 0; k < 3; k += 1) {
        const i = index ? index.getX(t * 3 + k) : t * 3 + k;
        corners.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
      }
      tris.push([corners[0], corners[1], corners[2]]);
    }
    out.push({ mesh, tris, box });
  });
  return out;
}

function pointTriangleDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const ap = p.clone().sub(a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return ap.length();
  const bp = p.clone().sub(b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return bp.length();
  if (d1 * d4 - d3 * d2 <= 0 && d1 >= 0 && d3 <= 0) return ap.sub(ab.multiplyScalar(d1 / (d1 - d3))).length();
  const cp = p.clone().sub(c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return cp.length();
  if (d5 * d2 - d1 * d6 <= 0 && d2 >= 0 && d6 <= 0) return ap.sub(ac.multiplyScalar(d2 / (d2 - d6))).length();
  if (d3 * d6 - d5 * d4 <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return bp.length();
  const denom = d1 * d4 - d3 * d2 + (d5 * d2 - d1 * d6) + (d3 * d6 - d5 * d4);
  const v = (d5 * d2 - d1 * d6) / denom;
  const w = (d3 * d6 - d5 * d4) / denom;
  return ap.sub(ab.multiplyScalar(v).add(ac.multiplyScalar(w))).length();
}

/** Parity test along +X: odd crossing count means inside the shell. */
function pointInsideMesh(p: THREE.Vector3, tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]>): boolean {
  let crossings = 0;
  for (const [a, b, c] of tris) {
    if (p.y < Math.min(a.y, b.y, c.y) || p.y > Math.max(a.y, b.y, c.y)) continue;
    if (Math.min(a.x, b.x, c.x) > p.x) continue;
    const e1 = b.clone().sub(a);
    const e2 = c.clone().sub(a);
    // pv = cross(+X, e2)
    const pv = new THREE.Vector3(0, -e2.z, e2.y);
    const det = e1.dot(pv);
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tv = p.clone().sub(a);
    const u = tv.dot(pv) * inv;
    if (u < 0 || u > 1) continue;
    const qv = tv.cross(e1);
    const v = qv.x * inv;
    if (v < 0 || u + v > 1) continue;
    if (e2.dot(qv) * inv > 1e-9) crossings += 1;
  }
  return crossings % 2 === 1;
}

const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();

function reachableAtEye(eye: THREE.Vector3, radius: number, colliders: ArenaMap['physicsColliders']): boolean {
  const bandLow = eye.y - radius - 0.35;
  const bandHigh = eye.y + radius;
  for (const box of colliders) {
    const minY = box.minY ?? Number.NEGATIVE_INFINITY;
    const maxY = box.maxY ?? Number.POSITIVE_INFINITY;
    if (maxY < bandLow || minY > bandHigh) continue;
    let px = eye.x;
    let pz = eye.z;
    let minX = box.minX;
    let maxX = box.maxX;
    let minZ = box.minZ;
    let maxZ = box.maxZ;
    if (box.rotation) {
      const centreX = (box.minX + box.maxX) / 2;
      const centreZ = (box.minZ + box.maxZ) / 2;
      scratchEuler.set(box.rotation[0], box.rotation[1], box.rotation[2]);
      scratchQuaternion.setFromEuler(scratchEuler).invert();
      const local = new THREE.Vector3(eye.x - centreX, 0, eye.z - centreZ).applyQuaternion(scratchQuaternion);
      px = local.x;
      pz = local.z;
      minX = -(box.maxX - box.minX) / 2;
      maxX = -minX;
      minZ = -(box.maxZ - box.minZ) / 2;
      maxZ = -minZ;
    }
    const dx = Math.max(minX - px, 0, px - maxX);
    const dz = Math.max(minZ - pz, 0, pz - maxZ);
    if (Math.hypot(dx, dz) < radius + CONTROLLER_OFFSET - 0.005) return false;
  }
  return true;
}

function measureEye(arenaId: string, stance: string, eye: THREE.Vector3, visuals: Triangles[], out: Offence[]): void {
  for (const visual of visuals) {
    const expanded = visual.box.clone().expandByScalar(NEAR_PLANE + 0.01);
    if (!expanded.containsPoint(eye)) continue;
    let minDist = Infinity;
    for (const [a, b, c] of visual.tris) {
      minDist = Math.min(minDist, pointTriangleDistance(eye, a, b, c));
    }
    const inside = pointInsideMesh(eye, visual.tris);
    if (inside || minDist < NEAR_PLANE) {
      out.push({ arena: arenaId, stance, mesh: visual.mesh.name, inside, minDist, eye: eye.clone() });
    }
  }
}

async function auditArena(
  arenaId: string,
  build: (scene: THREE.Scene) => ArenaMap,
): Promise<Offence[]> {
  const scene = new THREE.Scene();
  const map = build(scene);
  map.root.updateMatrixWorld(true);
  const visuals = collectWallLikeVisuals(map.root);
  console.log(`[hf387] ${arenaId}: ${visuals.length} wall-like visuals`);
  const offenders: Offence[] = [];
  const sampled = new Set<string>();
  const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY ?? 0);
  physics.syncDynamicColliders(deriveGlassDynamicColliders(map.breakableWindows, map));
  try {
    const sampleOnce = (stance: 'stand' | 'crouch' | 'prone', raw: { x: number; y: number; z: number }): void => {
      const shape = STANCE_SHAPES[stance];
      const eye = new THREE.Vector3(raw.x, raw.y, raw.z);
      const key = `${stance}:${eye.x.toFixed(2)}:${eye.y.toFixed(2)}:${eye.z.toFixed(2)}`;
      if (sampled.has(key)) return;
      sampled.add(key);
      // Validity gate: a capsule whose feet sit below the world plane is a
      // probe-marching artifact, never a live-reachable pose.
      if (eye.y - shape.eyeFromCenter - shape.halfHeight - shape.radius < MINIMUM_FOOT_Y) return;
      if (!reachableAtEye(eye, shape.radius, map.physicsColliders)) return;
      measureEye(arenaId, stance, eye, visuals, offenders);
    };
    for (const visual of visuals) {
      const centre = visual.box.getCenter(new THREE.Vector3());
      const standoffs: Array<{ dir: THREE.Vector3; start: THREE.Vector3 }> = [
        { dir: new THREE.Vector3(-1, 0, 0), start: new THREE.Vector3(visual.box.min.x - 2.5, Math.max(visual.box.min.y, 0) + 0.02, centre.z) },
        { dir: new THREE.Vector3(1, 0, 0), start: new THREE.Vector3(visual.box.max.x + 2.5, Math.max(visual.box.min.y, 0) + 0.02, centre.z) },
        { dir: new THREE.Vector3(0, 0, -1), start: new THREE.Vector3(centre.x, Math.max(visual.box.min.y, 0) + 0.02, visual.box.min.z - 2.5) },
        { dir: new THREE.Vector3(0, 0, 1), start: new THREE.Vector3(centre.x, Math.max(visual.box.min.y, 0) + 0.02, visual.box.max.z + 2.5) },
      ];
      for (const stance of ['stand', 'crouch', 'prone'] as const) {
        const shape = STANCE_SHAPES[stance];
        for (const face of standoffs) {
          physics.setStance('stand');
          const startEye = face.start.clone();
          startEye.y += shape.eyeFromCenter + shape.halfHeight + shape.radius;
          physics.teleportEye({ x: startEye.x, y: startEye.y, z: startEye.z });
          if (!physics.setStance(stance)) continue;
          for (let i = 0; i < 12; i += 1) {
            physics.move({ x: face.dir.x * 0.25, y: -0.06, z: face.dir.z * 0.25 }, 1 / 60);
          }
          for (let i = 0; i < 60; i += 1) {
            physics.move({ x: face.dir.x * 0.02, y: -0.06, z: face.dir.z * 0.02 }, 1 / 60);
            sampleOnce(stance, physics.eyePosition());
          }
          // Diagonal slides to catch seams, crawlspaces and corner pockets.
          for (const side of [-1, 1]) {
            for (let i = 0; i < 41; i += 1) {
              physics.move({
                x: (face.dir.x + side * face.dir.z) * 0.02,
                y: -0.06,
                z: (face.dir.z + side * face.dir.x) * 0.02,
              }, 1 / 60);
              sampleOnce(stance, physics.eyePosition());
            }
          }
        }
      }
    }
  } finally {
    physics.dispose();
  }
  return offenders;
}

function reportWorst(arenaId: string, offences: Offence[]): void {
  const worstByGroup = new Map<string, Offence>();
  for (const entry of offences) {
    const key = `${entry.stance}|${entry.mesh}`;
    const worst = worstByGroup.get(key);
    if (!worst || entry.minDist < worst.minDist) worstByGroup.set(key, entry);
  }
  const rows = [...worstByGroup.values()].sort((a, b) => a.minDist - b.minDist);
  console.log(`[hf387] ${arenaId} offender groups: ${rows.length}`);
  for (const row of rows.slice(0, 40)) {
    console.log(
      `[hf387] ${row.stance} "${row.mesh}" inside=${row.inside} minDist=${row.minDist.toFixed(3)}`
      + ` eye=(${row.eye.x.toFixed(2)},${row.eye.y.toFixed(2)},${row.eye.z.toFixed(2)})`,
    );
  }
}

describe('HF-387 prone/wall camera-clip audit', () => {
  it('atomic-acres: marches every wall-like surface and reports eye-in-geometry', async () => {
    reportWorst('atomic-acres', await auditArena('atomic-acres', buildArena));
  }, 900_000);

  it('high-seas: marches every wall-like surface and reports eye-in-geometry', async () => {
    reportWorst('high-seas', await auditArena('high-seas', (scene) => buildHighSeas(scene) as unknown as ArenaMap));
  }, 900_000);
});
