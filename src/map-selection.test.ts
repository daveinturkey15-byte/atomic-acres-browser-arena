import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS, activeSoloBotTarget, arenaSelection } from './map-selection';

describe('opening arena selection', () => {
  it('publishes three unique, fully described maps', () => {
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toEqual([
      'atomic-acres',
      'rustworks-1v1',
      'gun-range',
    ]);
    expect(new Set(ARENA_SELECTIONS.map((entry) => entry.displayName)).size).toBe(3);
    for (const entry of ARENA_SELECTIONS) {
      expect(entry.selectorLabel.length).toBeGreaterThan(3);
      expect(entry.summary.length).toBeGreaterThan(12);
      expect(entry.rulesLabel.length).toBeGreaterThan(8);
    }
  });

  it('keeps Atomic timed without a score cap', () => {
    const atomic = arenaSelection('atomic-acres');
    expect(atomic.matchRules).toEqual({ durationMs: 300_000, scoreLimit: null });
    expect(atomic.soloBotCount).toBe(2);
    expect(atomic.maximumSoloBots).toBe(6);
  });

  it('defines one rival for Rustworks and no rivals for the range', () => {
    expect(arenaSelection('rustworks-1v1')).toMatchObject({
      soloBotCount: 1,
      maximumSoloBots: 1,
      multiplayer: false,
    });
    expect(arenaSelection('gun-range')).toMatchObject({
      soloBotCount: 0,
      maximumSoloBots: 0,
      multiplayer: false,
      matchRules: { durationMs: null, scoreLimit: null },
    });
  });

  it('bounds Atomic fifth-death reinforcements and never reinforces sibling modes', () => {
    const atomic = arenaSelection('atomic-acres');
    expect([0, 4, 5, 10, 15, 20, 25, 100].map((deaths) => activeSoloBotTarget(atomic, deaths)))
      .toEqual([2, 2, 3, 4, 5, 6, 6, 6]);
    expect(activeSoloBotTarget(arenaSelection('rustworks-1v1'), 100)).toBe(1);
    expect(activeSoloBotTarget(arenaSelection('gun-range'), 100)).toBe(0);
  });

  it('falls back safely to Atomic Acres', () => {
    expect(arenaSelection('unknown').id).toBe('atomic-acres');
    expect(arenaSelection(null).id).toBe('atomic-acres');
  });
});
