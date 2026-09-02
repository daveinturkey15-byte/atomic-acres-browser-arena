import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS, SELECTABLE_ARENAS, decodeArenaId } from './map-selection';

// Farcrysis was hidden from the menu on 2026-08-28 at the owner's request, after a run of
// the real player path against the LIVE build measured it as the only arena of six that
// never reaches an active match: 279 s and then a tab crash, against 49-69 s for the rest.
// It was un-hidden on 2026-09-02 (HF-423) as a PREVIEW card, once the load path was fixed
// (Lane C, PASS 84: every fenced submission completes and the transition commits) and the
// registration trail behind a selectable arena was actually walked.
//
// Hiding an arena is a PRESENTATION decision. Its stable id is the network, replay, storage
// and room-link boundary, and that must keep working - a saved match or a shared invite
// naming a hidden arena has to decode, or hiding one arena silently breaks other people's
// links. These tests pin both halves of that, because getting only the first half right
// looks identical in the menu and is a data-loss bug everywhere else. The decode half is
// unchanged by the un-hide, and is asserted below exactly as it was while it was hidden.
describe('arena selectability', () => {
  it('offers farcrysis in the menu as a PREVIEW card', () => {
    const offered = SELECTABLE_ARENAS.find((entry) => entry.id === 'farcrysis');
    expect(offered, 'farcrysis must be selectable (HF-423)').toBeDefined();
    // PREVIEW, not a full ship: `prototype: true` is what drives the card's
    // preview treatment, and it goes out solo-only until it has been played.
    expect(offered?.prototype).toBe(true);
    expect(offered?.multiplayer).toBe(false);
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

  it('offers every arena in the registry, including high-seas and farcrysis', () => {
    const offered = SELECTABLE_ARENAS.map((entry) => entry.id);
    // The owner asked for Hijacked (high-seas) kept, explicitly.
    expect(offered).toContain('high-seas');
    // Nothing is hidden any more, so the menu list IS the registry. This is the
    // stronger form of the previous assertion, which subtracted farcrysis.
    expect(offered).toEqual(ARENA_SELECTIONS.map((entry) => entry.id));
  });

  it('keeps the menu list a subset of the registry, in registry order, with nothing invented', () => {
    // Guards the filter against ever reordering or inventing an entry.
    const registryOrder = ARENA_SELECTIONS.map((entry) => entry.id);
    const offered = SELECTABLE_ARENAS.map((entry) => entry.id);
    expect(offered).toEqual(registryOrder.filter((id) => offered.includes(id)));
    expect(offered.length).toBeLessThanOrEqual(registryOrder.length);
    // `toBeLessThan` stood here while farcrysis was hidden - it asserted that
    // SOMETHING was hidden, which stopped being true at HF-423 and was never
    // the property worth holding. Replaced by the exact rule the filter
    // implements, recomputed here independently, which is strictly stronger:
    // it catches a wrong entry being dropped, not merely a count changing.
    expect(offered).toEqual(
      ARENA_SELECTIONS.filter((entry) => entry.selectable !== false).map((entry) => entry.id),
    );
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
