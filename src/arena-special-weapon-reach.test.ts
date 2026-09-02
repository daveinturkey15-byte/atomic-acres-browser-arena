import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS } from './map-selection';
import { TIMED_MAP_WEAPON_DEFINITIONS, TIMED_MAP_WEAPON_IDS } from './timed-map-weapon-authority';
import {
  arenaCanAcquireFlamethrower,
  arenaCanAcquireFlareGun,
  arenaCanActivateFieldSupport,
  arenaOwnsTimedMapWeapon,
} from './arena-special-weapon-reach';

/**
 * PASS 85 lane H. These predicates decide whether an arena entry rehearses the
 * flare gun's and the flamethrower's first-shot presentation — 2560.6 ms and
 * 415.4 ms of SERIALIZED prewarm respectively, measured over 56 in-session map
 * switches on the shipped PASS 84 build. Getting one wrong in the permissive
 * direction costs load time; getting one wrong in the restrictive direction
 * would mean an arena that CAN spawn the weapon skipping its rehearsal, so
 * every route onto a map is asserted against the authority that owns it.
 */
describe('arena special-weapon reach', () => {
  const selection = (id: string) => {
    const found = ARENA_SELECTIONS.find((entry) => entry.id === id);
    if (!found) throw new Error(`no arena selection for ${id}`);
    return found;
  };

  it('follows the timed-map-weapon table rather than a written-down arena list', () => {
    // Derived from the definitions, so moving a spawn moves the prewarm with it.
    for (const weaponId of TIMED_MAP_WEAPON_IDS) {
      const owner = TIMED_MAP_WEAPON_DEFINITIONS[weaponId].arenaId;
      for (const arena of ARENA_SELECTIONS) {
        expect(arenaOwnsTimedMapWeapon(arena, weaponId)).toBe(arena.id === owner);
      }
    }
  });

  it('rehearses the flare gun only where the flare gun can spawn', () => {
    const owner = TIMED_MAP_WEAPON_DEFINITIONS['flare-gun'].arenaId;
    const reachable = ARENA_SELECTIONS.filter((arena) => arenaCanAcquireFlareGun(arena)).map((arena) => arena.id);
    expect(reachable).toEqual([owner]);
    // The saving is the point: every other arena skips a 2.5 s serialized step.
    expect(ARENA_SELECTIONS.length - reachable.length).toBeGreaterThanOrEqual(7);
  });

  it('keeps the flamethrower rehearsal wherever a care package could grant it', () => {
    const owner = TIMED_MAP_WEAPON_DEFINITIONS.flamethrower.arenaId;
    for (const arena of ARENA_SELECTIONS) {
      const expected = arena.id === owner || arenaCanActivateFieldSupport(arena);
      expect(arenaCanAcquireFlamethrower(arena), arena.id).toBe(expected);
    }
    // rustworks owns the map spawn; the crimson flamethrower reaches every
    // field-support arena, so this must NOT collapse to a single arena.
    expect(ARENA_SELECTIONS.filter((arena) => arenaCanAcquireFlamethrower(arena)).length)
      .toBeGreaterThan(1);
  });

  it('matches the field-support predicate the activation path itself applies', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    // If this literal ever changes in legacy-main, the prewarm gate has to
    // change with it, and this is the line that says so.
    expect(source).toContain("if ((!selectedArena.fieldSupport && selectedArena.id !== 'gun-range')");
    for (const arena of ARENA_SELECTIONS) {
      expect(arenaCanActivateFieldSupport(arena), arena.id)
        .toBe(arena.fieldSupport || arena.id === 'gun-range');
    }
    expect(arenaCanActivateFieldSupport(selection('gun-range'))).toBe(true);
    expect(arenaCanActivateFieldSupport(selection('map3'))).toBe(false);
  });

  it('is what the arena prewarm actually calls, and no arena id is written into that gate', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const arenaPrewarm = source.slice(
      source.indexOf('async function prewarmArenaBoundGameplayPresentations('),
      source.indexOf('function bootstrapMenuPreview('),
    );
    expect(arenaPrewarm).not.toHaveLength(0);
    expect(arenaPrewarm).toContain('!arenaCanAcquireFlareGun(selectedArena) ? Promise.resolve() :');
    expect(arenaPrewarm).toContain('!arenaCanAcquireFlamethrower(selectedArena) ? Promise.resolve() :');
    // The whole point of the module is that the gate names no arena.
    expect(arenaPrewarm.match(/selectedArena\.id === '/gu) ?? []).toHaveLength(0);
    // And the admitted vocabulary is untouched: the match-bound rehearsal is
    // still unconditional, which is what keeps in-combat compiles at zero.
    const matchBound = source.slice(
      source.indexOf('async function prewarmMatchBoundFirstShotPresentations('),
      source.indexOf('function disposeCorpsePresentation('),
    );
    expect(matchBound).toContain("weaponView.prewarmBrowserWeaponFirePresentation('flare-gun',");
    expect(matchBound).toContain("weaponView.prewarmBrowserWeaponFirePresentation('flamethrower',");
    expect(matchBound).not.toContain('arenaCanAcquire');
  });
});
