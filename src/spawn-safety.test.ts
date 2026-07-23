import { describe, expect, it } from 'vitest';
import { scoreSpawnCandidates, type SpawnMode } from './spawn-safety';
import type { ArenaId } from './map-selection';

const arenas: ArenaId[] = ['atomic-acres', 'rustworks-1v1', 'gun-range', 'skyline-terminal'];
const modes: SpawnMode[] = ['solo', 'tdm', 'ffa'];

describe('mode-aware deterministic spawn safety', () => {
  it.each(arenas.flatMap((arenaId) => modes.map((mode) => ({ arenaId, mode }))))('$arenaId $mode selects a clear deterministic candidate', ({ arenaId, mode }) => {
    const context = {
      arenaId,
      mode,
      population: mode === 'solo' ? 5 : 6,
      candidates: [
        { index: 0, point: { x: 0, y: 0, z: 0 } },
        { index: 1, point: { x: 20, y: 0, z: 0 } },
        { index: 2, point: { x: -20, y: 0, z: 0 } },
      ],
      threats: [{ x: 4, y: 0, z: 0 }],
      occupants: [{ x: 19, y: 0, z: 0 }],
      recentDeaths: [{ x: 0, y: 0, z: 0 }],
      colliders: [{ minX: 8, maxX: 12, minZ: -2, maxZ: 2, minY: -1, maxY: 3 }],
      previousIndex: 0,
    } as const;
    const first = scoreSpawnCandidates(context);
    expect(scoreSpawnCandidates(context)).toEqual(first);
    expect(first.index).toBe(1);
    expect(first.reason).toContain(`mode:${mode}`);
  });

  it('penalizes repeated traps and immediate enemy line of sight before raw distance', () => {
    const result = scoreSpawnCandidates({
      arenaId: 'atomic-acres', mode: 'tdm', population: 4,
      candidates: [{ index: 4, point: { x: 0, y: 0, z: 0 } }, { index: 5, point: { x: 12, y: 0, z: 0 } }],
      threats: [{ x: -10, y: 0, z: 0 }], occupants: [], recentDeaths: [{ x: 0, y: 0, z: 0 }],
      colliders: [{ minX: 4, maxX: 6, minZ: -2, maxZ: 2 }], previousIndex: 4,
    });
    expect(result.index).toBe(5);
    expect(result.reason).toContain('no-immediate-los');
    expect(result.reason).toContain('repeat-avoided');
  });

  it('rejects empty or non-finite candidate sets', () => {
    const base = { arenaId: 'rustworks-1v1' as const, mode: 'ffa' as const, population: 2, threats: [], occupants: [], recentDeaths: [], colliders: [], previousIndex: -1 };
    expect(() => scoreSpawnCandidates({ ...base, candidates: [] })).toThrow('No spawn candidates');
    expect(() => scoreSpawnCandidates({ ...base, candidates: [{ index: 0, point: { x: Number.NaN, y: 0, z: 0 } }] })).toThrow('No finite spawn candidates');
  });
});