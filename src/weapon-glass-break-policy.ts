import { WEAPON_CATALOG } from './combat/weapon-catalog';
import type { WeaponDefinition } from './combat/weapon-schema';
import type { GlassImpactProfile } from './glass-authority';
import type { WeaponId } from './protocol';

export type WeaponGlassBreakTiming = 'impact' | 'detonation';

export type WeaponGlassBreakPolicy = Readonly<{
  weapon: WeaponId;
  profile: Extract<GlassImpactProfile, 'bullet' | 'explosion'>;
  timing: WeaponGlassBreakTiming;
}>;

function projectileGlassBreakPolicy(definition: WeaponDefinition): Omit<WeaponGlassBreakPolicy, 'weapon'> {
  switch (definition.projectileId) {
    case 'signal-flare-v1':
      return Object.freeze({ profile: 'bullet', timing: 'impact' });
    case 'explosive-bolt-v1':
      return Object.freeze({ profile: 'explosion', timing: 'detonation' });
    default:
      throw new TypeError(`Projectile weapon ${definition.id} has no glass-break policy`);
  }
}

/**
 * Project the canonical weapon catalog into glass-break behavior. Every
 * damaging weapon is eligible; a future projectile must declare a supported
 * projectile identity or this projection fails closed.
 */
export function projectWeaponGlassBreakCatalog(
  definitions: readonly WeaponDefinition[] = WEAPON_CATALOG,
): readonly WeaponGlassBreakPolicy[] {
  const seen = new Set<string>();
  const policies = definitions.map((definition) => {
    if (seen.has(definition.id)) throw new TypeError(`Duplicate glass-break weapon ${definition.id}`);
    seen.add(definition.id);
    const behavior = definition.fireKind === 'projectile'
      ? projectileGlassBreakPolicy(definition)
      : Object.freeze({ profile: 'bullet' as const, timing: 'impact' as const });
    return Object.freeze({
      weapon: definition.id as WeaponId,
      ...behavior,
    });
  });
  return Object.freeze(policies);
}

export const WEAPON_GLASS_BREAK_CATALOG = projectWeaponGlassBreakCatalog();

const WEAPON_GLASS_BREAK_BY_ID: ReadonlyMap<WeaponId, WeaponGlassBreakPolicy> = new Map(
  WEAPON_GLASS_BREAK_CATALOG.map((policy) => [policy.weapon, policy]),
);

export function weaponGlassBreakPolicy(weapon: WeaponId): WeaponGlassBreakPolicy {
  const policy = WEAPON_GLASS_BREAK_BY_ID.get(weapon);
  if (!policy) throw new TypeError(`Weapon ${weapon} is absent from the glass-break catalog`);
  return policy;
}
