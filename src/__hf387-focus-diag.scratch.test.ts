import * as THREE from 'three';
import { describe, it } from 'vitest';
import { buildArena, type ArenaMap } from './map';
import { CharacterPhysics, STANCE_SHAPES } from './physics';

/**
 * HF-387 focused diagnostic (scratch — delete before handoff).
 * 1. atomic-acres practice-target dummies admit the capsule fully inside
 *    their visible torso capsules at every stance (no collider anywhere near).
 * 2. atomic-acres house exterior-access-ramp: crouch eye reaches 0.047 m
 *    (< 0.08 near plane). Which face, approached how?
 */

const NEAR_PLANE = 0.08;

function pointTriangleDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, out?: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const ap = p.clone().sub(a);
  const d1 = ab.dot(ap);
  const d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) { if (out) out.copy(ap); return ap.length(); }
  const bp = p.clone().sub(b);
  const d3 = ab.dot(bp);
  const d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) { if (out) out.copy(bp); return bp.length(); }
  if (d1 * d4 - d3 * d2 <= 0 && d1 >= 0 && d3 <= 0) {
    const q = ap.sub(ab.multiplyScalar(d1 / (d1 - d3)));
    if (out) out.copy(q);
    return q.length();
  }
  const cp = p.clone().sub(c);
  const d5 = ab.dot(cp);
  const d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) { if (out) out.copy(cp); return cp.length(); }
  if (d5 * d2 - d1 * d6 <= 0 && d2 >= 0 && d6 <= 0) {
    const q = ap.sub(ac.multiplyScalar(d2 / (d2 - d6)));
    if (out) out.copy(q);
    return q.length();
  }
  if (d3 * d6 - d5 * d4 <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { if (out) out.copy(bp); return bp.length(); }
  const denom = d1 * d4 - d3 * d2 + (d5 * d2 - d1 * d6) + (d3 * d6 - d5 * d4);
  const v = (d5 * d2 - d1 * d6) / denom;
  const w = (d3 * d6 - d5 * d4) / denom;
  const q = ap.sub(ab.multiplyScalar(v).add(ac.multiplyScalar(w)));
  if (out) out.copy(q);
  return q.length();
}

type Triangles = { mesh: THREE.Mesh; tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]>; box: THREE.Box3 };

function collectNamed(root: THREE.Object3D, predicate: (mesh: THREE.Mesh, size: THREE.Vector3) => boolean): Triangles[] {
  const out: Triangles[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    let visible = true;
    for (let ancestor: THREE.Object3D | null = mesh; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) visible = false;
    }
    if (!mesh.isMesh || !visible || !mesh.geometry.getAttribute('position')) return;
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    if (!predicate(mesh, size)) return;
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

function nearestTri(eye: THREE.Vector3, visual: Triangles, out?: THREE.Vector3): number {
  let best = Infinity;
  for (const [a, b, c] of visual.tris) {
    const dist = pointTriangleDistance(eye, a, b, c, out);
    if (Number.isFinite(dist) && dist < best) best = dist;
  }
  return best;
}

describe('HF-387 focus', () => {
  it('atomic-acres house ramp closest-face detail', async () => {
    const scene = new THREE.Scene();
    const map = buildArena(scene);
    map.root.updateMatrixWorld(true);
    const ramps = collectNamed(map.root, (mesh) => /access-ramp/i.test(mesh.name));
    console.log(`[diag] ramp visuals: ${ramps.map((r) => `${r.mesh.name}@(${r.box.getCenter(new THREE.Vector3()).x.toFixed(1)},${r.box.getCenter(new THREE.Vector3()).z.toFixed(1)})`).join('; ')}`);
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY ?? 0);
    try {
      for (const visual of ramps) {
        const box = visual.box;
        for (const stance of ['stand', 'crouch', 'prone'] as const) {
          const shape = STANCE_SHAPES[stance];
          let worst = { dist: Infinity, eye: '', point: '' };
          for (let gx = box.min.x - 1.2; gx <= box.max.x + 1.2; gx += 0.25) {
            for (let gz = box.min.z - 1.2; gz <= box.max.z + 1.2; gz += 0.25) {
              physics.setStance('stand');
              physics.teleportEye({ x: gx, y: shape.eyeFromCenter + shape.halfHeight + shape.radius + 0.05, z: gz });
              if (!physics.setStance(stance)) continue;
              for (let i = 0; i < 40; i += 1) physics.move({ x: 0, y: -0.06, z: 0 }, 1 / 60);
              const raw = physics.eyePosition();
              if (raw.y < -1) continue; // fell out of world during settle — skip
              const eye = new THREE.Vector3(raw.x, raw.y, raw.z);
              if (eye.y > box.max.y + 1.5) continue;
              const closest = new THREE.Vector3();
              const dist = nearestTri(eye, visual, closest);
              if (dist < worst.dist) {
                worst = { dist, eye: `(${eye.x.toFixed(2)},${eye.y.toFixed(2)},${eye.z.toFixed(2)})`, point: `(${closest.x.toFixed(2)},${closest.y.toFixed(2)},${closest.z.toFixed(2)})` };
              }
            }
          }
          if (worst.dist < Infinity) {
            console.log(`[diag] ${visual.mesh.name} ${stance}: worst=${worst.dist.toFixed(3)} eye=${worst.eye} closestPoint=${worst.point}`);
          }
        }
      }
    } finally {
      physics.dispose();
    }
  }, 900_000);

  it('atomic-acres dummy penetration detail', async () => {
    const scene = new THREE.Scene();
    const map = buildArena(scene);
    map.root.updateMatrixWorld(true);
    const dummies = collectNamed(map.root, (mesh) => /mid-(truck|coach)-torso$/.test(mesh.name));
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY ?? 0);
    try {
      for (const visual of dummies) {
        const centre = visual.box.getCenter(new THREE.Vector3());
        for (const stance of ['stand', 'crouch'] as const) {
          const shape = STANCE_SHAPES[stance];
          let worstEye = '';
          let worstDist = Infinity;
          for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Array<[number, number]>) {
            physics.setStance('stand');
            physics.teleportEye({ x: centre.x - dx * 2.5, y: shape.eyeFromCenter + shape.halfHeight + shape.radius, z: centre.z - dz * 2.5 });
            if (!physics.setStance(stance)) continue;
            for (let i = 0; i < 80; i += 1) {
              physics.move({ x: dx * 0.03, y: -0.06, z: dz * 0.03 }, 1 / 60);
              const raw = physics.eyePosition();
              const eye = new THREE.Vector3(raw.x, raw.y, raw.z);
              const dist = nearestTri(eye, visual);
              if (dist < worstDist) {
                worstDist = dist;
                worstEye = `(${eye.x.toFixed(2)},${eye.y.toFixed(2)},${eye.z.toFixed(2)})`;
              }
            }
          }
          console.log(`[diag] ${visual.mesh.name} ${stance}: worst=${worstDist.toFixed(3)} eye=${worstEye} (inside when distance is to a far shell or capped by radius)`);
        }
      }
    } finally {
      physics.dispose();
    }
  }, 600_000);
});
