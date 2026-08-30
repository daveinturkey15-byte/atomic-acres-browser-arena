import { describe, expect, it } from 'vitest';
import {
  ARENA_IDS,
  ARENA_SELECTIONS,
  activeSoloBotTarget,
  arenaCanvasLabel,
  arenaSelection,
  decodeArenaId,
  hostedArenaDurationMs,
  isArenaId,
  soloLaunchLabel,
} from './map-selection';

describe('opening arena selection', () => {
  // owner 2026-08-30: Test1/Test2 arenas added — six maps became eight.
  it('publishes eight unique, fully described maps', () => {
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toEqual([
      'atomic-acres',
      'skyline-terminal',
      'rustworks-1v1',
      'gun-range',
      'farcrysis',
      'high-seas',
      'test1',
      'test2',
    ]);
    expect(ARENA_SELECTIONS.map((entry) => entry.displayName)).toEqual(['Nuke Town', 'Terminal', 'RustRig', 'Gun Range', 'Farcrysis', 'High Seas', 'Test1', 'Test2']);
    expect(new Set(ARENA_SELECTIONS.map((entry) => entry.displayName)).size).toBe(8);
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
    // HF-359: 2-bot solo combat map with fieldSupport disabled
    expect(arenaSelection('farcrysis')).toMatchObject({
      id: 'farcrysis',
      selectorLabel: 'FARCrySIS',
      displayName: 'Farcrysis',
      multiplayer: true,
      fieldSupport: false,
      overdrive: false,
      soloBotCount: 2,
      maximumSoloBots: 2,
      rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO',
      matchRules: { durationMs: 300_000, scoreLimit: null },
    });
    expect(arenaSelection('high-seas')).toMatchObject({
      id: 'high-seas',
      selectorLabel: 'HIGH SEAS',
      displayName: 'High Seas',
      multiplayer: true,
      fieldSupport: true,
      overdrive: false,
      soloBotCount: 2,
      maximumSoloBots: 2,
      rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO',
      matchRules: { durationMs: 300_000, scoreLimit: null },
    });
    // owner 2026-08-30: Test1/Test2 arenas added — both host up to 6 with 2-bot solo.
    for (const [id, label, name] of [['test1', 'TEST1', 'Test1'], ['test2', 'TEST2', 'Test2']] as const) {
      expect(arenaSelection(id)).toMatchObject({
        id,
        selectorLabel: label,
        displayName: name,
        multiplayer: true,
        fieldSupport: true,
        overdrive: false,
        soloBotCount: 2,
        maximumSoloBots: 2,
        rulesLabel: '5 MIN · HOST UP TO 6 · 2 BOTS SOLO',
        matchRules: { durationMs: 300_000, scoreLimit: null },
      });
    }
  });

  it('binds hosted round clocks and canvas labels to the selected arena', () => {
    // HF-359: includes farcrysis round clock and canvas label
    // owner 2026-08-30: Test1/Test2 arenas added.
    expect(ARENA_SELECTIONS.map((selection) => hostedArenaDurationMs(selection)))
      .toEqual([300_000, 300_000, 300_000, 120_000, 300_000, 300_000, 300_000, 300_000]);
    expect(ARENA_SELECTIONS.map((selection) => arenaCanvasLabel(selection))).toEqual([
      'Nuke Town multiplayer arena',
      'Terminal multiplayer arena',
      'RustRig multiplayer arena',
      'Gun Range multiplayer arena',
      'Farcrysis multiplayer arena',
      'High Seas multiplayer arena',
      'Test1 multiplayer arena',
      'Test2 multiplayer arena',
    ]);
  });

  it('enables support presentation in every arena, including Gun Range training stations', () => {
    // HF-359: farcrysis has fieldSupport disabled
    expect(Object.fromEntries(ARENA_SELECTIONS.map((entry) => [entry.id, entry.fieldSupport]))).toEqual({
      'atomic-acres': true,
      'skyline-terminal': true,
      'rustworks-1v1': true,
      'gun-range': true,
      'farcrysis': false,
      'high-seas': true,
      // owner 2026-08-30: Test1/Test2 arenas added.
      'test1': true,
      'test2': true,
    });
  });

  it('bounds Atomic ten-defeat reinforcements and never reinforces sibling modes', () => {
    const atomic = arenaSelection('atomic-acres');
    expect([0, 9, 10, 19, 20, 29, 30, 39, 40, 100].map((deaths) => activeSoloBotTarget(atomic, deaths)))
      .toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 6]);
    expect(activeSoloBotTarget(arenaSelection('rustworks-1v1'), 100)).toBe(1);
    expect(activeSoloBotTarget(arenaSelection('gun-range'), 100)).toBe(0);
    expect(activeSoloBotTarget(arenaSelection('skyline-terminal'), 100)).toBe(1);
    expect(activeSoloBotTarget(arenaSelection('farcrysis'), 100)).toBe(2); // HF-359
    expect(activeSoloBotTarget(arenaSelection('high-seas'), 100)).toBe(2);
    // owner 2026-08-30: Test1/Test2 arenas added.
    expect(activeSoloBotTarget(arenaSelection('test1'), 100)).toBe(2);
    expect(activeSoloBotTarget(arenaSelection('test2'), 100)).toBe(2);
  });

  it('derives the solo launch label from the canonical arena catalog', () => {
    // HF-359: farcrysis has 2-bot solo skirmish launch label
    expect(ARENA_SELECTIONS.map(soloLaunchLabel)).toEqual([
      '1 BOT SKIRMISH',
      '1 BOT SKIRMISH',
      '1 BOT SKIRMISH',
      'START RANGE',
      '2 BOTS SKIRMISH',
      '2 BOTS SKIRMISH',
      // owner 2026-08-30: Test1/Test2 arenas added.
      '2 BOTS SKIRMISH',
      '2 BOTS SKIRMISH',
    ]);
  });

  it('decodes current route labels and preserves stable URL/storage/protocol ids', () => {
    expect(decodeArenaId('nuke-town')).toBe('atomic-acres');
    expect(decodeArenaId('terminal')).toBe('skyline-terminal');
    expect(decodeArenaId('rustrig')).toBe('rustworks-1v1');
    expect(decodeArenaId('atomic-acres')).toBe('atomic-acres');
    expect(decodeArenaId('skyline-terminal')).toBe('skyline-terminal');
    expect(decodeArenaId('rustworks-1v1')).toBe('rustworks-1v1');
    // HF-359: farcrysis route id and legacy aliases
    expect(decodeArenaId('farcrysis')).toBe('farcrysis');
    expect(decodeArenaId('f4rcry515')).toBe('farcrysis');
    expect(decodeArenaId('farcry')).toBe('farcrysis');
    expect(decodeArenaId('f4rcry')).toBe('farcrysis');
    expect(decodeArenaId('high-seas')).toBe('high-seas');
    // owner 2026-08-30: Test1/Test2 arenas added — route id equals stable id.
    expect(decodeArenaId('test1')).toBe('test1');
    expect(decodeArenaId('test2')).toBe('test2');
  });

  it('distinguishes strict current IDs from compatibility routes and aliases', () => {
    expect(ARENA_SELECTIONS.map(({ id }) => id)).toEqual(ARENA_IDS);
    for (const selection of ARENA_SELECTIONS) expect(isArenaId(selection.id)).toBe(true);
    expect(isArenaId('nuke-town')).toBe(false);
    expect(isArenaId('rustrig')).toBe(false);
    expect(isArenaId('f4rcry515')).toBe(false);
    expect(isArenaId('HIGH-SEAS')).toBe(false);
    expect(isArenaId(null)).toBe(false);
  });

  it('falls back safely to Nuke Town', () => {
    expect(arenaSelection('unknown').id).toBe('atomic-acres');
    expect(arenaSelection(null).id).toBe('atomic-acres');
  });
});
