import { describe, expect, it } from 'vitest';
import {
  arenaPickupWeaponIds,
  createDeferredWeaponRehearsalScheduler,
  createWeaponRehearsalPlan,
  createWeaponRehearsalState,
  decideWeaponSwitchRehearsal,
  markWeaponRehearsed,
  nextDeferredWeaponRehearsalSlice,
} from './weapon-rehearsal-scheduler';
import { WEAPON_IDS } from './protocol';
import type { WeaponRehearsalState, WeaponRehearsalWindow } from './weapon-rehearsal-scheduler';

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

/**
 * REGRESSION COVER for the defect `pass74-arena-boot-smoke` caught on
 * atomic-acres and nuketown2: the deferred scheduler used to run the
 * forced-submission admission state walk inside a live match and threw
 * "Forced WebGPU submission requires an idle completion frontier" 38 times.
 * The scheduler now only ever calls `prepare`, so the surface that could
 * force a submission is not reachable from a gameplay frame at all - which
 * is asserted here by the shape of the input it accepts.
 */
describe('deferred weapon rehearsal scheduler', () => {
  const harness = (window: WeaponRehearsalWindow) => {
    let state: WeaponRehearsalState | null = createWeaponRehearsalState(plan);
    const prepared: string[] = [];
    const errors: unknown[] = [];
    let resolvePrepare: (() => void) | null = null;
    const schedule = createDeferredWeaponRehearsalScheduler({
      readState: () => state,
      writeState: (next) => { state = next; },
      isPreparing: () => false,
      prepare: (weaponId) => {
        prepared.push(weaponId);
        return new Promise<void>((resolve) => { resolvePrepare = resolve; });
      },
      report: (error) => { errors.push(error); },
    });
    return {
      prepared, errors,
      tick: () => schedule(window),
      settle: async () => { resolvePrepare?.(); resolvePrepare = null; await Promise.resolve(); await Promise.resolve(); },
      rehearsed: () => state?.rehearsedWeaponIds ?? null,
    };
  };

  it('walks the deferred set one weapon per safe frame and records each one', async () => {
    const run = harness('respawn');
    run.tick();
    expect(run.prepared).toEqual([plan.deferredWeaponIds[0]]);
    // A second frame while the first slice is in flight must not start another.
    run.tick();
    expect(run.prepared).toEqual([plan.deferredWeaponIds[0]]);
    await run.settle();
    expect(run.rehearsed()).toEqual([plan.deferredWeaponIds[0]]);
    run.tick();
    expect(run.prepared).toEqual([plan.deferredWeaponIds[0], plan.deferredWeaponIds[1]]);
    expect(run.errors).toEqual([]);
  });

  it('does nothing at all during combat', () => {
    const run = harness('combat');
    run.tick();
    run.tick();
    expect(run.prepared).toEqual([]);
  });
});
