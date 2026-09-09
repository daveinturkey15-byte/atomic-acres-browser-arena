import type { WeaponId } from './protocol';

export type WeaponFinishProfile = {
  id: string;
  /** HF-334: multiplied over the shared albedo to express a livery variant
   * without shipping a second texture set. Absent means untinted (0xffffff). */
  tintHex?: number;
  albedo: string;
  normal: string;
  roughness: string;
  metalness: number;
  normalScale: number;
  textureRepeat: number;
};

const path = (weapon: WeaponId, suffix = '') => `./assets/original/textures/weapon-${weapon}${suffix}.png`;

export const WEAPON_FINISH_PROFILES: Record<WeaponId, WeaponFinishProfile> = {
  carbine: {
    id: 'hk416-graphite-gold-v1', albedo: path('carbine'), normal: path('carbine', '-normal'),
    roughness: path('carbine', '-roughness'), metalness: 0.62, normalScale: 0.32, textureRepeat: 2,
  },
  smg: {
    id: 'p90-teal-anodized-v1', albedo: path('smg'), normal: path('smg', '-normal'),
    roughness: path('smg', '-roughness'), metalness: 0.54, normalScale: 0.36, textureRepeat: 2,
  },
  lmg: {
    id: 'm249-bronze-olive-v1', albedo: path('lmg'), normal: path('lmg', '-normal'),
    roughness: path('lmg', '-roughness'), metalness: 0.5, normalScale: 0.34, textureRepeat: 2,
  },
  scattergun: {
    id: 'model12-blued-coral-v1', albedo: path('scattergun'), normal: path('scattergun', '-normal'),
    roughness: path('scattergun', '-roughness'), metalness: 0.48, normalScale: 0.3, textureRepeat: 2,
  },
  sniper: {
    id: 'm40a5-olive-cerakote-v1', albedo: path('sniper'), normal: path('sniper', '-normal'),
    roughness: path('sniper', '-roughness'), metalness: 0.42, normalScale: 0.28, textureRepeat: 2,
  },
  railgun: {
    id: 'vx8-ceramic-cyan-v1', albedo: path('sniper'), normal: path('sniper', '-normal'),
    roughness: path('sniper', '-roughness'), metalness: 0.68, normalScale: 0.26, textureRepeat: 2,
  },
  pistol: {
    id: 'glock17-satin-service-v1', albedo: path('pistol'), normal: path('pistol', '-normal'),
    roughness: path('pistol', '-roughness'), metalness: 0.66, normalScale: 0.25, textureRepeat: 2,
  },
  magnum: {
    id: 'desert-eagle-brushed-brass-v1', albedo: path('magnum'), normal: path('magnum', '-normal'),
    roughness: path('magnum', '-roughness'), metalness: 0.82, normalScale: 0.3, textureRepeat: 2,
  },
  'machine-pistol': {
    id: 'glock18-ported-graphite-v1', albedo: path('machine-pistol'), normal: path('machine-pistol', '-normal'),
    roughness: path('machine-pistol', '-roughness'), metalness: 0.6, normalScale: 0.3, textureRepeat: 2,
  },
  'mini-uzi': { id: 'mini-uzi-parkerized-v1', albedo: path('smg'), normal: path('smg', '-normal'), roughness: path('smg', '-roughness'), metalness: 0.58, normalScale: 0.34, textureRepeat: 2 },
  mp5: { id: 'mp5-matte-black-v1', albedo: path('smg'), normal: path('smg', '-normal'), roughness: path('smg', '-roughness'), metalness: 0.5, normalScale: 0.34, textureRepeat: 2 },
  m4a1: { id: 'm4a1-service-black-v1', albedo: path('carbine'), normal: path('carbine', '-normal'), roughness: path('carbine', '-roughness'), metalness: 0.6, normalScale: 0.32, textureRepeat: 2 },
  'ak-47': { id: 'ak47-blued-laminate-v1', albedo: path('carbine'), normal: path('carbine', '-normal'), roughness: path('carbine', '-roughness'), metalness: 0.58, normalScale: 0.34, textureRepeat: 2 },
  minigun: { id: 'm134-gunmetal-v1', albedo: path('lmg'), normal: path('lmg', '-normal'), roughness: path('lmg', '-roughness'), metalness: 0.72, normalScale: 0.38, textureRepeat: 2 },
  'm14-ebr': { id: 'm14-ebr-sage-v1', albedo: path('sniper'), normal: path('sniper', '-normal'), roughness: path('sniper', '-roughness'), metalness: 0.5, normalScale: 0.3, textureRepeat: 2 },
  'slug-shotgun': { id: 'benelli-m4-satin-v1', albedo: path('scattergun'), normal: path('scattergun', '-normal'), roughness: path('scattergun', '-roughness'), metalness: 0.54, normalScale: 0.3, textureRepeat: 2 },
  'flashlight-pistol': { id: 'usp45-tactical-v1', albedo: path('pistol'), normal: path('pistol', '-normal'), roughness: path('pistol', '-roughness'), metalness: 0.66, normalScale: 0.28, textureRepeat: 2 },
  'explosive-crossbow': { id: 'tac15-carbon-v1', albedo: path('pistol'), normal: path('pistol', '-normal'), roughness: path('pistol', '-roughness'), metalness: 0.42, normalScale: 0.32, textureRepeat: 2 },
  flamethrower: { id: 'm2-heat-weathered-v1', albedo: path('lmg'), normal: path('lmg', '-normal'), roughness: path('lmg', '-roughness'), metalness: 0.64, normalScale: 0.4, textureRepeat: 2 },
  // HF-334: crimson care-package variant. Same authored maps; the red livery
  // is applied as a runtime tint so no second texture set ships.
  'crimson-flamethrower': { id: 'crimson-lacquer-v1', tintHex: 0xd8342a, albedo: path('lmg'), normal: path('lmg', '-normal'), roughness: path('lmg', '-roughness'), metalness: 0.58, normalScale: 0.4, textureRepeat: 2 },
  'flare-gun': { id: 'orion-signal-red-v1', albedo: path('pistol'), normal: path('pistol', '-normal'), roughness: path('pistol', '-roughness'), metalness: 0.38, normalScale: 0.28, textureRepeat: 2 },
};

export function weaponFinishProfile(weapon: WeaponId): WeaponFinishProfile {
  return WEAPON_FINISH_PROFILES[weapon];
}
