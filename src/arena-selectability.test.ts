import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS, SELECTABLE_ARENAS, decodeArenaId } from './map-selection';

// Farcrysis was hidden from the menu on 2026-08-28 at the owner's request, after a run of
// the real player path against the LIVE build measured it as the only arena of six that
// never reaches an active match: 279 s and then a tab crash, against 49-69 s for the rest.
//
// Hiding an arena is a PRESENTATION decision. Its stable id is the network, replay, storage
// and room-link boundary, and that must keep working - a saved match or a shared invite
// naming a hidden arena has to decode, or hiding one arena silently breaks other people's
// links. These tests pin both halves of that, because getting only the first half right
// looks identical in the menu and is a data-loss bug everywhere else.
describe('arena selectability', () => {
  it('does not offer farcrysis in the menu', () => {
    expect(SELECTABLE_ARENAS.map((entry) => entry.id)).not.toContain('farcrysis');
  });

  it('still carries farcrysis as a real arena', () => {
    // Not merely present: the full registry is what audio, spawn safety and replay read.
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toContain('farcrysis');
  });

  it('still decodes farcrysis and its legacy aliases, so old links keep working', () => {
    expect(decodeArenaId('farcrysis')).toBe('farcrysis');
    for (const alias of ['f4rcry515', 'farcry', 'f4rcry']) {
      expect(decodeArenaId(alias)).toBe('farcrysis');
    }
  });

  // MAP3 (owner 2026-09-02, HF-409). Map 3 joined farcrysis behind the menu:
  // the card launched the authored stone gallery, not the corridor showcase the
  // owner asked for, so the card is withdrawn until the showcase is the arena.
  // Its registry row, id decoding and preview media all stay, exactly as
  // farcrysis's do.
  it('still carries map3 as a real arena and still decodes its id', () => {
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toContain('map3');
    expect(decodeArenaId('map3')).toBe('map3');
    expect(SELECTABLE_ARENAS.map((entry) => entry.id)).not.toContain('map3');
  });

  it('offers every other arena, including high-seas', () => {
    const offered = SELECTABLE_ARENAS.map((entry) => entry.id);
    // The owner asked for farcrysis out and Hijacked (high-seas) kept, explicitly.
    expect(offered).toContain('high-seas');
    // The hidden set is spelled out rather than derived from `selectable`, so
    // that hiding one more arena is a deliberate edit to this line and never a
    // side effect that the assertion re-derives and waves through.
    const hidden = new Set(['farcrysis', 'map3']);
    expect(offered).toEqual(
      ARENA_SELECTIONS.filter((entry) => !hidden.has(entry.id)).map((entry) => entry.id),
    );
  });

  it('keeps the menu list a strict subset of the registry, in registry order', () => {
    // Guards the filter against ever reordering or inventing an entry.
    const registryOrder = ARENA_SELECTIONS.map((entry) => entry.id);
    const offered = SELECTABLE_ARENAS.map((entry) => entry.id);
    expect(offered).toEqual(registryOrder.filter((id) => offered.includes(id)));
    expect(offered.length).toBeLessThan(registryOrder.length);
  });

  // owner 2026-08-30: Test1/Test2 arenas added — both ship selectable.
  it('offers the Test1 and Test2 arenas in the menu', () => {
    const offered = SELECTABLE_ARENAS.map((entry) => entry.id);
    expect(offered).toContain('test1');
    expect(offered).toContain('test2');
  });

  it('leaves the first offered arena as the default the menu preselects', () => {
    // pass64-shell marks index 0 selected and reads ARENA_SELECTIONS[0] for the canvas
    // label and solo button, so the two lists must agree on the default or the menu
    // preselects one arena and the launch button names another.
    expect(SELECTABLE_ARENAS[0]?.id).toBe(ARENA_SELECTIONS[0]?.id);
  });
});
