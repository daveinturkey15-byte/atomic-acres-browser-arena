/**
 * farcrysis-layout.test.ts — PASS 95 layout stage gates (SPEC.md §7 L2/L3/L5).
 *
 * What is held here, and why each number is what it is:
 *
 *   1. SCALE ANCHORS. `FARCRYSIS_SCALE` is a documented copy of constants that
 *      live in modules too heavy for a leaf; each copy is checked against its
 *      source so the layout cannot drift from the physics it is cut for.
 *   2. THE MIDDLE IS CLEAR. Every solid inside `FARCRYSIS_MIDDLE_RADIUS_M`
 *      either has a metric job or a named structural exemption. Held at
 *      ZERO unjustified masses — the L2 rule, mechanical.
 *   3. SIGHTLINES, MEASURED FOR REAL. Eye-to-eye lines against every solid
 *      collider and the terrain ridge field. The PASS 74 audit found this
 *      arena's sightline "assertion" was `>= 0` against a number that was not
 *      a sightline; the guard below fails the suite if that ever returns.
 *      The PASS 69 C4 target (no open line over 22 m from any spawn or
 *      patrol point) is NOT met and is not asserted as met: the numbers are
 *      ratcheted at the values measured at this head and may only improve.
 *      The 22 m target is documented, quoted in the lane report, and OPEN.
 *   4. SPAWN PAIRS. Every cross-team pair that is open is at least the
 *      HF-402 visible-enemy floor (30 m) apart, measured by real occlusion,
 *      and the count of open pairs may only fall.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { buildFarcrysis } from './farcrysis';
import {
  FARCRYSIS_CROSS_LANES,
  FARCRYSIS_LOOPS,
  FARCRYSIS_MIDDLE_EXEMPT,
  FARCRYSIS_MIDDLE_RADIUS_M,
  FARCRYSIS_PIPELINE_BUDGET,
  FARCRYSIS_REVIEW_STATIONS,
  FARCRYSIS_ROUTE_SEGMENTS,
  FARCRYSIS_SCALE,
  FARCRYSIS_SPAWN_ZONES,
  FARCRYSIS_TERRAIN_WATER,
  FARCRYSIS_VERTICAL_CROSSING,
  FARCRYSIS_COVER_RHYTHM,
  measureFarcrysisMidMapMasses,
  measureFarcrysisSightlines,
  openDistance,
} from './farcrysis-layout';
import { FARCRYSIS_BOUNDS, FARCRYSIS_COVER_MIN, FARCRYSIS_MAX_SIGHTLINE } from './farcrysis-constants';
import { FARCRYSIS_LANDMARKS } from './farcrysis-midmap-landmarks';
import { CHARACTER_PHYSICS_CONFIG } from './physics';
import { SPAWN_EYE_HEIGHT, SPAWN_LAYOUT_THRESHOLDS } from './spawn-layout-constraints';
import { SPRINT_ENTER_MPS } from './operator-posture-layer';
import { FLAMETHROWER_EFFECT } from './special-weapon-effects';
import { TSL_FOLIAGE_MAX_DISTINCT_GRAPHS } from './farcrysis-tsl-foliage';

// ---------------------------------------------------------------------------
// Ratchets — MEASURED at the L2 head by scripts/qa/measure-farcrysis-layout.ts
// (docs/evidence/pass95/farcrysis-rebuild/layout-after-l2.json). Lower-only.
// ---------------------------------------------------------------------------

/** Longest open eye-to-eye line from any spawn or patrol point, metres. Target: FARCRYSIS_MAX_SIGHTLINE (22). */
const MAX_OPEN_SIGHTLINE_CEILING_M = 94.0;
/** Fraction of compass samples at or under 22 m. Target: 1.0. */
const UNDER_CEILING_FRACTION_FLOOR = 0.60;
/** Cross-team spawn pairs with an open eye line. Target: 0. */
const OPEN_SPAWN_PAIRS_CEILING = 20;

const RATCHET_HISTORY: ReadonlyArray<{ readonly at: string; readonly maxOpenM: number; readonly underFraction: number; readonly openPairs: number; readonly why: string }> = [
  {
    at: '2026-09-05',
    maxOpenM: 94.0,
    underFraction: 0.60,
    openPairs: 20,
    why: 'PASS 95 layout stage, first real occlusion measurement at eda54adf then after the L2 clear: '
      + 'max 93.99 m (patrol-2 at 110 deg to the island edge), 391 of 1008 samples over 22 m before '
      + 'the clear, 20 of 64 cross-team pairs open with the nearest at 48.8 m. The interactables '
      + 'removed by L2 blocked none of the over-ceiling lines, so the clear could not move these.',
  },
];

function fakeCanvasContext(): CanvasRenderingContext2D {
  const gradient = () => ({ addColorStop: vi.fn() });
  const state: Record<PropertyKey, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif' };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'createImageData' || prop === 'getImageData') {
        return (...args: number[]) => {
          const w = args.length >= 4 ? args[2]! : args[0]!;
          const h = args.length >= 4 ? args[3]! : args[1]!;
          return { width: w, height: h, data: new Uint8ClampedArray(Math.max(4, w * h * 4)) };
        };
      }
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return gradient;
      if (prop === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (typeof prop === 'string') {
        if (!(prop in target)) target[prop] = vi.fn();
        return target[prop];
      }
      return undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0, getContext: () => context, style: {},
      setAttribute: () => undefined, appendChild: () => undefined, remove: () => undefined,
    }),
    getElementById: () => null,
    documentElement: { dataset: { renderBackend: 'webgl2' } },
    body: { appendChild: () => undefined },
  });
}

function buildArena() {
  const scene = new THREE.Scene();
  return buildFarcrysis(scene);
}

describe('farcrysis layout stage (PASS 95, SPEC section 7)', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('keeps every scale anchor equal to the constant it documents', () => {
    expect(FARCRYSIS_SCALE.eyeHeightM).toBe(SPAWN_EYE_HEIGHT);
    expect(FARCRYSIS_SCALE.autostepM).toBe(CHARACTER_PHYSICS_CONFIG.autostepHeight);
    expect(FARCRYSIS_SCALE.sprintMps).toBe(SPRINT_ENTER_MPS);
    expect(FARCRYSIS_SCALE.spawnCoverReachM).toBe(SPAWN_LAYOUT_THRESHOLDS.maximumCoverDistanceM);
    expect(FARCRYSIS_SCALE.engagementM).toBe(FARCRYSIS_MAX_SIGHTLINE);
    expect(FARCRYSIS_SCALE.weaponRangeM).toEqual({ localHitscan: 90, botHitscan: 110, worldTrace: 220, flamethrower: FLAMETHROWER_EFFECT.rangeM });
    expect(FARCRYSIS_MAX_SIGHTLINE).toBe(22);
    expect(FARCRYSIS_COVER_MIN).toBe(14);
  });

  it('exposes one factory-owned route, spawn, vertical and capture contract', () => {
    expect(FARCRYSIS_ROUTE_SEGMENTS).toHaveLength(28);
    expect(FARCRYSIS_ROUTE_SEGMENTS.every((edge) => edge.distanceM > 0 && edge.widthM >= 4.5)).toBe(true);
    expect(FARCRYSIS_ROUTE_SEGMENTS.reduce((sum, edge) => sum + edge.sprintSeconds, 0))
      .toBeCloseTo(FARCRYSIS_LOOPS.reduce((sum, route) => sum + route.sprintLapS, 0)
        + FARCRYSIS_CROSS_LANES.reduce((sum, lane) => sum + Math.hypot(lane.to[0] - lane.from[0], lane.to[1] - lane.from[1]) / FARCRYSIS_SCALE.sprintMps, 0), 8);
    expect(FARCRYSIS_SPAWN_ZONES.map((zone) => zone.team)).toEqual([0, 1]);
    expect(FARCRYSIS_SPAWN_ZONES.every((zone) => zone.coverReachM === SPAWN_LAYOUT_THRESHOLDS.maximumCoverDistanceM
      && zone.visibleEnemyFloorM === SPAWN_LAYOUT_THRESHOLDS.minimumVisibleEnemySpawnDistanceM)).toBe(true);
    expect(FARCRYSIS_VERTICAL_CROSSING).toMatchObject({ id: 'core-catwalk-stairs', widthM: 1.2 });
    expect(FARCRYSIS_VERTICAL_CROSSING.top[1]).toBeGreaterThan(FARCRYSIS_VERTICAL_CROSSING.foot[1]);
    expect(FARCRYSIS_TERRAIN_WATER.waterLevelY).toBe(-0.25);
    expect(FARCRYSIS_TERRAIN_WATER.safetyFloorY).toBe(-4.5);
    expect(FARCRYSIS_TERRAIN_WATER.shore).toMatchObject({ descentStartDist: 10, outerDropDist: 1.5 });
    expect(FARCRYSIS_COVER_RHYTHM.minimumPhysicalPieces).toBe(FARCRYSIS_COVER_MIN);
    expect(FARCRYSIS_COVER_RHYTHM.bands.map((band) => band.id)).toEqual(['beach-ring', 'jungle-band', 'core-loop']);
    expect(FARCRYSIS_REVIEW_STATIONS).toHaveLength(6);
    expect(new Set(FARCRYSIS_REVIEW_STATIONS.map((entry) => entry.id)).size).toBe(6);
    expect(FARCRYSIS_REVIEW_STATIONS.some((entry) => entry.purpose === 'overview')).toBe(true);
    expect(FARCRYSIS_REVIEW_STATIONS.some((entry) => entry.purpose === 'geometry')).toBe(true);
    expect(FARCRYSIS_REVIEW_STATIONS.some((entry) => entry.purpose === 'light-occlusion')).toBe(true);
  });

  it('derives the render budget from the shared foliage ceiling', () => {
    expect(FARCRYSIS_PIPELINE_BUDGET.maximumFoliageNodeGraphs).toBe(TSL_FOLIAGE_MAX_DISTINCT_GRAPHS);
    expect(FARCRYSIS_PIPELINE_BUDGET.maximumDrawCalls).toBe(460);
    expect(FARCRYSIS_PIPELINE_BUDGET.maximumTriangles).toBe(1_100_000);
    expect(FARCRYSIS_PIPELINE_BUDGET.minimumMaterialsPerFoliageGraph).toBeGreaterThanOrEqual(4);
  });

  it('publishes the same layout contract on the built factory root', () => {
    const arena = buildArena();
    expect(arena.root.userData.farcrysisLayout).toBeDefined();
    expect(arena.root.userData.farcrysisLayout.routeSegments).toBe(FARCRYSIS_ROUTE_SEGMENTS);
    expect(arena.root.userData.farcrysisLayout.reviewStations).toBe(FARCRYSIS_REVIEW_STATIONS);
    expect(arena.root.userData.farcrysisLayout.verticalCrossing).toBe(FARCRYSIS_VERTICAL_CROSSING);
    expect(arena.root.userData.farcrysisLayout.pipelineBudget).toBe(FARCRYSIS_PIPELINE_BUDGET);
  });

  it('derives the three loops and the cross lanes from the island bounds', () => {
    expect(FARCRYSIS_LOOPS.map((l) => l.id)).toEqual(['beach-ring', 'jungle-band', 'core-loop']);
    const [beach, jungle, core] = FARCRYSIS_LOOPS;
    expect(beach!.chebyshevM).toBe(FARCRYSIS_BOUNDS.maxX - 14);
    expect(jungle!.chebyshevM).toBe(26);
    for (const frame of FARCRYSIS_LANDMARKS) {
      expect(Math.max(Math.abs(frame.center[0]), Math.abs(frame.center[1]))).toBe(jungle!.chebyshevM);
    }
    expect(core!.chebyshevM).toBe(5.5);
    // Beach lap at sprint is the long way round; the core loop is seconds.
    expect(beach!.sprintLapS).toBeGreaterThan(jungle!.sprintLapS);
    expect(jungle!.sprintLapS).toBeGreaterThan(core!.sprintLapS);
    expect(core!.sprintLapS).toBeLessThan(12);
    for (const l of FARCRYSIS_LOOPS) {
      for (const [x, z] of l.waypoints) {
        expect(Math.abs(x)).toBeLessThanOrEqual(FARCRYSIS_BOUNDS.maxX);
        expect(Math.abs(z)).toBeLessThanOrEqual(FARCRYSIS_BOUNDS.maxZ);
      }
    }
    expect(FARCRYSIS_CROSS_LANES.map((l) => l.id)).toEqual(['lane-n', 'lane-s', 'lane-w', 'lane-e']);
  });

  it('pins the middle radius between the core shell and the landmark ring', () => {
    expect(FARCRYSIS_MIDDLE_RADIUS_M).toBe(20);
    const arena = buildArena();
    const audit = arena.root.userData.farcrysisColliderAudit as ReadonlyArray<{ id: string; bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }>;
    // No landmark-authored solid lies inside the middle.
    const landmarkInside = audit.filter((row) => /farcrysis-(ruined-wall|crate-(nw|ne|sw|se)|canopy-trunk|rock-(nw|ne|sw|se))/.test(row.id))
      .filter((row) => Math.max(Math.abs((row.bounds.minX + row.bounds.maxX) / 2), Math.abs((row.bounds.minZ + row.bounds.maxZ) / 2)) <= FARCRYSIS_MIDDLE_RADIUS_M);
    expect(landmarkInside.map((r) => r.id)).toEqual([]);
  });

  it('L2: every mass in the middle has a metric job or a named structural exemption', () => {
    const arena = buildArena();
    const report = measureFarcrysisMidMapMasses(arena);
    expect(report.masses.length).toBeGreaterThan(0);
    expect(report.unjustified, `masses in the middle with no job: ${report.unjustified.join(', ')}`).toEqual([]);
    // The exemption list is closed and every entry carries its sentence.
    for (const entry of FARCRYSIS_MIDDLE_EXEMPT) expect(entry.why.length).toBeGreaterThan(20);
    // The retired interactables do not come back under new names.
    const audit = arena.root.userData.farcrysisColliderAudit as ReadonlyArray<{ id: string }>;
    const retired = /^farcrysis-(crate-(05|06|07|08|09|10|11|12|23|24|25|26|31|33)|barrel-(07|08|20|23)|sandbag-06|cover-jungle-0[78])/;
    expect(audit.filter((row) => retired.test(row.id)).map((r) => r.id)).toEqual([]);
  });

  it('L3: measures sightlines by real occlusion and ratchets them downward only', () => {
    const arena = buildArena();
    const report = measureFarcrysisSightlines(arena);
    expect(report.samples.length).toBe(report.origins.length * report.bearings);
    expect(report.origins.filter((o) => o.kind === 'spawn').length).toBe(16);
    // A line that leaves the island unblocked is reported as such, never as 0.
    expect(report.samples.every((s) => s.openM > 0)).toBe(true);
    // The metric occludes: at least one sample is stopped by a named solid and one by terrain.
    expect(report.samples.some((s) => s.blockedBy !== 'bounds' && s.blockedBy !== 'terrain')).toBe(true);
    expect(report.samples.some((s) => s.blockedBy === 'terrain')).toBe(true);
    expect(report.maxOpenM).toBeLessThanOrEqual(MAX_OPEN_SIGHTLINE_CEILING_M);
    expect(report.underCeilingFraction).toBeGreaterThanOrEqual(UNDER_CEILING_FRACTION_FLOOR);
    expect(RATCHET_HISTORY.at(-1)!.maxOpenM).toBe(MAX_OPEN_SIGHTLINE_CEILING_M);
  });

  it('L3: every open cross-team spawn pair is beyond the HF-402 visible-enemy floor', () => {
    const arena = buildArena();
    const report = measureFarcrysisSightlines(arena);
    expect(report.spawnPairs.length).toBe(64);
    expect(report.spawnPairsOpen).toBeLessThanOrEqual(OPEN_SPAWN_PAIRS_CEILING);
    for (const pair of report.spawnPairs) {
      if (!pair.blocked) {
        expect(pair.distanceM, `${pair.from} -> ${pair.to} is open at ${pair.distanceM.toFixed(1)} m`)
          .toBeGreaterThanOrEqual(SPAWN_LAYOUT_THRESHOLDS.minimumVisibleEnemySpawnDistanceM);
      }
    }
  });

  it('occludes with a solid box and with a terrain ridge', () => {
    const flat = { minX: -1, maxX: 1, minZ: 4, maxZ: 5, minY: 0, maxY: 3 };
    const hit = openDistance({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 1.7, z: 10 }, [{ id: 'wall', bounds: flat }]);
    expect(hit.blockedBy).toBe('wall');
    expect(hit.openM).toBeGreaterThan(3.5);
    expect(hit.openM).toBeLessThan(4.5);
    const clear = openDistance({ x: 0, y: 1.7, z: 0 }, { x: 0, y: 1.7, z: 3 }, [{ id: 'wall', bounds: flat }]);
    expect(clear.blockedBy).toBe('bounds');
    expect(clear.openM).toBeCloseTo(3, 6);
  });

  it('never lets the vacuous PASS 74 sightline assertion return', () => {
    const source = readFileSync(resolve(__dirname, 'farcrysis.test.ts'), 'utf8');
    expect(source.includes('maxSightline).toBeGreaterThanOrEqual(0)')).toBe(false);
    expect(source.includes('measureFarcrysisSightlines')).toBe(true);
  });
});
