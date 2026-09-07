import { ORDINARY_WEAPON_IDS, type OrdinaryWeaponId, type WeaponId } from './protocol';

export function isOrdinaryWeapon(weapon: WeaponId): weapon is OrdinaryWeaponId {
  return ORDINARY_WEAPON_IDS.some((candidate) => candidate === weapon);
}

export function remoteReloadResultCacheKey(playerId: string, connectionEpoch: string, lifeId: number, requestId: string): string {
  return `${playerId}:${connectionEpoch}:${lifeId}:${requestId}`;
}
