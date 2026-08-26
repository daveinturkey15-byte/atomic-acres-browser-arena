import { GRENADE_CARRY_CAP } from './combat/ordnance';
import { WEAPONS } from './gameplay';
import { PRIMARY_WEAPON_IDS, type PrimaryWeaponId, type WeaponId } from './protocol';

export const DEATH_DROP_LIFETIME_MS = 30_000;
export const DEATH_DROP_INTERACTION_RANGE = 2.35;
export const DEATH_DROP_SCAVENGE_HORIZONTAL_RANGE = 1.05;
export const DEATH_DROP_SCAVENGE_RANGE = DEATH_DROP_SCAVENGE_HORIZONTAL_RANGE;
export const DEATH_DROP_SCAVENGE_VERTICAL_RANGE = 2.4;
export const MAX_DEATH_DROPS = 12;

export type DropPoint = { x: number; y: number; z: number };

export type DeathDrop = {
  id: string;
  weapon: WeaponId;
  position: DropPoint;
  ammo: number;
  reserve: number;
  createdAt: number;
  expiresAt: number;
  ammoConsumedAt: number | null;
  weaponConsumedAt: number | null;
};

export type DeathDropInventory = {
  primary: PrimaryWeaponId;
  ammo: number;
  reserve: number;
};

export type ScavengeInventory = {
  weapon: WeaponId;
  reserve: number;
  grenades: number;
};

function finiteRound(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function createDeathDrop(
  id: string,
  weapon: WeaponId,
  position: DropPoint,
  ammo: number,
  reserve: number,
  createdAt: number,
): DeathDrop {
  const spec = WEAPONS[weapon];
  return {
    id,
    weapon,
    position: {
      x: Number.isFinite(position.x) ? position.x : 0,
      y: Number.isFinite(position.y) ? position.y : 0,
      z: Number.isFinite(position.z) ? position.z : 0,
    },
    ammo: Math.min(spec.mag, finiteRound(ammo)),
    reserve: Math.min(spec.reserve, finiteRound(reserve)),
    createdAt,
    expiresAt: createdAt + DEATH_DROP_LIFETIME_MS,
    ammoConsumedAt: null,
    weaponConsumedAt: null,
  };
}

export function deathDropAmmoAvailable(drop: DeathDrop, now: number): boolean {
  return drop.ammoConsumedAt === null && now < drop.expiresAt;
}

export function deathDropWeaponAvailable(drop: DeathDrop, now: number): boolean {
  return isPrimaryWeaponId(drop.weapon) && drop.weaponConsumedAt === null && now < drop.expiresAt;
}

/** The single eligibility predicate shared by weapon prompts and consumption. */
export function deathDropWeaponPickupAvailable(
  drop: DeathDrop,
  equippedPrimary: PrimaryWeaponId,
  now: number,
): boolean {
  return deathDropWeaponAvailable(drop, now)
    && (drop.weapon !== equippedPrimary || deathDropAmmoAvailable(drop, now));
}

export function deathDropAvailable(drop: DeathDrop, now: number): boolean {
  return now < drop.expiresAt && (drop.ammoConsumedAt === null || deathDropWeaponAvailable(drop, now));
}

const PRIMARY_WEAPON_ID_SET = new Set<WeaponId>(PRIMARY_WEAPON_IDS);

export function isPrimaryWeaponId(weapon: WeaponId): weapon is PrimaryWeaponId {
  return PRIMARY_WEAPON_ID_SET.has(weapon);
}

export function nearestDeathDrop(
  drops: readonly DeathDrop[],
  position: DropPoint,
  range = DEATH_DROP_INTERACTION_RANGE,
  now = performance.now(),
  payload: 'any' | 'ammo' | 'weapon' = 'any',
): DeathDrop | null {
  let nearest: DeathDrop | null = null;
  let nearestDistance = range;
  for (const drop of drops) {
    const available = payload === 'ammo'
      ? deathDropAmmoAvailable(drop, now)
      : payload === 'weapon'
        ? deathDropWeaponAvailable(drop, now)
        : deathDropAvailable(drop, now);
    if (!available) continue;
    const distance = Math.hypot(drop.position.x - position.x, drop.position.y - position.y, drop.position.z - position.z);
    if (distance <= nearestDistance) {
      nearest = drop;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function selectDeathDropWeaponPickup(
  drops: readonly DeathDrop[],
  position: DropPoint,
  equippedPrimary: PrimaryWeaponId,
  now = performance.now(),
  expectedTargetId?: string,
  range = DEATH_DROP_INTERACTION_RANGE,
): DeathDrop | null {
  const eligible = drops.filter((drop) => deathDropWeaponPickupAvailable(drop, equippedPrimary, now));
  if (expectedTargetId !== undefined) {
    const expected = eligible.find((drop) => drop.id === expectedTargetId);
    return expected ? nearestDeathDrop([expected], position, range, now, 'weapon') : null;
  }
  return nearestDeathDrop(eligible, position, range, now, 'weapon');
}

export function nearestScavengeDeathDrop(
  drops: readonly DeathDrop[],
  position: DropPoint,
  now = performance.now(),
  horizontalRange = DEATH_DROP_SCAVENGE_HORIZONTAL_RANGE,
  verticalRange = DEATH_DROP_SCAVENGE_VERTICAL_RANGE,
): DeathDrop | null {
  let nearest: DeathDrop | null = null;
  let nearestHorizontal = horizontalRange;
  for (const drop of drops) {
    if (!deathDropAmmoAvailable(drop, now) || Math.abs(drop.position.y - position.y) > verticalRange) continue;
    const horizontal = Math.hypot(drop.position.x - position.x, drop.position.z - position.z);
    if (horizontal <= nearestHorizontal) {
      nearest = drop;
      nearestHorizontal = horizontal;
    }
  }
  return nearest;
}

export function scavengeDeathDrop(
  drop: DeathDrop,
  inventory: ScavengeInventory,
  maximumReserve: number,
  now: number,
): {
  scavenged: boolean;
  inventory: ScavengeInventory;
  drop: DeathDrop;
  ammoGranted: number;
  grenadeGranted: number;
} {
  if (!deathDropAmmoAvailable(drop, now)) {
    return { scavenged: false, inventory, drop, ammoGranted: 0, grenadeGranted: 0 };
  }
  const reserveCap = Math.min(WEAPONS[inventory.weapon].reserve, finiteRound(maximumReserve));
  const ammunitionAvailable = finiteRound(drop.ammo) + finiteRound(drop.reserve);
  const reserve = Math.min(reserveCap, finiteRound(inventory.reserve) + ammunitionAvailable);
  const grenades = Math.min(GRENADE_CARRY_CAP, finiteRound(inventory.grenades) + 1);
  const ammoGranted = Math.max(0, reserve - finiteRound(inventory.reserve));
  const grenadeGranted = Math.max(0, grenades - finiteRound(inventory.grenades));
  if (ammoGranted === 0 && grenadeGranted === 0) {
    return { scavenged: false, inventory, drop, ammoGranted: 0, grenadeGranted: 0 };
  }
  return {
    scavenged: true,
    inventory: { ...inventory, reserve, grenades },
    drop: { ...drop, ammoConsumedAt: now },
    ammoGranted,
    grenadeGranted,
  };
}

export function consumeDeathDropWeapon(
  drop: DeathDrop,
  inventory: DeathDropInventory,
  maximumReserve: number,
  now: number,
): {
  consumed: boolean;
  mode: 'pickup' | 'replenish' | null;
  inventory: DeathDropInventory;
  drop: DeathDrop;
} {
  if (!deathDropWeaponAvailable(drop, now) || !isPrimaryWeaponId(drop.weapon)) {
    return { consumed: false, mode: null, inventory, drop };
  }
  const spec = WEAPONS[drop.weapon];
  const reserveCap = Math.min(spec.reserve, finiteRound(maximumReserve));
  if (inventory.primary === drop.weapon) {
    if (!deathDropAmmoAvailable(drop, now)) return { consumed: false, mode: null, inventory, drop };
    const reserve = Math.min(reserveCap, finiteRound(inventory.reserve) + finiteRound(drop.ammo) + finiteRound(drop.reserve));
    if (reserve <= inventory.reserve) return { consumed: false, mode: null, inventory, drop };
    return {
      consumed: true,
      mode: 'replenish',
      inventory: { ...inventory, reserve },
      drop: { ...drop, ammoConsumedAt: now, weaponConsumedAt: now },
    };
  }
  return {
    consumed: true,
    mode: 'pickup',
    inventory: {
      primary: drop.weapon,
      ammo: Math.min(spec.mag, Math.max(1, finiteRound(drop.ammo))),
      reserve: 0,
    },
    // Owner requirement: the gun you swapped out (with its magazine and reserve)
    // goes INTO this drop instead of being deleted, and the consumed flags are
    // cleared, so you can immediately pick it back up and re-swap freely.
    drop: {
      ...drop,
      weapon: inventory.primary,
      ammo: finiteRound(inventory.ammo),
      reserve: finiteRound(inventory.reserve),
      weaponConsumedAt: null,
      ammoConsumedAt: null,
    },
  };
}

/**
 * Owner requirement (HF-315a): after an accepted weapon swap the gun you
 * dropped lands at YOUR feet with a fresh 30-second lifetime so you can swap
 * straight back — and the host must record EXACTLY the same placement as the
 * guest. The guest previously did this inline while the host kept the drop's
 * original position and expiry, so the two drop records diverged after every
 * accepted swap and later legitimate re-swaps were silently rejected. Both
 * roles call this single pure placement for `consumeDeathDropWeapon` results
 * in 'pickup' mode (a 'replenish' keeps the same gun, fully consumes the drop
 * and never repositions).
 */
export function placeSwappedDeathDrop(
  drop: DeathDrop,
  pickerPosition: DropPoint,
  floorY: number,
  now: number,
): DeathDrop {
  return {
    ...drop,
    position: {
      x: Number.isFinite(pickerPosition.x) ? pickerPosition.x : 0,
      y: Number.isFinite(floorY) ? floorY : 0,
      z: Number.isFinite(pickerPosition.z) ? pickerPosition.z : 0,
    },
    expiresAt: now + DEATH_DROP_LIFETIME_MS,
  };
}

export function pruneDeathDrops(drops: readonly DeathDrop[], now: number, maximum = MAX_DEATH_DROPS): DeathDrop[] {
  return drops.filter((drop) => deathDropAvailable(drop, now)).slice(0, Math.max(0, maximum));
}
