// TEMPORARY diagnostic scan (deleted before hand-off). Enumerates near-coplanar
// upward-face pairs across the additional-maps arenas.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';

type Spec = { id: string; x: number; y: number; z: number; sx: number; sy: number; sz: number };

function collect(root: THREE.Object3D): Spec[] {
  const specs: Spec[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry as THREE.BufferGeometry;
    if (!(geometry instanceof THREE.BoxGeometry)) return;
    if (node.userData.skylineQualityPlaceholder) return;
    const q = new THREE.Quaternion();
    node.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    if (Math.abs(e.x) > 1e-6 || Math.abs(e.z) > 1e-6) return; // tilted top faces: skip
    const p = new THREE.Vector3();
    node.getWorldPosition(p);
    const params = (geometry as THREE.BoxGeometry).parameters;
    const yaw = Math.abs(e.y) > 1e-6 ? e.y : 0;
    // approximate yawed footprint by AABB
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    const sx = params.width * cos + params.depth * sin;
    const sz = params.width * sin + params.depth * cos;
    specs.push({ id: node.name, x: p.x, y: p.y, z: p.z, sx, sy: params.height, sz });
  });
  return specs;
}

function pairs(specs: Spec[], minSep: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < specs.length; i += 1) {
    for (let j = i + 1; j < specs.length; j += 1) {
      const a = specs[i];
      const b = specs[j];
      const topA = a.y + a.sy / 2;
      const topB = b.y + b.sy / 2;
      if (Math.abs(topA - topB) >= minSep) continue;
      const overlapX = Math.min(a.x + a.sx / 2, b.x + b.sx / 2) - Math.max(a.x - a.sx / 2, b.x - b.sx / 2);
      const overlapZ = Math.min(a.z + a.sz / 2, b.z + b.sz / 2) - Math.max(a.z - a.sz / 2, b.z - b.sz / 2);
      if (overlapX > 1e-3 && overlapZ > 1e-3) {
        out.push(`${a.id}@${topA.toFixed(4)} ~ ${b.id}@${topB.toFixed(4)} (dy=${(Math.abs(topA - topB) * 1000).toFixed(2)}mm ov=${overlapX.toFixed(2)}x${overlapZ.toFixed(2)})`);
      }
    }
  }
  return out;
}

describe('scan', () => {
  it('skyline', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    console.log('SKYLINE PAIRS:\n' + pairs(collect(map.root), 0.0067).join('\n'));
    expect(true).toBe(true);
  });
  it('rustworks', () => {
    const map = buildRustworks1v1(new THREE.Scene());
    console.log('RUSTWORKS PAIRS:\n' + pairs(collect(map.root), 0.0067).join('\n'));
    expect(true).toBe(true);
  });
  it('gunrange', () => {
    const map = buildGunRange(new THREE.Scene());
    console.log('GUNRANGE PAIRS:\n' + pairs(collect(map.root), 0.0067).join('\n'));
    expect(true).toBe(true);
  });
});
