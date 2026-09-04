import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARENA_SELECTIONS, activeSoloBotTarget, initialSoloBotCount, type ArenaId } from './map-selection';
import { prepareMap3 } from './map3-arena';
import { ARENA_BUILDERS, arenaFieldsBots } from './spawn-layout-constraints';
import { validArenaSpawnPoint } from './spawn-safety';
import { selectSpawnCandidates, spawnUseMemoryMs, stableSpawnTieBreakSeed, type SpawnCandidate, type SpawnUse } from './spawn-selection';

/**
 * THE BOT PRESENCE GATE (HF-491).
 *
 * Owner, 2026-09-04, after playing HITL 4 on nuketown2 in Solo: "the bots not
 * in there". Earlier, HF-456: "bot spawns seem to just spawn in 1 or two
 * places".
 *
 * `src/spawn-layout-quality.test.ts` already gates the spawn TABLES and passes,
 * so the tables are not the defect and this file does not re-measure them. What
 * had no gate at all is the SELECTION rule under the one condition the owner
 * actually plays in: a live player standing on the map. Every existing
 * selector assertion runs with `threats: []`, which is the only situation in
 * which the old unbounded distance reward is harmless.
 *
 * Every floor below is derived from the arena's own authored spawn set. No
 * roster, arena id or metre count is written down here, so an arena that gains
 * or loses points moves its own floor and a new arena is covered the day it is
 * registered.
 */

await prepareMap3();

const BOT_ARENAS = ARENA_SELECTIONS.filter((selection) => arenaFieldsBots(selection.id) && initialSoloBotCount(selection) > 0);

/** Deployments are spaced wider than one respawn cycle - the case the flat 12 s window could not see. */
const RESPAWN_CADENCE_MS = 20_000;
const DEPLOYMENTS = 200;

/**
 * Half the arena's own authored points. A floor, not a target: it says a single
 * opponent must not live in a corner of the table, and it moves with the table.
 */
function requiredRegions(candidateCount: number): number {
  return Math.ceil(candidateCount / 2);
}

type Simulation = Readonly<{
  candidates: readonly SpawnCandidate[];
  used: ReadonlySet<number>;
  selectedDistancesM: readonly number[];
  candidateDistancesM: readonly number[];
  playerPoint: THREE.Vector3;
}>;

function simulateBotDeployments(arenaId: ArenaId): Simulation {
  const selection = ARENA_SELECTIONS.find((entry) => entry.id === arenaId)!;
  const arena = ARENA_BUILDERS[arenaId](new THREE.Scene());
  const candidates: SpawnCandidate[] = [
    ...arena.spawns[0].map((point, index) => ({ index, point, side: 0 as const })),
    ...arena.spawns[1].map((point, index) => ({ index: 100 + index, point, side: 1 as const })),
  ];
  // The player stands on his own first authored spawn. Deterministic, and the
  // exact geometry the owner is in when the match opens.
  const playerPoint = arena.spawns[0][0]!.clone();
  // HF-491: the population the selector is told about is the population the
  // match actually opens with - the arena's own declared solo count plus the
  // player - not a hard-coded 2. `MAP_TRAP_RADIUS` widens with population, so
  // a 4-bot arena must be scored as a 4-bot arena or this sim is measuring a
  // rig that never ships.
  const population = initialSoloBotCount(selection) + 1;
  const recentUses: SpawnUse[] = [];
  const memoryMs = spawnUseMemoryMs(candidates.length);
  const depth = Math.max(0, candidates.length - 1);
  const used = new Set<number>();
  const selectedDistancesM: number[] = [];
  for (let deployment = 0; deployment < DEPLOYMENTS; deployment += 1) {
    const nowMs = deployment * RESPAWN_CADENCE_MS;
    // Same retention the runtime uses: age retires a record only once the
    // shuffle-bag depth no longer needs it.
    while (recentUses.length > depth && nowMs - recentUses[0]!.at > memoryMs) recentUses.shift();
    const result = selectSpawnCandidates({
      arenaId,
      arenaKind: selection.kind,
      mode: 'solo',
      population,
      team: 1,
      candidates,
      threats: [playerPoint],
      occupants: [playerPoint],
      recentDeaths: [],
      recentUses,
      nowMs,
      recentUseAvoidanceMs: memoryMs,
      recentUseDepth: depth,
      colliders: arena.colliders,
      previousIndex: recentUses.at(-1)?.index ?? -1,
      tieBreakSeed: stableSpawnTieBreakSeed('bot-0'),
    });
    used.add(result.index);
    recentUses.push({ index: result.index, at: nowMs });
    const chosen = candidates.find((candidate) => candidate.index === result.index)!.point;
    selectedDistancesM.push(Math.hypot(chosen.x - playerPoint.x, chosen.z - playerPoint.z));
  }
  return {
    candidates,
    used,
    selectedDistancesM,
    candidateDistancesM: candidates.map(({ point }) => Math.hypot(point.x - playerPoint.x, point.z - playerPoint.z)),
    playerPoint,
  };
}

describe('solo bot presence and spawn spread', () => {
  it.each(BOT_ARENAS.map((selection) => [selection.id, selection] as const))(
    '%s deploys its configured solo bot count with no escalation owed at match start',
    (arenaId, selection) => {
      // The count the arena catalog promises is the count the match opens with.
      // AGENTS.md (Pass 66 routing) fixes this at exactly one enemy bot on every
      // bot-enabled arena; this asserts the catalog and the escalation function
      // agree on it rather than restating the number.
      // HF-491 (owner, 2026-09-04): the opening count is the arena's declared
      // start clamped by its declared maximum, not the Pass 66 default - an
      // arena may now declare `initialSoloBots` (nuketown2 declares 4). Every
      // arena that declares nothing still opens on Pass 66's exactly one bot,
      // which `initialSoloBotCount` returns unchanged.
      expect(activeSoloBotTarget(selection, 0)).toBe(initialSoloBotCount(selection));
      expect(initialSoloBotCount(selection)).toBeGreaterThan(0);
      expect(selection.maximumSoloBots).toBeGreaterThanOrEqual(initialSoloBotCount(selection));
      // A deployable count is worthless if the table it draws from is empty.
      const arena = ARENA_BUILDERS[arenaId](new THREE.Scene());
      expect(arena.spawns[0].length + arena.spawns[1].length).toBeGreaterThan(0);
    },
  );

  it.each(BOT_ARENAS.map((selection) => [selection.id] as const))(
    '%s: no authored spawn point intersects a collider',
    (arenaId) => {
      const arena = ARENA_BUILDERS[arenaId](new THREE.Scene());
      const invalid = [...arena.spawns[0], ...arena.spawns[1]]
        .filter((point) => !validArenaSpawnPoint(point, arena.bounds, arena.colliders))
        .map((point) => [Number(point.x.toFixed(2)), Number(point.z.toFixed(2))]);
      expect(invalid, `${arenaId} authored spawns inside geometry or out of bounds`).toEqual([]);
    },
  );

  it.each(BOT_ARENAS.map((selection) => [selection.id] as const))(
    '%s: a solo bot facing a live player covers at least half of its own authored points',
    (arenaId) => {
      const { used, candidates } = simulateBotDeployments(arenaId);
      const required = requiredRegions(candidates.length);
      expect(
        used.size,
        `${arenaId} used ${used.size}/${candidates.length} authored points over ${DEPLOYMENTS} deployments at ${RESPAWN_CADENCE_MS} ms cadence`,
      ).toBeGreaterThanOrEqual(required);
    },
  );

  it.each(BOT_ARENAS.map((selection) => [selection.id] as const))(
    '%s: a solo bot is not parked at the far extreme of the map',
    (arenaId) => {
      // The owner's report is spatial, so the assertion is spatial: the single
      // opponent must not sit, on median, in the most distant quarter of the
      // points its own arena authors. Derived from this arena's distance
      // distribution, so a small map and a 128 m map are both covered.
      const { selectedDistancesM, candidateDistancesM } = simulateBotDeployments(arenaId);
      const sortedCandidates = [...candidateDistancesM].sort((left, right) => left - right);
      const farQuartile = sortedCandidates[Math.floor(sortedCandidates.length * 0.75)]!;
      const sortedSelected = [...selectedDistancesM].sort((left, right) => left - right);
      const medianSelected = sortedSelected[Math.floor(sortedSelected.length / 2)]!;
      expect(
        medianSelected,
        `${arenaId} median bot spawn ${medianSelected.toFixed(1)} m from the player; the arena's far quartile starts at ${farQuartile.toFixed(1)} m`,
      ).toBeLessThan(farQuartile);
    },
  );

  // HF-491 (owner, 2026-09-04). Raising an arena's opening count is only honest
  // if the arena can actually seat that many at once. This deploys the whole
  // opening squad in one match-open pass - each bot placed with the previous
  // ones already standing as occupants and already recorded as recent uses,
  // exactly as `spawnBots` does - and requires every one of them to land on a
  // distinct, collider-free authored point. It runs on the escalated maximum
  // too, so nuketown2 is covered at four AND at the six its ladder reaches.
  it.each(
    BOT_ARENAS.flatMap((selection) => [
      [selection.id, 'opening', initialSoloBotCount(selection)] as const,
      [selection.id, 'fully escalated', activeSoloBotTarget(selection, 10_000)] as const,
    ]),
  )('%s: seats its %s solo squad (%i) on distinct authored points', (arenaId, _phase, squad) => {
    const selection = ARENA_SELECTIONS.find((entry) => entry.id === arenaId)!;
    const arena = ARENA_BUILDERS[arenaId](new THREE.Scene());
    const candidates: SpawnCandidate[] = [
      ...arena.spawns[0].map((point, index) => ({ index, point, side: 0 as const })),
      ...arena.spawns[1].map((point, index) => ({ index: 100 + index, point, side: 1 as const })),
    ];
    const playerPoint = arena.spawns[0][0]!.clone();
    const memoryMs = spawnUseMemoryMs(candidates.length);
    const depth = Math.max(0, candidates.length - 1);
    const recentUses: SpawnUse[] = [];
    const occupants: SpawnCandidate['point'][] = [playerPoint];
    const chosen = new Set<number>();
    for (let index = 0; index < squad; index += 1) {
      const result = selectSpawnCandidates({
        arenaId,
        arenaKind: selection.kind,
        mode: 'solo',
        population: squad + 1,
        team: 1,
        candidates,
        threats: [playerPoint],
        occupants,
        recentDeaths: [],
        recentUses,
        nowMs: 0,
        recentUseAvoidanceMs: memoryMs,
        recentUseDepth: depth,
        colliders: arena.colliders,
        previousIndex: recentUses.at(-1)?.index ?? -1,
        tieBreakSeed: stableSpawnTieBreakSeed(`bot-${index}`),
      });
      const point = candidates.find((candidate) => candidate.index === result.index)!.point;
      expect(validArenaSpawnPoint(point, arena.bounds, arena.colliders), `${arenaId} bot-${index} spawned inside geometry`).toBe(true);
      chosen.add(result.index);
      recentUses.push({ index: result.index, at: 0 });
      occupants.push(point);
    }
    expect(chosen.size, `${arenaId} seated ${chosen.size} distinct points for a squad of ${squad}`).toBe(squad);
    // A squad may never be asked to seat more bodies than the arena authors.
    expect(squad).toBeLessThanOrEqual(candidates.length);
  });
});
