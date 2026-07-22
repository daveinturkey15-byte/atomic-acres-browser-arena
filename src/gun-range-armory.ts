import type { PrimaryWeaponId } from './protocol';

export type GunRangeWeaponStation = Readonly<{
  id: string;
  weapon: PrimaryWeaponId;
  label: string;
  position: Readonly<{ x: number; y: number; z: number }>;
}>;

export const GUN_RANGE_ARMORY_INTERACTION_RANGE = 2.6;

export const GUN_RANGE_WEAPON_STATIONS: readonly GunRangeWeaponStation[] = Object.freeze([
  Object.freeze({ id: 'range-carbine', weapon: 'carbine', label: 'CARBINE', position: Object.freeze({ x: -12, y: 1.4, z: 11 }) }),
  Object.freeze({ id: 'range-smg', weapon: 'smg', label: 'SMG', position: Object.freeze({ x: -6, y: 1.4, z: 11 }) }),
  Object.freeze({ id: 'range-lmg', weapon: 'lmg', label: 'LMG', position: Object.freeze({ x: 0, y: 1.4, z: 11 }) }),
  Object.freeze({ id: 'range-scattergun', weapon: 'scattergun', label: 'SCATTERGUN', position: Object.freeze({ x: 6, y: 1.4, z: 11 }) }),
  Object.freeze({ id: 'range-sniper', weapon: 'sniper', label: 'SNIPER', position: Object.freeze({ x: 12, y: 1.4, z: 11 }) }),
]);

export function nearestGunRangeWeaponStation(
  position: Readonly<{ x: number; y: number; z: number }>,
  maximumDistance = GUN_RANGE_ARMORY_INTERACTION_RANGE,
): GunRangeWeaponStation | null {
  if (![position.x, position.y, position.z, maximumDistance].every(Number.isFinite) || maximumDistance < 0) return null;
  let nearest: GunRangeWeaponStation | null = null;
  let nearestDistanceSquared = maximumDistance * maximumDistance;
  for (const station of GUN_RANGE_WEAPON_STATIONS) {
    const dx = position.x - station.position.x;
    const dy = position.y - station.position.y;
    const dz = position.z - station.position.z;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared > nearestDistanceSquared) continue;
    nearest = station;
    nearestDistanceSquared = distanceSquared;
  }
  return nearest;
}
