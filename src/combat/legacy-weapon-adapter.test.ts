import { describe, expect, it } from 'vitest';
import { GUN_RANGE_WEAPON_STATIONS } from '../gun-range-armory';
import { FIELD_KITS, deployedWeapons } from '../loadout';
import { MULTIPLAYER_PROTOCOL_VERSION } from '../protocol';
import {
  WEAPONS,
  beginReload,
  computeDamage,
  computeRecoilImpulse,
  computeSpread,
} from '../gameplay';
import legacyBaseline from './fixtures/pass64-legacy-weapons.json';
import {
  LEGACY_WEAPONS,
  LegacyWeaponAdapterError,
  adaptWeaponCatalogToLegacy,
  adaptWeaponDefinitionToLegacy,
} from './legacy-weapon-adapter';
import { WEAPON_CATALOG } from './weapon-catalog';
import type { WeaponDefinition } from './weapon-schema';

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const entry of Object.values(value)) expectDeepFrozen(entry);
}

describe('Pass 65 runtime weapon adapter', () => {
  it('projects the complete current-protocol roster in canonical order', () => {
    expect(MULTIPLAYER_PROTOCOL_VERSION).toBe(14);
    expect(Object.keys(LEGACY_WEAPONS)).toEqual(WEAPON_CATALOG.map((weapon) => weapon.id));
    expect(Object.keys(LEGACY_WEAPONS).slice(0, 9)).toEqual(legacyBaseline.legacyEnumerationOrder);
    expect(LEGACY_WEAPONS.carbine).toMatchObject({ id: 'carbine', name: 'HK416', damage: 31, mag: 30 });
    expect(LEGACY_WEAPONS.minigun).toMatchObject({ spinUpMs: 1200, movementMultiplier: 0.8, mag: 240 });
    expect(LEGACY_WEAPONS['explosive-crossbow']).toMatchObject({ fireKind: 'projectile', projectileId: 'explosive-bolt-v1' });
    expect(LEGACY_WEAPONS.flamethrower).toMatchObject({ fireKind: 'hitscan', automatic: true, mag: 100 });
    expect(LEGACY_WEAPONS['flare-gun']).toMatchObject({ fireKind: 'projectile', projectileId: 'signal-flare-v1', mag: 1 });
    expect(WEAPONS).toBe(LEGACY_WEAPONS);
  });

  it('deep-freezes the adapted registry, each weapon, and penetration profiles', () => {
    expectDeepFrozen(LEGACY_WEAPONS);
  });

  it('rejects missing, duplicate, unknown, and reordered catalogs without a fallback', () => {
    expect(() => adaptWeaponCatalogToLegacy(WEAPON_CATALOG.slice(0, -1)))
      .toThrow(/missing flare-gun/);

    const duplicate = [...WEAPON_CATALOG.slice(0, -1), WEAPON_CATALOG[0]];
    expect(() => adaptWeaponCatalogToLegacy(duplicate)).toThrow(/duplicate weapon id "carbine"/);

    const unknown = [
      { ...WEAPON_CATALOG[0], id: 'candidate-weapon' } as WeaponDefinition,
      ...WEAPON_CATALOG.slice(1),
    ];
    expect(() => adaptWeaponCatalogToLegacy(unknown)).toThrow(LegacyWeaponAdapterError);
    expect(() => adaptWeaponCatalogToLegacy(unknown)).toThrow(/unsupported weapon id "candidate-weapon"/);

    const reordered = [...WEAPON_CATALOG];
    [reordered[5], reordered[6]] = [reordered[6], reordered[5]];
    expect(() => adaptWeaponCatalogToLegacy(reordered)).toThrow(/weapon 5 must be "railgun"/);
  });

  it('keeps policy, provenance, and non-runtime identifiers inert in the runtime projection', () => {
    const original = WEAPON_CATALOG[0];
    const metadataVariant: WeaponDefinition = {
      ...original,
      recoil: { ...original.recoil, deterministicPatternId: 'metadata-only-pattern-v2' },
      ammo: { ...original.ammo, emptyReloadSeconds: 2.5 },
      policies: { ...original.policies, loadout: 'curated-only' },
      modelSetId: 'metadata-only-model-v2',
      presentationId: 'metadata-only-presentation-v2',
      audioId: 'metadata-only-audio-v2',
      provenanceId: 'metadata-only-provenance-v2',
      evidenceIds: ['metadata-only-evidence-v2'],
    };
    expect(adaptWeaponDefinitionToLegacy(metadataVariant)).toEqual(
      adaptWeaponDefinitionToLegacy(original),
    );
  });

  it('preserves hardcoded prone spread, caller-supplied random recoil, and tactical reload timing', () => {
    const carbine = WEAPONS.carbine;
    const standingSpread = computeSpread(carbine, {
      ads: false, moving: false, crouched: false, prone: false, sustainedShots: 0,
    });
    const proneSpread = computeSpread(carbine, {
      ads: false, moving: false, crouched: false, prone: true, sustainedShots: 0,
    });
    expect(proneSpread).toBeCloseTo(standingSpread * legacyBaseline.universalProneSpreadMultiplier, 12);
    expect(WEAPON_CATALOG[0].spread.proneMultiplier).not.toBe(legacyBaseline.universalProneSpreadMultiplier);

    const recoilLeft = computeRecoilImpulse(carbine, 7, 0);
    const recoilRight = computeRecoilImpulse(carbine, 7, 1);
    expect(recoilLeft.pitch).toBe(recoilRight.pitch);
    expect(recoilLeft.yaw).toBe(-recoilRight.yaw);

    const tactical = beginReload(carbine, 12, 40, 1_000)!;
    const empty = beginReload(carbine, 0, 40, 1_000)!;
    expect(tactical.endsAt).toBe(1_000 + carbine.reload * 1_000);
    expect(empty.endsAt).toBe(tactical.endsAt);
    expect(WEAPON_CATALOG[0].ammo.emptyReloadSeconds).not.toBe(carbine.reload);
  });

  it('preserves magnum and railgun special behavior plus current range/loadout routes', () => {
    expect(computeDamage(WEAPONS.magnum, 10, 'head')).toBe(99);
    expect(computeDamage(WEAPONS.magnum, 10, 'body')).toBe(52);
    expect(computeDamage(WEAPONS.magnum, 10, 'limb')).toBe(39);
    expect(computeDamage(WEAPONS.railgun, 220, 'head')).toBe(50);
    expect(computeDamage(WEAPONS.railgun, 220, 'body')).toBe(50);
    expect(WEAPONS.railgun.penetration).toMatchObject({
      penetrationPower: 100_000,
      maxPenetratedSurfaces: 64,
    });

    expect(GUN_RANGE_WEAPON_STATIONS.map((station) => [station.id, station.weapon])).toEqual([
      ['range-carbine', 'carbine'],
      ['range-smg', 'smg'],
      ['range-lmg', 'lmg'],
      ['range-scattergun', 'scattergun'],
      ['range-sniper', 'sniper'],
    ]);
    expect(deployedWeapons('sniper')).toEqual(['sniper', 'machine-pistol']);
    expect(deployedWeapons('lmg')).toEqual(['lmg', 'pistol']);
    expect(FIELD_KITS.map((kit) => kit.weapon)).toEqual(['carbine', 'smg', 'scattergun', 'sniper']);
    expect(FIELD_KITS.flatMap((kit) => [kit.weapon, kit.sidearm])).not.toContain('magnum');
    expect(FIELD_KITS.flatMap((kit) => [kit.weapon, kit.sidearm])).not.toContain('railgun');
    expect(FIELD_KITS.flatMap((kit) => [kit.weapon, kit.sidearm])).not.toContain('flamethrower');
    expect(FIELD_KITS.flatMap((kit) => [kit.weapon, kit.sidearm])).not.toContain('flare-gun');
  });
});
