/**
 * REGRESSION GATE — a support blast centred on a combatant must damage it,
 * even when that combatant is ALSO a world solid.
 *
 * Owner playtest 2026-08-30: "carpet bomber no damage, drone/chopper buggy" in
 * the Gun Range.
 *
 * Root cause (HF-403): training dummies are the only combatants in the game
 * that are simultaneously world solids, and legacy-main publishes a dummy's
 * aim point at its own collider's exact centre — feet + 1.05 m, inside a
 * 0.72 x 2.10 x 0.72 m box. The support line-of-sight predicate was a plain
 * segment/box sweep, so EVERY query to a dummy terminated 0.36 m deep inside
 * the dummy's own solid and reported "blocked". Nothing in the range could be
 * hurt by anything that asks for line of sight first.
 *
 * Why it shipped: no gate ever put a support source and a solid combatant in
 * the same arena. Every LOS test used a hand-built world where the target was
 * a point in empty air, which is the one arrangement that cannot reproduce it.
 *
 * This gate refuses to name a support source by hand. It enumerates them from
 * the killstreak catalog, so a new streak is covered as OFFENSIVE by default
 * and has to be argued out of coverage rather than into it.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange } from './additional-maps';
import { segmentIntersectsBox, sphereIntersectsBox, type Box2 } from './collision';
import {
  GUN_RANGE_TEST_BAY_CONTRACT,
  gunRangeTestBayDummyPose,
} from './gun-range-test-bay';
import { gunRangeTestBayDummyColliders } from './test-bay-dummy-colliders';
import {
  PASS65_KILLSTREAK_CATALOG,
  parseKillstreakLoadout,
  type Pass65KillstreakId,
} from './killstreak-catalog';
import {
  HostKillstreakRuntime,
  type KillstreakTarget,
  type KillstreakWorld,
  type SupportVec3,
} from './killstreak-runtime';
import {
  resolveSupportAircraftEnvelopeStep,
} from './support-aircraft-collision';
import { SupportPlacementGroundSampler } from './support-placement-ground';

const MAIN_SOURCE = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

/** Both numbers are pinned against legacy-main by `ships the endpoint-aware predicate`. */
const LOS_PADDING_M = 0.02;
const LOS_INTERIOR_MARGIN_M = 0.05;

/**
 * Killstreaks that never deliver damage, and therefore have nothing to pin
 * here. Everything else in the catalog is treated as OFFENSIVE — a new streak
 * lands in the covered set automatically, which is the direction that fails
 * safe. Each exclusion states the mechanism, not just the name.
 */
const NON_OFFENSIVE_SUPPORT_REASONS: Readonly<Record<string, string>> = Object.freeze({
  'scout-sweep': 'recon pulse; reveals positions and applies no damage',
  adrenaline: 'self-buff on the activating actor; no world effect at all',
  'care-package': 'crate delivery; the reward inside is what may be offensive',
  'crimson-flamethrower': 'care-package WEAPON grant, not a support strike',
});

const OFFENSIVE_SUPPORT_IDS: readonly Pass65KillstreakId[] = Object.freeze(
  PASS65_KILLSTREAK_CATALOG.definitions
    .map((definition) => definition.id)
    .filter((id) => !(id in NON_OFFENSIVE_SUPPORT_REASONS)),
);

/**
 * How each offensive source positions the point it asks line of sight FROM,
 * relative to the combatant it is centred on. Ground-impact sources sit on the
 * floor collider and lift the query by 0.08 m so the floor cannot self-occlude
 * (damageAround does exactly this for carpet-bomber and chopper); airborne
 * sources query from where they actually are.
 *
 * Every entry is expressed against the dummy's own published aim point, which
 * is the arrangement the defect lived in.
 */
const BLAST_ORIGIN_CONVENTIONS: Readonly<Record<string, (aimPoint: SupportVec3) => SupportVec3>> = Object.freeze({
  // Bomb detonates on the floor under the target; +0.08 m LOS lift.
  'carpet-bomber': (aim) => [aim[0], 0.08, aim[2]],
  // Missile/gun splash burst on the struck surface; same +0.08 m lift.
  chopper: (aim) => [aim[0], 0.08, aim[2]],
  // Tri-pass strikes the marked ground point.
  'tri-pass': (aim) => [aim[0], 0.08, aim[2]],
  // A hunter drone dives onto its assigned target and detonates on contact.
  'hunter-swarm': (aim) => [aim[0], aim[1] + 0.4, aim[2]],
  // The nuke detonates overhead; centred on the target, like every other row
  // here, because "centred on a combatant" is the invariant being pinned.
  nuke: (aim) => [aim[0], aim[1] + 0.45, aim[2]],
  // Drone guns fire from their own hover altitude down onto the target.
  yardhawk: (aim) => [aim[0] - 6, aim[1] + 5, aim[2]],
  'piloted-drone': (aim) => [aim[0] - 6, aim[1] + 5, aim[2]],
  'drone-swarm': (aim) => [aim[0] - 6, aim[1] + 5, aim[2]],
});

/**
 * Sources whose damage the HostKillstreakRuntime resolves end to end, so the
 * whole path (activation, flight, impact, damage receipt) can be driven here.
 * The rest resolve inside legacy-main, which no test can import; the
 * structural pin at the bottom of this file covers those.
 */
const RUNTIME_RESOLVED_SUPPORT_IDS: readonly Pass65KillstreakId[] = Object.freeze([
  'carpet-bomber',
  'chopper',
  'piloted-drone',
  'drone-swarm',
]);

/** Frozen so a pose change cannot make this suite drift with wall-clock time. */
const DUMMY_POSE_AT_MS = 4_000;

const map = buildGunRange(new THREE.Scene());
const dummyIds: readonly string[] = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((definition) => definition.id);
const dummySolids = gunRangeTestBayDummyColliders(dummyIds, DUMMY_POSE_AT_MS).map((entry) => entry.bounds);
const solids: readonly Box2[] = Object.freeze([...map.colliders, ...dummySolids]);

/**
 * Exactly how legacy-main publishes a dummy: the arena root sits at its feet
 * and `trainingDummySupportPoint` lifts the aim point 1.05 m, which is also
 * the vertical centre of the 0..2.10 m collider derived from that same pose.
 */
const dummyTargets: readonly KillstreakTarget[] = Object.freeze(
  GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((definition): KillstreakTarget => {
    const pose = gunRangeTestBayDummyPose(definition, DUMMY_POSE_AT_MS);
    return {
      id: definition.id,
      kind: 'bot',
      team: 1,
      lifeId: 1,
      alive: true,
      position: [pose.position.x, pose.position.y + 1.05, pose.position.z],
    };
  }),
);

/** The shipped predicate, mirrored; the source pin below keeps it honest. */
function enclosesPoint(box: Box2, point: { x: number; y: number; z: number }): boolean {
  const margin = LOS_INTERIOR_MARGIN_M;
  const minY = (box.minY ?? 0) + margin;
  const maxY = (box.maxY ?? 8) - margin;
  if (box.maxX - box.minX <= margin * 2 || box.maxZ - box.minZ <= margin * 2 || maxY <= minY) return false;
  return sphereIntersectsBox(point, 1e-4, {
    minX: box.minX + margin,
    maxX: box.maxX - margin,
    minY,
    maxY,
    minZ: box.minZ + margin,
    maxZ: box.maxZ - margin,
    rotation: box.rotation,
  });
}

/** The predicate that shipped BEFORE HF-403 — the defect, kept executable. */
function naiveLineOfSight(from: SupportVec3, to: SupportVec3): boolean {
  const start = { x: from[0], y: from[1], z: from[2] };
  const end = { x: to[0], y: to[1], z: to[2] };
  return !solids.some((box) => segmentIntersectsBox(start, end, box, LOS_PADDING_M));
}

function shippedLineOfSight(from: SupportVec3, to: SupportVec3): boolean {
  const start = { x: from[0], y: from[1], z: from[2] };
  const end = { x: to[0], y: to[1], z: to[2] };
  return !solids.some((box) => segmentIntersectsBox(start, end, box, LOS_PADDING_M)
    && !enclosesPoint(box, start)
    && !enclosesPoint(box, end));
}

describe('offensive support enumeration', () => {
  it('covers every catalog streak that is not argued out with a mechanism', () => {
    // 8 offensive of 12 catalog entries today. A thirteenth streak joins the
    // covered set by default; excluding it requires writing why.
    expect(OFFENSIVE_SUPPORT_IDS.length).toBe(8);
    expect([...OFFENSIVE_SUPPORT_IDS].sort()).toEqual([
      'carpet-bomber', 'chopper', 'drone-swarm', 'hunter-swarm',
      'nuke', 'piloted-drone', 'tri-pass', 'yardhawk',
    ]);
    for (const id of Object.keys(NON_OFFENSIVE_SUPPORT_REASONS)) {
      expect(PASS65_KILLSTREAK_CATALOG.definitions.some((entry) => entry.id === id), id).toBe(true);
    }
    // Every offensive source must declare where it queries line of sight from.
    for (const id of OFFENSIVE_SUPPORT_IDS) {
      expect(BLAST_ORIGIN_CONVENTIONS[id], `${id} has no blast-origin convention`).toBeDefined();
    }
  });
});

describe('a solid combatant never occludes itself from a support blast', () => {
  it('puts the target aim point inside the target own solid, as shipped', () => {
    // Not incidental: this containment IS the defect's precondition, so it is
    // pinned rather than assumed. 0.36 m of horizontal penetration and 1.05 m
    // of vertical, measured from the HF-318 collider half-extents.
    for (const target of dummyTargets) {
      const own = dummySolids.find((box) => (
        target.position[0] > box.minX && target.position[0] < box.maxX
        && target.position[2] > box.minZ && target.position[2] < box.maxZ
      ));
      expect(own, `${target.id} has no collider containing its own aim point`).toBeDefined();
      const point = { x: target.position[0], y: target.position[1], z: target.position[2] };
      expect(enclosesPoint(own!, point), target.id).toBe(true);
      expect(point.x - own!.minX).toBeCloseTo(0.36, 6);
      expect(point.y - (own!.minY ?? 0)).toBeCloseTo(1.05, 6);
    }
  });

  it.each(OFFENSIVE_SUPPORT_IDS)('lets %s reach every dummy it is centred on', (id) => {
    const origin = BLAST_ORIGIN_CONVENTIONS[id];
    for (const target of dummyTargets) {
      const from = origin(target.position);
      expect(
        shippedLineOfSight(from, target.position),
        `${id} -> ${target.id} reported blocked by the target own solid`,
      ).toBe(true);
      // The same query under the pre-HF-403 predicate. If this ever reports
      // "clear", the defect is no longer reproducible here and this whole
      // suite has stopped testing what it claims to.
      expect(
        naiveLineOfSight(from, target.position),
        `${id} -> ${target.id} is no longer a reproduction of the defect`,
      ).toBe(false);
    }
  });

  it('still lets a real wall block two points that are both outside it', () => {
    // The discount is for CONTAINMENT only. Widening it into "endpoints near a
    // solid see through it" would turn the range into an aquarium.
    const wall = map.colliders
      .filter((box) => (box.maxY ?? 0) > 2 && box.maxX - box.minX < 4 && box.maxZ - box.minZ > 6)[0];
    expect(wall, 'gun range has no thin tall wall to test with').toBeDefined();
    const midZ = (wall.minZ + wall.maxZ) / 2;
    const midY = ((wall.minY ?? 0) + (wall.maxY ?? 8)) / 2;
    const left: SupportVec3 = [wall.minX - 3, midY, midZ];
    const right: SupportVec3 = [wall.maxX + 3, midY, midZ];
    expect(shippedLineOfSight(left, right)).toBe(false);
    expect(naiveLineOfSight(left, right)).toBe(false);
  });

  it('does not discount a solid an endpoint is merely standing on', () => {
    // Zero penetration depth is not containment: a roof still blocks line of
    // sight for whoever is standing on top of it.
    const roof = solids.find((box) => (box.minY ?? 0) > 5 && box.maxX - box.minX > 8);
    expect(roof, 'gun range has no raised roof to test with').toBeDefined();
    const onTop: SupportVec3 = [(roof!.minX + roof!.maxX) / 2, roof!.maxY ?? 8, (roof!.minZ + roof!.maxZ) / 2];
    const below: SupportVec3 = [onTop[0], (roof!.minY ?? 0) - 1, onTop[2]];
    expect(shippedLineOfSight(onTop, below)).toBe(false);
    expect(naiveLineOfSight(onTop, below)).toBe(false);
  });
});

function gunRangeWorld(hasLineOfSight: NonNullable<KillstreakWorld['hasLineOfSight']>): KillstreakWorld {
  const flightBounds = Object.freeze({
    minX: map.bounds.minX,
    maxX: map.bounds.maxX,
    minZ: map.bounds.minZ,
    maxZ: map.bounds.maxZ,
    floorY: 0,
    ceilingY: 18,
  });
  const ground = new SupportPlacementGroundSampler({
    bounds: map.bounds,
    ceilingY: flightBounds.ceilingY,
    colliders: solids,
    prepareRaycastMeshes: () => [],
  });
  return {
    bounds: flightBounds,
    targets: [
      { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [53, 1.7, 30] },
      ...dummyTargets,
    ],
    groundHeightAt: (x, z) => ground.heightAt(x, z),
    hasLineOfSight,
    supportStrikeBoundsAt: () => GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds,
    resolveFlightEnvelopePosition: (from, desired, envelope) => resolveSupportAircraftEnvelopeStep({
      bounds: flightBounds,
      solids,
      from,
      desired,
      envelope,
    }).position,
  };
}

/** Runs one support to completion over the bravo lane and returns who it hurt. */
function damagedDummies(
  id: Pass65KillstreakId,
  hasLineOfSight: NonNullable<KillstreakWorld['hasLineOfSight']>,
): ReadonlySet<string> {
  const world = gunRangeWorld(hasLineOfSight);
  const runtime = new HostKillstreakRuntime(70);
  runtime.registerActor('owner', 0, 1, parseKillstreakLoadout({
    schemaVersion: 1,
    slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
  }));
  expect(runtime.grantTrainingReward('owner', 1, id, {
    arenaId: 'gun-range',
    stationKind: 'secure-test-bay',
    authorityRole: 'host',
  })).toEqual({ accepted: true, reason: 'accepted' });
  expect(runtime.activate({
    by: 'owner',
    matchEpoch: 70,
    lifeId: 1,
    sequence: 1,
    slot: 1,
    activationId: `solid-combatant-${id}`,
    expectedId: id,
    // The carpet salvo weaves +/-5.2 m about the anchor line and the four
    // dummy lanes sit 10 m apart at z = -16/-6/4/14, so an anchor on z = -1
    // puts the weave troughs directly down the bravo lane.
    anchor: [52.1, 0, -1],
    facing: [1, 0, 0],
  }, 1_000, world)).toMatchObject({ accepted: true, activatedId: id });
  // Each source runs for its OWN authored lifetime, read from the catalog: a
  // fixed window would quietly stop testing a streak whose duration is retuned.
  const lifetimeMs = PASS65_KILLSTREAK_CATALOG.definitions.find((entry) => entry.id === id)!.durationMs;
  const damaged = new Set<string>();
  for (let elapsed = 0; elapsed <= lifetimeMs; elapsed += 50) {
    for (const event of runtime.advance(1_000 + elapsed, world).damageEvents) damaged.add(event.targetId);
  }
  return damaged;
}

describe('runtime-resolved support damages a dummy that is also a solid', () => {
  it.each(RUNTIME_RESOLVED_SUPPORT_IDS)('%s hurts at least one dummy in the range', (id) => {
    const hit = [...damagedDummies(id, shippedLineOfSight)].filter((who) => dummyIds.includes(who));
    expect(hit.length, `${id} damaged no dummy in the Gun Range`).toBeGreaterThan(0);
  });

  /**
   * The owner-visible defect, end to end. Measured 2026-08-30 over each
   * source's full authored lifetime in the Gun Range:
   *
   *   carpet-bomber ... 0 dummies damaged (was: 4 with the shipped predicate)
   *   piloted-drone ... 0
   *   drone-swarm ..... 0
   *   chopper ......... 3, unchanged
   *
   * The chopper's AI cannon survives because `segmentBoxHitTime` discards a
   * hit whose entry parameter is >= 0.99 of the segment. From orbit the dummy
   * is ~45 m away and its 0.72 m box is entered inside that last 1%, so the
   * bare sweep never saw it. Self-occlusion is a CLOSE-RANGE defect: it bites
   * exactly when the blast is centred on the target, which is why the owner
   * saw it on the carpet bomber and the drones and not on the orbiting gun.
   *
   * A source moving OUT of the dark set means it found a second damage path
   * that never asks for line of sight, and that path needs its own pin.
   */
  it('goes dark on the close-range sources under the pre-HF-403 predicate', () => {
    const darkened = RUNTIME_RESOLVED_SUPPORT_IDS.filter((id) => (
      [...damagedDummies(id, naiveLineOfSight)].filter((who) => dummyIds.includes(who)).length === 0
    ));
    expect([...darkened].sort()).toEqual(['carpet-bomber', 'drone-swarm', 'piloted-drone']);
  });
});

describe('legacy-main support line-of-sight authority', () => {
  it('ships the endpoint-aware predicate the mirror above reproduces', () => {
    expect(MAIN_SOURCE).toContain(`const KILLSTREAK_LINE_OF_SIGHT_PADDING_M = ${LOS_PADDING_M};`);
    expect(MAIN_SOURCE).toContain(`const KILLSTREAK_LINE_OF_SIGHT_INTERIOR_MARGIN_M = ${LOS_INTERIOR_MARGIN_M};`);
    expect(MAIN_SOURCE).toContain('return !solids.some((box) => segmentIntersectsBox(start, end, box, KILLSTREAK_LINE_OF_SIGHT_PADDING_M)\n'
      + '    && !killstreakSolidEnclosesPoint(box, start)\n'
      + '    && !killstreakSolidEnclosesPoint(box, end));');
  });

  /**
   * COVERAGE RATCHET. HF-403 repaired the shared predicate, and every consumer
   * that calls `killstreakLineOfSight` inherited the repair. Two support
   * damage paths never called it: they open-code a bare `segmentIntersectsBox`
   * against `activeWorldColliders()`, so for THEM a training dummy still
   * occludes itself and the owner-reported symptom is still live.
   *
   * Owner date 2026-08-30. This is a ratchet, not an exemption: the set below
   * is pinned EXACTLY. Fixing a site fails this test until its entry is
   * deleted, and adding a new bare-predicate reach test fails it immediately.
   * Neither direction can happen silently again.
   */
  it('pins the exact set of support reach tests still on the bare predicate', () => {
    const openCoded = [...MAIN_SOURCE.matchAll(
      /activeWorldColliders\(\)\.some\(\(box\) => segmentIntersectsBox\((?<from>[A-Za-z0-9_.]+), (?<to>[A-Za-z0-9_.]+), box\)\)/g,
    )].map((match) => `${match.groups!.from} -> ${match.groups!.to}`);

    // Only the reach tests whose TARGET is a published training-dummy aim
    // point can hit the self-occlusion defect; a dummy is the only combatant
    // that is also a solid. `targetPoint` is that variable in both sites.
    const dummyReach = openCoded.filter((signature) => signature.endsWith('-> targetPoint'));
    expect(dummyReach).toEqual([
      // detonateHunterDrone: the hunter-swarm blast's dummy loop.
      'point -> targetPoint',
      // supportBlast: the tri-pass blast's dummy loop (hunter-swarm reaches it
      // too, at maximumDamage 0, for presentation only).
      'point -> targetPoint',
    ]);
    // Both are one edit each: swap the bare sweep for
    //   killstreakLineOfSight(activeWorldColliders(), point.toArray(), targetPoint.toArray())
    // exactly as the carpet/chopper/drone consumers already do.
    expect(dummyReach.length, 'a NEW support reach test bypasses killstreakLineOfSight').toBe(2);
  });
});
