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

describe('Pass 64 legacy weapon adapter', () => {
  it('matches the independent nine-weapon baseline byte-for-value and order', () => {
    expect(MULTIPLAYER_PROTOCOL_VERSION).toBe(6);
    expect(Object.keys(LEGACY_WEAPONS)).toEqual(legacyBaseline.legacyEnumerationOrder);
    expect(LEGACY_WEAPONS).toEqual(legacyBaseline.weapons);
    expect(WEAPONS).toBe(LEGACY_WEAPONS);
  });

  it('deep-freezes the adapted registry, each weapon, and penetration profiles', () => {
    expectDeepFrozen(LEGACY_WEAPONS);
  });

  it('rejects missing, duplicate, unknown, and reordered catalogs without a fallback', () => {
    expect(() => adaptWeaponCatalogToLegacy(WEAPON_CATALOG.slice(0, -1)))
      .toThrow(/missing machine-pistol/);

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

  it('keeps F01-only metadata inert in the legacy projection', () => {
    const original = WEAPON_CATALOG[0];
    const metadataVariant: WeaponDefinition = {
      ...original,
      spinUpMs: 250,
      movementMultiplier: 0.75,
      spread: { ...original.spread, proneMultiplier: 0.1 },
      recoil: { ...original.recoil, deterministicPatternId: 'metadata-only-pattern-v2' },
      ammo: { ...original.ammo, emptyReloadSeconds: 2.5 },
      optic: null,
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
    expect(computeDamage(WEAPONS.magnum, 10, 'head')).toBe(100);
    expect(computeDamage(WEAPONS.magnum, 10, 'body')).toBe(0);
    expect(computeDamage(WEAPONS.magnum, 10, 'limb')).toBe(0);
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
  });
});
