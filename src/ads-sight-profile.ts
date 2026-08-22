import { WEAPON_IDS, type WeaponId } from './protocol';

export type AdsSightMarker = 'reflex' | 'aperture' | 'posts' | 'bead' | 'diamond' | 'chevron' | 'cross' | 'scope';

export type AdsSightProfile = Readonly<{
  id: WeaponId;
  marker: AdsSightMarker;
  color: string;
  ringSizePx: number;
  dotSizePx: number;
  rotationDeg: number;
}>;

// Every canonical weapon owns an explicit sight signature. Sniper, M14 EBR and
// Railgun use their dedicated full-screen optics; the remaining entries drive
// the centred HUD marker that supplements their physical viewmodel sight.
export const ADS_SIGHT_PROFILES: Readonly<Record<WeaponId, AdsSightProfile>> = Object.freeze({
  carbine: Object.freeze({ id: 'carbine', marker: 'reflex', color: '#ff5f56', ringSizePx: 24, dotSizePx: 5, rotationDeg: 0 }),
  smg: Object.freeze({ id: 'smg', marker: 'aperture', color: '#68f4df', ringSizePx: 20, dotSizePx: 3, rotationDeg: 0 }),
  lmg: Object.freeze({ id: 'lmg', marker: 'posts', color: '#ffc15c', ringSizePx: 27, dotSizePx: 4, rotationDeg: 0 }),
  scattergun: Object.freeze({ id: 'scattergun', marker: 'bead', color: '#f5eee0', ringSizePx: 18, dotSizePx: 6, rotationDeg: 0 }),
  sniper: Object.freeze({ id: 'sniper', marker: 'scope', color: '#e9fff9', ringSizePx: 0, dotSizePx: 0, rotationDeg: 0 }),
  'mini-uzi': Object.freeze({ id: 'mini-uzi', marker: 'aperture', color: '#62d8ff', ringSizePx: 18, dotSizePx: 4, rotationDeg: 0 }),
  mp5: Object.freeze({ id: 'mp5', marker: 'aperture', color: '#8df6b2', ringSizePx: 23, dotSizePx: 3, rotationDeg: 0 }),
  m4a1: Object.freeze({ id: 'm4a1', marker: 'reflex', color: '#ff8a62', ringSizePx: 28, dotSizePx: 4, rotationDeg: 0 }),
  'ak-47': Object.freeze({ id: 'ak-47', marker: 'chevron', color: '#ffd16f', ringSizePx: 25, dotSizePx: 3, rotationDeg: 0 }),
  minigun: Object.freeze({ id: 'minigun', marker: 'cross', color: '#ffb347', ringSizePx: 30, dotSizePx: 4, rotationDeg: 0 }),
  'm14-ebr': Object.freeze({ id: 'm14-ebr', marker: 'scope', color: '#ff714f', ringSizePx: 0, dotSizePx: 0, rotationDeg: 0 }),
  'slug-shotgun': Object.freeze({ id: 'slug-shotgun', marker: 'bead', color: '#d9f5ff', ringSizePx: 14, dotSizePx: 5, rotationDeg: 0 }),
  pistol: Object.freeze({ id: 'pistol', marker: 'posts', color: '#9ff5ff', ringSizePx: 18, dotSizePx: 3, rotationDeg: 0 }),
  'machine-pistol': Object.freeze({ id: 'machine-pistol', marker: 'reflex', color: '#ff748d', ringSizePx: 19, dotSizePx: 3, rotationDeg: 0 }),
  magnum: Object.freeze({ id: 'magnum', marker: 'diamond', color: '#ffd37a', ringSizePx: 21, dotSizePx: 4, rotationDeg: 45 }),
  'flashlight-pistol': Object.freeze({ id: 'flashlight-pistol', marker: 'posts', color: '#d5fbff', ringSizePx: 22, dotSizePx: 4, rotationDeg: 0 }),
  'explosive-crossbow': Object.freeze({ id: 'explosive-crossbow', marker: 'chevron', color: '#ff7048', ringSizePx: 29, dotSizePx: 4, rotationDeg: 0 }),
  railgun: Object.freeze({ id: 'railgun', marker: 'scope', color: '#64f4ff', ringSizePx: 0, dotSizePx: 0, rotationDeg: 0 }),
  flamethrower: Object.freeze({ id: 'flamethrower', marker: 'cross', color: '#ff9b42', ringSizePx: 32, dotSizePx: 2, rotationDeg: 45 }),
  // HF-334: same reticle geometry as the map flamethrower, crimson tint.
  'crimson-flamethrower': Object.freeze({ id: 'crimson-flamethrower', marker: 'cross', color: '#ff4133', ringSizePx: 32, dotSizePx: 2, rotationDeg: 45 }),
  'flare-gun': Object.freeze({ id: 'flare-gun', marker: 'bead', color: '#ff3f2f', ringSizePx: 16, dotSizePx: 7, rotationDeg: 0 }),
});

export function adsSightProfile(weapon: WeaponId): AdsSightProfile {
  return ADS_SIGHT_PROFILES[weapon];
}

export function adsSightCatalogComplete(): boolean {
  return WEAPON_IDS.length === Object.keys(ADS_SIGHT_PROFILES).length
    && WEAPON_IDS.every((weapon) => ADS_SIGHT_PROFILES[weapon]?.id === weapon);
}
