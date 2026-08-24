import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Box2 } from './collision';
import { buildArena } from './map';

// Nuke Town fidelity contract (BO2 homage brief): very short sightlines.
//
// The reference map's character is broken lanes: no standing eye-line may run
// unobstructed across the whole map. A deterministic collider ray audit
// measured 60.3 m (street-canyon sliver, fixed by the Pass 79 fin extension)
// and then 56.0 m (back-fence corridor) on this layout; this test pins the
// worst standing eye-line well below those values. Proven RED at 56.0 m
// before the rear-hedge cross-runs landed.

const EYE_HEIGHT = 1.65;
/** Worst allowed clear standing eye-line, in metres. */
const MAXIMUM_CLEAR_EYE_LINE = 42;

function blocksSight(collider: Box2): boolean {
  return collider.maxY === undefined || collider.maxY >= EYE_HEIGHT;
}

/** Segment vs AABB slab test over XZ; endpoints strictly outside are clear. */
function segmentClearOfBox(ax: number, az: number, bx: number, bz: number, box: Box2): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < box.minX || ax > box.maxX) return true;
  } else {
    let ta = (box.minX - ax) / dx;
    let tb = (box.maxX - ax) / dx;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < box.minZ || az > box.maxZ) return true;
  } else {
    let ta = (box.minZ - az) / dz;
    let tb = (box.maxZ - az) / dz;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
  }
  return !(t0 <= t1 && t1 > 0 && t0 < 1);
}

describe('Nuke Town sightline fidelity', () => {
  it('keeps every standing eye-line shorter than a cross-map killing lane', () => {
    const map = buildArena(new THREE.Scene());
    const bounds = map.bounds;
    const colliders = (map.physicsColliders as Box2[]).filter(blocksSight);

    // Deterministic low-discrepancy sample pairing over open space. Points sit
    // on a 1 m lattice inside the playable bounds, offset from the walls.
    const points: Array<[number, number]> = [];
    for (let x = bounds.minX + 2; x <= bounds.maxX - 2; x += 1) {
      for (let z = bounds.minZ + 2; z <= bounds.maxZ - 2; z += 1) {
        const insideCollider = colliders.some(
          (c) => x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ,
        );
        if (!insideCollider) points.push([x, z]);
      }
    }

    let longest = 0;
    let longestPair: number[] = [];
    for (let t = 0; t < points.length * 40; t++) {
      const ia = Math.floor((((t + 0.5) * 0.618033988749895) % 1) * points.length);
      const ib = Math.floor((((t + 0.5) * 0.7548776662466927) % 1) * points.length);
      const a = points[ia];
      const b = points[ib];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length <= longest) continue;
      const clear = colliders.every((c) => segmentClearOfBox(a[0], a[1], b[0], b[1], c));
      if (clear) {
        longest = length;
        longestPair = [a[0], a[1], b[0], b[1]];
      }
    }
    expect(
      longest,
      `longest clear eye-line ${longest.toFixed(1)} m via ${JSON.stringify(longestPair)}`,
    ).toBeLessThanOrEqual(MAXIMUM_CLEAR_EYE_LINE);
  }, 120_000);
});
