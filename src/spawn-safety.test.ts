import { describe, expect, it } from 'vitest';
import { FFA_MINIMUM_SPAWN_SEPARATION, initialFfaSpawnReservation, playerSpawnProtectionMs, scoreSpawnCandidates, stableSpawnTieBreakSeed, validArenaSpawnPoint, waypointEyePoint, type SpawnMode } from './spawn-safety';
import { ARENA_SELECTIONS, type ArenaId } from './map-selection';

const arenas: ArenaId[] = ARENA_SELECTIONS.map((selection) => selection.id);
const modes: SpawnMode[] = ['solo', 'tdm', 'ffa'];

describe('mode-aware deterministic spawn safety', () => {
  it('uses spatial separation instead of asymmetric FFA spawn immunity', () => {
    expect(playerSpawnProtectionMs('ffa')).toBe(0);
    expect(playerSpawnProtectionMs('tdm')).toBe(1_350);
    expect(playerSpawnProtectionMs('solo')).toBe(1_350);
  });

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
    expect(first.index).toBe(mode === 'ffa' ? 2 : 1);
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

  it('spreads FFA combatants by at least eight metres and breaks equal-score ties per player', () => {
    const base = {
      arenaId: 'skyline-terminal' as const,
      mode: 'ffa' as const,
      population: 6,
      candidates: [
        { index: 0, point: { x: 0, y: 0, z: 0 } },
        { index: 1, point: { x: 7, y: 0, z: 0 } },
        { index: 100, point: { x: 12, y: 0, z: 0 } },
        { index: 101, point: { x: -12, y: 0, z: 0 } },
      ],
      threats: [], occupants: [{ x: 0, y: 0, z: 0 }], recentDeaths: [], colliders: [], previousIndex: -1,
    };
    expect(FFA_MINIMUM_SPAWN_SEPARATION).toBe(8);
    const alpha = scoreSpawnCandidates({ ...base, tieBreakSeed: stableSpawnTieBreakSeed('alpha') });
    const bravo = scoreSpawnCandidates({ ...base, tieBreakSeed: stableSpawnTieBreakSeed('bravo') });
    expect(alpha.candidates.find((candidate) => candidate.index === 1)?.score)
      .toBeLessThan(alpha.candidates.find((candidate) => candidate.index === 100)?.score ?? 0);
    expect([100, 101]).toContain(alpha.index);
    expect([100, 101]).toContain(bravo.index);
    expect(stableSpawnTieBreakSeed('alpha')).not.toBe(stableSpawnTieBreakSeed('bravo'));
  });

  it('reserves collision-free initial FFA deployment points before peer snapshots exist', () => {
    const actors = ['charlie', 'alpha', 'bravo'];
    const candidates = [
      { index: 0, point: { x: 0, y: 0, z: 0 } },
      { index: 1, point: { x: 3, y: 0, z: 0 } },
      { index: 2, point: { x: 10, y: 0, z: 0 } },
      { index: 3, point: { x: 20, y: 0, z: 0 } },
    ];
    const reservations = actors.map((actor) => initialFfaSpawnReservation(actor, actors, candidates, 42));
    expect(new Set(reservations).size).toBe(actors.length);
    const points = reservations.map((index) => candidates.find((candidate) => candidate.index === index)!.point);
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        expect(Math.hypot(points[left].x - points[right].x, points[left].z - points[right].z))
          .toBeGreaterThanOrEqual(FFA_MINIMUM_SPAWN_SEPARATION);
      }
    }
    expect(initialFfaSpawnReservation('alpha', actors, candidates, 42))
      .toBe(initialFfaSpawnReservation('alpha', [...actors].reverse(), candidates, 42));
  });

  it('falls back when the authored spawn set cannot separate the initial roster', () => {
    expect(initialFfaSpawnReservation('alpha', ['alpha', 'bravo'], [
      { index: 0, point: { x: 0, y: 0, z: 0 } },
      { index: 1, point: { x: 2, y: 0, z: 0 } },
    ])).toBeNull();
  });

  it('rejects empty or non-finite candidate sets', () => {
    const base = { arenaId: 'rustworks-1v1' as const, mode: 'ffa' as const, population: 2, threats: [], occupants: [], recentDeaths: [], colliders: [], previousIndex: -1 };
    expect(() => scoreSpawnCandidates({ ...base, candidates: [] })).toThrow('No spawn candidates');
    expect(() => scoreSpawnCandidates({ ...base, candidates: [{ index: 0, point: { x: Number.NaN, y: 0, z: 0 } }] })).toThrow('No finite spawn candidates');
  });

  it('validates raised-deck spawns at their authored elevation', () => {
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
    const lowBulkhead = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: -1, maxY: 2 };
    const raisedBulkhead = { ...lowBulkhead, minY: 4, maxY: 7 };
    expect(validArenaSpawnPoint({ x: 0, y: 5.5, z: 0 }, bounds, [lowBulkhead])).toBe(true);
    expect(validArenaSpawnPoint({ x: 0, y: 5.5, z: 0 }, bounds, [raisedBulkhead])).toBe(false);
    expect(validArenaSpawnPoint({ x: 0, y: Number.NaN, z: 0 }, bounds, [])).toBe(false);
  });

  it('adds bot eye height to each waypoint deck elevation', () => {
    expect(waypointEyePoint({ x: 2, y: 5.5, z: -3 })).toEqual({ x: 2, y: 6.92, z: -3 });
    expect(waypointEyePoint({ x: 2, z: -3 })).toEqual({ x: 2, y: 1.42, z: -3 });
  });
});
