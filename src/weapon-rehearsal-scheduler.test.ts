import { describe, expect, it } from 'vitest';
import {
  arenaPickupWeaponIds,
  createWeaponRehearsalPlan,
  createWeaponRehearsalState,
  decideWeaponSwitchRehearsal,
  markWeaponRehearsed,
  nextDeferredWeaponRehearsalSlice,
} from './weapon-rehearsal-scheduler';
import { WEAPON_IDS } from './protocol';

const plan = createWeaponRehearsalPlan({
  allWeaponIds: WEAPON_IDS,
  loadout: { primary: 'smg', sidearm: 'magnum' },
  pickupWeaponIds: ['flare-gun', 'crimson-flamethrower'],
});

describe('weapon rehearsal scheduler', () => {
  it('derives the admission set from the loadout and arena pickups', () => {
    expect(plan.admissionWeaponIds).toEqual(['smg', 'magnum', 'flare-gun', 'crimson-flamethrower']);
    expect(plan.deferredWeaponIds).toEqual(WEAPON_IDS.filter((id) => !plan.admissionWeaponIds.includes(id)));
  });

  it('projects arena pickups from the live arena authorities', () => {
    expect(arenaPickupWeaponIds({ id: 'skyline-terminal', fieldSupport: true })).toEqual([
      'crimson-flamethrower', 'flare-gun',
    ]);
    expect(arenaPickupWeaponIds({ id: 'farcrysis', fieldSupport: false })).toEqual([]);
    expect(arenaPickupWeaponIds({ id: 'gun-range', fieldSupport: true })).toEqual(WEAPON_IDS);
  });

  it('keeps deferred work in canonical order and advances one frame-sized slice', () => {
    let state = createWeaponRehearsalState(plan);
    expect(nextDeferredWeaponRehearsalSlice(state, 'pre-match-countdown')).toEqual(['carbine']);
    state = markWeaponRehearsed(state, ['carbine']);
    expect(nextDeferredWeaponRehearsalSlice(state, 'respawn', 2)).toEqual(['lmg', 'scattergun']);
  });

  it('gates deferred slices out of combat and recognizes every safe window', () => {
    const state = createWeaponRehearsalState(plan);
    expect(nextDeferredWeaponRehearsalSlice(state, 'combat')).toEqual([]);
    for (const window of ['menu', 'pre-match-countdown', 'admission-settle', 'respawn'] as const) {
      expect(nextDeferredWeaponRehearsalSlice(state, window)).toHaveLength(1);
    }
  });

  it('requires a synchronous fallback before an unrehearsed combat switch', () => {
    const state = createWeaponRehearsalState(plan);
    expect(decideWeaponSwitchRehearsal(state, 'lmg', 'combat')).toEqual({
      weaponId: 'lmg', rehearsal: 'synchronous-before-switch',
    });
    expect(decideWeaponSwitchRehearsal(markWeaponRehearsed(state, ['lmg']), 'lmg', 'combat'))
      .toEqual({ weaponId: 'lmg', rehearsal: 'none' });
  });

  it('never rehearses an ID twice', () => {
    let state = createWeaponRehearsalState(plan);
    state = markWeaponRehearsed(state, ['smg', 'smg', 'magnum']);
    state = markWeaponRehearsed(state, ['smg', 'magnum']);
    expect(state.rehearsedWeaponIds).toEqual(['smg', 'magnum']);
    expect(nextDeferredWeaponRehearsalSlice(state, 'admission-settle')).toEqual(['carbine']);
  });
});
