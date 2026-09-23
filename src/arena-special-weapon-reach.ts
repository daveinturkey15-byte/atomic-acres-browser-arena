import type { ArenaId } from './arena-identity';
import { TIMED_MAP_WEAPON_DEFINITIONS, type TimedMapWeaponId } from './timed-map-weapon-authority';

/**
 * CAN THIS ARENA EVER PUT THIS SPECIAL WEAPON IN SOMEONE'S HANDS?
 *
 * PASS 85 lane H, the load-time deep cut. Every arena entry rehearses the
 * complete first-shot presentation of the flare gun and the flamethrower, and
 * those two rehearsals are SERIALIZED after the concurrent effect families
 * (they stage a transient world PointLight, and three r185 folds the visible
 * light graph into every render object's cache key, so they cannot overlap).
 * Measured on the shipped PASS 84 build over 56 in-session map switches:
 * `flare-first-shot` costs a median of 2560.6 ms and `flamethrower-first-shot`
 * 415.4 ms, on EVERY arena, out of a 21.3 s median switch.
 *
 * But neither weapon is a loadout weapon. Both are authority-owned
 * (`AUTHORITY_OWNED_SPECIAL_WEAPON_IDS` in gameplay-contract.ts) and each has
 * exactly one authored route onto the map:
 *   - the flare gun spawns as skyline-terminal's timed map weapon, AND Gun
 *     Range's secure test bay racks EVERY weapon id, so a solo/host player
 *     there can take one off the rack;
 *   - the flamethrower spawns as rustworks-1v1's timed map weapon, AND the
 *     care package can roll the crimson flamethrower on any arena where field
 *     support can be activated, AND the same Gun Range rack grants it.
 *
 * The Gun Range route was MISSED by the first cut of this module (found by the
 * PASS 85 lane H skeptic, 2026-09-02): `grantTrainingTimedMapWeapon` accepts on
 * `context.arenaId === 'gun-range'` alone and never reads the definition's own
 * arenaId, so reading only TIMED_MAP_WEAPON_DEFINITIONS pinned a false model of
 * the world and skipped the flare rehearsal on an arena that CAN hand a player
 * a flare gun. That is exactly the defect class this module exists to prevent,
 * committed by this module. Both routes are now derived from their authorities
 * and both are source-pinned by the test beside this file.
 *
 * So these predicates ask the SAME authorities the spawner asks —
 * `TIMED_MAP_WEAPON_DEFINITIONS` for the map route and the field-support rule
 * for the care-package route — rather than restating an arena list that would
 * quietly stop matching the day a definition moves. That is the whole reason
 * this lives in its own module with its own test: a hand-written roster in a
 * prewarm gate is the failure this repo keeps paying for.
 *
 * SAFETY, and why this cannot reach a live combat frame: skipping a rehearsal
 * here removes nothing from the admitted vocabulary. The arena transition
 * still prewarms the FULL weapon catalogue immediately before this
 * (`weaponPrewarmCatalogForArena` deliberately returns every weapon id, so the
 * models stay resident across map switches), and
 * `prewarmMatchBoundFirstShotPresentations` still rehearses the exact flare
 * and flamethrower fire compositions against the complete match scene on every
 * arena before admission. This gate only removes a DUPLICATE arena-side
 * rehearsal on arenas whose own authority can never produce the weapon.
 */

type ArenaWeaponReach = Readonly<{ id: ArenaId; fieldSupport: boolean }>;

/**
 * The exact predicate `activateFieldSupport` applies before any support
 * activation is allowed. Gun Range carries field support through its training
 * bay despite the catalog flag, which is why the id appears there and here and
 * nowhere else.
 */
export function arenaCanActivateFieldSupport(arena: ArenaWeaponReach): boolean {
  return arena.fieldSupport || arena.id === 'gun-range';
}

/** Does this arena own the authored spawn for this timed map weapon? */
export function arenaOwnsTimedMapWeapon(arena: ArenaWeaponReach, weaponId: TimedMapWeaponId): boolean {
  return TIMED_MAP_WEAPON_DEFINITIONS[weaponId].arenaId === arena.id;
}

/**
 * Gun Range's secure test bay racks every weapon id (`gun-range-test-bay.ts`
 * builds its stations straight from `WEAPON_IDS`), and
 * `grantTrainingTimedMapWeapon` accepts any timed map weapon on the sole
 * condition `arenaId === 'gun-range'`. So Gun Range reaches BOTH timed map
 * weapons whichever arena owns the authored spawn.
 */
export function arenaCanTrainTimedMapWeapons(arena: ArenaWeaponReach): boolean {
  return arena.id === 'gun-range';
}

/** The flare gun has two routes: its map spawn, and the Gun Range rack. */
export function arenaCanAcquireFlareGun(arena: ArenaWeaponReach): boolean {
  return arenaOwnsTimedMapWeapon(arena, 'flare-gun') || arenaCanTrainTimedMapWeapons(arena);
}

/** The flamethrower has three: map spawn, care package, Gun Range rack. */
export function arenaCanAcquireFlamethrower(arena: ArenaWeaponReach): boolean {
  return arenaOwnsTimedMapWeapon(arena, 'flamethrower')
    || arenaCanActivateFieldSupport(arena)
    || arenaCanTrainTimedMapWeapons(arena);
}
