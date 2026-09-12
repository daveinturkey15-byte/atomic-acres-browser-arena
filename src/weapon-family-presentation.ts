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

const BASE_PROFILES: Record<'carbine' | 'smg' | 'lmg' | 'scattergun' | 'sniper' | 'railgun' | 'pistol' | 'magnum' | 'machine-pistol', WeaponFamilyPresentation> = {
  carbine: {
    sightHeight: 0.215, adsX: -0.36, adsY: 0.251, adsZ: -0.04, projectionCorrection: 0,
    flashScale: 1, recoilTranslation: 0.13, recoilRotation: 0.18,
    actionTravel: 0.075, smokeBase: 1,
    requiredDetails: ['optic-lens', 'optic-reticle', 'stock-cheek-rest', 'charging-handle', 'magazine-rib', 'angled-foregrip'],
  },
  smg: {
    sightHeight: 0.24, adsX: -0.36, adsY: 0.135, adsZ: -0.025, projectionCorrection: 0.101,
    flashScale: 0.78, recoilTranslation: 0.095, recoilRotation: 0.135,
    actionTravel: 0.09, smokeBase: 1,
    requiredDetails: ['smg-aperture', 'smg-front-post', 'magazine-witness', 'muzzle-brake', 'charging-tab', 'smg-foregrip'],
  },
  lmg: {
    sightHeight: 0.215, adsX: -0.36, adsY: 0.251, adsZ: -0.02, projectionCorrection: 0,
    flashScale: 1.14, recoilTranslation: 0.155, recoilRotation: 0.205,
    actionTravel: 0.105, smokeBase: 1.6,
    requiredDetails: ['lmg-heavy-receiver', 'lmg-box-magazine', 'lmg-carry-handle', 'lmg-bipod', 'lmg-heat-shield', 'lmg-aperture', 'lmg-front-sight-dot', 'rear-sight', 'front-sight', 'bolt-or-slide'],
  },
  scattergun: {
    sightHeight: 0.2, adsX: -0.36, adsY: 0.159, adsZ: 0.015, projectionCorrection: 0.101,
    flashScale: 1.45, recoilTranslation: 0.19, recoilRotation: 0.24,
    actionTravel: 0.22, smokeBase: 3,
    requiredDetails: ['ghost-ring', 'front-bead', 'loading-port', 'shell-saddle', 'pump-rib'],
  },
  sniper: {
    sightHeight: 0.285, adsX: -0.36, adsY: 0.209, adsZ: 0.045, projectionCorrection: 0,
    flashScale: 1.22, recoilTranslation: 0.22, recoilRotation: 0.3,
    actionTravel: 0.13, smokeBase: 2,
    requiredDetails: ['sniper-scope', 'sniper-scope-lens', 'sniper-muzzle-brake', 'sniper-bolt-handle', 'sniper-chassis', 'bolt-or-slide'],
  },
  railgun: {
    sightHeight: 0.285, adsX: -0.36, adsY: 0.209, adsZ: 0.045, projectionCorrection: 0,
    flashScale: 1.5, recoilTranslation: 0.25, recoilRotation: 0.34,
    actionTravel: 0.16, smokeBase: 0.4,
    requiredDetails: ['railgun-receiver', 'railgun-coil-left', 'railgun-coil-right', 'railgun-thermal-scope', 'railgun-capacitor', 'bolt-or-slide'],
  },
  pistol: {
    sightHeight: 0.17, adsX: -0.36, adsY: 0.278, adsZ: -0.08, projectionCorrection: 0,
    flashScale: 0.7, recoilTranslation: 0.11, recoilRotation: 0.2,
    actionTravel: 0.1, smokeBase: 1,
    requiredDetails: ['pistol-rear-sight', 'pistol-front-sight', 'pistol-magazine', 'pistol-slide', 'pistol-trigger-guard', 'pistol-ejection-port', 'pistol-frame-rail'],
  },
  magnum: {
    sightHeight: 0.18, adsX: -0.36, adsY: 0.278, adsZ: -0.075, projectionCorrection: 0,
    flashScale: 1.12, recoilTranslation: 0.17, recoilRotation: 0.29,
    actionTravel: 0.13, smokeBase: 1.8,
    requiredDetails: ['pistol-rear-sight', 'pistol-front-sight', 'pistol-magazine', 'pistol-slide', 'pistol-trigger-guard', 'magnum-heavy-barrel', 'magnum-cylinder'],
  },
  'machine-pistol': {
    sightHeight: 0.17, adsX: -0.36, adsY: 0.278, adsZ: -0.08, projectionCorrection: 0,
    flashScale: 0.76, recoilTranslation: 0.12, recoilRotation: 0.22,
    actionTravel: 0.11, smokeBase: 1,
    requiredDetails: ['pistol-rear-sight', 'pistol-front-sight', 'pistol-magazine', 'pistol-slide', 'pistol-trigger-guard', 'auto-selector', 'machine-pistol-compensator', 'machine-pistol-charging-wings'],
  },
};

const PROFILES: Record<WeaponId, WeaponFamilyPresentation> = {
  ...BASE_PROFILES,
  'mini-uzi': { ...BASE_PROFILES.smg, flashScale: 0.82, recoilTranslation: 0.11, requiredDetails: [...BASE_PROFILES.smg.requiredDetails, 'mini-uzi-compact-stock'] },
  mp5: { ...BASE_PROFILES.smg, flashScale: 0.72, recoilTranslation: 0.09, requiredDetails: [...BASE_PROFILES.smg.requiredDetails, 'mp5-diode-sight'] },
  m4a1: { ...BASE_PROFILES.carbine, flashScale: 0.96, requiredDetails: [...BASE_PROFILES.carbine.requiredDetails, 'm4a1-handguard'] },
  'ak-47': { ...BASE_PROFILES.carbine, flashScale: 1.16, recoilTranslation: 0.17, requiredDetails: [...BASE_PROFILES.carbine.requiredDetails, 'ak-gas-tube'] },
  minigun: { ...BASE_PROFILES.lmg, flashScale: 1.25, recoilTranslation: 0.18, smokeBase: 2.2, requiredDetails: ['minigun-barrel-cluster', 'minigun-ammo-drum', 'minigun-carry-frame', 'bolt-or-slide'] },
  'm14-ebr': { ...BASE_PROFILES.sniper, flashScale: 1.08, recoilTranslation: 0.18, requiredDetails: [...BASE_PROFILES.sniper.requiredDetails, 'm14-thermal-optic'] },
  'slug-shotgun': { ...BASE_PROFILES.scattergun, flashScale: 1.32, recoilTranslation: 0.23, requiredDetails: [...BASE_PROFILES.scattergun.requiredDetails, 'slug-saddle'] },
  'flashlight-pistol': { ...BASE_PROFILES.pistol, flashScale: 1.3, recoilTranslation: 0.15, smokeBase: 1.5, requiredDetails: [...BASE_PROFILES.pistol.requiredDetails, 'always-on-flashlight'] },
  'explosive-crossbow': { ...BASE_PROFILES.pistol, sightHeight: 0.2, flashScale: 0, recoilTranslation: 0.05, smokeBase: 0, requiredDetails: ['crossbow-limb-left', 'crossbow-limb-right', 'crossbow-string', 'bolt-rail'] },
  flamethrower: { ...BASE_PROFILES.lmg, sightHeight: 0.18, adsY: 0.22, flashScale: 1.8, recoilTranslation: 0.06, recoilRotation: 0.08, actionTravel: 0.03, smokeBase: 3.4, requiredDetails: ['flamethrower-fuel-tank-left', 'flamethrower-fuel-tank-right', 'flamethrower-hose', 'flamethrower-igniter', 'flamethrower-heat-shield', 'bolt-or-slide'] },
  'crimson-flamethrower': { ...BASE_PROFILES.lmg, sightHeight: 0.18, adsY: 0.22, flashScale: 1.8, recoilTranslation: 0.06, recoilRotation: 0.08, actionTravel: 0.03, smokeBase: 3.4, requiredDetails: ['flamethrower-fuel-tank-left', 'flamethrower-fuel-tank-right', 'flamethrower-hose', 'flamethrower-igniter', 'flamethrower-heat-shield', 'bolt-or-slide'] },
  'flare-gun': { ...BASE_PROFILES.pistol, sightHeight: 0.16, adsY: 0.286, flashScale: 0.9, recoilTranslation: 0.1, actionTravel: 0.14, smokeBase: 1.2, requiredDetails: ['flare-gun-break-barrel', 'flare-gun-latch', 'flare-gun-front-sight', 'flare-gun-rear-sight', 'flare-gun-trigger-guard', 'bolt-or-slide'] },
};

export function weaponFamilyPresentation(weapon: WeaponId): WeaponFamilyPresentation {
  return PROFILES[weapon];
}

export function centeredSightY(weapon: WeaponId, rootY = -0.38, viewScale = 0.6): number {
  const profile = weaponFamilyPresentation(weapon);
  return rootY + profile.adsY + profile.sightHeight * viewScale + profile.projectionCorrection;
}
