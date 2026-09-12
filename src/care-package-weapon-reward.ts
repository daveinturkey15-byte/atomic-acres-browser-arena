import {
  rewardForCarePackageUnit,
  type KillstreakCatalog,
} from './killstreak-catalog';
import type { TimedMapWeaponId } from './timed-map-weapon-authority';

/**
 * HF-334 (owner: "add 10% chance in care package to get a flamethrower"):
 * a fixed 10-in-100 flamethrower band layered over the existing care-package
 * pool with exact integer arithmetic mirroring the nuke 1% pattern. The
 * remaining 90% delegates back to the derived-weight pool, so the pool keeps
 * its internal shape exactly (recorded owner consequence: every pool entry —
 * including the nuke's fixed 1-in-100 of the pool roll — now lands at 90% of
 * its former overall rate; the nuke becomes exactly 0.9% of a care roll).
 */
export const CARE_PACKAGE_FLAMETHROWER_PROBABILITY = Object.freeze({
  numerator: 10,
  denominator: 100,
} as const);

/** The only weapon the care package may currently grant. */
export const CARE_PACKAGE_WEAPON_REWARD_ID = 'flamethrower' satisfies TimedMapWeaponId;
export type CarePackageWeaponRewardId = typeof CARE_PACKAGE_WEAPON_REWARD_ID;

export type CarePackageReward<Id extends string = string> =
  | Readonly<{ kind: 'killstreak'; id: Id }>
  | Readonly<{ kind: 'timed-map-weapon'; weaponId: CarePackageWeaponRewardId }>;

export type CarePackageRewardRoll<Id extends string = string> = Readonly<{
  reward: CarePackageReward<Id>;
  /**
   * The admitted unit, drawn from the layered domain when the flamethrower
   * band is open and from the plain pool domain otherwise. Stored host-side so
   * a weapon reward can be deterministically downgraded at capture time.
   */
  rollUnit: number;
  /** Total size of the integer domain rollUnit was drawn from. */
  rollDomainUnits: number;
}>;

function assertCatalogPool<Id extends string>(catalog: KillstreakCatalog<Id>): number {
  const totalWeightUnits = catalog.carePackagePool.totalWeightUnits;
  if (!Number.isSafeInteger(totalWeightUnits) || totalWeightUnits <= 0) {
    throw new Error('care-package pool total weight is invalid');
  }
  return totalWeightUnits;
}

/** The size of the layered roll domain: pool total x fixed denominator (100). */
export function carePackageLayeredTotalUnits<Id extends string>(catalog: KillstreakCatalog<Id>): number {
  const totalWeightUnits = assertCatalogPool(catalog);
  const layeredTotal = totalWeightUnits * CARE_PACKAGE_FLAMETHROWER_PROBABILITY.denominator;
  if (!Number.isSafeInteger(layeredTotal)) throw new Error('care-package layered total exceeds safe-integer range');
  return layeredTotal;
}

/** Exclusive end of the flamethrower band inside the layered domain. */
export function carePackageWeaponBandEndExclusive<Id extends string>(catalog: KillstreakCatalog<Id>): number {
  return assertCatalogPool(catalog) * CARE_PACKAGE_FLAMETHROWER_PROBABILITY.numerator;
}

/**
 * Host-only reward roll for one care crate. When the flamethrower band is
 * open, the seed is reduced over layeredTotal = totalWeightUnits * 100; the
 * first totalWeightUnits * 10 units are the flamethrower (exactly 10%), and
 * every remaining unit delegates to the existing pool via
 * (layeredUnit - band) % totalWeightUnits, which sweeps every pool residue
 * exactly 90 times — the pool's internal shape is preserved bit-exactly.
 * When the band is closed (no grant path wired, weapon already held or
 * pending), the roll reproduces the original pool distribution exactly.
 */
export function rollCarePackageReward<Id extends string>(
  catalog: KillstreakCatalog<Id>,
  seed: number,
  options: Readonly<{ flamethrowerAdmissible: boolean }>,
): CarePackageRewardRoll<Id> {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error(`care-package roll seed ${seed} is invalid`);
  const totalWeightUnits = assertCatalogPool(catalog);
  if (options.flamethrowerAdmissible !== true) {
    const rollUnit = seed % totalWeightUnits;
    return Object.freeze({
      reward: Object.freeze({ kind: 'killstreak' as const, id: rewardForCarePackageUnit(catalog, rollUnit) }),
      rollUnit,
      rollDomainUnits: totalWeightUnits,
    });
  }
  const layeredTotal = carePackageLayeredTotalUnits(catalog);
  const bandEndExclusive = carePackageWeaponBandEndExclusive(catalog);
  const layeredUnit = seed % layeredTotal;
  if (layeredUnit < bandEndExclusive) {
    return Object.freeze({
      reward: Object.freeze({ kind: 'timed-map-weapon' as const, weaponId: CARE_PACKAGE_WEAPON_REWARD_ID }),
      rollUnit: layeredUnit,
      rollDomainUnits: layeredTotal,
    });
  }
  return Object.freeze({
    reward: Object.freeze({
      kind: 'killstreak' as const,
      id: rewardForCarePackageUnit(catalog, (layeredUnit - bandEndExclusive) % totalWeightUnits),
    }),
    rollUnit: layeredUnit,
    rollDomainUnits: layeredTotal,
  });
}

/**
 * Deterministic capture-time downgrade for a weapon-reward crate whose grant
 * became inadmissible between roll and capture (e.g. another player took the
 * single flamethrower instance). Maps the crate's stored roll unit back onto
 * the pool so a capture never silently drops a reward.
 */
export function downgradeCarePackageWeaponReward<Id extends string>(
  catalog: KillstreakCatalog<Id>,
  rollUnit: number,
): Id {
  if (!Number.isSafeInteger(rollUnit) || rollUnit < 0) {
    throw new Error(`care-package downgrade unit ${rollUnit} is invalid`);
  }
  return rewardForCarePackageUnit(catalog, rollUnit % assertCatalogPool(catalog));
}
