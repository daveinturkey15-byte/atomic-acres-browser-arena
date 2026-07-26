import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import type { Box2 } from './collision';
import {
  PASS65_SHED_PLACEMENTS,
  shedPlacementFootprint,
  shedPlacementsForArena,
  validateShedPlacementRegistry,
} from './destructible-shed-registry';
import { buildArena, type ArenaMap } from './map';

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
    expect(shedPlacementsForArena('skyline-terminal').every((placement) => placement.zone === 'terminal-apron' && placement.position.z >= 0)).toBe(true);
  });

  it('keeps every authored footprint in-bounds, off static collision, apart from spawns, and disjoint', () => {
    const arenas: ArenaMap[] = [
      buildArena(new THREE.Scene()),
      buildRustworks1v1(new THREE.Scene()),
      buildSkylineTerminal(new THREE.Scene()),
      buildGunRange(new THREE.Scene()),
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
