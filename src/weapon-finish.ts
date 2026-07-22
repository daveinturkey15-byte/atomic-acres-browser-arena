import type { WeaponId } from './protocol';

export type WeaponFinishProfile = {
  id: string;
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
    id: 'm86-graphite-gold-v1', albedo: path('carbine'), normal: path('carbine', '-normal'),
    roughness: path('carbine', '-roughness'), metalness: 0.62, normalScale: 0.32, textureRepeat: 2,
  },
  smg: {
    id: 'vectorline-teal-anodized-v1', albedo: path('smg'), normal: path('smg', '-normal'),
    roughness: path('smg', '-roughness'), metalness: 0.54, normalScale: 0.36, textureRepeat: 2,
  },
  lmg: {
    id: 'mastiff63-bronze-olive-v1', albedo: path('lmg'), normal: path('lmg', '-normal'),
    roughness: path('lmg', '-roughness'), metalness: 0.5, normalScale: 0.34, textureRepeat: 2,
  },
  scattergun: {
    id: 'model12-blued-coral-v1', albedo: path('scattergun'), normal: path('scattergun', '-normal'),
    roughness: path('scattergun', '-roughness'), metalness: 0.48, normalScale: 0.3, textureRepeat: 2,
  },
  sniper: {
    id: 'longline-olive-cerakote-v1', albedo: path('sniper'), normal: path('sniper', '-normal'),
    roughness: path('sniper', '-roughness'), metalness: 0.42, normalScale: 0.28, textureRepeat: 2,
  },
  pistol: {
    id: 'aster9-satin-service-v1', albedo: path('pistol'), normal: path('pistol', '-normal'),
    roughness: path('pistol', '-roughness'), metalness: 0.66, normalScale: 0.25, textureRepeat: 2,
  },
  'machine-pistol': {
    id: 'aster18-ported-graphite-v1', albedo: path('machine-pistol'), normal: path('machine-pistol', '-normal'),
    roughness: path('machine-pistol', '-roughness'), metalness: 0.6, normalScale: 0.3, textureRepeat: 2,
  },
};

export function weaponFinishProfile(weapon: WeaponId): WeaponFinishProfile {
  return WEAPON_FINISH_PROFILES[weapon];
}
