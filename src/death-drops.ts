import { WEAPONS } from './gameplay';
import type { PrimaryWeaponId, WeaponId } from './protocol';

export const DEATH_DROP_LIFETIME_MS = 30_000;
export const DEATH_DROP_INTERACTION_RANGE = 2.35;
export const DEATH_DROP_SCAVENGE_HORIZONTAL_RANGE = 1.05;
export const DEATH_DROP_SCAVENGE_RANGE = DEATH_DROP_SCAVENGE_HORIZONTAL_RANGE;
export const DEATH_DROP_SCAVENGE_VERTICAL_RANGE = 2.4;
export const MAX_DEATH_DROPS = 12;

export type DropPoint = { x: number; y: number; z: number };

export type DeathDrop = {
  id: string;
  weapon: PrimaryWeaponId;
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
  weapon: PrimaryWeaponId,
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
  return drop.weaponConsumedAt === null && now < drop.expiresAt;
}

export function deathDropAvailable(drop: DeathDrop, now: number): boolean {
  return now < drop.expiresAt && (drop.ammoConsumedAt === null || drop.weaponConsumedAt === null);
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
  grenadeCap: number,
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
  const grenades = Math.min(finiteRound(grenadeCap), finiteRound(inventory.grenades) + 1);
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
  if (!deathDropWeaponAvailable(drop, now)) return { consumed: false, mode: null, inventory, drop };
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
    drop: { ...drop, weaponConsumedAt: now },
  };
}

export function pruneDeathDrops(drops: readonly DeathDrop[], now: number, maximum = MAX_DEATH_DROPS): DeathDrop[] {
  return drops.filter((drop) => deathDropAvailable(drop, now)).slice(0, Math.max(0, maximum));
}
