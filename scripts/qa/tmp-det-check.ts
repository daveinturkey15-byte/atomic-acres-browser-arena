// TEMPORARY: build the arena twice in one process and hash the collider set.
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { buildArena } from '../../src/map';

function fingerprint(label: string): { count: number; hash: string; boxes: string } {
  const map = buildArena(new THREE.Scene());
  const parts = map.physicsColliders
    .map((b) => `${b.minX.toFixed(3)},${b.maxX.toFixed(3)},${(b.minY ?? 0).toFixed(3)},${(b.maxY ?? 0).toFixed(3)},${b.minZ.toFixed(3)},${b.maxZ.toFixed(3)}`)
    .sort();
  const hash = createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
  console.log(`${label}: colliders=${parts.length} hash=${hash}`);
  return { count: parts.length, hash, boxes: parts.join('|') };
}

const a = fingerprint('build A');
const b = fingerprint('build B');
console.log(a.hash === b.hash ? 'DETERMINISTIC' : 'NONDETERMINISTIC');
if (a.hash !== b.hash) {
  const sa = new Set(a.boxes.split('|'));
  const sb = new Set(b.boxes.split('|'));
  for (const s of sa) if (!sb.has(s)) console.log('only-in-A:', s);
  for (const s of sb) if (!sa.has(s)) console.log('only-in-B:', s);
}
