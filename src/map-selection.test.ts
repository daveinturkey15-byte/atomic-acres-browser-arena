import { describe, expect, it } from 'vitest';
import {
  ARENA_SELECTIONS,
  activeSoloBotTarget,
  arenaCanvasLabel,
  arenaSelection,
  decodeArenaId,
  hostedArenaDurationMs,
  soloLaunchLabel,
} from './map-selection';

describe('opening arena selection', () => {
  it('publishes four unique, fully described maps', () => {
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toEqual([
      'atomic-acres',
      'skyline-terminal',
      'rustworks-1v1',
      'gun-range',
    ]);
    expect(ARENA_SELECTIONS.map((entry) => entry.displayName)).toEqual(['Nuke Town', 'Terminal', 'RustRig', 'Gun Range']);
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
    expect(atomic.soloBotCount).toBe(1);
    expect(atomic.maximumSoloBots).toBe(6);
    expect(atomic.rulesLabel).toBe('5 MIN · 1 BOT · +1 / 10 DEFEATS · MAX 6');
  });

  it('defines one-bot solo combat maps and a bot-free gun range without changing hosted support', () => {
    expect(arenaSelection('rustworks-1v1')).toMatchObject({
      soloBotCount: 1,
      maximumSoloBots: 1,
      multiplayer: true,
      fieldSupport: true,
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
      selectorLabel: 'TERMINAL',
      displayName: 'Terminal',
      multiplayer: true,
      fieldSupport: true,
      overdrive: false,
      soloBotCount: 1,
      rulesLabel: '5 MIN · HOST UP TO 6 · 1 BOT SOLO',
      matchRules: { durationMs: 300_000, scoreLimit: null },
    });
  });

  it('binds hosted round clocks and canvas labels to the selected arena', () => {
    expect(ARENA_SELECTIONS.map((selection) => hostedArenaDurationMs(selection)))
      .toEqual([300_000, 300_000, 300_000, 120_000]);
    expect(ARENA_SELECTIONS.map((selection) => arenaCanvasLabel(selection))).toEqual([
      'Nuke Town multiplayer arena',
      'Terminal multiplayer arena',
      'RustRig multiplayer arena',
      'Gun Range multiplayer arena',
    ]);
  });

  it('enables support presentation in every arena, including Gun Range training stations', () => {
    expect(Object.fromEntries(ARENA_SELECTIONS.map((entry) => [entry.id, entry.fieldSupport]))).toEqual({
      'atomic-acres': true,
      'skyline-terminal': true,
      'rustworks-1v1': true,
      'gun-range': true,
    });
  });

  it('bounds Atomic ten-defeat reinforcements and never reinforces sibling modes', () => {
    const atomic = arenaSelection('atomic-acres');
    expect([0, 9, 10, 19, 20, 29, 30, 39, 40, 100].map((deaths) => activeSoloBotTarget(atomic, deaths)))
      .toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 6]);
    expect(activeSoloBotTarget(arenaSelection('rustworks-1v1'), 100)).toBe(1);
    expect(activeSoloBotTarget(arenaSelection('gun-range'), 100)).toBe(0);
    expect(activeSoloBotTarget(arenaSelection('skyline-terminal'), 100)).toBe(1);
  });

  it('derives the solo launch label from the canonical arena catalog', () => {
    expect(ARENA_SELECTIONS.map(soloLaunchLabel)).toEqual([
      '1 BOT SKIRMISH',
      '1 BOT SKIRMISH',
      '1 BOT SKIRMISH',
      'START RANGE',
    ]);
  });

  it('decodes current route labels and preserves stable URL/storage/protocol ids', () => {
    expect(decodeArenaId('nuke-town')).toBe('atomic-acres');
    expect(decodeArenaId('terminal')).toBe('skyline-terminal');
    expect(decodeArenaId('rustrig')).toBe('rustworks-1v1');
    expect(decodeArenaId('atomic-acres')).toBe('atomic-acres');
    expect(decodeArenaId('skyline-terminal')).toBe('skyline-terminal');
    expect(decodeArenaId('rustworks-1v1')).toBe('rustworks-1v1');
  });

  it('falls back safely to Nuke Town', () => {
    expect(arenaSelection('unknown').id).toBe('atomic-acres');
    expect(arenaSelection(null).id).toBe('atomic-acres');
  });
});
