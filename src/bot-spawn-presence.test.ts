import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARENA_SELECTIONS, activeSoloBotTarget, type ArenaId } from './map-selection';
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

const BOT_ARENAS = ARENA_SELECTIONS.filter((selection) => arenaFieldsBots(selection.id) && selection.soloBotCount > 0);

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
      population: 2,
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
      expect(activeSoloBotTarget(selection, 0)).toBe(selection.soloBotCount);
      expect(selection.soloBotCount).toBeGreaterThan(0);
      expect(selection.maximumSoloBots).toBeGreaterThanOrEqual(selection.soloBotCount);
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
});
