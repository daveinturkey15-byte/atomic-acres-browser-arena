import type { WeaponPenetrationProfile } from '../ballistics';
import type { WeaponId } from '../protocol';
import { LEGACY_WEAPON_ENUMERATION_ORDER, WEAPON_CATALOG } from './weapon-catalog';
import type { WeaponDefinition, WeaponEffectsProfile, WeaponFireKind, WeaponOpticProfile } from './weapon-schema';

export type LegacyWeaponSpec = Readonly<{
  id: WeaponId;
  name: string;
  damage: number;
  minimumDamage: number;
  falloffStart: number;
  falloffEnd: number;
  headMultiplier: number;
  limbMultiplier: number;
  rpm: number;
  mag: number;
  reserve: number;
  reload: number;
  hipSpread: number;
  adsSpreadMultiplier: number;
  movementSpreadMultiplier: number;
  crouchSpreadMultiplier: number;
  sustainedSpreadPerShot: number;
  maximumSpread: number;
  pellets: number;
  recoilPitch: number;
  recoilYaw: number;
  recoilRecovery: number;
  adsRecoilMultiplier: number;
  crouchRecoilMultiplier: number;
  proneRecoilMultiplier: number;
  switchSeconds: number;
  spinUpMs: number;
  movementMultiplier: number;
  automatic: boolean;
  color: number;
  muzzleFlashScale: number;
  reportGain: number;
  flashlight: WeaponEffectsProfile['flashlight'];
  fireKind: WeaponFireKind;
  optic: WeaponOpticProfile | null;
  projectileId: string | null;
  penetration: WeaponPenetrationProfile;
}>;

export type LegacyWeaponRegistry = Readonly<Record<WeaponId, LegacyWeaponSpec>>;

export class LegacyWeaponAdapterError extends Error {
  constructor(message: string) {
    super(`Invalid legacy weapon catalog: ${message}`);
    this.name = 'LegacyWeaponAdapterError';
  }
}

const LEGACY_WEAPON_IDS = new Set<string>(LEGACY_WEAPON_ENUMERATION_ORDER);

function legacyWeaponId(id: string): WeaponId {
  if (!LEGACY_WEAPON_IDS.has(id)) throw new LegacyWeaponAdapterError(`unsupported weapon id ${JSON.stringify(id)}`);
  return id as WeaponId;
}

function assertExactLegacyRoster(definitions: readonly WeaponDefinition[]): void {
  const seen = new Set<string>();
  for (const definition of definitions) {
    if (!LEGACY_WEAPON_IDS.has(definition.id)) {
      throw new LegacyWeaponAdapterError(`unsupported weapon id ${JSON.stringify(definition.id)}`);
    }
    if (seen.has(definition.id)) {
      throw new LegacyWeaponAdapterError(`duplicate weapon id ${JSON.stringify(definition.id)}`);
    }
    seen.add(definition.id);
  }
  if (definitions.length !== LEGACY_WEAPON_ENUMERATION_ORDER.length) {
    const missing = LEGACY_WEAPON_ENUMERATION_ORDER.filter((id) => !seen.has(id));
    throw new LegacyWeaponAdapterError(
      `expected ${LEGACY_WEAPON_ENUMERATION_ORDER.length} weapons, received ${definitions.length}`
      + (missing.length > 0 ? `; missing ${missing.join(', ')}` : ''),
    );
  }
  for (let index = 0; index < LEGACY_WEAPON_ENUMERATION_ORDER.length; index += 1) {
    const expected = LEGACY_WEAPON_ENUMERATION_ORDER[index];
    const actual = definitions[index]?.id;
    if (actual !== expected) {
      throw new LegacyWeaponAdapterError(
        `weapon ${index} must be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
      );
    }
  }
}

/**
 * Projects the canonical schema into the compact registry consumed by the live
 * runtime. Policy, provenance, and deterministic presentation identifiers stay
 * in the canonical catalog rather than being duplicated here.
 */
export function adaptWeaponDefinitionToLegacy(definition: WeaponDefinition): LegacyWeaponSpec {
  return Object.freeze({
    id: legacyWeaponId(definition.id),
    name: definition.displayName,
    damage: definition.damage.base,
    minimumDamage: definition.damage.minimum,
    falloffStart: definition.damage.falloffStartM,
    falloffEnd: definition.damage.falloffEndM,
    headMultiplier: definition.damage.headMultiplier,
    limbMultiplier: definition.damage.limbMultiplier,
    rpm: definition.rpm,
    mag: definition.ammo.magazine,
    reserve: definition.ammo.reserve,
    reload: definition.ammo.reloadSeconds,
    hipSpread: definition.spread.hipRadians,
    adsSpreadMultiplier: definition.spread.adsMultiplier,
    movementSpreadMultiplier: definition.spread.movementMultiplier,
    crouchSpreadMultiplier: definition.spread.crouchMultiplier,
    sustainedSpreadPerShot: definition.spread.sustainedPerShot,
    maximumSpread: definition.spread.maximumRadians,
    pellets: definition.pellets,
    recoilPitch: definition.recoil.pitchRadians,
    recoilYaw: definition.recoil.yawRadians,
    recoilRecovery: definition.recoil.recoveryPerSecond,
    adsRecoilMultiplier: definition.recoil.adsMultiplier,
    crouchRecoilMultiplier: definition.recoil.crouchMultiplier,
    proneRecoilMultiplier: definition.recoil.proneMultiplier,
    switchSeconds: definition.ammo.switchSeconds,
    spinUpMs: definition.spinUpMs,
    movementMultiplier: definition.movementMultiplier,
    automatic: definition.fireMode === 'automatic',
    color: definition.effects.tracerColorHex,
    muzzleFlashScale: definition.effects.muzzleFlashScale,
    reportGain: definition.effects.reportGain,
    flashlight: definition.effects.flashlight,
    fireKind: definition.fireKind,
    optic: definition.optic,
    projectileId: definition.projectileId,
    penetration: Object.freeze({
      caliber: definition.penetration.calibreLabel,
      penetrationPower: definition.penetration.power,
      fmjMultiplier: definition.penetration.fmjMultiplier,
      energyFalloffStart: definition.penetration.energyFalloffStartM,
      energyFalloffEnd: definition.penetration.energyFalloffEndM,
      minimumEnergyRetention: definition.penetration.minimumEnergyRetention,
      minimumWallDamageMultiplier: definition.penetration.minimumWallDamageMultiplier,
      maxPenetratedSurfaces: definition.penetration.maximumSurfaces,
    }),
  });
}

export function adaptWeaponCatalogToLegacy(
  definitions: readonly WeaponDefinition[],
): LegacyWeaponRegistry {
  assertExactLegacyRoster(definitions);
  const entries = definitions.map((definition) => [
    definition.id,
    adaptWeaponDefinitionToLegacy(definition),
  ] as const);
  return Object.freeze(Object.fromEntries(entries)) as LegacyWeaponRegistry;
}

export const LEGACY_WEAPONS: LegacyWeaponRegistry = adaptWeaponCatalogToLegacy(WEAPON_CATALOG);
