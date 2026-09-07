import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import type { Box2 } from './collision';
import {
  PASS65_SHED_ELIGIBILITY,
  PASS65_SHED_PLACEMENTS,
  shedPlacementFootprint,
  shedPlacementsForArena,
  validateShedPlacementRegistry,
} from './destructible-shed-registry';
import { buildArena, type ArenaMap } from './map';
import { buildNuketown2 } from './nuketown2-arena';

function overlap(left: Box2, right: Box2): boolean {
  return left.minX < right.maxX && left.maxX > right.minX
    && left.minZ < right.maxZ && left.maxZ > right.minZ
    && (left.minY ?? 0) < (right.maxY ?? 8) && (left.maxY ?? 8) > (right.minY ?? 0);
}

describe('frozen Pass 65 shed placement registry', () => {
  it('places two sheds in every approved zone and none in Gun Range', () => {
    expect(validateShedPlacementRegistry()).toEqual([]);
    expect(shedPlacementsForArena('atomic-acres')).toHaveLength(2);
    expect(shedPlacementsForArena('rustworks-1v1')).toHaveLength(2);
    expect(shedPlacementsForArena('skyline-terminal')).toHaveLength(2);
    expect(shedPlacementsForArena('gun-range')).toEqual([]);
    expect(shedPlacementsForArena('farcrysis')).toEqual([]);
    expect(shedPlacementsForArena('high-seas')).toEqual([]);
    // NUKETOWN2 (owner 2026-09-02, HF-407): "still keeping ... the sheds".
    expect(shedPlacementsForArena('nuketown2')).toHaveLength(2);
    expect(PASS65_SHED_ELIGIBILITY.map((row) => row.arenaId)).toEqual([
      'atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range', 'farcrysis', 'high-seas', 'nuketown2',
    ]);
    // The two rebuild sheds are a 180-degree rotation of each other, which is
    // the same involution every solid in that arena is emitted through. Checked
    // mechanically: a hand-placed pair is exactly what drifts.
    const [north, south] = shedPlacementsForArena('nuketown2');
    expect(south!.position.x).toBeCloseTo(-north!.position.x, 10);
    expect(south!.position.z).toBeCloseTo(-north!.position.z, 10);
    expect(Math.cos(south!.yaw)).toBeCloseTo(Math.cos(north!.yaw + Math.PI), 10);
    expect(Math.sin(south!.yaw)).toBeCloseTo(Math.sin(north!.yaw + Math.PI), 10);
    expect(shedPlacementsForArena('skyline-terminal').every((placement) => placement.zone === 'terminal-apron' && placement.position.z >= 0)).toBe(true);
  });

  it('keeps every authored footprint in-bounds, off static collision, apart from spawns, and disjoint', () => {
    const arenas: ArenaMap[] = [
      buildArena(new THREE.Scene()),
      buildRustworks1v1(new THREE.Scene()),
      buildSkylineTerminal(new THREE.Scene()),
      buildGunRange(new THREE.Scene()),
      // NUKETOWN2 (HF-407): the rebuild's two sheds go through the same
      // in-bounds / off-collider / clear-of-spawns / disjoint check as every
      // other arena's. Registering a placement without building the arena it
      // sits in is how a shed ends up inside a fence.
      buildNuketown2(new THREE.Scene()),
    ];
    for (const arena of arenas) {
      const placements = shedPlacementsForArena(arena.id);
      const footprints = placements.map(shedPlacementFootprint);
      footprints.forEach((footprint, index) => {
        expect(footprint.minX, placements[index]!.id).toBeGreaterThanOrEqual(arena.bounds.minX);
        expect(footprint.maxX, placements[index]!.id).toBeLessThanOrEqual(arena.bounds.maxX);
        expect(footprint.minZ, placements[index]!.id).toBeGreaterThanOrEqual(arena.bounds.minZ);
        expect(footprint.maxZ, placements[index]!.id).toBeLessThanOrEqual(arena.bounds.maxZ);
        expect(arena.physicsColliders.some((collider) => overlap(footprint, collider)), placements[index]!.id).toBe(false);
        const nearestSpawn = Math.min(...[...arena.spawns[0], ...arena.spawns[1]].map((spawn) => (
          Math.hypot(spawn.x - placements[index]!.position.x, spawn.z - placements[index]!.position.z)
        )));
        expect(nearestSpawn, placements[index]!.id).toBeGreaterThan(5.5);
      });
      for (let left = 0; left < footprints.length; left += 1) {
        for (let right = left + 1; right < footprints.length; right += 1) {
          expect(overlap(footprints[left]!, footprints[right]!), `${placements[left]!.id}/${placements[right]!.id}`).toBe(false);
        }
      }
    }
    expect(new Set(PASS65_SHED_PLACEMENTS.map((placement) => placement.id)).size).toBe(PASS65_SHED_PLACEMENTS.length);
  });
});
