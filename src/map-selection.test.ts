import { describe, expect, it } from 'vitest';
import {
  ARENA_IDS,
  ARENA_SELECTIONS,
  activeSoloBotTarget,
  arenaCanvasLabel,
  arenaSelection,
  decodeArenaId,
  hostedArenaDurationMs,
  initialSoloBotCount,
  isArenaId,
  soloLaunchLabel,
  SELECTABLE_ARENAS,
} from './map-selection';

describe('opening arena selection', () => {
  // HF-495 (owner, 2026-09-04): Nuke Town Rebuild is first and Raid Rebuild is
  // second; the full catalog below keeps every other arena in relative order.
  // owner 2026-08-30: Test1/Test2 arenas added. owner 2026-09-02 (HF-405):
  // Map 3 registered as a PREVIEW arena. The count is deliberately not in the
  // title any more - the same reason pass74-arena-boot-smoke.spec.ts stopped
  // writing "all six arenas" down: a title that names a number goes stale
  // silently, and the roster below is the assertion that matters.
  it('publishes a unique, fully described map for every registered arena', () => {
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toEqual([
      'nuketown2',
      'raid2',
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
    // HF-407: Nuke Town Rebuild added. Its display name must NOT collide with
    // 'Nuke Town'; HF-495 now puts the rebuild first while keeping the names
    // unambiguous when both are resolved from the catalog.
    // HF-408: Raid Rebuild added, on the same rule against 'Raid'.
    expect(ARENA_SELECTIONS.map((entry) => entry.displayName)).toEqual(['Nuke Town Rebuild', 'Raid Rebuild', 'Nuke Town', 'Terminal', 'RustRig', 'Gun Range', 'Farcrysis', 'High Seas', 'Firing Range', 'Raid', 'Map 3']);
    // HF-495 (owner, 2026-09-04): selectability derives the menu order from
    // this catalog; the retired original Raid is absent without a second list.
    expect(SELECTABLE_ARENAS.map((entry) => entry.id)).toEqual([
      'nuketown2', 'raid2', 'skyline-terminal', 'rustworks-1v1', 'gun-range',
      'high-seas', 'test1', 'map3',
    ]);
    expect(new Set(ARENA_SELECTIONS.map((entry) => entry.displayName)).size).toBe(11);
    expect(ARENA_SELECTIONS.length).toBe(11);
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
    // HF-359: 2-bot solo combat map with fieldSupport disabled.
    // HF-429 (2026-09-03): PARKED at the owner's decision - `selectable: false`
    // and the PREVIEW word off the card copy. Everything else on the row is
    // unchanged, which is the point: parking is one field, not a rollback, and
    // this pin is what proves the rest of Lane R is still here.
    expect(arenaSelection('farcrysis')).toMatchObject({
      id: 'farcrysis',
      selectorLabel: 'FARCrySIS',
      displayName: 'Farcrysis',
      prototype: true,
      multiplayer: false,
      fieldSupport: false,
      overdrive: false,
      selectable: false,
      soloBotCount: 2,
      maximumSoloBots: 2,
      rulesLabel: '5 MIN · SOLO · 2 BOTS',
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
      // NUKETOWN2 (HF-407): the whole point of the rejig. The shipped Nuke Town
      // is the ONE imported arena in the game; its rebuild is code.
      nuketown2: 'code',
      raid2: 'code',
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
      // HF-408 (Lane AQ): raid2 is an eleventh entry on MATCH_DURATION_MS, like test2.
      // HF-495: catalog order is Nuke Town Rebuild, Raid Rebuild, then the
      // retained rows; the duration values remain bound to each row.
      .toEqual([300_000, 300_000, 300_000, 300_000, 300_000, 120_000, 300_000, 300_000, 300_000, 300_000, 300_000]);
    expect(ARENA_SELECTIONS.map((selection) => arenaCanvasLabel(selection))).toEqual([
      'Nuke Town Rebuild multiplayer arena',
      'Raid Rebuild multiplayer arena',
      'Nuke Town multiplayer arena',
      'Terminal multiplayer arena',
      'RustRig multiplayer arena',
      'Gun Range multiplayer arena',
      'Farcrysis multiplayer arena',
      'High Seas multiplayer arena',
      'Firing Range multiplayer arena',
      'Raid multiplayer arena',
      // MAP3: an explore arena is not a multiplayer arena.
      'Map 3 explore arena',
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
      // NUKETOWN2 (HF-407): field support is ON, unlike Map 3. The owner said
      // he will host this preview with friends, and it carries the shipped Nuke
      // Town's hosted feature set deliberately - the thing under test is the
      // LAYOUT, so nothing else may differ between the two.
      'nuketown2': true,
      // RAID2 (HF-408): field support is ON, matching test2. This is the same
      // mode on the same netcode with a different arena id, and unlike Map 3 it
      // registers `multiplayer: true` - so turning support OFF here would be
      // inconsistent with the row it actually ships.
      'raid2': true,
    });
  });

  // HF-491 (owner, 2026-09-04, after playing Solo on the Nuke Town rebuild:
  // "the bots not in there"). This assertion used to read "and never reinforces
  // sibling modes", and it was true only because `activeSoloBotTarget` tested
  // for the arena id `atomic-acres` - which HF-466 had already made
  // unselectable, so the ladder was dead code for every arena the owner could
  // pick. The ladder is now the rule for EVERY arena, bounded by that arena's
  // own declared `maximumSoloBots`. Nothing here was deleted: the arenas that
  // must not reinforce are still pinned to their exact counts below, and they
  // hold because their catalog row declares max === start, not because the
  // function knows their names.
  it('runs the ten-defeat ladder on every arena, bounded by that arena own declared maximum', () => {
    const atomic = arenaSelection('atomic-acres');
    expect([0, 9, 10, 19, 20, 29, 30, 39, 40, 100].map((deaths) => activeSoloBotTarget(atomic, deaths)))
      .toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 6]);
    // Arenas whose catalog row declares max === start cannot escalate, at any
    // score. This is the fairness/safety half of the old assertion, kept whole.
    expect(activeSoloBotTarget(arenaSelection('rustworks-1v1'), 100)).toBe(1);
    expect(activeSoloBotTarget(arenaSelection('gun-range'), 100)).toBe(0);
    expect(activeSoloBotTarget(arenaSelection('map3'), 100)).toBe(0);
    expect(activeSoloBotTarget(arenaSelection('farcrysis'), 100)).toBe(2); // HF-359
    expect(activeSoloBotTarget(arenaSelection('high-seas'), 100)).toBe(2);
    // owner 2026-08-30: Test1/Test2 arenas added.
    expect(activeSoloBotTarget(arenaSelection('test1'), 100)).toBe(2);
    expect(activeSoloBotTarget(arenaSelection('test2'), 100)).toBe(2);
    expect(activeSoloBotTarget(arenaSelection('raid2'), 100)).toBe(2);
    // Terminal declares maximumSoloBots 6 like Atomic. Under the old id test it
    // sat at one bot forever regardless of that declaration; it now honours it.
    expect([0, 9, 10, 50, 100].map((deaths) => activeSoloBotTarget(arenaSelection('skyline-terminal'), deaths)))
      .toEqual([1, 1, 2, 6, 6]);
  });

  // HF-491. nuketown2 is the arena the owner played, and the first arena to
  // declare `initialSoloBots`. Four to open (the original is a 6v6 map, and one
  // opponent on an 84 m street reads as an empty arena), then the same shared
  // ladder to its declared six.
  it('opens Nuke Town Rebuild on its declared four bots and ladders to six', () => {
    const rebuild = arenaSelection('nuketown2');
    expect(rebuild.initialSoloBots).toBe(4);
    expect(initialSoloBotCount(rebuild)).toBe(4);
    expect(activeSoloBotTarget(rebuild, 0)).toBe(4);
    expect([0, 9, 10, 19, 20, 30, 100].map((deaths) => activeSoloBotTarget(rebuild, deaths)))
      .toEqual([4, 4, 5, 5, 6, 6, 6]);
    // The card states the count the match opens with, not the Pass 66 default.
    expect(soloLaunchLabel(rebuild)).toBe('4 BOTS SKIRMISH');
    expect(rebuild.rulesLabel).toContain('4 BOTS SOLO');
  });

  // HF-491. The default is the contract, and it is still the default: an arena
  // that declares no starting count opens on Pass 66's exactly-one bot.
  it('keeps the Pass 66 one-bot start for every arena that declares no initialSoloBots', () => {
    const undeclared = ARENA_SELECTIONS.filter((entry) => entry.initialSoloBots === undefined);
    expect(undeclared.map((entry) => entry.id)).not.toContain('nuketown2');
    expect(undeclared.length).toBe(ARENA_SELECTIONS.length - 1);
    for (const entry of undeclared) {
      expect(initialSoloBotCount(entry)).toBe(entry.soloBotCount);
      expect(activeSoloBotTarget(entry, 0)).toBe(entry.soloBotCount);
    }
    expect(initialSoloBotCount(arenaSelection('skyline-terminal'))).toBe(1);
    expect(activeSoloBotTarget(arenaSelection('skyline-terminal'), 0)).toBe(1);
  });

  // HF-491. The clamp, not the caller, is what keeps a declaration honest: no
  // arena may open above, or ladder past, the population its spawn table and
  // per-bot frame budget were sized for.
  it('never lets any arena start above or escalate past its declared maximum', () => {
    for (const entry of ARENA_SELECTIONS) {
      expect(initialSoloBotCount(entry)).toBeLessThanOrEqual(entry.maximumSoloBots);
      expect(initialSoloBotCount(entry)).toBeGreaterThanOrEqual(0);
      for (const deaths of [0, 1, 9, 10, 25, 100, 10_000]) {
        const target = activeSoloBotTarget(entry, deaths);
        expect(target).toBeLessThanOrEqual(entry.maximumSoloBots);
        expect(target).toBeGreaterThanOrEqual(initialSoloBotCount(entry));
      }
      // Monotone in defeats: reinforcements arrive, they never retreat.
      expect(activeSoloBotTarget(entry, 100)).toBeGreaterThanOrEqual(activeSoloBotTarget(entry, 0));
    }
  });

  it('derives the solo launch label from the canonical arena catalog', () => {
    // HF-359: farcrysis has 2-bot solo skirmish launch label
    expect(ARENA_SELECTIONS.map(soloLaunchLabel)).toEqual([
      // HF-495: first two cards are the rebuild previews.
      '4 BOTS SKIRMISH',
      '2 BOTS SKIRMISH',
      '1 BOT SKIRMISH',
      '1 BOT SKIRMISH',
      '1 BOT SKIRMISH',
      'START RANGE',
      '2 BOTS SKIRMISH',
      '2 BOTS SKIRMISH',
      '2 BOTS SKIRMISH',
      '2 BOTS SKIRMISH',
      // MAP3 (HF-405, then HF-409): Map 3 fields no bots at all and is not a
      // firing range - it explores. "START RANGE" was the right words while
      // the Gun Range was the only bot-less arena and the wrong words for the
      // second one.
      'START EXPLORING',
      // The remaining rows retain their catalog order and declared bot counts.
    ]);
  });

  // MAP3 (owner 2026-09-02, HF-405 then HF-409; card restored PASS 86). Map 3
  // shipped selectable and SOLO at 15:14, was withdrawn at 16:25 the same day
  // because the card launched the authored stone gallery rather than the
  // corridor showcase, and is offered again now that the showcase IS the arena.
  // It comes back as an EXPLORE arena, which is a declared registry kind.
  it('offers Map 3 as an explore arena, with no lobby, no bots and no clock pressure', () => {
    const map3 = arenaSelection('map3');
    expect(map3.id).toBe('map3');
    expect(map3.selectable).toBe(true);
    expect(SELECTABLE_ARENAS.map((entry) => entry.id)).toContain('map3');
    // The kind is the thing every gate reads; it is not a list of ids.
    expect(map3.kind).toBe('explore');
    // ...and it is the ONLY explore arena, so a team arena silently acquiring
    // the kind (and dropping out of the team-spawn rule) fails here.
    expect(ARENA_SELECTIONS.filter((entry) => entry.kind === 'explore').map((entry) => entry.id)).toEqual(['map3']);
    expect(ARENA_SELECTIONS.filter((entry) => entry.kind === 'team').length).toBe(ARENA_SELECTIONS.length - 1);
    // Still registered: audio, spawn safety, replay and the compatibility
    // decoder all read the FULL registry, and a saved match or a shared link
    // naming map3 has to keep resolving.
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toContain('map3');
    expect(map3.multiplayer).toBe(false);
    expect(map3.fieldSupport).toBe(false);
    expect(map3.overdrive).toBe(false);
    // The card has to SAY preview, or "solo only" is a surprise at the lobby.
    expect(map3.selectorLabel).toContain('PREVIEW');
    // HF-409, owner 16:55: "it's not about combat, it's a mode you can
    // explore". The card says EXPLORE and the arena fields no bots at all -
    // not two, not one. A preview that quietly kept a bot ladder would be the
    // old claim wearing the new label.
    expect(map3.rulesLabel).toContain('EXPLORE');
    expect(map3.soloBotCount).toBe(0);
    expect(map3.maximumSoloBots).toBe(0);

    // MAP3 (HF-409 finisher 3): the card links to the standalone showcase page,
    // and the href is RELATIVE. The published game document is at
    // `channels/<pass>/index.html`, so a rooted '/map3.html' 404s on every
    // channel - which is the whole reason the page looked destroyed.
    expect(map3.showcasePath).toBe('map3.html');
    expect(map3.showcasePath?.startsWith('/')).toBe(false);
    expect(map3.showcasePath).not.toContain('://');
    // No other arena claims a second page, so a copy-paste into a team arena
    // (which has no such page built) fails here rather than shipping a 404.
    expect(ARENA_SELECTIONS.filter((entry) => entry.showcasePath).map((entry) => entry.id)).toEqual(['map3']);

    // The lede counts the corridors, and there are EIGHT since the Rapier
    // playground landed as a real lane in `MAP3_LANES`. An undercounting lede
    // is the same class of untruth as the matchbar that called this a
    // deathmatch, and is the kind of copy that silently rots as content lands.
    expect(map3.menuLede).toContain('eight corridors');
    expect(map3.menuLede).not.toContain('seven corridors');
    // An explore arena must not carry a match clock into its HUD. The registry
    // keeps `matchRules.durationMs` because the id is also the replay/storage
    // boundary and a saved match naming map3 must still decode - so the HUD
    // reads the KIND, not the clock. See `src/ui/hud-mode-banner.ts`.
    expect(map3.fieldSupport).toBe(false);
    // Stable id is the network/storage boundary from the first commit.
    expect(decodeArenaId('map3')).toBe('map3');
    expect(isArenaId('map3')).toBe(true);
    expect(ARENA_IDS).toContain('map3');
  });

  // NUKETOWN2 (owner 2026-09-02, HF-407). The rebuild ships selectable, hosted
  // and with the 2x core, because the owner asked to host it with friends and
  // asked for the 2x damage to be kept. What this pins is the pair of failures
  // that would make the A/B meaningless: the rebuild being registered but not
  // offered ("published but unselectable"), and the two Nuke Towns being
  // indistinguishable in the menu.
  it('offers the Nuke Town Rebuild as the first selectable hosted preview', () => {
    const rebuild = arenaSelection('nuketown2');
    expect(rebuild.id).toBe('nuketown2');
    expect(rebuild.selectable).toBe(true);
    expect(SELECTABLE_ARENAS.map((entry) => entry.id)).toContain('nuketown2');
    // The owner's three kept features, as far as the registry can carry them.
    expect(rebuild.multiplayer).toBe(true);
    expect(rebuild.fieldSupport).toBe(true);
    expect(rebuild.overdrive).toBe(true);
    // The card must say preview, and must not read as the shipped map.
    expect(rebuild.selectorLabel).toContain('PREVIEW');
    expect(rebuild.rulesLabel).toContain('PREVIEW');
    expect(rebuild.displayName).not.toBe(arenaSelection('atomic-acres').displayName);
    expect(rebuild.routeId).not.toBe(arenaSelection('atomic-acres').routeId);
    // The shipped Nuke Town is untouched by this lane: still there and still
    // the imported build. HF-495 changes catalog presentation, not its stable id.
    expect(arenaSelection('atomic-acres').authoring).toBe('import');
    expect(decodeArenaId('nuke-town')).toBe('atomic-acres');
    expect(decodeArenaId('nuketown')).toBe('atomic-acres');
    // Stable id is the network/storage boundary from the first commit, so the
    // promotion the owner will ask for later is one field and not a migration.
    expect(decodeArenaId('nuketown2')).toBe('nuketown2');
    expect(decodeArenaId('nuke-town-rebuild')).toBe('nuketown2');
    expect(isArenaId('nuketown2')).toBe(true);
    expect(ARENA_IDS).toContain('nuketown2');
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
    // HF-495: invalid compatibility input follows the first catalog entry,
    // which is now the first selectable card, Nuke Town Rebuild.
    expect(arenaSelection('unknown').id).toBe('nuketown2');
    expect(arenaSelection(null).id).toBe('nuketown2');
  });
});
