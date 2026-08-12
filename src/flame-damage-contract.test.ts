import { describe, expect, it } from 'vitest';
import {
  FLAME_DAMAGE_CATALOG,
  FLAME_DAMAGE_PULSE_INTERVAL_MS,
  FLAME_DAMAGE_SOURCE_IDS,
  HF279_FLAME_DAMAGE_MULTIPLIER,
  flameDamageAllowsTarget,
  flameDamagePerPulse,
  validateFlameDamageCatalog,
  type FlameDamageProfile,
} from './flame-damage-contract';

function catalog(): FlameDamageProfile[] {
  return FLAME_DAMAGE_SOURCE_IDS.map((id) => ({
    ...FLAME_DAMAGE_CATALOG[id],
    affectedRelations: [...FLAME_DAMAGE_CATALOG[id].affectedRelations],
  }));
}

describe('HF-279 flame damage contract', () => {
  it('freezes every preceding fire lane at 10 DPS and changes only those lanes to exact 20 DPS', () => {
    expect(HF279_FLAME_DAMAGE_MULTIPLIER).toBe(2);
    expect(FLAME_DAMAGE_PULSE_INTERVAL_MS).toBe(500);
    for (const id of FLAME_DAMAGE_SOURCE_IDS) {
      expect(FLAME_DAMAGE_CATALOG[id]).toMatchObject({
        previousDamagePerSecond: 10,
        multiplier: 2,
        damagePerSecond: 20,
      });
      expect(flameDamagePerPulse(id)).toBe(10);
    }
    expect(validateFlameDamageCatalog(catalog())).toEqual([]);
  });

  it.each(FLAME_DAMAGE_SOURCE_IDS)('%s affects self, friendly and enemy without a team immunity', (source) => {
    expect(flameDamageAllowsTarget(source, 'owner', 0, 'owner', 0)).toBe(true);
    expect(flameDamageAllowsTarget(source, 'owner', 0, 'friend', 0)).toBe(true);
    expect(flameDamageAllowsTarget(source, 'owner', 0, 'enemy', 1)).toBe(true);
    expect(flameDamageAllowsTarget(source, '', 0, 'enemy', 1)).toBe(false);
  });

  it('rejects missing, extra, duplicate, weakened, over-buffed and relation-immune mutations', () => {
    const valid = catalog();
    expect(validateFlameDamageCatalog(valid.slice(1))).toEqual(expect.arrayContaining([
      'carpet-bomber-napalm: missing source',
      'catalog source count mismatch',
    ]));
    expect(validateFlameDamageCatalog([...valid, valid[0]!] as FlameDamageProfile[]))
      .toEqual(expect.arrayContaining(['carpet-bomber-napalm: duplicate source', 'catalog source count mismatch']));

    for (const mutation of [
      { ...valid[0]!, previousDamagePerSecond: 9 },
      { ...valid[0]!, multiplier: 1 },
      { ...valid[0]!, damagePerSecond: 19 },
      { ...valid[0]!, damagePerSecond: 21 },
      { ...valid[0]!, affectedRelations: ['enemy'] as const },
    ]) {
      const candidate = [...valid];
      candidate[0] = mutation;
      expect(validateFlameDamageCatalog(candidate).length).toBeGreaterThan(0);
    }
  });
});
