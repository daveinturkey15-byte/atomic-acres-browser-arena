import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARENA_SELECTIONS } from './map-selection';
import { prepareMap3 } from './map3-arena';
import { ARENA_BUILDERS } from './spawn-layout-constraints';
import { selectSpawnCandidates, stableSpawnTieBreakSeed, type SpawnCandidate, type SpawnUse } from './spawn-selection';

await prepareMap3();

const emptyContext = (candidates: readonly SpawnCandidate[]) => ({
  arenaId: 'atomic-acres' as const,
  mode: 'solo' as const,
  population: 4,
  candidates,
  threats: [],
  occupants: [],
  recentDeaths: [],
  recentUses: [],
  colliders: [],
  previousIndex: -1,
  tieBreakSeed: 7,
});

describe('shared spawn selection', () => {
  it.each(ARENA_SELECTIONS.map((selection) => [selection.id, selection] as const))(
    '%s covers at least 80% of every authored point over 200 seeded deployments',
    (arenaId, selection) => {
      const arena = ARENA_BUILDERS[arenaId](new THREE.Scene());
      const candidates: SpawnCandidate[] = [
        ...arena.spawns[0].map((point, index) => ({ index, point, side: 0 as const })),
        ...arena.spawns[1].map((point, index) => ({ index: 100 + index, point, side: 1 as const })),
      ];
      const recentUses: SpawnUse[] = [];
      const used = new Set<number>();
      for (let deployment = 0; deployment < 200; deployment += 1) {
        const nowMs = deployment * 1_000;
        while (recentUses.length > 0 && nowMs - recentUses[0]!.at > 12_000) recentUses.shift();
        const result = selectSpawnCandidates({
          ...emptyContext(candidates),
          arenaId,
          arenaKind: selection.kind,
          nowMs,
          recentUses,
          tieBreakSeed: stableSpawnTieBreakSeed(`${arenaId}:${deployment}`),
        });
        used.add(result.index);
        recentUses.push({ index: result.index, at: nowMs });
      }
      expect(used.size, `${arenaId} used ${used.size}/${candidates.length} points`).toBeGreaterThanOrEqual(Math.ceil(candidates.length * 0.8));
    },
  );

  it('avoids a recently used point while a fresh valid alternative exists', () => {
    const candidates = [0, 1, 2, 3].map((index) => ({ index, point: { x: index * 10, y: 0, z: 0 } }));
    const recentUses: SpawnUse[] = [];
    const selected: number[] = [];
    for (let nowMs = 0; nowMs < candidates.length; nowMs += 1) {
      const result = selectSpawnCandidates({ ...emptyContext(candidates), nowMs, recentUses, tieBreakSeed: nowMs });
      expect(recentUses.some((use) => use.index === result.index)).toBe(false);
      selected.push(result.index);
      recentUses.push({ index: result.index, at: nowMs });
    }
    expect(new Set(selected).size).toBe(candidates.length);
  });

  it('ranks a candidate monotonically higher when its nearest threat is farther away', () => {
    const result = selectSpawnCandidates({
      ...emptyContext([
        { index: 0, point: { x: 0, y: 0, z: 0 } },
        { index: 1, point: { x: 10, y: 0, z: 0 } },
      ]),
      threats: [{ x: 4, y: 0, z: 0 }],
    });
    const near = result.candidates.find((candidate) => candidate.index === 0)!;
    const far = result.candidates.find((candidate) => candidate.index === 1)!;
    expect(far.nearestThreatDistanceSq).toBeGreaterThan(near.nearestThreatDistanceSq);
    expect(far.score).toBeGreaterThan(near.score);
    expect(result.index).toBe(1);
  });

  it('is deterministic for a fixed candidate set, context and seed', () => {
    const context = {
      ...emptyContext([
        { index: 0, point: { x: -10, y: 0, z: 0 } },
        { index: 1, point: { x: 10, y: 0, z: 0 } },
      ]),
      tieBreakSeed: stableSpawnTieBreakSeed('fixed-actor'),
    };
    expect(selectSpawnCandidates(context)).toEqual(selectSpawnCandidates(context));
  });

  it('prefers the declared team side in TDM while retaining an opposite-side fallback', () => {
    const candidates: SpawnCandidate[] = [
      { index: 0, point: { x: -10, y: 0, z: 0 }, side: 0 },
      { index: 100, point: { x: 10, y: 0, z: 0 }, side: 1 },
    ];
    const result = selectSpawnCandidates({
      ...emptyContext(candidates),
      arenaId: 'nuketown2',
      arenaKind: 'team',
      mode: 'tdm',
      team: 1,
      preferredSide: 1,
    });
    expect(result.index).toBe(100);
    expect(result.reason).toContain('team-side-preferred');
  });
});
