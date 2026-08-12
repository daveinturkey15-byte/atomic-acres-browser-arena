import type { Team } from './protocol';

export const FLAME_DAMAGE_SOURCE_IDS = Object.freeze([
  'carpet-bomber-napalm',
  'flare-gun-burn',
  'flamethrower-ground-fire',
] as const);

export type FlameDamageSource = (typeof FLAME_DAMAGE_SOURCE_IDS)[number];
export type FlameTargetRelation = 'self' | 'friendly' | 'enemy';

export type FlameDamageProfile = Readonly<{
  id: FlameDamageSource;
  previousDamagePerSecond: number;
  multiplier: number;
  damagePerSecond: number;
  affectedRelations: readonly FlameTargetRelation[];
}>;

export const HF279_FLAME_DAMAGE_MULTIPLIER = 2;
export const FLAME_DAMAGE_PULSE_INTERVAL_MS = 500;

const ALL_FLAME_TARGET_RELATIONS = Object.freeze([
  'self',
  'friendly',
  'enemy',
] as const satisfies readonly FlameTargetRelation[]);

function profile(id: FlameDamageSource): FlameDamageProfile {
  const previousDamagePerSecond = 10;
  return Object.freeze({
    id,
    previousDamagePerSecond,
    multiplier: HF279_FLAME_DAMAGE_MULTIPLIER,
    damagePerSecond: previousDamagePerSecond * HF279_FLAME_DAMAGE_MULTIPLIER,
    affectedRelations: ALL_FLAME_TARGET_RELATIONS,
  });
}

/**
 * HF-279 freezes the preceding source-specific fire lanes at 10 DPS, then
 * applies one exact 2x balance change. Direct Flare impact, Flamethrower
 * stream-hit and Carpet Bomber blast damage deliberately live outside this
 * catalog and do not inherit the burn multiplier.
 */
export const FLAME_DAMAGE_CATALOG: Readonly<Record<FlameDamageSource, FlameDamageProfile>> = Object.freeze({
  'carpet-bomber-napalm': profile('carpet-bomber-napalm'),
  'flare-gun-burn': profile('flare-gun-burn'),
  'flamethrower-ground-fire': profile('flamethrower-ground-fire'),
});

export function flameDamagePerPulse(
  source: FlameDamageSource,
  intervalMs = FLAME_DAMAGE_PULSE_INTERVAL_MS,
): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return 0;
  return FLAME_DAMAGE_CATALOG[source].damagePerSecond * intervalMs / 1_000;
}

export function flameTargetRelation(
  ownerId: string,
  ownerTeam: Team,
  targetId: string,
  targetTeam: Team,
): FlameTargetRelation | null {
  if (!ownerId || !targetId) return null;
  if (ownerId === targetId) return 'self';
  return ownerTeam === targetTeam ? 'friendly' : 'enemy';
}

export function flameDamageAllowsTarget(
  source: FlameDamageSource,
  ownerId: string,
  ownerTeam: Team,
  targetId: string,
  targetTeam: Team,
): boolean {
  const relation = flameTargetRelation(ownerId, ownerTeam, targetId, targetTeam);
  return relation !== null && FLAME_DAMAGE_CATALOG[source].affectedRelations.includes(relation);
}

const FROZEN_PROFILE_ORACLE: Readonly<Record<FlameDamageSource, Readonly<{
  previousDamagePerSecond: 10;
  multiplier: 2;
  damagePerSecond: 20;
}>>> = Object.freeze({
  'carpet-bomber-napalm': Object.freeze({ previousDamagePerSecond: 10, multiplier: 2, damagePerSecond: 20 }),
  'flare-gun-burn': Object.freeze({ previousDamagePerSecond: 10, multiplier: 2, damagePerSecond: 20 }),
  'flamethrower-ground-fire': Object.freeze({ previousDamagePerSecond: 10, multiplier: 2, damagePerSecond: 20 }),
});

/** Independent mutation gate for the frozen HF-279 source and relation set. */
export function validateFlameDamageCatalog(
  profiles: readonly FlameDamageProfile[],
): readonly string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const candidate of profiles) {
    if (seen.has(candidate.id)) errors.push(`${candidate.id}: duplicate source`);
    seen.add(candidate.id);
    if (!FLAME_DAMAGE_SOURCE_IDS.includes(candidate.id)) {
      errors.push(`${candidate.id}: unknown source`);
      continue;
    }
    const oracle = FROZEN_PROFILE_ORACLE[candidate.id];
    if (candidate.previousDamagePerSecond !== oracle.previousDamagePerSecond) {
      errors.push(`${candidate.id}: preceding baseline drifted`);
    }
    if (candidate.multiplier !== oracle.multiplier) errors.push(`${candidate.id}: multiplier must be exactly 2`);
    if (candidate.damagePerSecond !== oracle.damagePerSecond
      || candidate.damagePerSecond !== candidate.previousDamagePerSecond * candidate.multiplier) {
      errors.push(`${candidate.id}: resulting damage must be exactly 20 DPS and 2x baseline`);
    }
    const relations = new Set(candidate.affectedRelations);
    if (candidate.affectedRelations.length !== ALL_FLAME_TARGET_RELATIONS.length
      || ALL_FLAME_TARGET_RELATIONS.some((relation) => !relations.has(relation))) {
      errors.push(`${candidate.id}: must affect self, friendly and enemy exactly once`);
    }
  }
  for (const id of FLAME_DAMAGE_SOURCE_IDS) {
    if (!seen.has(id)) errors.push(`${id}: missing source`);
  }
  if (profiles.length !== FLAME_DAMAGE_SOURCE_IDS.length) errors.push('catalog source count mismatch');
  return Object.freeze(errors);
}
