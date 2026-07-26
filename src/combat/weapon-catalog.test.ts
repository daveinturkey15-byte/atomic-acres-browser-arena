import { describe, expect, it } from 'vitest';
import combatOracle from '../../.agents/skills/atomic-acres-combat-registry/scripts/fixtures/known-good.json';
import { MULTIPLAYER_PROTOCOL_VERSION, WEAPON_IDS } from '../protocol';
import { LEGACY_WEAPON_ENUMERATION_ORDER, WEAPON_CATALOG } from './weapon-catalog';
import { validateWeaponDefinitions } from './weapon-schema';

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const entry of Object.values(value)) expectDeepFrozen(entry);
}

const PASS65_WEAPON_IDS = [
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'railgun', 'pistol', 'magnum', 'machine-pistol',
  'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr', 'slug-shotgun',
  'flashlight-pistol', 'explosive-crossbow',
] as const;

function compatibilityProjection(definition: Record<string, any>): Record<string, any> {
  const copy = structuredClone(definition);
  delete copy.displayName;
  delete copy.effects;
  if (copy.id === 'scattergun') {
    delete copy.damage;
    delete copy.spread;
  }
  return copy;
}

describe('Pass 65 canonical weapon catalog', () => {
  it('contains exactly the protocol-v7 roster in a stable enumeration order', () => {
    expect(MULTIPLAYER_PROTOCOL_VERSION).toBe(7);
    expect(LEGACY_WEAPON_ENUMERATION_ORDER).toEqual([
      ...PASS65_WEAPON_IDS,
    ]);
    expect(WEAPON_CATALOG.map((definition) => definition.id)).toEqual(LEGACY_WEAPON_ENUMERATION_ORDER);
    expect(new Set(WEAPON_CATALOG.map((definition) => definition.id))).toEqual(new Set(WEAPON_IDS));
  });

  it('is schema-valid and deeply frozen at the canonical parse boundary', () => {
    expect(validateWeaponDefinitions(WEAPON_CATALOG)).toEqual([]);
    expectDeepFrozen(WEAPON_CATALOG);
  });

  it('preserves Pass 64 mechanics except for explicitly approved names, effects, and pellet-shotgun tuning', () => {
    const currentById = new Map(WEAPON_CATALOG.map((definition) => [definition.id, definition]));
    for (const baseline of combatOracle.weapons) {
      expect(compatibilityProjection(currentById.get(baseline.id) as unknown as Record<string, any>))
        .toEqual(compatibilityProjection(baseline));
    }
  });

  it('pins the approved new weapon identities and special gameplay contracts', () => {
    const byId = Object.fromEntries(WEAPON_CATALOG.map((definition) => [definition.id, definition]));
    expect(byId.carbine.displayName).toBe('HK416');
    expect(byId.smg.displayName).toBe('FN P90');
    expect(byId['machine-pistol'].displayName).toBe('Glock 18');
    expect(byId['mini-uzi']).toMatchObject({ displayName: 'Mini Uzi', rpm: 1050, family: 'smg' });
    expect(byId.mp5).toMatchObject({ displayName: 'MP5', family: 'smg' });
    expect(byId.m4a1).toMatchObject({ displayName: 'M4A1', family: 'assault-rifle' });
    expect(byId['ak-47']).toMatchObject({ displayName: 'AK-47', family: 'assault-rifle' });
    expect(byId.minigun).toMatchObject({ displayName: 'M134 Minigun', movementMultiplier: 0.8, spinUpMs: 1200 });
    expect(byId['m14-ebr']).toMatchObject({
      displayName: 'M14 EBR', optic: { kind: 'thermal-smoke-only', magnification: 2.5 },
    });
    expect(byId['slug-shotgun']).toMatchObject({ displayName: 'Benelli M4 Slug', fireKind: 'slug', pellets: 1 });
    expect(byId['flashlight-pistol']).toMatchObject({
      displayName: 'HK USP .45 Tactical', rpm: 300,
      effects: { reportGain: 1.4, flashlight: { kind: 'always-on', solidOcclusion: 'required' } },
    });
    expect(byId['explosive-crossbow']).toMatchObject({
      displayName: 'TAC-15 Explosive Crossbow', fireKind: 'projectile', policies: { authority: 'host-projectile-v1' },
    });
  });

  it('retains special pickup and entitlement-only metadata', () => {
    const byId = Object.fromEntries(WEAPON_CATALOG.map((definition) => [definition.id, definition]));
    expect(byId.magnum.policies.range).toEqual({
      kind: 'entitlement-only',
      entitlementPolicyId: 'dhv-x-sidearm-v1',
    });
    expect(byId.railgun).toMatchObject({
      policies: { loadout: 'pickup-only', range: { kind: 'never' }, authority: 'host-railgun-v1' },
      penetration: { power: 100_000, maximumSurfaces: 64 },
    });
  });
});
