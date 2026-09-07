import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS } from './arena-layout';
import { circleIntersectsBox } from './collision';
import { OVERDRIVE_PICKUP_RADIUS, OVERDRIVE_POSITION } from './overdrive';
import { buildArena } from './map';
import type { ArenaMap } from './map';

/**
 * HF-385 guard: derives 2x Damage Core reachability from the LIVE collider set
 * instead of trusting the hand-written OVERDRIVE_POSITION coordinate.
 *
 * Why this exists: the Pass 78 rebuild seated CENTRAL_BUS - a solid
 * 12.6 x 3.8 x 5.6 m collider - exactly on (0, 0.82, 0), leaving the core
 * unclaimable (nearest standable point 3.25 m vs a 1.65 m pickup radius) and
 * its icon depth-occluded inside the bus body, while the HUD kept announcing
 * it. Nothing failed because nothing DERIVED anything. This guard rebuilds
 * the arena and re-measures the seat against the real physics colliders every
 * run, so the next layout move fails here instead of shipping invisible.
 */

/** Same grounded-capsule obstruction rule as nuketown-traversal.test.ts:
 * bodies tall enough not to autostep (0.42 m) and low enough to matter. */
function groundBlocked(map: ArenaMap, x: number, z: number): boolean {
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    const yaw = b.rotation?.[1];
    let bx = x;
    let bz = z;
    if (yaw !== undefined && yaw !== 0) {
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const dx = x - cx;
      const dz = z - cz;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      bx = cx + dx * cos - dz * sin;
      bz = cz + dx * sin + dz * cos;
    }
    if (circleIntersectsBox(bx, bz, 0.38, b)) return true;
  }
  return false;
}

/** True when a world point sits inside any movement-blocking collider whose
 * vertical span overlaps [minY, maxY] - the bus body failing mode. */
function insideSolid(map: ArenaMap, x: number, y: number, z: number): boolean {
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= minY) continue;
    if (y < minY || y > maxY) continue;
    const yaw = b.rotation?.[1];
    let bx = x;
    let bz = z;
    if (yaw !== undefined && yaw !== 0) {
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const dx = x - cx;
      const dz = z - cz;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      bx = cx + dx * cos - dz * sin;
      bz = cz + dx * sin + dz * cos;
    }
    if (bx >= b.minX && bx <= b.maxX && bz >= b.minZ && bz <= b.maxZ) return true;
  }
  return false;
}

describe('Nuke Town 2x Damage Core seat (HF-385)', () => {
  it('derives claimability from the live collider set: a standable point exists inside the pickup radius', () => {
    const map = buildArena(new THREE.Scene());
    expect(OVERDRIVE_POSITION.x).toBeGreaterThanOrEqual(ARENA_BOUNDS.minX);
    expect(OVERDRIVE_POSITION.x).toBeLessThanOrEqual(ARENA_BOUNDS.maxX);
    expect(OVERDRIVE_POSITION.z).toBeGreaterThanOrEqual(ARENA_BOUNDS.minZ);
    expect(OVERDRIVE_POSITION.z).toBeLessThanOrEqual(ARENA_BOUNDS.maxZ);

    // Fine sweep of the whole pickup disc: the live claim test is a bare
    // horizontal radius against the player eye, so ANY unblocked standing
    // spot within OVERDRIVE_PICKUP_RADIUS makes the core claimable.
    const STEP = 0.05;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let dx = -OVERDRIVE_PICKUP_RADIUS; dx <= OVERDRIVE_PICKUP_RADIUS; dx += STEP) {
      for (let dz = -OVERDRIVE_PICKUP_RADIUS; dz <= OVERDRIVE_PICKUP_RADIUS; dz += STEP) {
        const horizontal = Math.hypot(dx, dz);
        if (horizontal > OVERDRIVE_PICKUP_RADIUS) continue;
        if (groundBlocked(map, OVERDRIVE_POSITION.x + dx, OVERDRIVE_POSITION.z + dz)) continue;
        if (horizontal < bestDistance) bestDistance = horizontal;
      }
    }
    // Report the measured margin so a future layout move prints its own evidence.
    console.log(`[hf385] core (${OVERDRIVE_POSITION.x}, ${OVERDRIVE_POSITION.z}) nearest standable ${bestDistance.toFixed(2)} m vs pickup radius ${OVERDRIVE_PICKUP_RADIUS} m`);
    // Margin strictly inside the radius: flush-to-collider seats rot the same
    // way the origin seat did when a prop grows by even a capsule width.
    expect(bestDistance).toBeLessThanOrEqual(OVERDRIVE_PICKUP_RADIUS - 0.25);
  });

  it('keeps the core and its floating world icon out of every solid collider', () => {
    const map = buildArena(new THREE.Scene());
    // The core mesh rides at state.position.y (+/- 0.14 bob).
    expect(insideSolid(map, OVERDRIVE_POSITION.x, OVERDRIVE_POSITION.y, OVERDRIVE_POSITION.z)).toBe(false);
    // quadWorldIcon renders at root y + 1.75 (legacy-main.ts updateOverdrive),
    // so band-check the highest bob frame as well as the rest position.
    expect(insideSolid(map, OVERDRIVE_POSITION.x, OVERDRIVE_POSITION.y + 1.75, OVERDRIVE_POSITION.z)).toBe(false);
    expect(insideSolid(map, OVERDRIVE_POSITION.x, OVERDRIVE_POSITION.y + 1.89, OVERDRIVE_POSITION.z)).toBe(false);
  });
});
