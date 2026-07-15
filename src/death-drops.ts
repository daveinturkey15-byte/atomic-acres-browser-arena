import { WEAPONS } from './gameplay';
import type { PrimaryWeaponId } from './protocol';

export const DEATH_DROP_LIFETIME_MS = 25_000;
export const DEATH_DROP_INTERACTION_RANGE = 2.35;
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
  consumedAt: number | null;
};

export type DeathDropInventory = {
  primary: PrimaryWeaponId;
  ammo: number;
  reserve: number;
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
    consumedAt: null,
  };
}

export function deathDropAvailable(drop: DeathDrop, now: number): boolean {
  return drop.consumedAt === null && now < drop.expiresAt;
}

export function nearestDeathDrop(
  drops: readonly DeathDrop[],
  position: DropPoint,
  range = DEATH_DROP_INTERACTION_RANGE,
  now = performance.now(),
): DeathDrop | null {
  let nearest: DeathDrop | null = null;
  let nearestDistance = range;
  for (const drop of drops) {
    if (!deathDropAvailable(drop, now)) continue;
    const distance = Math.hypot(drop.position.x - position.x, drop.position.y - position.y, drop.position.z - position.z);
    if (distance <= nearestDistance) {
      nearest = drop;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function consumeDeathDrop(
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
  if (!deathDropAvailable(drop, now)) return { consumed: false, mode: null, inventory, drop };
  const spec = WEAPONS[drop.weapon];
  const reserveCap = Math.min(spec.reserve, Math.max(0, finiteRound(maximumReserve)));
  if (inventory.primary === drop.weapon) {
    const available = drop.ammo + drop.reserve;
    const reserve = Math.min(reserveCap, finiteRound(inventory.reserve) + available);
    if (reserve <= inventory.reserve) return { consumed: false, mode: null, inventory, drop };
    return {
      consumed: true,
      mode: 'replenish',
      inventory: { ...inventory, reserve },
      drop: { ...drop, consumedAt: now },
    };
  }
  return {
    consumed: true,
    mode: 'pickup',
    inventory: {
      primary: drop.weapon,
      ammo: Math.min(spec.mag, Math.max(1, drop.ammo)),
      reserve: Math.min(reserveCap, drop.reserve),
    },
    drop: { ...drop, consumedAt: now },
  };
}

export function pruneDeathDrops(drops: readonly DeathDrop[], now: number, maximum = MAX_DEATH_DROPS): DeathDrop[] {
  return drops.filter((drop) => deathDropAvailable(drop, now)).slice(0, Math.max(0, maximum));
}
