import type { WeaponId } from '../protocol';
import { parseWeaponDefinitions, type WeaponDefinition } from './weapon-schema';

export const MINIGUN_PRE_PASS65_BASE_DAMAGE = 15;
export const MINIGUN_PRE_PASS65_MINIMUM_DAMAGE = 11.25;
export const MINIGUN_PASS65_DAMAGE_MULTIPLIER = 0.75;

/** Pass 64 insertion order is observable through Object.keys/Object.values consumers. */
export const LEGACY_WEAPON_ENUMERATION_ORDER = Object.freeze([
  'carbine',
  'smg',
  'lmg',
  'scattergun',
  'sniper',
  'railgun',
  'pistol',
  'magnum',
  'machine-pistol',
  'mini-uzi',
  'mp5',
  'm4a1',
  'ak-47',
  'minigun',
  'm14-ebr',
  'slug-shotgun',
  'flashlight-pistol',
  'explosive-crossbow',
  'flamethrower',
  'flare-gun',
  // HF-334: appended, never inserted - the legacy enumeration order is an
  // observable Pass 64 contract and every existing index must stay put.
  'crimson-flamethrower',
] as const satisfies readonly WeaponId[]);

const RAW_B1_WEAPON_DEFINITIONS = [
  {
    id: 'carbine', displayName: 'HK416', slot: 'primary', family: 'assault-rifle',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 650, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 31, minimum: 20, falloffStartM: 24, falloffEndM: 72, headMultiplier: 1.5, limbMultiplier: 0.82 },
    spread: { hipRadians: 0.012, adsMultiplier: 0.28, movementMultiplier: 1.65, standMultiplier: 1, crouchMultiplier: 0.78, proneMultiplier: 0.65, sustainedPerShot: 0.0016, maximumRadians: 0.045 },
    recoil: { pitchRadians: 0.016, yawRadians: 0.006, recoveryPerSecond: 12, adsMultiplier: 0.72, standMultiplier: 1, crouchMultiplier: 0.84, proneMultiplier: 0.65, deterministicPatternId: 'carbine-pattern-v1' },
    ammo: { magazine: 30, reserve: 120, reloadSeconds: 1.8, emptyReloadSeconds: 2.05, switchSeconds: 0.48 },
    penetration: { calibreLabel: '5.56 mm', power: 5.8, fmjMultiplier: 1.12, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 20, energyFalloffEndM: 76, minimumEnergyRetention: 0.48, minimumWallDamageMultiplier: 0.34, maximumSurfaces: 2 },
    effects: { tracerColorHex: 0xffd166, muzzleFlashScale: 1, reportGain: 1, flashlight: null },
    optic: { kind: 'standard', magnification: 1.25, solidOcclusion: 'required' }, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'station', stationId: 'range-carbine' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'carbine-model-set-v1', presentationId: 'carbine-view-v1', audioId: 'carbine-audio-v1', provenanceId: 'carbine-provenance-v1', evidenceIds: ['r232-carbine'],
  },
  {
    id: 'smg', displayName: 'FN P90', slot: 'primary', family: 'smg',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 860, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 23, minimum: 14, falloffStartM: 15, falloffEndM: 52, headMultiplier: 1.5, limbMultiplier: 0.8 },
    spread: { hipRadians: 0.018, adsMultiplier: 0.42, movementMultiplier: 1.45, standMultiplier: 1, crouchMultiplier: 0.82, proneMultiplier: 0.72, sustainedPerShot: 0.0021, maximumRadians: 0.058 },
    recoil: { pitchRadians: 0.011, yawRadians: 0.009, recoveryPerSecond: 15, adsMultiplier: 0.78, standMultiplier: 1, crouchMultiplier: 0.88, proneMultiplier: 0.72, deterministicPatternId: 'smg-pattern-v1' },
    ammo: { magazine: 32, reserve: 128, reloadSeconds: 1.5, emptyReloadSeconds: 1.75, switchSeconds: 0.4 },
    penetration: { calibreLabel: '9 mm', power: 3.05, fmjMultiplier: 1.08, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 8, energyFalloffEndM: 38, minimumEnergyRetention: 0.22, minimumWallDamageMultiplier: 0.22, maximumSurfaces: 1 },
    effects: { tracerColorHex: 0x65e7ff, muzzleFlashScale: 0.78, reportGain: 0.86, flashlight: null },
    optic: null, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'station', stationId: 'range-smg' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'smg-model-set-v1', presentationId: 'smg-view-v1', audioId: 'smg-audio-v1', provenanceId: 'smg-provenance-v1', evidenceIds: ['r232-smg'],
  },
  {
    id: 'lmg', displayName: 'M249 SAW', slot: 'primary', family: 'lmg',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 720, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 27, minimum: 18, falloffStartM: 30, falloffEndM: 82, headMultiplier: 1.5, limbMultiplier: 0.82 },
    spread: { hipRadians: 0.022, adsMultiplier: 0.34, movementMultiplier: 1.78, standMultiplier: 1, crouchMultiplier: 0.7, proneMultiplier: 0.6, sustainedPerShot: 0.0025, maximumRadians: 0.064 },
    recoil: { pitchRadians: 0.019, yawRadians: 0.01, recoveryPerSecond: 10, adsMultiplier: 0.76, standMultiplier: 1, crouchMultiplier: 0.8, proneMultiplier: 0.6, deterministicPatternId: 'lmg-pattern-v1' },
    ammo: { magazine: 62, reserve: 186, reloadSeconds: 3.25, emptyReloadSeconds: 3.6, switchSeconds: 0.78 },
    penetration: { calibreLabel: '7.62 mm', power: 6.9, fmjMultiplier: 1.14, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 30, energyFalloffEndM: 90, minimumEnergyRetention: 0.58, minimumWallDamageMultiplier: 0.4, maximumSurfaces: 2 },
    effects: { tracerColorHex: 0x9fda72, muzzleFlashScale: 1.14, reportGain: 1.06, flashlight: null },
    optic: { kind: 'standard', magnification: 1.25, solidOcclusion: 'required' }, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'station', stationId: 'range-lmg' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'lmg-model-set-v1', presentationId: 'lmg-view-v1', audioId: 'lmg-audio-v1', provenanceId: 'lmg-provenance-v1', evidenceIds: ['r232-lmg'],
  },
  {
    id: 'scattergun', displayName: 'Remington 870', slot: 'primary', family: 'shotgun',
    // Pump cadence lifted so the one-range specialist is not strictly worse
    // than every SMG inside its own 10-38m bracket.
    fireKind: 'pellet', fireMode: 'semi', rpm: 95, pellets: 9, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 13, minimum: 5, falloffStartM: 10, falloffEndM: 38, headMultiplier: 1.35, limbMultiplier: 0.86 },
    spread: { hipRadians: 0.082, adsMultiplier: 0.74, movementMultiplier: 1.24, standMultiplier: 1, crouchMultiplier: 0.88, proneMultiplier: 0.8, sustainedPerShot: 0.0024, maximumRadians: 0.112 },
    recoil: { pitchRadians: 0.052, yawRadians: 0.012, recoveryPerSecond: 8, adsMultiplier: 0.84, standMultiplier: 1, crouchMultiplier: 0.9, proneMultiplier: 0.8, deterministicPatternId: 'scattergun-pattern-v1' },
    ammo: { magazine: 8, reserve: 40, reloadSeconds: 2.35, emptyReloadSeconds: 2.7, switchSeconds: 0.62 },
    penetration: { calibreLabel: '12 ga pellet', power: 2.15, fmjMultiplier: 1, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 4, energyFalloffEndM: 20, minimumEnergyRetention: 0.16, minimumWallDamageMultiplier: 0.18, maximumSurfaces: 1 },
    effects: { tracerColorHex: 0xff8a5b, muzzleFlashScale: 1.45, reportGain: 1.14, flashlight: null },
    optic: null, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'station', stationId: 'range-scattergun' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'scattergun-model-set-v1', presentationId: 'scattergun-view-v1', audioId: 'scattergun-audio-v1', provenanceId: 'scattergun-provenance-v1', evidenceIds: ['r232-scattergun'],
  },
  {
    id: 'sniper', displayName: 'M40A5', slot: 'primary', family: 'marksman',
    fireKind: 'hitscan', fireMode: 'semi', rpm: 55, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 67, minimum: 67, falloffStartM: 96, falloffEndM: 120, headMultiplier: 3, limbMultiplier: 0.9 },
    spread: { hipRadians: 0.052, adsMultiplier: 0.05, movementMultiplier: 1.8, standMultiplier: 1, crouchMultiplier: 0.72, proneMultiplier: 0.52, sustainedPerShot: 0.004, maximumRadians: 0.07 },
    recoil: { pitchRadians: 0.072, yawRadians: 0.016, recoveryPerSecond: 6.5, adsMultiplier: 0.6, standMultiplier: 1, crouchMultiplier: 0.76, proneMultiplier: 0.52, deterministicPatternId: 'sniper-pattern-v1' },
    ammo: { magazine: 5, reserve: 25, reloadSeconds: 2.6, emptyReloadSeconds: 2.9, switchSeconds: 0.68 },
    penetration: { calibreLabel: '7.62 mm', power: 9.4, fmjMultiplier: 1.16, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 58, energyFalloffEndM: 120, minimumEnergyRetention: 0.7, minimumWallDamageMultiplier: 0.48, maximumSurfaces: 3 },
    effects: { tracerColorHex: 0xa9e7ff, muzzleFlashScale: 1.22, reportGain: 1.12, flashlight: null },
    optic: { kind: 'standard', magnification: 4, solidOcclusion: 'required' }, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'station', stationId: 'range-sniper' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'sniper-model-set-v1', presentationId: 'sniper-view-v1', audioId: 'sniper-audio-v1', provenanceId: 'sniper-provenance-v1', evidenceIds: ['r232-sniper'],
  },
  {
    id: 'railgun', displayName: 'EMRG Railgun', slot: 'special', family: 'marksman',
    fireKind: 'hitscan', fireMode: 'semi', rpm: 40, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 50, minimum: 50, falloffStartM: 512, falloffEndM: 512, headMultiplier: 1, limbMultiplier: 1 },
    spread: { hipRadians: 0.035, adsMultiplier: 0, movementMultiplier: 1, standMultiplier: 1, crouchMultiplier: 1, proneMultiplier: 1, sustainedPerShot: 0, maximumRadians: 0.035 },
    recoil: { pitchRadians: 0.085, yawRadians: 0, recoveryPerSecond: 5.8, adsMultiplier: 1, standMultiplier: 1, crouchMultiplier: 1, proneMultiplier: 1, deterministicPatternId: 'railgun-pattern-v1' },
    ammo: { magazine: 8, reserve: 0, reloadSeconds: 1.5, emptyReloadSeconds: 1.75, switchSeconds: 0.72 },
    penetration: { calibreLabel: 'electromagnetic sabot', power: 100_000, fmjMultiplier: 1, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 512, energyFalloffEndM: 513, minimumEnergyRetention: 1, minimumWallDamageMultiplier: 1, maximumSurfaces: 64 },
    effects: { tracerColorHex: 0x7df8ff, muzzleFlashScale: 1.5, reportGain: 1.2, flashlight: null },
    optic: { kind: 'special-authority', magnification: 2.5, solidOcclusion: 'required', authorityPolicyId: 'host-railgun-v1' }, projectileId: null,
    policies: { loadout: 'pickup-only', bot: 'never', drop: 'map-pickup', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-railgun-v1' },
    modelSetId: 'railgun-model-set-v1', presentationId: 'railgun-view-v1', audioId: 'railgun-audio-v1', provenanceId: 'railgun-provenance-v1', evidenceIds: ['r232-railgun'],
  },
  {
    id: 'pistol', displayName: 'Glock 17', slot: 'secondary', family: 'sidearm',
    fireKind: 'hitscan', fireMode: 'semi', rpm: 420, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 36, minimum: 22, falloffStartM: 20, falloffEndM: 58, headMultiplier: 1.5, limbMultiplier: 0.84 },
    spread: { hipRadians: 0.02, adsMultiplier: 0.34, movementMultiplier: 1.42, standMultiplier: 1, crouchMultiplier: 0.8, proneMultiplier: 0.7, sustainedPerShot: 0.0024, maximumRadians: 0.052 },
    recoil: { pitchRadians: 0.021, yawRadians: 0.008, recoveryPerSecond: 14, adsMultiplier: 0.74, standMultiplier: 1, crouchMultiplier: 0.86, proneMultiplier: 0.7, deterministicPatternId: 'pistol-pattern-v1' },
    ammo: { magazine: 15, reserve: 60, reloadSeconds: 1.35, emptyReloadSeconds: 1.55, switchSeconds: 0.28 },
    penetration: { calibreLabel: '9 mm', power: 3.65, fmjMultiplier: 1.08, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 12, energyFalloffEndM: 48, minimumEnergyRetention: 0.3, minimumWallDamageMultiplier: 0.26, maximumSurfaces: 1 },
    effects: { tracerColorHex: 0xe8c77b, muzzleFlashScale: 0.7, reportGain: 0.82, flashlight: null },
    optic: null, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'companion-sidearm', primaryIds: ['carbine', 'smg', 'lmg', 'scattergun'] }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'pistol-model-set-v1', presentationId: 'pistol-view-v1', audioId: 'pistol-audio-v1', provenanceId: 'pistol-provenance-v1', evidenceIds: ['r232-pistol'],
  },
  {
    id: 'magnum', displayName: 'Desert Eagle .50 AE', slot: 'secondary', family: 'sidearm',
    fireKind: 'hitscan', fireMode: 'semi', rpm: 90, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 52, minimum: 34, falloffStartM: 18, falloffEndM: 55, headMultiplier: 1.9, limbMultiplier: 0.75 },
    spread: { hipRadians: 0.026, adsMultiplier: 0.3, movementMultiplier: 1.5, standMultiplier: 1, crouchMultiplier: 0.8, proneMultiplier: 0.68, sustainedPerShot: 0.006, maximumRadians: 0.06 },
    recoil: { pitchRadians: 0.05, yawRadians: 0.012, recoveryPerSecond: 8, adsMultiplier: 0.74, standMultiplier: 1, crouchMultiplier: 0.84, proneMultiplier: 0.68, deterministicPatternId: 'magnum-pattern-v1' },
    ammo: { magazine: 6, reserve: 30, reloadSeconds: 1.75, emptyReloadSeconds: 2, switchSeconds: 0.34 },
    penetration: { calibreLabel: '.50 AE', power: 4.7, fmjMultiplier: 1.08, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 30, energyFalloffEndM: 82, minimumEnergyRetention: 0.4, minimumWallDamageMultiplier: 0.3, maximumSurfaces: 1 },
    effects: { tracerColorHex: 0xffd36a, muzzleFlashScale: 1.12, reportGain: 1.2, flashlight: null },
    optic: null, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'companion-sidearm', primaryIds: ['carbine', 'smg', 'lmg', 'scattergun', 'sniper'] }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'magnum-model-set-v1', presentationId: 'magnum-view-v1', audioId: 'magnum-audio-v1', provenanceId: 'magnum-provenance-v1', evidenceIds: ['r232-magnum'],
  },
  {
    id: 'machine-pistol', displayName: 'Glock 18', slot: 'secondary', family: 'sidearm',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 900, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 18, minimum: 11, falloffStartM: 11, falloffEndM: 34, headMultiplier: 1.5, limbMultiplier: 0.8 },
    spread: { hipRadians: 0.026, adsMultiplier: 0.46, movementMultiplier: 1.55, standMultiplier: 1, crouchMultiplier: 0.82, proneMultiplier: 0.78, sustainedPerShot: 0.0032, maximumRadians: 0.072 },
    recoil: { pitchRadians: 0.014, yawRadians: 0.012, recoveryPerSecond: 13, adsMultiplier: 0.82, standMultiplier: 1, crouchMultiplier: 0.9, proneMultiplier: 0.78, deterministicPatternId: 'machine-pistol-pattern-v1' },
    ammo: { magazine: 20, reserve: 80, reloadSeconds: 1.55, emptyReloadSeconds: 1.75, switchSeconds: 0.3 },
    penetration: { calibreLabel: '9 mm', power: 2.75, fmjMultiplier: 1.06, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 6, energyFalloffEndM: 30, minimumEnergyRetention: 0.18, minimumWallDamageMultiplier: 0.2, maximumSurfaces: 1 },
    effects: { tracerColorHex: 0xff9f43, muzzleFlashScale: 0.76, reportGain: 0.84, flashlight: null },
    optic: null, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'companion-sidearm', primaryIds: ['sniper'] }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'machine-pistol-model-set-v1', presentationId: 'machine-pistol-view-v1', audioId: 'machine-pistol-audio-v1', provenanceId: 'machine-pistol-provenance-v1', evidenceIds: ['r232-machine-pistol'],
  },
  {
    id: 'mini-uzi', displayName: 'Mini Uzi', slot: 'primary', family: 'smg',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 1_050, pellets: 1, spinUpMs: 0, movementMultiplier: 1.05,
    damage: { policy: 'standard', base: 19, minimum: 8, falloffStartM: 9, falloffEndM: 36, headMultiplier: 1.45, limbMultiplier: 0.78 },
    spread: { hipRadians: 0.022, adsMultiplier: 0.5, movementMultiplier: 1.35, standMultiplier: 1, crouchMultiplier: 0.86, proneMultiplier: 0.76, sustainedPerShot: 0.003, maximumRadians: 0.078 },
    recoil: { pitchRadians: 0.013, yawRadians: 0.013, recoveryPerSecond: 14, adsMultiplier: 0.84, standMultiplier: 1, crouchMultiplier: 0.9, proneMultiplier: 0.78, deterministicPatternId: 'mini-uzi-pattern-v1' },
    ammo: { magazine: 32, reserve: 128, reloadSeconds: 1.55, emptyReloadSeconds: 1.8, switchSeconds: 0.34 },
    penetration: { calibreLabel: '9 mm', power: 2.35, fmjMultiplier: 1.05, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 5, energyFalloffEndM: 26, minimumEnergyRetention: 0.14, minimumWallDamageMultiplier: 0.18, maximumSurfaces: 1 },
    effects: { tracerColorHex: 0xffb25b, muzzleFlashScale: 0.82, reportGain: 0.86, flashlight: null },
    optic: null, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'mini-uzi-model-set-v1', presentationId: 'mini-uzi-family-view-v1', audioId: 'mini-uzi-audio-v1', provenanceId: 'mini-uzi-procedural-cc0-v1', evidenceIds: ['r220-mini-uzi', 'r232-mini-uzi'],
  },
  {
    id: 'mp5', displayName: 'MP5', slot: 'primary', family: 'smg',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 800, pellets: 1, spinUpMs: 0, movementMultiplier: 1.02,
    damage: { policy: 'standard', base: 25, minimum: 16, falloffStartM: 18, falloffEndM: 58, headMultiplier: 1.5, limbMultiplier: 0.82 },
    spread: { hipRadians: 0.016, adsMultiplier: 0.34, movementMultiplier: 1.38, standMultiplier: 1, crouchMultiplier: 0.8, proneMultiplier: 0.7, sustainedPerShot: 0.0017, maximumRadians: 0.052 },
    recoil: { pitchRadians: 0.01, yawRadians: 0.0065, recoveryPerSecond: 16, adsMultiplier: 0.72, standMultiplier: 1, crouchMultiplier: 0.84, proneMultiplier: 0.7, deterministicPatternId: 'mp5-pattern-v1' },
    ammo: { magazine: 30, reserve: 120, reloadSeconds: 1.65, emptyReloadSeconds: 1.9, switchSeconds: 0.38 },
    penetration: { calibreLabel: '9 mm', power: 3.15, fmjMultiplier: 1.08, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 10, energyFalloffEndM: 44, minimumEnergyRetention: 0.24, minimumWallDamageMultiplier: 0.23, maximumSurfaces: 1 },
    effects: { tracerColorHex: 0x66e6c7, muzzleFlashScale: 0.72, reportGain: 0.82, flashlight: null },
    optic: { kind: 'standard', magnification: 1.2, solidOcclusion: 'required' }, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'mp5-model-set-v1', presentationId: 'mp5-family-view-v1', audioId: 'mp5-audio-v1', provenanceId: 'mp5-procedural-cc0-v1', evidenceIds: ['r221-mp5', 'r232-mp5'],
  },
  {
    id: 'm4a1', displayName: 'M4A1', slot: 'primary', family: 'assault-rifle',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 700, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 29, minimum: 19, falloffStartM: 26, falloffEndM: 78, headMultiplier: 1.5, limbMultiplier: 0.82 },
    spread: { hipRadians: 0.011, adsMultiplier: 0.27, movementMultiplier: 1.58, standMultiplier: 1, crouchMultiplier: 0.76, proneMultiplier: 0.64, sustainedPerShot: 0.0014, maximumRadians: 0.042 },
    recoil: { pitchRadians: 0.014, yawRadians: 0.005, recoveryPerSecond: 13.5, adsMultiplier: 0.7, standMultiplier: 1, crouchMultiplier: 0.82, proneMultiplier: 0.64, deterministicPatternId: 'm4a1-pattern-v1' },
    ammo: { magazine: 30, reserve: 120, reloadSeconds: 1.75, emptyReloadSeconds: 2, switchSeconds: 0.46 },
    penetration: { calibreLabel: '5.56 mm', power: 5.7, fmjMultiplier: 1.12, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 22, energyFalloffEndM: 78, minimumEnergyRetention: 0.47, minimumWallDamageMultiplier: 0.34, maximumSurfaces: 2 },
    effects: { tracerColorHex: 0xffd98c, muzzleFlashScale: 0.96, reportGain: 0.96, flashlight: null },
    optic: { kind: 'standard', magnification: 1.25, solidOcclusion: 'required' }, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'm4a1-model-set-v1', presentationId: 'm4a1-family-view-v1', audioId: 'm4a1-audio-v1', provenanceId: 'm4a1-procedural-cc0-v1', evidenceIds: ['r225-m4a1', 'r232-m4a1'],
  },
  {
    id: 'ak-47', displayName: 'AK-47', slot: 'primary', family: 'assault-rifle',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 600, pellets: 1, spinUpMs: 0, movementMultiplier: 0.96,
    damage: { policy: 'standard', base: 35, minimum: 22, falloffStartM: 28, falloffEndM: 86, headMultiplier: 1.5, limbMultiplier: 0.82 },
    spread: { hipRadians: 0.015, adsMultiplier: 0.32, movementMultiplier: 1.7, standMultiplier: 1, crouchMultiplier: 0.78, proneMultiplier: 0.62, sustainedPerShot: 0.0021, maximumRadians: 0.054 },
    recoil: { pitchRadians: 0.021, yawRadians: 0.009, recoveryPerSecond: 10, adsMultiplier: 0.76, standMultiplier: 1, crouchMultiplier: 0.82, proneMultiplier: 0.62, deterministicPatternId: 'ak-47-pattern-v1' },
    ammo: { magazine: 30, reserve: 120, reloadSeconds: 2.05, emptyReloadSeconds: 2.35, switchSeconds: 0.54 },
    penetration: { calibreLabel: '7.62x39 mm', power: 7.35, fmjMultiplier: 1.15, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 30, energyFalloffEndM: 94, minimumEnergyRetention: 0.6, minimumWallDamageMultiplier: 0.42, maximumSurfaces: 2 },
    effects: { tracerColorHex: 0xffad66, muzzleFlashScale: 1.16, reportGain: 1.12, flashlight: null },
    optic: { kind: 'standard', magnification: 1.15, solidOcclusion: 'required' }, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'ak-47-model-set-v1', presentationId: 'ak-47-family-view-v1', audioId: 'ak-47-audio-v1', provenanceId: 'ak-47-procedural-cc0-v1', evidenceIds: ['r226-ak-47', 'r232-ak-47'],
  },
  {
    id: 'minigun', displayName: 'M134 Minigun', slot: 'primary', family: 'lmg',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 1_200, pellets: 1, spinUpMs: 1_200, movementMultiplier: 0.8,
    damage: { policy: 'standard', base: MINIGUN_PRE_PASS65_BASE_DAMAGE * MINIGUN_PASS65_DAMAGE_MULTIPLIER, minimum: MINIGUN_PRE_PASS65_MINIMUM_DAMAGE * MINIGUN_PASS65_DAMAGE_MULTIPLIER, falloffStartM: 24, falloffEndM: 74, headMultiplier: 1, limbMultiplier: 0.85 },
    spread: { hipRadians: 0.026, adsMultiplier: 0.7, movementMultiplier: 1.8, standMultiplier: 1, crouchMultiplier: 0.82, proneMultiplier: 0.72, sustainedPerShot: 0.0012, maximumRadians: 0.06 },
    recoil: { pitchRadians: 0.008, yawRadians: 0.008, recoveryPerSecond: 14, adsMultiplier: 0.9, standMultiplier: 1, crouchMultiplier: 0.86, proneMultiplier: 0.72, deterministicPatternId: 'minigun-pattern-v1' },
    ammo: { magazine: 240, reserve: 480, reloadSeconds: 5.4, emptyReloadSeconds: 5.8, switchSeconds: 1.05 },
    penetration: { calibreLabel: '7.62 mm', power: 6.5, fmjMultiplier: 1.12, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 24, energyFalloffEndM: 82, minimumEnergyRetention: 0.52, minimumWallDamageMultiplier: 0.38, maximumSurfaces: 2 },
    effects: { tracerColorHex: 0xffef9a, muzzleFlashScale: 1.25, reportGain: 1.04, flashlight: null },
    optic: null, projectileId: null,
    policies: { loadout: 'eligible', bot: 'diagnostic-only', drop: 'droppable', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'minigun-model-set-v1', presentationId: 'minigun-family-view-v1', audioId: 'minigun-audio-v1', provenanceId: 'minigun-procedural-cc0-v1', evidenceIds: ['r228-minigun', 'r232-minigun'],
  },
  {
    id: 'm14-ebr', displayName: 'M14 EBR', slot: 'primary', family: 'marksman',
    fireKind: 'hitscan', fireMode: 'semi', rpm: 37, pellets: 1, spinUpMs: 0, movementMultiplier: 0.94,
    // Pass 72 balance correction: reduce the complete damage envelope by
    // exactly 40%; range and hit-zone multipliers remain authored unchanged.
    damage: { policy: 'standard', base: 37.2, minimum: 24, falloffStartM: 38, falloffEndM: 100, headMultiplier: 1.7, limbMultiplier: 0.82 },
    spread: { hipRadians: 0.032, adsMultiplier: 0.08, movementMultiplier: 1.85, standMultiplier: 1, crouchMultiplier: 0.7, proneMultiplier: 0.5, sustainedPerShot: 0.004, maximumRadians: 0.062 },
    recoil: { pitchRadians: 0.045, yawRadians: 0.012, recoveryPerSecond: 7.5, adsMultiplier: 0.62, standMultiplier: 1, crouchMultiplier: 0.74, proneMultiplier: 0.5, deterministicPatternId: 'm14-ebr-pattern-v1' },
    ammo: { magazine: 20, reserve: 80, reloadSeconds: 2.35, emptyReloadSeconds: 2.65, switchSeconds: 0.66 },
    penetration: { calibreLabel: '7.62 mm', power: 0.55, fmjMultiplier: 1.16, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 45, energyFalloffEndM: 112, minimumEnergyRetention: 0.68, minimumWallDamageMultiplier: 0.12, maximumSurfaces: 1 },
    effects: { tracerColorHex: 0x9ceaff, muzzleFlashScale: 1.08, reportGain: 1.08, flashlight: null },
    optic: { kind: 'thermal-smoke-only', magnification: 2.5, solidOcclusion: 'required', targetPolicy: 'living-targets-through-smoke', authority: 'presentation-only' }, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'm14-ebr-model-set-v1', presentationId: 'm14-ebr-family-view-v1', audioId: 'm14-ebr-audio-v1', provenanceId: 'm14-ebr-procedural-cc0-v1', evidenceIds: ['r229-m14-ebr', 'r232-m14-ebr'],
  },
  {
    id: 'slug-shotgun', displayName: 'Benelli M4 Slug', slot: 'primary', family: 'shotgun',
    fireKind: 'slug', fireMode: 'semi', rpm: 85, pellets: 1, spinUpMs: 0, movementMultiplier: 0.96,
    damage: { policy: 'standard', base: 88, minimum: 45, falloffStartM: 20, falloffEndM: 72, headMultiplier: 1.35, limbMultiplier: 0.72 },
    spread: { hipRadians: 0.025, adsMultiplier: 0.16, movementMultiplier: 1.72, standMultiplier: 1, crouchMultiplier: 0.72, proneMultiplier: 0.62, sustainedPerShot: 0.006, maximumRadians: 0.052 },
    recoil: { pitchRadians: 0.082, yawRadians: 0.015, recoveryPerSecond: 5.5, adsMultiplier: 0.68, standMultiplier: 1, crouchMultiplier: 0.78, proneMultiplier: 0.62, deterministicPatternId: 'slug-shotgun-pattern-v1' },
    ammo: { magazine: 8, reserve: 32, reloadSeconds: 2.55, emptyReloadSeconds: 2.9, switchSeconds: 0.68 },
    penetration: { calibreLabel: '12 ga slug', power: 8.1, fmjMultiplier: 1.1, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 18, energyFalloffEndM: 78, minimumEnergyRetention: 0.62, minimumWallDamageMultiplier: 0.45, maximumSurfaces: 2 },
    effects: { tracerColorHex: 0xffbd78, muzzleFlashScale: 1.35, reportGain: 1.16, flashlight: null },
    optic: { kind: 'standard', magnification: 1.35, solidOcclusion: 'required' }, projectileId: null,
    policies: { loadout: 'eligible', bot: 'eligible', drop: 'droppable', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'slug-shotgun-model-set-v1', presentationId: 'slug-shotgun-family-view-v1', audioId: 'slug-shotgun-audio-v1', provenanceId: 'slug-shotgun-procedural-cc0-v1', evidenceIds: ['r230-slug-shotgun', 'r231-scatter-comparator', 'r232-slug-shotgun'],
  },
  {
    id: 'flashlight-pistol', displayName: 'HK USP .45 Tactical', slot: 'secondary', family: 'sidearm',
    fireKind: 'hitscan', fireMode: 'semi', rpm: 300, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 45, minimum: 28, falloffStartM: 18, falloffEndM: 56, headMultiplier: 1.5, limbMultiplier: 0.82 },
    spread: { hipRadians: 0.022, adsMultiplier: 0.32, movementMultiplier: 1.48, standMultiplier: 1, crouchMultiplier: 0.8, proneMultiplier: 0.7, sustainedPerShot: 0.003, maximumRadians: 0.055 },
    recoil: { pitchRadians: 0.032, yawRadians: 0.01, recoveryPerSecond: 10, adsMultiplier: 0.72, standMultiplier: 1, crouchMultiplier: 0.84, proneMultiplier: 0.7, deterministicPatternId: 'flashlight-pistol-pattern-v1' },
    ammo: { magazine: 10, reserve: 50, reloadSeconds: 1.5, emptyReloadSeconds: 1.75, switchSeconds: 0.3 },
    penetration: { calibreLabel: '.45 ACP', power: 4.1, fmjMultiplier: 1.08, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 14, energyFalloffEndM: 52, minimumEnergyRetention: 0.34, minimumWallDamageMultiplier: 0.28, maximumSurfaces: 1 },
    effects: { tracerColorHex: 0xffd7a1, muzzleFlashScale: 1.08, reportGain: 1.4, flashlight: { kind: 'always-on', colorHex: 0xe6f4ff, intensity: 8, rangeM: 18, coneAngleRadians: 0.42, solidOcclusion: 'required' } },
    optic: null, projectileId: null,
    policies: { loadout: 'eligible', bot: 'diagnostic-only', drop: 'droppable', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'flashlight-pistol-model-set-v1', presentationId: 'flashlight-pistol-family-view-v1', audioId: 'flashlight-pistol-audio-v1', provenanceId: 'flashlight-pistol-procedural-cc0-v1', evidenceIds: ['r222-flashlight-pistol', 'r232-flashlight-pistol'],
  },
  {
    id: 'explosive-crossbow', displayName: 'TAC-15 Explosive Crossbow', slot: 'secondary', family: 'launcher',
    fireKind: 'projectile', fireMode: 'semi', rpm: 36, pellets: 1, spinUpMs: 0, movementMultiplier: 0.94,
    damage: { policy: 'standard', base: 45, minimum: 45, falloffStartM: 120, falloffEndM: 121, headMultiplier: 1, limbMultiplier: 1 },
    spread: { hipRadians: 0.028, adsMultiplier: 0.12, movementMultiplier: 1.8, standMultiplier: 1, crouchMultiplier: 0.72, proneMultiplier: 0.58, sustainedPerShot: 0, maximumRadians: 0.028 },
    recoil: { pitchRadians: 0.024, yawRadians: 0.004, recoveryPerSecond: 8, adsMultiplier: 0.72, standMultiplier: 1, crouchMultiplier: 0.82, proneMultiplier: 0.58, deterministicPatternId: 'explosive-crossbow-pattern-v1' },
    ammo: { magazine: 1, reserve: 8, reloadSeconds: 2.45, emptyReloadSeconds: 2.45, switchSeconds: 0.58 },
    penetration: { calibreLabel: 'explosive bolt', power: 0, fmjMultiplier: 1, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 0, energyFalloffEndM: 1, minimumEnergyRetention: 0, minimumWallDamageMultiplier: 0, maximumSurfaces: 0 },
    effects: { tracerColorHex: 0xff724f, muzzleFlashScale: 0.2, reportGain: 0.5, flashlight: null },
    optic: { kind: 'standard', magnification: 1.5, solidOcclusion: 'required' }, projectileId: 'explosive-bolt-v1',
    policies: { loadout: 'eligible', bot: 'never', drop: 'droppable', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-projectile-v1' },
    modelSetId: 'explosive-crossbow-model-set-v1', presentationId: 'explosive-crossbow-family-view-v1', audioId: 'explosive-crossbow-audio-v1', provenanceId: 'explosive-crossbow-procedural-cc0-v1', evidenceIds: ['r223-explosive-crossbow', 'r232-explosive-crossbow'],
  },
  {
    id: 'flamethrower', displayName: 'M2 Flamethrower', slot: 'special', family: 'launcher',
    // The authoritative stream adapter owns the hard 18 m reach and burn volume;
    // this hitscan projection keeps current bot cadence fail-closed and deterministic.
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 600, pellets: 1, spinUpMs: 180, movementMultiplier: 0.82,
    damage: { policy: 'standard', base: 81, minimum: 0, falloffStartM: 8, falloffEndM: 18, headMultiplier: 1, limbMultiplier: 1 },
    spread: { hipRadians: 0.038, adsMultiplier: 0.72, movementMultiplier: 1.4, standMultiplier: 1, crouchMultiplier: 0.9, proneMultiplier: 0.82, sustainedPerShot: 0.0008, maximumRadians: 0.055 },
    recoil: { pitchRadians: 0.004, yawRadians: 0.003, recoveryPerSecond: 18, adsMultiplier: 0.9, standMultiplier: 1, crouchMultiplier: 0.9, proneMultiplier: 0.82, deterministicPatternId: 'flamethrower-pattern-v1' },
    ammo: { magazine: 100, reserve: 100, reloadSeconds: 3.8, emptyReloadSeconds: 4.2, switchSeconds: 0.85 },
    penetration: { calibreLabel: 'ignited fuel stream', power: 0, fmjMultiplier: 1, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 0, energyFalloffEndM: 18, minimumEnergyRetention: 0, minimumWallDamageMultiplier: 0, maximumSurfaces: 0 },
    effects: { tracerColorHex: 0xff7a24, muzzleFlashScale: 1.8, reportGain: 0.92, flashlight: null },
    optic: null, projectileId: null,
    policies: { loadout: 'pickup-only', bot: 'eligible', drop: 'map-pickup', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'flamethrower-model-set-v1', presentationId: 'flamethrower-family-view-v1', audioId: 'flamethrower-audio-v1', provenanceId: 'flamethrower-original-project-v1', evidenceIds: ['pass66-flamethrower-canonical-family'],
  },
  {
    id: 'flare-gun', displayName: 'Orion Flare Pistol', slot: 'special', family: 'launcher',
    fireKind: 'projectile', fireMode: 'semi', rpm: 24, pellets: 1, spinUpMs: 0, movementMultiplier: 1,
    damage: { policy: 'standard', base: 42, minimum: 42, falloffStartM: 45, falloffEndM: 90, headMultiplier: 1, limbMultiplier: 1 },
    spread: { hipRadians: 0.04, adsMultiplier: 0.2, movementMultiplier: 1.5, standMultiplier: 1, crouchMultiplier: 0.82, proneMultiplier: 0.72, sustainedPerShot: 0, maximumRadians: 0.04 },
    recoil: { pitchRadians: 0.035, yawRadians: 0.006, recoveryPerSecond: 8, adsMultiplier: 0.75, standMultiplier: 1, crouchMultiplier: 0.84, proneMultiplier: 0.72, deterministicPatternId: 'flare-gun-pattern-v1' },
    ammo: { magazine: 1, reserve: 5, reloadSeconds: 2.1, emptyReloadSeconds: 2.1, switchSeconds: 0.42 },
    penetration: { calibreLabel: '37 mm signal flare', power: 0, fmjMultiplier: 1, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 0, energyFalloffEndM: 1, minimumEnergyRetention: 0, minimumWallDamageMultiplier: 0, maximumSurfaces: 0 },
    effects: { tracerColorHex: 0xff3c20, muzzleFlashScale: 0.9, reportGain: 0.82, flashlight: null },
    optic: { kind: 'standard', magnification: 1.1, solidOcclusion: 'required' }, projectileId: 'signal-flare-v1',
    policies: { loadout: 'pickup-only', bot: 'eligible', drop: 'map-pickup', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-projectile-v1' },
    modelSetId: 'flare-gun-model-set-v1', presentationId: 'flare-gun-family-view-v1', audioId: 'flare-gun-audio-v1', provenanceId: 'flare-gun-original-project-v1', evidenceIds: ['pass66-flare-gun-canonical-family'],
  },
  {
    // HF-334: the care-package reward variant. A distinct weapon instance from
    // the arena-bound map flamethrower above, so a package grant never
    // cannibalises the world pickup — that cannibalisation is exactly why the
    // naive single-instance wiring was refused. Red livery; direct damage is
    // exactly 70% of the map flamethrower's 81 (owner: "30% less").
    id: 'crimson-flamethrower', displayName: 'Crimson Flamethrower', slot: 'special', family: 'launcher',
    fireKind: 'hitscan', fireMode: 'automatic', rpm: 600, pellets: 1, spinUpMs: 180, movementMultiplier: 0.82,
    damage: { policy: 'standard', base: 56.7, minimum: 0, falloffStartM: 8, falloffEndM: 18, headMultiplier: 1, limbMultiplier: 1 },
    spread: { hipRadians: 0.038, adsMultiplier: 0.72, movementMultiplier: 1.4, standMultiplier: 1, crouchMultiplier: 0.9, proneMultiplier: 0.82, sustainedPerShot: 0.0008, maximumRadians: 0.055 },
    recoil: { pitchRadians: 0.004, yawRadians: 0.003, recoveryPerSecond: 18, adsMultiplier: 0.9, standMultiplier: 1, crouchMultiplier: 0.9, proneMultiplier: 0.82, deterministicPatternId: 'crimson-flamethrower-pattern-v1' },
    // Care-package fuel load: one tank, no resupply, so the reward is powerful
    // but finite rather than a permanent upgrade.
    ammo: { magazine: 100, reserve: 0, reloadSeconds: 3.8, emptyReloadSeconds: 4.2, switchSeconds: 0.85 },
    penetration: { calibreLabel: 'ignited fuel stream', power: 0, fmjMultiplier: 1, materialPolicyId: 'pass64-ballistic-materials-v1', energyFalloffStartM: 0, energyFalloffEndM: 18, minimumEnergyRetention: 0, minimumWallDamageMultiplier: 0, maximumSurfaces: 0 },
    effects: { tracerColorHex: 0xff1f14, muzzleFlashScale: 1.8, reportGain: 0.92, flashlight: null },
    optic: null, projectileId: null,
    policies: { loadout: 'pickup-only', bot: 'never', drop: 'map-pickup', range: { kind: 'never' }, replay: 'serialized', telemetry: 'standard', stance: { stand: 'allowed', crouch: 'allowed', prone: 'allowed' }, authority: 'host-shot-v1' },
    modelSetId: 'crimson-flamethrower-model-set-v1', presentationId: 'crimson-flamethrower-family-view-v1', audioId: 'crimson-flamethrower-audio-v1', provenanceId: 'crimson-flamethrower-original-project-v1', evidenceIds: ['pass74-crimson-flamethrower-canonical-family'],
  },
] as const satisfies readonly WeaponDefinition[];

/** Canonical, schema-validated B1 definitions. Target metadata remains inert until its owning migration. */
export const WEAPON_CATALOG: readonly WeaponDefinition[] = parseWeaponDefinitions(RAW_B1_WEAPON_DEFINITIONS);

export type SustainedRecoilRank = Readonly<{
  weaponId: WeaponId;
  burden: number;
}>;

/** Angular impulse per second, normalized by authored recovery rate. */
export function sustainedRecoilBurden(definition: WeaponDefinition): number {
  const angularImpulse = Math.hypot(definition.recoil.pitchRadians, definition.recoil.yawRadians);
  return angularImpulse * (definition.rpm / 60) / definition.recoil.recoveryPerSecond;
}

export function sustainedRecoilRanking(
  definitions: readonly WeaponDefinition[] = WEAPON_CATALOG,
): readonly SustainedRecoilRank[] {
  return Object.freeze(definitions
    .map((definition) => Object.freeze({
      weaponId: definition.id as WeaponId,
      burden: sustainedRecoilBurden(definition),
    }))
    .sort((left, right) => right.burden - left.burden || left.weaponId.localeCompare(right.weaponId)));
}
