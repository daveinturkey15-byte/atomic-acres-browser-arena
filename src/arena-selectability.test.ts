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
  it('parks farcrysis behind the menu without withdrawing it (HF-429)', () => {
    // PARKED 2026-09-03 at the owner's decision. Asserted through the FLAG,
    // never through an id list: the previous version of this test named
    // farcrysis as offered, and before that as hidden, and each swing needed
    // the test rewritten. The registry field is the single source; a park or an
    // un-park is one edit in src/map-selection.ts and nothing here moves.
    const row = ARENA_SELECTIONS.find((entry) => entry.id === 'farcrysis');
    expect(row, 'farcrysis must still be a registered arena').toBeDefined();
    expect(row?.selectable).toBe(false);
    expect(SELECTABLE_ARENAS.some((entry) => entry.id === 'farcrysis')).toBe(false);
    // Parked, not reverted: everything Lane R landed is still on the row, so
    // un-parking is one field and not a rebuild.
    expect(row?.prototype).toBe(true);
    expect(row?.multiplayer).toBe(false);
    expect(row?.soloBotCount).toBe(2);
    // And the card no longer advertises itself as nearly-ready.
    expect(row?.rulesLabel ?? '').not.toMatch(/PREVIEW/);
    expect(row?.selectorLabel ?? '').not.toMatch(/PREVIEW/);
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

  it('offers exactly the rows the registry flags as selectable, and hides exactly the rest', () => {
    const offered = SELECTABLE_ARENAS.map((entry) => entry.id);
    // The owner asked for Hijacked (high-seas) kept, explicitly.
    expect(offered).toContain('high-seas');
    // DERIVED on both sides. This replaces "the menu list IS the registry",
    // which was only true on the days nothing was parked and had to be
    // rewritten every time one was. Both partitions are computed from the flag,
    // so the pair holds whatever is parked.
    const flaggedOffered = ARENA_SELECTIONS.filter((entry) => entry.selectable !== false).map((entry) => entry.id);
    const flaggedHidden = ARENA_SELECTIONS.filter((entry) => entry.selectable === false).map((entry) => entry.id);
    expect(offered).toEqual(flaggedOffered);
    expect(new Set([...flaggedOffered, ...flaggedHidden]).size).toBe(ARENA_SELECTIONS.length);
    // Not vacuous: a hidden row is still a registered arena, which is the half
    // that keeps saved matches and shared invites decoding.
    for (const id of flaggedHidden) {
      expect(ARENA_SELECTIONS.map((entry) => entry.id)).toContain(id);
      expect(decodeArenaId(id)).toBe(id);
    }
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
