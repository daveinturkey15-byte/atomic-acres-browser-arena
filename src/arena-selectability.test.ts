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

  // MAP3 (owner 2026-09-02, HF-409, card restored in PASS 86). Map 3 spent one
  // day behind the menu while its card launched the authored stone gallery
  // instead of the corridor showcase the owner asked for. The showcase IS the
  // arena now, so the card is offered again - as an EXPLORE arena, which is a
  // declared registry kind and not a special case.
  it('offers map3 as an explore arena and still decodes its id', () => {
    expect(ARENA_SELECTIONS.map((entry) => entry.id)).toContain('map3');
    expect(decodeArenaId('map3')).toBe('map3');
    expect(SELECTABLE_ARENAS.map((entry) => entry.id)).toContain('map3');
    const map3 = ARENA_SELECTIONS.find((entry) => entry.id === 'map3');
    expect(map3?.kind).toBe('explore');
    expect(map3?.multiplayer).toBe(false);
    expect(map3?.maximumSoloBots).toBe(0);
  });

  it('offers every other arena, including high-seas', () => {
    const offered = SELECTABLE_ARENAS.map((entry) => entry.id);
    // The owner asked for farcrysis out and Hijacked (high-seas) kept, explicitly.
    expect(offered).toContain('high-seas');
    // The hidden set is spelled out rather than derived from `selectable`, so
    // that hiding one more arena is a deliberate edit to this line and never a
    // side effect that the assertion re-derives and waves through.
    const hidden = new Set(['farcrysis']);
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
