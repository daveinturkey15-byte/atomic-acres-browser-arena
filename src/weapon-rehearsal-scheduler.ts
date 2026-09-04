import { PASS65_KILLSTREAK_SOURCES } from './killstreak-catalog';
import { arenaCanActivateFieldSupport } from './arena-special-weapon-reach';
import { RAILGUN_WEAPON_ID, railgunSpawnSitesForArena } from './railgun-authority';
import { TIMED_MAP_WEAPON_DEFINITIONS } from './timed-map-weapon-authority';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import { WEAPON_IDS, type PrimaryWeaponId, type SidearmWeaponId, type WeaponId } from './protocol';
import { GUN_RANGE_FIELD_TEST_WEAPONS } from './weapon-prewarm-catalog';
import type { ArenaId } from './arena-identity';

export type WeaponRehearsalArena = Readonly<{
  id: ArenaId;
  fieldSupport: boolean;
}>;

export type WeaponRehearsalWindow =
  | 'menu'
  | 'pre-match-countdown'
  | 'admission-settle'
  | 'respawn'
  | 'combat';

export const WEAPON_REHEARSAL_WINDOWS: readonly WeaponRehearsalWindow[] = Object.freeze([
  'menu', 'pre-match-countdown', 'admission-settle', 'respawn', 'combat',
]);

export type WeaponRehearsalPlan = Readonly<{
  allWeaponIds: readonly WeaponId[];
  admissionWeaponIds: readonly WeaponId[];
  deferredWeaponIds: readonly WeaponId[];
}>;

export type WeaponRehearsalState = Readonly<{
  plan: WeaponRehearsalPlan;
  rehearsedWeaponIds: readonly WeaponId[];
}>;

export type WeaponRehearsalInputs = Readonly<{
  allWeaponIds: readonly WeaponId[];
  loadout: Readonly<{
    primary: PrimaryWeaponId;
    sidearm: SidearmWeaponId;
  }>;
  pickupWeaponIds: readonly WeaponId[];
}>;

export type WeaponSwitchRehearsalDecision = Readonly<{
  weaponId: WeaponId;
  rehearsal: 'none' | 'safe-window' | 'synchronous-before-switch';
}>;

function uniqueKnownWeaponIds(ids: readonly WeaponId[], known: ReadonlySet<WeaponId>): readonly WeaponId[] {
  return Object.freeze([...new Set(ids)].filter((id) => known.has(id)));
}

/** Map and training-bay pickups projected from their gameplay authorities. */
export function arenaPickupWeaponIds(
  arena: WeaponRehearsalArena,
  allWeaponIds: readonly WeaponId[] = WEAPON_IDS,
): readonly WeaponId[] {
  const known = new Set(allWeaponIds);
  if (arena.id === 'gun-range') {
    return uniqueKnownWeaponIds(GUN_RANGE_FIELD_TEST_WEAPONS, known);
  }

  const reachable = new Set<string>();
  for (const definition of Object.values(TIMED_MAP_WEAPON_DEFINITIONS)) {
    if (definition.arenaId === arena.id) reachable.add(definition.weaponId);
  }
  if (railgunSpawnSitesForArena(arena.id) !== null) reachable.add(RAILGUN_WEAPON_ID);

  const pickupOnly = new Set(WEAPON_CATALOG
    .filter((definition) => definition.policies.loadout === 'pickup-only')
    .map((definition) => definition.id));
  if (arenaCanActivateFieldSupport(arena)) {
    for (const source of PASS65_KILLSTREAK_SOURCES) {
      if (source.availability === 'care-only' && pickupOnly.has(source.id)) reachable.add(source.id);
    }
  }
  return Object.freeze(allWeaponIds.filter((id) => pickupOnly.has(id) && reachable.has(id)));
}

/** Purely derives the admission hot set and preserves the canonical deferral order. */
export function createWeaponRehearsalPlan(inputs: WeaponRehearsalInputs): WeaponRehearsalPlan {
  const allWeaponIds = Object.freeze([...new Set(inputs.allWeaponIds)]);
  const known = new Set(allWeaponIds);
  const admissionWeaponIds = uniqueKnownWeaponIds([
    inputs.loadout.primary,
    inputs.loadout.sidearm,
    ...inputs.pickupWeaponIds,
  ], known);
  const admission = new Set(admissionWeaponIds);
  const deferredWeaponIds = Object.freeze(allWeaponIds.filter((id) => !admission.has(id)));
  return Object.freeze({ allWeaponIds, admissionWeaponIds, deferredWeaponIds });
}

export function createWeaponRehearsalState(plan: WeaponRehearsalPlan): WeaponRehearsalState {
  return Object.freeze({ plan, rehearsedWeaponIds: Object.freeze([]) });
}

/** Records only known IDs and projects the registry in canonical catalog order. */
export function markWeaponRehearsed(
  state: WeaponRehearsalState,
  weaponIds: readonly WeaponId[],
): WeaponRehearsalState {
  const rehearsed = new Set(state.rehearsedWeaponIds);
  for (const id of weaponIds) if (state.plan.allWeaponIds.includes(id)) rehearsed.add(id);
  return Object.freeze({
    plan: state.plan,
    rehearsedWeaponIds: Object.freeze(state.plan.allWeaponIds.filter((id) => rehearsed.has(id))),
  });
}

export function isSafeWeaponRehearsalWindow(window: WeaponRehearsalWindow): boolean {
  return window !== 'combat';
}

/** Returns one frame-sized deferred slice, and nothing at all during combat. */
export function nextDeferredWeaponRehearsalSlice(
  state: WeaponRehearsalState,
  window: WeaponRehearsalWindow,
  maximum = 1,
): readonly WeaponId[] {
  if (!isSafeWeaponRehearsalWindow(window) || !Number.isSafeInteger(maximum) || maximum <= 0) {
    return Object.freeze([]);
  }
  const rehearsed = new Set(state.rehearsedWeaponIds);
  return Object.freeze(state.plan.deferredWeaponIds.filter((id) => !rehearsed.has(id)).slice(0, maximum));
}

/** A live combat switch must cross the one-off readiness barrier before it commits. */
export function decideWeaponSwitchRehearsal(
  state: WeaponRehearsalState,
  weaponId: WeaponId,
  window: WeaponRehearsalWindow,
): WeaponSwitchRehearsalDecision {
  if (state.rehearsedWeaponIds.includes(weaponId)) {
    return Object.freeze({ weaponId, rehearsal: 'none' });
  }
  return Object.freeze({
    weaponId,
    rehearsal: window === 'combat' ? 'synchronous-before-switch' : 'safe-window',
  });
}

/**
 * The deferred warm-up NEVER runs the forced-submission state walk.
 *
 * MEASURED DEFECT (PASS 94 load-time lane, `pass74-arena-boot-smoke`): the
 * first version of this scheduler called `exercisePreparedWebGpuWeaponSwitches`
 * for the `respawn` and `pre-match-countdown` windows, and every slice threw
 *
 *   [deferred weapon rehearsal] Error: Forced WebGPU submission requires an
 *   idle completion frontier; 1 submission(s) remain
 *
 * 38 times into the console on atomic-acres and nuketown2. The state walk is
 * an ADMISSION instrument: it forces submissions and flushes the queue, which
 * is only legal while the gameplay frame loop is not presenting. Those two
 * windows are inside a live match, so the frontier is never idle.
 *
 * The fix is not to relax the frontier check - that check is what keeps the
 * 12 s WebGPU queue fence meaningful. It is to give the deferred path the work
 * it can legally do: `prepareBrowserWeapon`, the asset/GPU-readiness half,
 * which is exactly what the `menu` window already used and what the
 * synchronous pre-switch barrier in `rehearseWeaponBeforeSwitch` uses. The
 * state walk keeps running inside admission for the weapons a player can
 * actually hold, where the frame loop is not yet live.
 */
export function createDeferredWeaponRehearsalScheduler(input: Readonly<{
  readState: () => WeaponRehearsalState | null;
  writeState: (state: WeaponRehearsalState) => void;
  isPreparing: () => boolean;
  prepare: (weaponId: WeaponId) => Promise<void>;
  report: (error: unknown) => void;
}>): (window: WeaponRehearsalWindow) => void {
  let pending: Promise<void> | null = null;
  return (window): void => {
    const state = input.readState();
    if (!state || input.isPreparing() || pending || !isSafeWeaponRehearsalWindow(window)) return;
    const [weaponId] = nextDeferredWeaponRehearsalSlice(state, window);
    if (!weaponId) return;
    const operation = input.prepare(weaponId).then(() => {
      const current = input.readState();
      if (current?.plan === state.plan) input.writeState(markWeaponRehearsed(current, [weaponId]));
    });
    pending = operation;
    void operation.catch(input.report).finally(() => {
      if (pending === operation) pending = null;
    });
  };
}

export async function rehearseWeaponBeforeSwitch(
  state: WeaponRehearsalState,
  weaponId: WeaponId,
  generation: number,
  currentGeneration: () => number,
  readState: () => WeaponRehearsalState | null,
  prepare: (weaponId: WeaponId) => Promise<void>,
): Promise<WeaponRehearsalState | null> {
  await prepare(weaponId);
  const current = readState();
  return generation === currentGeneration() && current?.plan === state.plan
    ? markWeaponRehearsed(current, [weaponId])
    : null;
}
