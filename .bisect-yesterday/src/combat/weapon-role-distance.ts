import type { WeaponDefinition } from './weapon-schema';

export type WeaponRoleDistance = Readonly<{
  leftId: string;
  rightId: string;
  distance: number;
  numericDistance: number;
  categoricalDistance: number;
}>;

const normalizedDelta = (left: number, right: number): number => (
  Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1e-6)
);

function numericRoleVector(weapon: WeaponDefinition): readonly number[] {
  return Object.freeze([
    weapon.rpm,
    weapon.pellets,
    weapon.spinUpMs,
    weapon.movementMultiplier,
    weapon.damage.base,
    weapon.damage.minimum,
    weapon.damage.falloffStartM,
    weapon.damage.falloffEndM,
    weapon.damage.headMultiplier,
    weapon.damage.limbMultiplier,
    weapon.spread.hipRadians,
    weapon.spread.adsMultiplier,
    weapon.spread.movementMultiplier,
    weapon.spread.crouchMultiplier,
    weapon.spread.proneMultiplier,
    weapon.spread.sustainedPerShot,
    weapon.spread.maximumRadians,
    weapon.recoil.pitchRadians,
    weapon.recoil.yawRadians,
    weapon.recoil.recoveryPerSecond,
    weapon.recoil.adsMultiplier,
    weapon.ammo.magazine,
    weapon.ammo.reserve,
    weapon.ammo.reloadSeconds,
    weapon.ammo.emptyReloadSeconds,
    weapon.ammo.switchSeconds,
    weapon.penetration.power,
    weapon.penetration.energyFalloffStartM,
    weapon.penetration.energyFalloffEndM,
    weapon.penetration.minimumEnergyRetention,
    weapon.penetration.minimumWallDamageMultiplier,
    weapon.penetration.maximumSurfaces,
    weapon.effects.muzzleFlashScale,
    weapon.effects.reportGain,
    weapon.optic?.magnification ?? 1,
  ]);
}

function categoricalRoleVector(weapon: WeaponDefinition): readonly string[] {
  return Object.freeze([
    weapon.slot,
    weapon.family,
    weapon.fireKind,
    weapon.fireMode,
    weapon.damage.policy,
    weapon.penetration.calibreLabel,
    weapon.optic?.kind ?? 'iron-sights',
    weapon.projectileId ?? 'hitscan',
    weapon.recoil.deterministicPatternId,
    weapon.audioId,
    weapon.presentationId,
    weapon.modelSetId,
  ]);
}

export function weaponRoleDistance(left: WeaponDefinition, right: WeaponDefinition): WeaponRoleDistance {
  const leftNumeric = numericRoleVector(left);
  const rightNumeric = numericRoleVector(right);
  const numericDistance = Math.sqrt(leftNumeric.reduce((sum, value, index) => (
    sum + normalizedDelta(value, rightNumeric[index]!) ** 2
  ), 0) / leftNumeric.length);
  const leftCategorical = categoricalRoleVector(left);
  const rightCategorical = categoricalRoleVector(right);
  const categoricalDistance = leftCategorical.reduce((sum, value, index) => (
    sum + (value === rightCategorical[index] ? 0 : 1)
  ), 0) / leftCategorical.length;
  return Object.freeze({
    leftId: left.id,
    rightId: right.id,
    numericDistance,
    categoricalDistance,
    distance: numericDistance * 0.82 + categoricalDistance * 0.18,
  });
}

export function weaponRoleDistanceMatrix(weapons: readonly WeaponDefinition[]): readonly WeaponRoleDistance[] {
  return Object.freeze(weapons.flatMap((left, leftIndex) => (
    weapons.slice(leftIndex + 1).map((right) => weaponRoleDistance(left, right))
  )));
}

