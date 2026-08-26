import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from './weapon-catalog';
import { weaponRoleDistance, weaponRoleDistanceMatrix } from './weapon-role-distance';
import type { WeaponDefinition } from './weapon-schema';

describe('Pass 65 complete-roster weapon role distance', () => {
  it('auto-enrols every canonical pair and rejects near-duplicate shipped identities', () => {
    const matrix = weaponRoleDistanceMatrix(WEAPON_CATALOG);
    expect(matrix).toHaveLength(WEAPON_CATALOG.length * (WEAPON_CATALOG.length - 1) / 2);
    const closest = [...matrix].sort((left, right) => left.distance - right.distance)[0]!;
    expect(closest.distance, `${closest.leftId}/${closest.rightId}`).toBeGreaterThan(0.1);
    expect(closest.numericDistance, `${closest.leftId}/${closest.rightId}`).toBeGreaterThan(0.055);
  });

  it('keeps the Mini Uzi materially separated from both compact-automatic comparators', () => {
    const byId = Object.fromEntries(WEAPON_CATALOG.map((weapon) => [weapon.id, weapon]));
    expect(weaponRoleDistance(byId['mini-uzi']!, byId.smg!).distance).toBeGreaterThan(0.15);
    expect(weaponRoleDistance(byId['mini-uzi']!, byId.mp5!).distance).toBeGreaterThan(0.15);
    expect(weaponRoleDistance(byId.smg!, byId.mp5!).distance).toBeGreaterThan(0.15);
  });

  it('fails a cloned future weapon even if its labels and IDs are changed', () => {
    const cloned = {
      ...structuredClone(WEAPON_CATALOG[0]),
      id: 'future-carbine-clone',
      displayName: 'Future Carbine Clone',
      audioId: 'future-carbine-audio',
      presentationId: 'future-carbine-view',
      modelSetId: 'future-carbine-model',
      provenanceId: 'future-carbine-provenance',
    } as unknown as WeaponDefinition;
    expect(weaponRoleDistance(WEAPON_CATALOG[0], cloned).distance).toBeLessThan(0.1);
  });
});
