import { WEAPON_CATALOG } from './combat/weapon-catalog';
import { WEAPON_IDS, type WeaponId } from './protocol';
import { magnifiedFovDegrees } from './weapon-presentation-state';

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

/** Degrees the generic iron-sight ADS takes off the player's preferred field of view. */
export const ADS_IRON_SIGHT_FOV_REDUCTION_DEGREES = 20;
/** Floor on the generic iron-sight ADS, so a low preferred FOV cannot tunnel. */
export const ADS_IRON_SIGHT_MINIMUM_FOV_DEGREES = 55;

/**
 * The magnification a weapon's authored optic actually delivers, or null when
 * the weapon aims down bare iron sights.
 *
 * HF-405: the owner asked for "a better scope 1.5x on the crossbow". The optic
 * was already authored — weapon-catalog gives explosive-crossbow
 * `optic.magnification: 1.5` and weapon-model builds the compact glass — but
 * the ADS ladder hard-coded a three-weapon list (sniper/m14-ebr/railgun) and
 * dropped every other weapon into the generic iron-sight fallback, so the
 * authored number had no reader anywhere in src/. Deriving it from the catalog
 * means a weapon that authors an optic gets its true magnification without
 * anyone remembering to extend a list.
 */
export function authoredOpticMagnification(weapon: WeaponId): number | null {
  const optic = WEAPON_CATALOG.find((definition) => definition.id === weapon)?.optic ?? null;
  if (!optic || !Number.isFinite(optic.magnification) || optic.magnification <= 1) return null;
  return optic.magnification;
}

/** The generic iron-sight ADS field of view, with no optic involved. */
export function ironSightAdsFovDegrees(baseFovDegrees: number): number {
  return Math.max(ADS_IRON_SIGHT_MINIMUM_FOV_DEGREES, baseFovDegrees - ADS_IRON_SIGHT_FOV_REDUCTION_DEGREES);
}

/**
 * ADS field of view for a weapon with no dedicated full-screen optic pipeline.
 *
 * Magnification is measured against the player's preferred FOV, exactly as the
 * sniper/DMR/railgun branches measure theirs, so one weapon's "1.5x" means the
 * same thing as another's "3x". The result is the TIGHTER of the authored optic
 * and the generic iron-sight ADS: at the default 82 degree base the generic ADS
 * is already 62 degrees (about 1.45x), so a weakly authored optic — the flare
 * gun's 1.1x would open the view back up to 74.5 degrees — must never make
 * aiming worse than iron sights.
 */
export function adsAimingFovDegrees(weapon: WeaponId, baseFovDegrees: number): number {
  const ironSight = ironSightAdsFovDegrees(baseFovDegrees);
  const magnification = authoredOpticMagnification(weapon);
  if (magnification === null) return ironSight;
  return Math.min(ironSight, magnifiedFovDegrees(baseFovDegrees, magnification));
}
