import * as THREE from 'three';
import { describe, it } from 'vitest';
import { buildArena } from './map';
import { CharacterPhysics, STANCE_SHAPES } from './physics';

/**
 * HF-387 probe: explain HOW the camera reaches <0.08 m from ramp triangles.
 * For each worst grid pose print capsule centre, foot Y, nearest triangle,
 * nearest face normal, and whether the eye is above the capsule top.
 * Scratch diagnostic — delete before handoff.
 */

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
  if (Math.abs(denom) < 1e-12) return NaN;
  const v = (d5 * d2 - d1 * d6) / denom;
  const w = (d3 * d6 - d5 * d4) / denom;
  return ap.sub(ab.multiplyScalar(v).add(ac.multiplyScalar(w))).length();
}

function triNormal(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.Vector3 {
  return b.clone().sub(a).cross(c.clone().sub(a)).normalize();
}

type Entry = { dist: number; eye: THREE.Vector3; tri: [THREE.Vector3, THREE.Vector3, THREE.Vector3]; centre: THREE.Vector3; footY: number };

describe('HF-387 ramp pose probe', () => {
  it('explains the worst ramp poses', async () => {
    const scene = new THREE.Scene();
    const map = buildArena(scene);
    map.root.updateMatrixWorld(true);
    const ramps: Array<{ mesh: THREE.Mesh; tris: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]>; box: THREE.Box3 }> = [];
    map.root.traverse((node) => {
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
      ramps.push({ mesh, tris, box: new THREE.Box3().setFromObject(mesh) });
    });
    console.log(`[probe] ramps: ${ramps.map((r) => r.mesh.name).join(', ')}`);
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY ?? 0);
    try {
      for (const ramp of ramps) {
        const box = ramp.box;
        for (const stance of ['stand', 'crouch', 'prone'] as const) {
          const shape = STANCE_SHAPES[stance];
          const worsts: Entry[] = [];
          for (let gx = box.min.x - 1.2; gx <= box.max.x + 1.2; gx += 0.25) {
            for (let gz = box.min.z - 1.2; gz <= box.max.z + 1.2; gz += 0.25) {
              physics.setStance('stand');
              physics.teleportEye({ x: gx, y: shape.eyeFromCenter + shape.halfHeight + shape.radius + 0.05, z: gz });
              if (!physics.setStance(stance)) continue;
              for (let i = 0; i < 40; i += 1) physics.move({ x: 0, y: -0.06, z: 0 }, 1 / 60);
              const raw = physics.eyePosition();
              if (raw.y < -1) continue;
              const eye = new THREE.Vector3(raw.x, raw.y, raw.z);
              let best = Infinity;
              let bestTri: [THREE.Vector3, THREE.Vector3, THREE.Vector3] | null = null;
              for (const tri of ramp.tris) {
                const d = pointTriangleDistance(eye, ...tri);
                if (Number.isFinite(d) && d < best) { best = d; bestTri = tri; }
              }
              if (!bestTri) continue;
              const capsuleCentreY = raw.y - shape.eyeFromCenter;
              const centre = new THREE.Vector3(raw.x, capsuleCentreY, raw.z);
              worsts.push({ dist: best, eye, tri: bestTri, centre, footY: centre.y - (shape.halfHeight + shape.radius) });
            }
          }
          worsts.sort((a, b) => a.dist - b.dist);
          console.log(`[probe] ${ramp.mesh.name} ${stance}: samples=${worsts.length} under010=${worsts.filter((w) => w.dist < 0.1).length}`);
          for (const w of worsts.slice(0, 3)) {
            const n = triNormal(...w.tri);
            const capsuleTopY = w.centre.y + shape.halfHeight;
            console.log(
              `[probe]   dist=${w.dist.toFixed(3)} eye=(${w.eye.x.toFixed(2)},${w.eye.y.toFixed(2)},${w.eye.z.toFixed(2)})`
              + ` capsuleCentre=(${w.centre.x.toFixed(2)},${w.centre.y.toFixed(2)},${w.centre.z.toFixed(2)})`
              + ` capsuleTopY=${capsuleTopY.toFixed(2)} footY=${w.footY.toFixed(2)}`
              + ` triA=(${w.tri[0].x.toFixed(2)},${w.tri[0].y.toFixed(2)},${w.tri[0].z.toFixed(2)})`
              + ` triB=(${w.tri[1].x.toFixed(2)},${w.tri[1].y.toFixed(2)},${w.tri[1].z.toFixed(2)})`
              + ` triC=(${w.tri[2].x.toFixed(2)},${w.tri[2].y.toFixed(2)},${w.tri[2].z.toFixed(2)})`
              + ` normal=(${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)})`,
            );
          }
        }
      }
    } finally {
      physics.dispose();
    }
  }, 900_000);
});
