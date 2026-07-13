import { describe, expect, it } from 'vitest';
import { centeredSightY, weaponFamilyPresentation } from './weapon-family-presentation';

const weapons = ['carbine', 'smg', 'scattergun'] as const;

describe('weapon family presentation', () => {
  it('physically centres every authored sight axis', () => {
    for (const weapon of weapons) expect(Math.abs(centeredSightY(weapon))).toBeLessThan(0.001);
  });

  it('gives every weapon a distinct action and complete detail contract', () => {
    const profiles = weapons.map(weaponFamilyPresentation);
    expect(new Set(profiles.map((profile) => profile.actionTravel)).size).toBe(3);
    expect(profiles.every((profile) => profile.requiredDetails.length >= 5)).toBe(true);
    expect(weaponFamilyPresentation('scattergun').smokeBase).toBeGreaterThan(weaponFamilyPresentation('smg').smokeBase);
  });
});
