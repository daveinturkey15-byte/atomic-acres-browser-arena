import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { segmentBoxHitTime } from './collision';
import { buildFarcrysis } from './farcrysis';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { FARCRYSIS_WATER_LEVEL, farcrysisTerrainHeight } from './farcrysis-terrain-authority';
import {
  SPAWN_EYE_HEIGHT,
  SPAWN_LAYOUT_THRESHOLDS,
  arenaPointsOfInterest,
  measureSpawnLayout,
} from './spawn-layout-constraints';

/**
 * PASS 85 Lane R — the farcrysis spawn table.
 *
 * The shared gate is src/spawn-layout-quality.test.ts, and its roster is
 * derived from `selectable !== false`, so it does not look at farcrysis while
 * the arena is hidden. This file holds the same layout to the same numbers
 * from inside the arena's own module set, so the table cannot rot in the gap
 * between the fix and the unhide.
 *
 * It also carries the one rule the shared gate CANNOT check here. HF-402's
 * `floorBeneath` finds a floor from a downward ray against `raycastMeshes`, an
 * axis-aligned collider top, or the physics fail-safe floor. farcrysis has
 * none of those under the player: its ground is 5,474 ROTATED tangent-plane
 * slabs in `physicsColliders` (`farcrysisTerrainPhysicsTiles`), the visual
 * terrain is presentation-only and deliberately absent from `raycastMeshes`,
 * and the fail-safe floor is 4.5 m down. Measured: with `floorBeneath` as
 * shipped, 7 of 1,244 dry 2 m cells on this island report a floor - all of
 * them prop tops - so every spawn anywhere on it reads 'no-floor'. The floor
 * check below is therefore done against the plates directly, with the same
 * downward segment and the same autostep/drop tolerances the shared rule uses.
 */

/** `floorBeneath`'s own tolerances (src/spawn-layout-constraints.ts). */
const AUTOSTEP_M = 0.45;
const FLOOR_DROP_TOLERANCE_M = 0.6;
/** `spawnRecord` in farcrysis.ts seats every point this far above the surface. */
const EYE_ABOVE_GROUND_M = 1.7;
/** The solver's dry-land margin: no spawn in the wade shelf. */
const DRY_FREEBOARD_M = 1.2;
/** The diagonal the two tables are split across: u = (x + z) / 2. */
const DIAGONAL_BAND_M = 17;
/** src/spawn-layout-quality.test.ts: MINIMUM_SPREAD_FRACTION. */
const MINIMUM_SPREAD_FRACTION = 0.18;
/** src/spawn-layout-quality.test.ts: MINIMUM_PAIR_SEPARATION_M. */
const MINIMUM_PAIR_SEPARATION_M = 3;
/** src/spawn-layout-quality.test.ts: MINIMUM_SPAWNS_PER_TEAM. */
const MINIMUM_SPAWNS_PER_TEAM = 4;

const arena = buildFarcrysis(new THREE.Scene());
const teams = [arena.spawns[0], arena.spawns[1]] as const;
const allPoints = [...teams[0], ...teams[1]];
const LONGEST_AXIS = Math.max(
  FARCRYSIS_BOUNDS.maxX - FARCRYSIS_BOUNDS.minX,
  FARCRYSIS_BOUNDS.maxZ - FARCRYSIS_BOUNDS.minZ,
);

/** The gap between the feet and the terrain plate beneath them, or null when there is none. */
function plateGapBeneath(point: THREE.Vector3): number | null {
  const far = SPAWN_EYE_HEIGHT + FLOOR_DROP_TOLERANCE_M + 0.01;
  const feetY = point.y - SPAWN_EYE_HEIGHT;
  let best: number | null = null;
  for (const box of arena.physicsColliders) {
    if (box.maxY === undefined) continue;
    let surfaceY: number;
    if (box.rotation) {
      const time = segmentBoxHitTime(
        { x: point.x, y: point.y, z: point.z },
        { x: point.x, y: point.y - far, z: point.z },
        box,
        0,
      );
      if (time === null) continue;
      surfaceY = point.y - time * far;
    } else {
      if (point.x < box.minX || point.x > box.maxX || point.z < box.minZ || point.z > box.maxZ) continue;
      surfaceY = box.maxY;
    }
    const gap = feetY - surfaceY;
    if (gap < -AUTOSTEP_M || gap > FLOOR_DROP_TOLERANCE_M) continue;
    if (best === null || Math.abs(gap) < Math.abs(best)) best = gap;
  }
  return best;
}

const describePoint = (point: THREE.Vector3, team: number): string =>
  `farcrysis team ${team} spawn (${point.x}, ${point.z})`;

describe('farcrysis spawn table (PASS 85 Lane R)', () => {
  it('seats every spawn on the terrain authority rather than the flat 1.7 m eye pin', () => {
    // The pre-PASS-85 table used the shared `spawnRecord` height of y = 1.7 for
    // all eight points, i.e. feet at y = 0. That is only near-correct on the
    // beach corners it occupied (surface 0.08-0.50 m); at (-8, -26), where a
    // spawn now stands, the surface is 7.28 m and a flat pin would bury the
    // player. legacy-main copies this y into the player and teleports the
    // capsule eye to it, so the authored value is what the runtime uses.
    for (const [team, points] of teams.entries()) {
      for (const point of points) {
        expect(point.y, `${describePoint(point, team)} is not seated on the terrain`)
          .toBeCloseTo(farcrysisTerrainHeight(point.x, point.z) + EYE_ABOVE_GROUND_M, 6);
      }
    }
  });

  it('stands every spawn on a terrain plate within autostep of its feet', () => {
    for (const [team, points] of teams.entries()) {
      for (const point of points) {
        expect(plateGapBeneath(point), `${describePoint(point, team)} has no terrain plate beneath it`).not.toBeNull();
      }
    }
  });

  it('keeps every spawn on dry land, clear of the wade shelf', () => {
    for (const [team, points] of teams.entries()) {
      for (const point of points) {
        expect(
          farcrysisTerrainHeight(point.x, point.z),
          `${describePoint(point, team)} stands in the surf`,
        ).toBeGreaterThanOrEqual(FARCRYSIS_WATER_LEVEL + DRY_FREEBOARD_M);
      }
    }
  });

  it('fields at least six points per team - the old table had four in one corner', () => {
    for (const [team, points] of teams.entries()) {
      expect(points.length, `farcrysis team ${team}`).toBeGreaterThanOrEqual(MINIMUM_SPAWNS_PER_TEAM);
      expect(points.length, `farcrysis team ${team}`).toBeGreaterThanOrEqual(6);
    }
  });

  it('splits the two tables across the NW/SE diagonal the arena was authored around', () => {
    for (const point of teams[0]) {
      expect((point.x + point.z) / 2, `${describePoint(point, 0)} is not on team 0's side of the diagonal`)
        .toBeLessThanOrEqual(-DIAGONAL_BAND_M);
    }
    for (const point of teams[1]) {
      expect((point.x + point.z) / 2, `${describePoint(point, 1)} is not on team 1's side of the diagonal`)
        .toBeGreaterThanOrEqual(DIAGONAL_BAND_M);
    }
  });

  it('spreads each team across the island instead of blobbing it in a beach corner', () => {
    // Measured on the shipped table before this pass: team spans 16 m and
    // 16 m of a 128 m map = 0.125, under the shared gate's 0.18 floor.
    for (const [team, points] of teams.entries()) {
      const spanX = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
      const spanZ = Math.max(...points.map((p) => p.z)) - Math.min(...points.map((p) => p.z));
      expect(
        Math.max(spanX, spanZ) / LONGEST_AXIS,
        `farcrysis team ${team} spans only ${Math.max(spanX, spanZ).toFixed(1)} m of a ${LONGEST_AXIS} m map`,
      ).toBeGreaterThanOrEqual(MINIMUM_SPREAD_FRACTION);
    }
  });

  it('separates its own spawns so one grenade cannot cover two', () => {
    for (const [team, points] of teams.entries()) {
      for (let left = 0; left < points.length; left += 1) {
        for (let right = left + 1; right < points.length; right += 1) {
          expect(
            Math.hypot(points[left]!.x - points[right]!.x, points[left]!.z - points[right]!.z),
            `farcrysis team ${team}: (${points[left]!.x},${points[left]!.z}) and (${points[right]!.x},${points[right]!.z}) are effectively one spawn`,
          ).toBeGreaterThanOrEqual(MINIMUM_PAIR_SEPARATION_M);
        }
      }
    }
  });

  it('holds the tables apart by more than the shared team-separation floor', () => {
    let closest = Number.POSITIVE_INFINITY;
    for (const left of teams[0]) {
      for (const right of teams[1]) closest = Math.min(closest, Math.hypot(left.x - right.x, left.z - right.z));
    }
    expect(closest / LONGEST_AXIS, `farcrysis tables are ${closest.toFixed(1)} m apart`)
      .toBeGreaterThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.minimumCrossTeamSeparationFraction);
  });

  it('passes every HF-402 rule the shared instrument can see on this arena', () => {
    // Everything except the floor rule, which is measured above against the
    // plates: route, cover, wall standoff, open arc, enemy line of sight and
    // team separation all come from the shared measurement unchanged.
    const report = measureSpawnLayout('farcrysis', arena);
    const notFloor = report.points.flatMap((point) => point.failures
      .filter((failure) => failure !== 'no-floor')
      .map((failure) => `farcrysis team ${point.team} spawn (${point.x}, ${point.z}): ${failure}`));
    expect(notFloor, 'farcrysis per-point failures other than the heightfield floor rule').toEqual([]);
    expect(report.failures, 'farcrysis layout-level failures').toEqual([]);
    expect(report.summary.reachablePercent, 'farcrysis spawns with an autostep route to an enemy spawn').toBe(100);
    expect(report.summary.maxCoverDistanceM).toBeLessThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.maximumCoverDistanceM);
    expect(report.summary.minWallStandoffM).toBeGreaterThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.minimumWallStandoffM);
    expect(report.summary.minOpenArcFraction).toBeGreaterThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.minimumOpenArcFraction);
    expect(report.summary.nearestVisibleEnemyPairM ?? Infinity)
      .toBeGreaterThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.minimumVisibleEnemySpawnDistanceM);
  });

  it('keeps a point of interest within reach of the spawn set', () => {
    // Bots patrol these; a spawn set with no anchor near it opens every round
    // with a long empty walk.
    const poi = arenaPointsOfInterest(arena);
    expect(poi.length).toBeGreaterThan(0);
    const distances = allPoints.map((point) => Math.min(...poi.map((anchor) => Math.hypot(point.x - anchor.x, point.z - anchor.z))));
    expect(Math.max(...distances), 'farthest farcrysis spawn from any patrol anchor').toBeLessThanOrEqual(40);
  });
});
