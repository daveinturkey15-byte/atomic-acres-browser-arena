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
  SELECTABLE_ARENAS,
} from './map-selection';

describe('opening arena selection', () => {
  // owner 2026-08-30: Test1/Test2 arenas added. owner 2026-09-02 (HF-405):
  // Map 3 registered as a PREVIEW arena. The count is deliberately not in the
  // title any more - the same reason pass74-arena-boot-smoke.spec.ts stopped
  // writing "all six arenas" down: a title that names a number goes stale
  // silently, and the roster below is the assertion that matters.
  it('publishes a unique, fully described map for every registered arena', () => {
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toEqual([
      'atomic-acres',
      'skyline-terminal',
      'rustworks-1v1',
      'gun-range',
      'farcrysis',
      'high-seas',
      'test1',
      'test2',
      'map3',
    ]);
    // HF-405: Map 3 registered as a PREVIEW arena (2026-09-02); Test1/Test2 carry their owner names.
    expect(ARENA_SELECTIONS.map((entry) => entry.displayName)).toEqual(['Nuke Town', 'Terminal', 'RustRig', 'Gun Range', 'Farcrysis', 'High Seas', 'Firing Range', 'Raid', 'Map 3']);
    expect(new Set(ARENA_SELECTIONS.map((entry) => entry.displayName)).size).toBe(9);
    expect(ARENA_SELECTIONS.length).toBe(9);
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
    // owner 2026-08-31: renamed to Firing Range and Raid. The STABLE IDS ARE
    // UNCHANGED on purpose - they are the network, storage and replay boundary,
    // so a rename must never move them. That is what this pairing pins.
    for (const [id, label, name] of [
      ['test1', 'FIRING RANGE', 'Firing Range'],
      ['test2', 'RAID', 'Raid'],
    ] as const) {
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

  /**
   * Owner 2026-08-31 asked to be able to see, per map, whether it is authored
   * art or generated code. That answer is only useful if it stays true, so it
   * is pinned against the thing it describes: the ONE arena that streams a
   * mesh file is the one flagged 'import'.
   */
  it('states truthfully, per map, whether the arena is imported art or generated code', () => {
    const byId = Object.fromEntries(ARENA_SELECTIONS.map((entry) => [entry.id, entry.authoring]));
    expect(byId).toEqual({
      'atomic-acres': 'import',
      'skyline-terminal': 'code',
      'rustworks-1v1': 'code',
      'gun-range': 'code',
      farcrysis: 'code',
      'high-seas': 'code',
      test1: 'code',
      test2: 'code',
      map3: 'code',
    });
    // Exactly one imported arena today; a second one appearing without this
    // gate being revisited is the drift worth catching.
    expect(ARENA_SELECTIONS.filter((entry) => entry.authoring === 'import')).toHaveLength(1);
    // The owner's own wording, 2026-08-31: "imported assets" for Nuke Town and
    // "all code build, no asset import" for everything else.
    expect(arenaSelection('atomic-acres').authoringNote).toBe('IMPORTED ASSETS');
    for (const entry of ARENA_SELECTIONS.filter((candidate) => candidate.authoring === 'code')) {
      expect(entry.authoringNote, `${entry.id} is code-built`).toBe('ALL CODE BUILD, NO ASSET IMPORT');
    }
    // The note and the flag must never disagree - a card that says one thing while
    // the registry says another is worse than no card at all.
    for (const entry of ARENA_SELECTIONS) {
      const claimsImport = entry.authoringNote.includes('IMPORTED');
      expect(claimsImport, `${entry.id} note must match its authoring flag`).toBe(entry.authoring === 'import');
    }
  });

  it('labels an unfinished arena as a prototype on its own card', () => {
    expect(arenaSelection('farcrysis').prototype).toBe(true);
    // Every arena the owner considers finished must NOT carry the badge.
    for (const entry of ARENA_SELECTIONS.filter((candidate) => candidate.id !== 'farcrysis')) {
      expect(entry.prototype ?? false, `${entry.id} is not a prototype`).toBe(false);
    }
  });

  it('binds hosted round clocks and canvas labels to the selected arena', () => {
    // HF-359: includes farcrysis round clock and canvas label
    // owner 2026-08-30: Test1/Test2 arenas added.
    expect(ARENA_SELECTIONS.map((selection) => hostedArenaDurationMs(selection)))
      .toEqual([300_000, 300_000, 300_000, 120_000, 300_000, 300_000, 300_000, 300_000, 300_000]);
    expect(ARENA_SELECTIONS.map((selection) => arenaCanvasLabel(selection))).toEqual([
      'Nuke Town multiplayer arena',
      'Terminal multiplayer arena',
      'RustRig multiplayer arena',
      'Gun Range multiplayer arena',
      'Farcrysis multiplayer arena',
      'High Seas multiplayer arena',
      'Firing Range multiplayer arena',
      'Raid multiplayer arena',
      'Map 3 multiplayer arena',
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
      // MAP3 (HF-405): field support is OFF while the arena is a solo preview.
      // Support rewards are hosted-authoritative and this arena has had no
      // two-client lane run against it.
      'map3': false,
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
      // MAP3 (HF-405).
      '2 BOTS SKIRMISH',
    ]);
  });

  // MAP3 (owner 2026-09-02, HF-405 then HF-409). Map 3 shipped selectable and
  // SOLO on 2026-09-02 15:14 and was withdrawn from the menu at 16:25 the same
  // day: the card launched the authored stone gallery rather than the corridor
  // showcase, and the owner read that as the showcase having been destroyed.
  // The row, the labels and the id boundary all stay - only the card is gone,
  // and it comes back the moment the arena IS the showcase.
  it('keeps Map 3 a real solo-preview arena while its card is withdrawn', () => {
    const map3 = arenaSelection('map3');
    expect(map3.id).toBe('map3');
    expect(map3.selectable).toBe(false);
    expect(SELECTABLE_ARENAS.map((entry) => entry.id)).not.toContain('map3');
    // Still registered: audio, spawn safety, replay and the compatibility
    // decoder all read the FULL registry, and a saved match or a shared link
    // naming map3 has to keep resolving.
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toContain('map3');
    expect(map3.multiplayer).toBe(false);
    expect(map3.fieldSupport).toBe(false);
    expect(map3.overdrive).toBe(false);
    // The card has to SAY preview, or "solo only" is a surprise at the lobby.
    expect(map3.selectorLabel).toContain('PREVIEW');
    expect(map3.rulesLabel).toContain('SOLO PREVIEW');
    // Stable id is the network/storage boundary from the first commit.
    expect(decodeArenaId('map3')).toBe('map3');
    expect(isArenaId('map3')).toBe(true);
    expect(ARENA_IDS).toContain('map3');
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
