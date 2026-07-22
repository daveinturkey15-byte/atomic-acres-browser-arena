import { describe, expect, it } from 'vitest';
import { DEFAULT_FIELD_KIT, FIELD_KITS, deployedWeapons, fieldKitById, parseFieldKitSelection, serializeFieldKitSelection } from './loadout';

describe('field-kit selection', () => {
  it('offers one original kit for each implemented primary weapon', () => {
    expect(FIELD_KITS.map((kit) => kit.weapon)).toEqual(['carbine', 'smg', 'scattergun', 'sniper']);
    expect(new Set(FIELD_KITS.map((kit) => kit.id)).size).toBe(FIELD_KITS.length);
  });

  it('round-trips the marksman kit and deploys its Longline sniper with the full-auto machine pistol', () => {
    const encoded = serializeFieldKitSelection('marksman');
    expect(parseFieldKitSelection(encoded)).toBe('marksman');
    expect(fieldKitById('marksman').weapon).toBe('sniper');
    expect(fieldKitById('marksman').sidearm).toBe('machine-pistol');
    expect(deployedWeapons('sniper')).toEqual(['sniper', 'machine-pistol']);
  });

  it('issues the service pistol to standard kits and the auto sidearm only to marksman', () => {
    for (const kit of FIELD_KITS) expect(deployedWeapons(kit.weapon)).toEqual([kit.weapon, kit.sidearm]);
    expect(FIELD_KITS.filter((kit) => kit.sidearm === 'machine-pistol').map((kit) => kit.id)).toEqual(['marksman']);
  });

  it('falls back safely for missing malformed stale or unknown storage values', () => {
    expect(parseFieldKitSelection(null)).toBe(DEFAULT_FIELD_KIT);
    expect(parseFieldKitSelection('not-json')).toBe(DEFAULT_FIELD_KIT);
    expect(parseFieldKitSelection(JSON.stringify({ version: 2, selected: 'runner' }))).toBe(DEFAULT_FIELD_KIT);
    expect(parseFieldKitSelection(JSON.stringify({ version: 1, selected: 'unknown' }))).toBe(DEFAULT_FIELD_KIT);
    expect(fieldKitById('__proto__').id).toBe(DEFAULT_FIELD_KIT);
  });

  it('round-trips an allowlisted versioned selection', () => {
    const encoded = serializeFieldKitSelection('breacher');
    expect(parseFieldKitSelection(encoded)).toBe('breacher');
    expect(JSON.parse(encoded)).toEqual({ version: 1, selected: 'breacher' });
  });
});
