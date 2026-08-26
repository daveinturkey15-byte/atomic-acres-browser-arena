import * as THREE from 'three';
import { describe, it } from 'vitest';
import { buildArena } from './map';
import { CharacterPhysics, STANCE_SHAPES } from './physics';

/**
 * HF-387 ramp walk-in probe (scratch — delete before handoff).
 *
 * The teleport-based rampprobe embedded the capsule in the slab before
 * settling, which produces poses real movement can never reach. This probe
 * only WALKS: teleport to a standoff clear of every collider, switch stance,
 * then march small steps toward/under the ramp while sampling the live eye.
 * Reports the worst eye-to-visible-triangle distance per ramp and stance with
 * the exact foot height so the contact face is identifiable.
 */

const NEAR_PLANE = 0.08;

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

function pointInsideMesh(p: THREE.Vector3, tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]>): boolean {
  let crossings = 0;
  for (const [a, b, c] of tris) {
    if (p.y < Math.min(a.y, b.y, c.y) || p.y > Math.max(a.y, b.y, c.y)) continue;
    if (Math.min(a.x, b.x, c.x) > p.x) continue;
    const e1 = b.clone().sub(a);
    const e2 = c.clone().sub(a);
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

type Triangles = { mesh: THREE.Mesh; tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]>; box: THREE.Box3 };

function collectRamps(root: THREE.Object3D): Triangles[] {
  const out: Triangles[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !/access-ramp$/.test(mesh.name)) return;
    mesh.updateMatrixWorld(true);
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const index = geometry.getIndex();
    const tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
    const triCount = Math.floor((index ? index.count : position.count) / 3);
    for (let t = 0; t < triCount; t += 1) {
      const corners: THREE.Vector3[] = [];
      for (let k = 0; k < 3; k += 1) {
        const i = index ? index.getX(t * 3 + k) : t * 3 + k;
        corners.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
      }
      tris.push([corners[0], corners[1], corners[2]]);
    }
    out.push({ mesh, tris, box: new THREE.Box3().setFromObject(mesh) });
  });
  return out;
}

describe('HF-387 ramp walk-in', () => {
  it('walks every stance into and under each ramp and reports worst eye clearance', async () => {
    const scene = new THREE.Scene();
    const map = buildArena(scene);
    map.root.updateMatrixWorld(true);
    const ramps = collectRamps(map.root);
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY ?? 0);
    try {
      for (const ramp of ramps) {
        const centre = ramp.box.getCenter(new THREE.Vector3());
        const half = ramp.box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        // Approach directions: four cardinal plus two under-slab runs along the slope axis.
        const dirs: Array<{ label: string; dx: number; dz: number }> = [
          { label: '-x', dx: -1, dz: 0 },
          { label: '+x', dx: 1, dz: 0 },
          { label: '-z', dx: 0, dz: -1 },
          { label: '+z', dx: 0, dz: 1 },
        ];
        for (const stance of ['stand', 'crouch', 'prone'] as const) {
          const shape = STANCE_SHAPES[stance];
          let worst = { dist: Infinity, inside: false, eye: '', footY: 0, dir: '' };
          for (const dir of dirs) {
            physics.setStance('stand');
            // Standoff 3 m outside the AABB along the approach direction.
            const sx = centre.x + dir.dx * (half.x + 3);
            const sz = centre.z + dir.dz * (half.z + 3);
            physics.teleportEye({ x: sx, y: shape.eyeFromCenter + shape.halfHeight + shape.radius + 0.05, z: sz });
            if (!physics.setStance(stance)) continue;
            for (let i = 0; i < 30; i += 1) physics.move({ x: dir.dx * 0.25, y: -0.06, z: dir.dz * 0.25 }, 1 / 60);
            for (let i = 0; i < 120; i += 1) {
              physics.move({ x: dir.dx * 0.02, y: -0.06, z: dir.dz * 0.02 }, 1 / 60);
              const raw = physics.eyePosition();
              if (raw.y < -1) continue;
              const eye = new THREE.Vector3(raw.x, raw.y, raw.z);
              let best = Infinity;
              for (const [a, b, c] of ramp.tris) {
                const d = pointTriangleDistance(eye, a, b, c);
                if (Number.isFinite(d) && d < best) best = d;
              }
              const inside = pointInsideMesh(eye, ramp.tris);
              const bodyY = raw.y - shape.eyeFromCenter;
              const footY = bodyY - shape.halfHeight - shape.radius;
              if (best < worst.dist) {
                worst = { dist: best, inside, eye: `(${eye.x.toFixed(2)},${eye.y.toFixed(2)},${eye.z.toFixed(2)})`, footY, dir: dir.label };
              }
            }
          }
          const verdict = worst.dist < NEAR_PLANE || worst.inside ? 'OFFEND' : 'clear';
          console.log(
            `[rampwalk] ${ramp.mesh.name}@(${centre.x.toFixed(1)},${centre.z.toFixed(1)}) ${stance}: ${verdict}`
            + ` minDist=${worst.dist.toFixed(3)} inside=${worst.inside} footY=${worst.footY.toFixed(2)} dir=${worst.dir} eye=${worst.eye}`,
          );
        }
      }
    } finally {
      physics.dispose();
    }
  }, 600_000);
});
