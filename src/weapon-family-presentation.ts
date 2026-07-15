import type { WeaponId } from './protocol';

export type WeaponFamilyPresentation = {
  sightHeight: number;
  adsX: number;
  adsY: number;
  adsZ: number;
  projectionCorrection: number;
  flashScale: number;
  recoilTranslation: number;
  recoilRotation: number;
  actionTravel: number;
  smokeBase: number;
  requiredDetails: string[];
};

const PROFILES: Record<WeaponId, WeaponFamilyPresentation> = {
  carbine: {
    sightHeight: 0.215, adsX: -0.36, adsY: 0.251, adsZ: -0.04, projectionCorrection: 0,
    flashScale: 1, recoilTranslation: 0.13, recoilRotation: 0.18,
    actionTravel: 0.075, smokeBase: 1,
    requiredDetails: ['optic-lens', 'optic-reticle', 'stock-cheek-rest', 'charging-handle', 'magazine-rib'],
  },
  smg: {
    sightHeight: 0.24, adsX: -0.36, adsY: 0.135, adsZ: -0.025, projectionCorrection: 0.101,
    flashScale: 0.78, recoilTranslation: 0.095, recoilRotation: 0.135,
    actionTravel: 0.09, smokeBase: 1,
    requiredDetails: ['smg-aperture', 'smg-front-post', 'magazine-witness', 'muzzle-brake', 'charging-tab'],
  },
  scattergun: {
    sightHeight: 0.2, adsX: -0.36, adsY: 0.159, adsZ: 0.015, projectionCorrection: 0.101,
    flashScale: 1.45, recoilTranslation: 0.19, recoilRotation: 0.24,
    actionTravel: 0.22, smokeBase: 3,
    requiredDetails: ['ghost-ring', 'front-bead', 'loading-port', 'shell-saddle', 'pump-rib'],
  },
  sniper: {
    sightHeight: 0.3, adsX: -0.36, adsY: 0.166, adsZ: 0.045, projectionCorrection: 0,
    flashScale: 1.22, recoilTranslation: 0.22, recoilRotation: 0.3,
    actionTravel: 0.13, smokeBase: 2,
    requiredDetails: ['sniper-scope', 'sniper-scope-lens', 'optic-reticle', 'stock-cheek-rest', 'bolt-or-slide'],
  },
  pistol: {
    sightHeight: 0.17, adsX: -0.36, adsY: 0.278, adsZ: -0.08, projectionCorrection: 0,
    flashScale: 0.7, recoilTranslation: 0.11, recoilRotation: 0.2,
    actionTravel: 0.1, smokeBase: 1,
    requiredDetails: ['pistol-rear-sight', 'pistol-front-sight', 'pistol-magazine', 'pistol-slide', 'pistol-trigger-guard'],
  },
};

export function weaponFamilyPresentation(weapon: WeaponId): WeaponFamilyPresentation {
  return PROFILES[weapon];
}

export function centeredSightY(weapon: WeaponId, rootY = -0.38, viewScale = 0.6): number {
  const profile = weaponFamilyPresentation(weapon);
  return rootY + profile.adsY + profile.sightHeight * viewScale + profile.projectionCorrection;
}
