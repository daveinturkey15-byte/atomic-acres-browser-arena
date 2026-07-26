import { describe, expect, it } from 'vitest';
import combatOracle from '../../.agents/skills/atomic-acres-combat-registry/scripts/fixtures/known-good.json';
import { MULTIPLAYER_PROTOCOL_VERSION, WEAPON_IDS } from '../protocol';
import legacyBaseline from './fixtures/pass64-legacy-weapons.json';
import { LEGACY_WEAPON_ENUMERATION_ORDER, WEAPON_CATALOG } from './weapon-catalog';
import { validateWeaponDefinitions } from './weapon-schema';

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const entry of Object.values(value)) expectDeepFrozen(entry);
}

describe('B1 weapon catalog', () => {
  it('contains exactly the protocol-v6 roster in the preserved legacy enumeration order', () => {
    expect(MULTIPLAYER_PROTOCOL_VERSION).toBe(legacyBaseline.protocolVersion);
    expect(LEGACY_WEAPON_ENUMERATION_ORDER).toEqual([
      'carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'railgun', 'pistol', 'magnum', 'machine-pistol',
    ]);
    expect(WEAPON_CATALOG.map((definition) => definition.id)).toEqual(LEGACY_WEAPON_ENUMERATION_ORDER);
    expect(new Set(WEAPON_CATALOG.map((definition) => definition.id))).toEqual(new Set(WEAPON_IDS));
  });

  it('is schema-valid and deeply frozen at the canonical parse boundary', () => {
    expect(validateWeaponDefinitions(WEAPON_CATALOG)).toEqual([]);
    expectDeepFrozen(WEAPON_CATALOG);
  });

  it('matches every field in the validator-owned B1 oracle after applying legacy order', () => {
    const oracleById = new Map(combatOracle.weapons.map((definition) => [definition.id, definition]));
    expect(WEAPON_CATALOG).toEqual(
      LEGACY_WEAPON_ENUMERATION_ORDER.map((id) => oracleById.get(id)),
    );
  });

  it('retains the reviewed metadata without making it a legacy runtime consumer', () => {
    const byId = Object.fromEntries(WEAPON_CATALOG.map((definition) => [definition.id, definition]));
    expect(byId.pistol.policies.range).toEqual({
      kind: 'companion-sidearm',
      primaryIds: ['carbine', 'smg', 'lmg', 'scattergun'],
    });
    expect(byId['machine-pistol'].policies.range).toEqual({
      kind: 'companion-sidearm',
      primaryIds: ['sniper'],
    });
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
