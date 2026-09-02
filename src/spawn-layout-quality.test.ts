import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARENA_SELECTIONS } from './map-selection';
import { validArenaSpawnPoint } from './spawn-safety';
import {
  ARENA_BUILDERS,
  FREE_FOR_ALL_ONLY_ARENA_IDS,
  SPAWN_LAYOUT_THRESHOLDS,
  arenaFieldsBots,
  arenaRunsTeamModes,
  measureSpawnLayout,
} from './spawn-layout-constraints';

type SpawnPoint = { x: number; z: number };
// HF-402: the builder table is `Record<ArenaId, ...>` in
// spawn-layout-constraints.ts - exhaustive by type, so a new registry id
// without a builder fails tsc instead of silently escaping this gate.
const BUILDERS = ARENA_BUILDERS;

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

/**
 * HF-402 (2026-09-02). Owner: "please ensure all maps have more reasonable
 * spawns for both players and bots, currently raid spawns me in outside".
 *
 * Everything above passed on Raid while five of its six team-0 spawns stood
 * in the void outside the boundary wall: "walkable" was measured as "not
 * inside a collider", and nothing is inside a collider where there is no map.
 * Measured on the shipped b138b9c0 tables before this block existed:
 *
 *     test2 (Raid)   team 0: 5/6 no floor, 6/6 no autostep route to the enemy
 *                    team 1: 4/6 no floor, 6/6 no route (the two with a floor
 *                            sit in a garage only a jump leaves)
 *     every other selectable arena: 12/12 or 24/24 on every rule below
 *
 * The rules and their thresholds live in src/spawn-layout-constraints.ts and
 * are calibrated on Nuke Town. The roster is derived from ARENA_SELECTIONS.
 */
describe('HF-402: every authored spawn is inside the map, on a floor, with a route, cover, and no enemy spawn in sight', () => {
  for (const selection of PLAYABLE) {
    describe(selection.displayName, () => {
      const arena = BUILDERS[selection.id](new THREE.Scene());
      const report = measureSpawnLayout(selection.id, arena);
      const describePoint = (point: (typeof report.points)[number]): string => `${selection.id} team ${point.team} spawn (${point.x}, ${point.z})`;

      it('stands every spawn on a floor within autostep of its feet - outside the footprint there is none', () => {
        for (const point of report.points) {
          expect(point.floorGapM, `${describePoint(point)} has nothing beneath it (a fail-safe floor more than 0.6 m down does not count)`).not.toBeNull();
        }
      });

      it('connects every spawn to an enemy spawn by a route that needs no jump - a bot cannot jump', () => {
        for (const point of report.points) {
          expect(point.reachable, `${describePoint(point)} has no autostep route to any enemy spawn${point.reachableByJump ? ' (a jump would reach one: a bot trap)' : ''}`).toBe(true);
        }
      });

      it(`puts hard cover within ${SPAWN_LAYOUT_THRESHOLDS.maximumCoverDistanceM} m of every spawn`, () => {
        for (const point of report.points) {
          expect(point.coverDistanceM, `${describePoint(point)} is ${point.coverDistanceM} m from the nearest cover`).toBeLessThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.maximumCoverDistanceM);
        }
      });

      // HF-402 repair: standoff and open arc. Thresholds are the SHIPPED set's
      // own minima (see SPAWN_LAYOUT_THRESHOLDS), so every arena but Raid
      // passed these the day they were written - which is the point: they
      // encode what the maps the owner accepts already do.
      it(`keeps every spawn at least ${SPAWN_LAYOUT_THRESHOLDS.minimumWallStandoffM} m off any face that fills the view`, () => {
        for (const point of report.points) {
          expect(point.wallStandoffM, `${describePoint(point)} opens ${point.wallStandoffM} m from a wall in its face`).toBeGreaterThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.minimumWallStandoffM);
        }
      });

      it(`leaves at least ${SPAWN_LAYOUT_THRESHOLDS.minimumOpenArcFraction * 100}% of the compass open to walk out of`, () => {
        for (const point of report.points) {
          expect(point.openArcFraction, `${describePoint(point)} is boxed in: only ${(point.openArcFraction * 100).toFixed(0)}% of the compass is walkable`).toBeGreaterThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.minimumOpenArcFraction);
        }
      });

      if (arenaFieldsBots(selection.id)) {
        it(`keeps every enemy spawn with a direct eye-height line at least ${SPAWN_LAYOUT_THRESHOLDS.minimumVisibleEnemySpawnDistanceM} m away - bots draw from that table`, () => {
          for (const point of report.points) {
            if (point.nearestVisibleEnemyM === null) continue;
            expect(point.nearestVisibleEnemyM, `${describePoint(point)} sees an enemy spawn ${point.nearestVisibleEnemyM} m away`).toBeGreaterThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.minimumVisibleEnemySpawnDistanceM);
          }
        });
      }

      if (arenaRunsTeamModes(selection.id)) {
        it(`separates the two tables by at least ${SPAWN_LAYOUT_THRESHOLDS.minimumCrossTeamSeparationFraction * 100}% of the longer axis`, () => {
          expect(report.summary.crossTeamMinFraction, `${selection.id} tables are ${report.summary.crossTeamMinDistanceM} m apart`).toBeGreaterThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.minimumCrossTeamSeparationFraction);
        });
      }

      it('reports no failure at all - and none the rules above did not already name', () => {
        // The per-point failure list is what the solver and the runtime
        // verifier consume; it must agree with the assertions above.
        //
        // The previous version of this filtered `teams-too-close` out of
        // report.failures and asserted the remainder was empty. That was
        // vacuous: `teams-too-close:*` is the ONLY string measureSpawnLayout
        // ever pushes into report.failures, so the filtered array was empty
        // whatever the layout did. It now asserts the real invariant - that
        // the layout produces no failure of any kind - which is what the
        // block's title claims and what the solver is held to.
        const named = new Set(['no-floor', 'no-autostep-route-to-enemy', 'no-cover-in-reach', 'enemy-spawn-in-sight', 'inside-geometry-or-out-of-bounds', 'wall-in-the-face', 'boxed-in']);
        for (const point of report.points) {
          for (const failure of point.failures) expect(named.has(failure), `${describePoint(point)}: unknown failure ${failure}`).toBe(true);
        }
        expect(report.points.flatMap((point) => point.failures.map((failure) => `${describePoint(point)}: ${failure}`)), `${selection.id} per-point failures`).toEqual([]);
        expect(report.failures, `${selection.id} layout-level failures`).toEqual([]);
      });
    });
  }
});

/**
 * HF-402 repair. The team-separation rule is skipped on arenas the runtime
 * forces into free-for-all, where the two tables are one merged pool. That
 * exemption used to key on `maximumSoloBots === 0`, which got the right answer
 * for the wrong reason and would have let a future bot-less TEAM arena escape
 * the rule. It now keys on FREE_FOR_ALL_ONLY_ARENA_IDS - and this pins that
 * list against the runtime that actually decides it, so the two cannot drift.
 */
describe('HF-402: the free-for-all exemption matches what the runtime does', () => {
  const legacyMain = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('pins every exempted arena to the runtime line that forces it to free-for-all', () => {
    for (const arenaId of FREE_FOR_ALL_ONLY_ARENA_IDS) {
      expect(
        legacyMain.includes(`const rangeLobby = arenaId === '${arenaId}';`),
        `${arenaId} is exempt from the team-separation rule, but legacy-main.ts no longer forces it to free-for-all`,
      ).toBe(true);
    }
    // ...and that the forced mode really is ffa, not merely a named lobby.
    expect(legacyMain).toContain("const mode: MatchMode = rangeLobby || element<HTMLSelectElement>('#lobby-mode').value === 'ffa' ? 'ffa' : 'tdm';");
    expect(legacyMain).toContain('modeInput.disabled = !hostControls || rangeLobby;');
  });

  it('exempts nothing else: every selectable TEAM arena is held to team separation', () => {
    for (const selection of PLAYABLE) {
      // MAP3 (HF-409, owner 2026-09-02 16:55: "it's not about combat, it's a
      // mode you can explore"): an EXPLORE arena has no opposing side, so there
      // is no second table for its spawns to be separated FROM and the rule is
      // vacuous rather than skipped.
      //
      // This reads the registry's declared `kind`, NOT a list of ids, and it is
      // a check the file did not have before: declaring `'explore'` obliges the
      // arena to actually carry no lobby, no bots and no field support, so the
      // kind cannot be used to duck this gate while shipping combat. An explore
      // arena that later gains a lobby or a single bot fails HERE, immediately,
      // rather than quietly leaving the rule.
      if (selection.kind === 'explore') {
        expect(selection.multiplayer, `${selection.id} is declared explore but hosts a lobby`).toBe(false);
        expect(selection.maximumSoloBots, `${selection.id} is declared explore but fields bots`).toBe(0);
        expect(selection.soloBotCount, `${selection.id} is declared explore but fields bots`).toBe(0);
        expect(selection.fieldSupport, `${selection.id} is declared explore but carries field support`).toBe(false);
        expect(arenaFieldsBots(selection.id), `${selection.id} is declared explore but the runtime fields bots`).toBe(false);
        expect(arenaRunsTeamModes(selection.id), `${selection.id} is declared explore but runs team modes`).toBe(false);
        continue;
      }
      if (FREE_FOR_ALL_ONLY_ARENA_IDS.includes(selection.id)) continue;
      expect(arenaRunsTeamModes(selection.id), `${selection.id} escapes the team-separation rule`).toBe(true);
    }
  });

  it('holds every selectable arena to a declared kind, and keeps exactly one explore arena', () => {
    // The kind is a required field, so tsc already forces a new arena to answer
    // the question. This pins the ANSWER SET so that flipping an existing team
    // arena to explore - which would silently drop it out of the rule above -
    // is a deliberate edit to this line.
    for (const selection of PLAYABLE) {
      expect(['team', 'explore'], `${selection.id} has no declared kind`).toContain(selection.kind);
    }
    expect(PLAYABLE.filter((selection) => selection.kind === 'explore').map((selection) => selection.id)).toEqual(['map3']);
  });
});
