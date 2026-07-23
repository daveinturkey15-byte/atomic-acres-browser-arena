import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS, activeSoloBotTarget, arenaSelection } from './map-selection';

describe('opening arena selection', () => {
  it('publishes four unique, fully described maps', () => {
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toEqual([
      'atomic-acres',
      'rustworks-1v1',
      'gun-range',
      'skyline-terminal',
    ]);
    expect(new Set(ARENA_SELECTIONS.map((entry) => entry.displayName)).size).toBe(4);
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

  it('defines one-bot solo Rustworks, gun range and 4th Skyline Terminal with private multiplayer hosting', () => {
    expect(arenaSelection('rustworks-1v1')).toMatchObject({
      soloBotCount: 1,
      maximumSoloBots: 1,
      multiplayer: true,
      matchRules: { durationMs: 300_000, scoreLimit: null },
      rulesLabel: '5 MIN · HOST UP TO 6 · 1 BOT SOLO',
    });
    expect(arenaSelection('gun-range')).toMatchObject({
      soloBotCount: 0,
      maximumSoloBots: 0,
      multiplayer: true,
      matchRules: { durationMs: 120_000, scoreLimit: null },
      rulesLabel: '2 MIN · 6P FFA · NO BOTS',
    });
    expect(arenaSelection('skyline-terminal')).toMatchObject({
      id: 'skyline-terminal',
      selectorLabel: 'SKYLINE TERMINAL',
      displayName: 'Skyline Terminal',
      multiplayer: true,
      fieldSupport: false,
      overdrive: false,
      matchRules: { durationMs: 300_000, scoreLimit: null },
    });
  });

  it('bounds Atomic fifth-death reinforcements and never reinforces sibling modes', () => {
    const atomic = arenaSelection('atomic-acres');
    expect([0, 4, 5, 10, 15, 20, 25, 100].map((deaths) => activeSoloBotTarget(atomic, deaths)))
      .toEqual([2, 2, 3, 4, 5, 6, 6, 6]);
    expect(activeSoloBotTarget(arenaSelection('rustworks-1v1'), 100)).toBe(1);
    expect(activeSoloBotTarget(arenaSelection('gun-range'), 100)).toBe(0);
    expect(activeSoloBotTarget(arenaSelection('skyline-terminal'), 100)).toBe(6);
  });

  it('falls back safely to Atomic Acres', () => {
    expect(arenaSelection('unknown').id).toBe('atomic-acres');
    expect(arenaSelection(null).id).toBe('atomic-acres');
  });
});
