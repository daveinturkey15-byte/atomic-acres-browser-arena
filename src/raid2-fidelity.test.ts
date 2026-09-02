import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRaid2, RAID2_BOUNDS, STAIR_RISERS, STAIR_RUN, STEP } from './raid2-arena';

import { measureLayout } from '../scripts/qa/raid2-layout-metrics';
import { measureSpawnLayout } from './spawn-layout-constraints';

/** stairRun's tread depth; a riser is this deep along the direction of climb. */
const STAIR_TREAD_M = 0.45;

/**
 * RAID2 fidelity gate (HF-408).
 *
 * WHAT MAKES THIS A GATE RATHER THAN A SNAPSHOT. Every band below is derived,
 * before the build, either from the reference study in
 * docs/raid-rebuild/SPATIAL_PLAN.md or from a number already measured on the
 * SHIPPED roster - never from what this build happened to produce. The reason
 * is written beside each one, so a later pass that wants to move a band has to
 * argue with the reason and not just with the number.
 *
 * The owner's complaint was "Raid just feels like loads of walls". That is a
 * claim about geometry, so the falsifier is geometric: the metrics come from
 * scripts/qa/raid2-layout-metrics.ts, which rasterises the AUTHORITATIVE
 * COLLIDERS - what a player bumps into and what a bullet stops on - onto a
 * 0.5 m grid and casts 16 rays at the 1.70 m standing eye from every accessible
 * cell. Presentation dressing cannot flatter any number here.
 *
 * Where a band is a floor set just under a shipped arena's measurement, that is
 * deliberate: it makes the gate fail a REGRESSION rather than pin a lucky
 * build.
 */

const arena = buildRaid2(new THREE.Scene());
const metrics = measureLayout('raid2', arena);

describe('raid2 layout fidelity — the reference proportions', () => {
  it('1. keeps the bounds the reference study derived (100 x 76 m)', () => {
    // SPATIAL_PLAN 2.1: the reference's playable bounding box measures 1.311:1
    // and its corrected long axis lands in 102-110 m. 100 x 76 is aspect 1.316
    // (0.4% error) at the conservative bottom of that band. The owner never said
    // Raid was the wrong size; he said it was walls.
    expect(RAID2_BOUNDS.maxX - RAID2_BOUNDS.minX).toBe(100);
    expect(RAID2_BOUNDS.maxZ - RAID2_BOUNDS.minZ).toBe(76);
  });

  it('2. fills its box like the reference does (0.58 - 0.72)', () => {
    // The reference's playable region measured 62.4% of its bounding box.
    // +/- 0.07 is the flood fill's cell quantisation, not slack.
    expect(metrics.fillFraction).toBeGreaterThanOrEqual(0.58);
    expect(metrics.fillFraction).toBeLessThanOrEqual(0.72);
  });
});

describe('raid2 layout fidelity — the openness the complaint was about', () => {
  it('3. sees further than Nuke Town does on a map 71% larger', () => {
    // Nuke Town (atomic-acres) measures a 13.84 m mean open line on 4440 m2.
    // Raid is 7600 m2 and measured 9.97 m: the LARGEST playable arena in the
    // game with the SHORTEST sightlines of any real combat arena in it. That
    // inversion is the defect. The floor sits just under Nuke Town's own
    // number so this fails a regression rather than pinning a lucky build.
    expect(metrics.meanOpenM).toBeGreaterThanOrEqual(13.0);
  });

  it('4. holds a real median down its own long axis (>= 24 m)', () => {
    // Nuke Town measures 26.55 m over a 74 m axis, i.e. 36% of it. 24 m over a
    // 100 m axis is 24% - deliberately BELOW Nuke Town's ratio, because Raid's
    // house band genuinely does interrupt its own long axis and pretending
    // otherwise would be authoring a different map. Shipped Raid: 17.10 m.
    expect(metrics.longAxisMedianM).toBeGreaterThanOrEqual(24.0);
  });

  it('5. has exactly one long lane, not none and not a field (0.12 - 0.45)', () => {
    // The reference has ONE lane that holds a 45 m line. Below 0.12 that lane
    // does not exist (shipped Raid measures 0.106, which is why its headline
    // promise of a ~48 m pool lane was not true); above 0.45 the map is a field
    // (skyline-terminal measures 0.889).
    expect(metrics.longLaneCellFraction).toBeGreaterThanOrEqual(0.12);
    expect(metrics.longLaneCellFraction).toBeLessThanOrEqual(0.45);
  });

  it('6. leaves almost nowhere with no shot from it (<= 0.04)', () => {
    // A cell whose longest line dies inside 12 m is a place a player cannot
    // fight from. Shipped Raid measures 0.036; the rebuild may not get worse.
    expect(metrics.pocketFraction).toBeLessThanOrEqual(0.04);
  });

  it('7. is a mansion, not an airport and not a suburb (roofed <= 0.24)', () => {
    // Shipped Raid 0.367, Nuke Town 0.130, skyline-terminal 0.308. A mansion
    // earns more roof than a suburb and less than an airport. Over a third of
    // the shipped map's accessible ground being under a roof is how a plan of
    // three big rooms became a warren of covered walks.
    expect(metrics.roofedFraction).toBeLessThanOrEqual(0.24);
  });
});

describe('raid2 layout fidelity — consolidation, not subtraction', () => {
  it('8. spends its wall on few big masses, like Nuke Town (<= 34)', () => {
    // THE CENTRAL CLAIM OF THE REBUILD. Nuke Town builds its map from 33
    // eye-blocking masses; the shipped Raid uses 59 on a map only 1.7x the
    // size. A player does not experience "wall area", he experiences the number
    // of separate things that end a sightline. The rebuild may not exceed Nuke
    // Town's count even though it carries three lanes and four upper rooms.
    expect(metrics.eyeClusterCount).toBeLessThanOrEqual(34);
  });

  it('9. and those masses are architecture, not partitions (>= 15 m2 mean)', () => {
    // The complement of the count, so the gate cannot be satisfied by merging
    // two fragments and splitting a building. Shipped Raid 11.0 m2, Nuke Town
    // 17.2 m2.
    expect(metrics.meanEyeClusterM2).toBeGreaterThanOrEqual(15.0);
  });

  it('10. did NOT buy its openness by deleting cover (<= 17 m2 per 100 m2)', () => {
    // The falsifier for the lazy fix. Nuke Town carries 16.8 m2 of blocking
    // footprint per 100 m2 of floor, the shipped Raid 13.0 and the Firing Range
    // 28.8 - so Raid was never a quantity problem, and a rebuild that opened up
    // by removing cover would be a worse map that passed every band above.
    // This is the band that stops that.
    expect(metrics.wallM2Per100M2Accessible).toBeLessThanOrEqual(17.0);
  });

  it('11. is still full of things to fight behind (>= 24 mountable pieces)', () => {
    // The same proof from the other side: cover a player can vault or shoot
    // over is what makes a big open map playable rather than a killing field.
    expect(metrics.mountableCount).toBeGreaterThanOrEqual(24);
  });

  it('12. keeps the reference’s four upper rooms (>= 500 m2 of first floor)', () => {
    // Four upper rooms are the reference's identity. The shipped map has
    // 2241 m2 of first floor, which is MORE building than the reference has, so
    // the band is a floor that keeps the rooms without pinning the excess.
    expect(metrics.upperFloorM2).toBeGreaterThanOrEqual(500);
  });
});

describe('raid2 layout fidelity — the rules the shipped map learned the hard way', () => {
  it('13. authors no ground cover in the 0.9 - 1.8 m dead band', () => {
    // A piece in that band hides a crouched player from nobody (the crouch eye
    // sits at 1.16 m) and cannot be mounted (the measured jump apex is 0.82 m).
    //
    // Two things are deliberately NOT offenders, and the test proves rather
    // than assumes it:
    //
    //  - The balcony rails. A 1.05 m rail on a +3.40 m floor is a different
    //    object from a 1.05 m block on the ground, which is why the filter is
    //    on colliders footed at grade.
    //  - Stair treads. A stair passes through the band by definition - risers
    //    3 and 4 of a 9-riser run to +3.40 m top out at 1.13 m and 1.51 m - and
    //    a tread is a surface you WALK UP, not cover you hide behind, so it is
    //    not in the class this rule governs. `stairRun` sinks every riser to
    //    y = -0.2 while all authored cover is footed at y = 0, so the two are
    //    mechanically distinguishable and the assertion below names every
    //    survivor: if anything that is NOT a stair tread ever appears in the
    //    band, this fails with its coordinates.
    const inBand = (arena.colliders as unknown as ReadonlyArray<Record<string, number>>).filter((box) => {
      const top = box.maxY ?? 0;
      const foot = box.minY ?? 0;
      return foot < 0.5 && top > 0.9 && top < 1.8;
    });
    const isStairTread = (box: Record<string, number>): boolean => {
      const sunk = Math.abs((box.minY ?? 0) + 0.2) < 1e-6;
      const runDepth = Math.min((box.maxX ?? 0) - (box.minX ?? 0), (box.maxZ ?? 0) - (box.minZ ?? 0));
      return sunk && Math.abs(runDepth - STAIR_TREAD_M) < 1e-6;
    };
    const offenders = inBand.filter((box) => !isStairTread(box));
    expect(offenders.map((box) => `x[${box.minX},${box.maxX}] z[${box.minZ},${box.maxZ}] top=${box.maxY}`))
      .toEqual([]);
    // And the stairs really are the only things in there: four runs, two mid
    // risers each. A build that quietly added a fifth stair would change this.
    expect(inBand.length).toBe(8);
  });

  it('14. every stair is walked, never jumped (riser under the 0.42 m autostep)', () => {
    // BOTS DO NOT CLIMB, and this arena authors no vertical navigation. A stair
    // whose riser exceeds the autostep is a staircase only a player can use,
    // which is how the shipped Raid ended up with power positions no bot ever
    // contested.
    expect(3.4 / STAIR_RISERS).toBeLessThan(0.42);
    expect(STAIR_RUN).toBeCloseTo(4.05, 5);
    expect(STEP).toBeLessThan(0.42);
  });
});

describe('raid2 spawns', () => {
  const report = measureSpawnLayout('raid2', arena);

  it('15. passes the shipped spawn-quality gate outright', () => {
    // Same gate, same thresholds, no arena-specific relaxation.
    expect(report.failures).toEqual([]);
    expect(report.points.filter((point) => point.failures.length > 0)).toEqual([]);
  });

  it('16. is an x mirror, because the reference’s anchors are', () => {
    // SPATIAL_PLAN: the two flanks differ in KIND - a pool terrace and a motor
    // drive - so a 180-degree rotation would demand they be equal, which they
    // are not. Every team-0 point must have a team-1 partner within 2 m of its
    // x mirror. The shipped Raid could NOT satisfy this: HF-402 had to move
    // team 1 out of its own garage because no bot could reach it.
    for (const point of report.points.filter((entry) => entry.team === 0)) {
      const partner = report.points
        .filter((entry) => entry.team === 1)
        .find((entry) => Math.hypot(entry.x - -point.x, entry.z - point.z) <= 2);
      expect(partner, `team-0 (${point.x}, ${point.z}) has no x-mirror partner`).toBeDefined();
    }
  });

  it('17. keeps the two teams a long way apart (>= 55 m)', () => {
    expect(report.summary.crossTeamMinDistanceM).toBeGreaterThanOrEqual(55);
  });

  it('18. never lets one spawn see another', () => {
    expect(report.summary.enemyLosPairs).toBe(0);
  });
});
