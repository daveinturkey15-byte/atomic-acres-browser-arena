import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARENA_SELECTIONS } from './map-selection';
import { buildArena } from './map';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import { buildFarcrysis } from './farcrysis';
import { buildHighSeas } from './high-seas';
import { buildTest1, buildTest2 } from './test-maps';
import { validArenaSpawnPoint } from './spawn-safety';

type SpawnPoint = { x: number; z: number };
const BUILDERS: Record<string, (scene: THREE.Scene) => { spawns: Record<number, SpawnPoint[]>; bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; colliders: readonly unknown[] }> = {
  'atomic-acres': buildArena as never,
  'rustworks-1v1': buildRustworks1v1 as never,
  'gun-range': buildGunRange as never,
  'skyline-terminal': buildSkylineTerminal as never,
  farcrysis: buildFarcrysis as never,
  'high-seas': ((scene: THREE.Scene) => buildHighSeas(scene)) as never,
  test1: buildTest1 as never,
  test2: buildTest2 as never,
};

/**
 * THE SPAWN LAYOUT GATE.
 *
 * Owner 2026-08-31: "bot spawns are bad on other maps than nuketown, make
 * player and bot spawns nicely spread and balanced everywhere alwys need a good
 * rule".
 *
 * The selection RULE was never the problem - `scoreSpawnCandidates` is one pure
 * function shared by players and bots, and it already avoids line of sight,
 * nearby enemies, recent deaths and occupied points. The problem is that a rule
 * can only choose among the points a map authors, and most maps authored a
 * corner blob rather than a spawn front. Measured before this gate existed:
 *
 *     atomic-acres  12 points, 43.0 m of spread   <- the map the owner says is fine
 *     test2 (Raid)   6 points,  4 x 10 m box, min pair 2.83 m, one point invalid
 *     farcrysis      4 points, 16 x 12 m corner of a 128 x 128 m map
 *     gun-range      3 points, BOTH TEAM LISTS BYTE-IDENTICAL, cross-team 0.00 m
 *
 * So this gate is on the DATA, not the algorithm. Nuke Town is the reference
 * because it is the one the owner is happy with.
 */

/** Nuke Town is the standard: every other playable arena is measured against it. */
const MINIMUM_SPAWNS_PER_TEAM = 4;
/**
 * Two spawns closer than this are one spawn for grenade purposes.
 *
 * 3 m rather than a rounder 4 because Nuke Town - the arena the owner is happy
 * with and therefore the reference - has a legitimate 3.16 m pair. A threshold
 * the reference map fails is a wrong threshold, not a finding.
 */
const MINIMUM_PAIR_SEPARATION_M = 3;
/** A team's points must span at least this much of the arena's longer axis. */
const MINIMUM_SPREAD_FRACTION = 0.18;

const PLAYABLE = ARENA_SELECTIONS.filter((arena) => arena.selectable !== false);

function distance(a: SpawnPoint, b: SpawnPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('authored spawn layouts, on every playable arena', () => {
  for (const selection of PLAYABLE) {
    describe(selection.displayName, () => {
      const arena = BUILDERS[selection.id]!(new THREE.Scene());
      const teams = [arena.spawns[0] ?? [], arena.spawns[1] ?? []] as const;

      it('authors enough spawn points per team to spread a full lobby', () => {
        for (const [team, points] of teams.entries()) {
          expect(points.length, `${selection.id} team ${team}`).toBeGreaterThanOrEqual(MINIMUM_SPAWNS_PER_TEAM);
        }
      });

      it('places every authored spawn somewhere a player can actually stand', () => {
        for (const [team, points] of teams.entries()) {
          for (const point of points) {
            // y = 1.7 is the authored spawn height (`spawnRecord` builds every
            // point at eye level). Probing at y = 0 reports every point on a
            // map whose floor is a collider as "inside geometry" - which is a
            // bug in the check, not in the map, and it cost a false alarm on
            // all six Firing Range spawns before it was caught.
            const admissible = validArenaSpawnPoint(
              { x: point.x, y: 1.7, z: point.z },
              arena.bounds,
              arena.colliders as never,
            );
            expect(admissible, `${selection.id} team ${team} spawn ${point.x},${point.z} is inside geometry or out of bounds`).toBe(true);
          }
        }
      });

      it('separates its own spawns so one grenade cannot cover two', () => {
        for (const [team, points] of teams.entries()) {
          for (let left = 0; left < points.length; left += 1) {
            for (let right = left + 1; right < points.length; right += 1) {
              expect(
                distance(points[left]!, points[right]!),
                `${selection.id} team ${team}: (${points[left]!.x},${points[left]!.z}) and (${points[right]!.x},${points[right]!.z}) are effectively one spawn`,
              ).toBeGreaterThanOrEqual(MINIMUM_PAIR_SEPARATION_M);
            }
          }
        }
      });

      it('spreads its spawns across the map rather than blobbing them in a corner', () => {
        const width = arena.bounds.maxX - arena.bounds.minX;
        const depth = arena.bounds.maxZ - arena.bounds.minZ;
        const longestAxis = Math.max(width, depth);
        for (const [team, points] of teams.entries()) {
          const spanX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
          const spanZ = Math.max(...points.map((p) => p.z)) - Math.min(...points.map((p) => p.z));
          // Spread along EITHER axis counts: a spawn line across a corridor map
          // is as good as one down the length of an open one.
          expect(
            Math.max(spanX, spanZ) / longestAxis,
            `${selection.id} team ${team} spans only ${Math.max(spanX, spanZ).toFixed(1)} m of a ${longestAxis.toFixed(0)} m map`,
          ).toBeGreaterThanOrEqual(MINIMUM_SPREAD_FRACTION);
        }
      });

      it('never gives the two teams the same point to spawn on', () => {
        // gun-range shipped two byte-identical lists, so both teams drew from
        // the same three points and could materialise on top of each other.
        let closest = Number.POSITIVE_INFINITY;
        for (const left of teams[0]) {
          for (const right of teams[1]) closest = Math.min(closest, distance(left, right));
        }
        expect(closest, `${selection.id} teams share a spawn point`).toBeGreaterThan(MINIMUM_PAIR_SEPARATION_M);
      });
    });
  }
});
