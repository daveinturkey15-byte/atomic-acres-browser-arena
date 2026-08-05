import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CARE_PACKAGE_FIXED_DENOMINATOR,
  PASS65_KILLSTREAK_CATALOG,
  PASS65_KILLSTREAK_SLOT_DEFINITIONS,
  PASS65_KILLSTREAK_SOURCES,
  createKillstreakCatalog,
  parseKillstreakLoadout,
  rewardForCarePackageUnit,
  validateKillstreakLoadout,
  type KillstreakCatalogSourceDefinition,
} from './killstreak-catalog';
import { DRONE_SUPPORT_LIFETIMES_MS } from './killstreak-support-catalog';

const decisionReceiptPath = fileURLToPath(new URL('../docs/PASS65_DECISION_RECEIPTS.json', import.meta.url));
const decisionReceipts = JSON.parse(readFileSync(decisionReceiptPath, 'utf8')) as {
  receipts: Array<{
    id: string;
    status: string;
    value?: {
      catalog?: Array<Record<string, unknown> & { carePackageWeightUnits: number }>;
      selectionPolicy?: {
        slots?: unknown;
        mutuallyExclusiveGroups?: unknown;
      };
    };
  }>;
};

function withoutDerivedWeight<T extends { carePackageWeightUnits: number }>(entry: T): Omit<T, 'carePackageWeightUnits'> {
  const { carePackageWeightUnits, ...authored } = entry;
  void carePackageWeightUnits;
  return authored;
}

function withLaterOwnerCorrections<T extends Record<string, unknown>>(entry: T): T {
  return entry.id === 'drone-swarm'
    ? { ...entry, durationMs: DRONE_SUPPORT_LIFETIMES_MS.swarm }
    : entry;
}

function source(id: string): KillstreakCatalogSourceDefinition {
  return PASS65_KILLSTREAK_SOURCES.find((entry) => entry.id === id)!;
}

function futureSource(
  id: string,
  baseWeight: number,
  availability: KillstreakCatalogSourceDefinition['availability'] = 'selectable',
): KillstreakCatalogSourceDefinition {
  return {
    id,
    displayName: id.split('-').map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(' '),
    cost: 10,
    tier: 'high',
    availability,
    carePackageBaseWeightUnits: baseWeight,
    relationship: 'future-catalog-fixture',
    activation: 'instant',
    durationMs: 10_000,
    repeatable: false,
  };
}

describe('Pass 65 canonical killstreak catalog', () => {
  it('is an exact typed projection of the frozen DEC-13 catalog and slot families', () => {
    const receipt = decisionReceipts.receipts.find((entry) => entry.id === 'DEC-13');
    const frozenCatalog = receipt?.value?.catalog ?? [];
    const frozenIds = new Set(frozenCatalog.map((entry) => entry.id));
    const frozenRuntimeRows = PASS65_KILLSTREAK_CATALOG.definitions.filter((entry) => frozenIds.has(entry.id));
    expect(receipt?.status).toBe('FROZEN');
    expect(PASS65_KILLSTREAK_CATALOG.definitions.length).toBeGreaterThanOrEqual(frozenCatalog.length);
    expect(frozenRuntimeRows.map(withoutDerivedWeight)).toEqual(
      frozenCatalog.map(withLaterOwnerCorrections).map(withoutDerivedWeight),
    );
    if (PASS65_KILLSTREAK_CATALOG.definitions.length === frozenCatalog.length) {
      expect(PASS65_KILLSTREAK_CATALOG.definitions).toEqual(frozenCatalog.map(withLaterOwnerCorrections));
    }
    expect(PASS65_KILLSTREAK_SLOT_DEFINITIONS).toEqual(receipt?.value?.selectionPolicy?.slots);
    expect(receipt?.value?.selectionPolicy?.mutuallyExclusiveGroups).toEqual([['nuke', 'drone-swarm']]);
    expect(Object.isFrozen(PASS65_KILLSTREAK_SOURCES)).toBe(true);
    expect(PASS65_KILLSTREAK_SOURCES.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(PASS65_KILLSTREAK_CATALOG.definitions)).toBe(true);
    expect(PASS65_KILLSTREAK_CATALOG.definitions.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(PASS65_KILLSTREAK_CATALOG.carePackagePool.entries)).toBe(true);
  });

  it('derives the complete care-package pool from every current or future source row', () => {
    const expectedBaseTotal = PASS65_KILLSTREAK_CATALOG.definitions
      .filter((entry) => entry.availability !== 'retired' && entry.id !== 'care-package' && entry.id !== 'nuke')
      .reduce((sum, entry) => sum + entry.carePackageBaseWeightUnits, 0);
    expect(PASS65_KILLSTREAK_CATALOG.carePackagePool).toMatchObject({
      nonNukeBaseWeightTotal: expectedBaseTotal,
      totalWeightUnits: expectedBaseTotal * CARE_PACKAGE_FIXED_DENOMINATOR,
      fixedNukeProbability: { numerator: 1, denominator: 100 },
    });
    for (const entry of PASS65_KILLSTREAK_CATALOG.definitions) {
      const expectedWeight = entry.availability === 'retired' || entry.id === 'care-package'
        ? 0
        : entry.id === 'nuke'
          ? expectedBaseTotal
          : entry.carePackageBaseWeightUnits * 99;
      expect(entry.carePackageWeightUnits, entry.id).toBe(expectedWeight);
    }
    const nuke = PASS65_KILLSTREAK_CATALOG.carePackagePool.entries.find((entry) => entry.id === 'nuke')!;
    expect(nuke.weightUnits * CARE_PACKAGE_FIXED_DENOMINATOR).toBe(PASS65_KILLSTREAK_CATALOG.carePackagePool.totalWeightUnits);
    const maximumBaseWeight = Math.max(...PASS65_KILLSTREAK_SOURCES.map((entry) => entry.carePackageBaseWeightUnits));
    expect(source('scout-sweep').carePackageBaseWeightUnits).toBe(maximumBaseWeight);
    expect(PASS65_KILLSTREAK_CATALOG.carePackagePool.entries.map((entry) => entry.id)).not.toContain('care-package');
  });

  it('accepts every legal five-slot combination and rejects family, duplicate, and Nuke/Drone violations', () => {
    let legalCount = 0;
    for (const slot1 of PASS65_KILLSTREAK_SLOT_DEFINITIONS[0].allowedIds) {
      for (const slot2 of PASS65_KILLSTREAK_SLOT_DEFINITIONS[1].allowedIds) {
        for (const slot3 of PASS65_KILLSTREAK_SLOT_DEFINITIONS[2].allowedIds) {
          for (const slot4 of PASS65_KILLSTREAK_SLOT_DEFINITIONS[3].allowedIds) {
            if (slot3 === slot4) continue;
            for (const slot5 of PASS65_KILLSTREAK_SLOT_DEFINITIONS[4].allowedIds) {
              const loadout = { schemaVersion: 1, slots: [slot1, slot2, slot3, slot4, slot5] };
              expect(validateKillstreakLoadout(loadout)).toEqual({ valid: true, errors: [] });
              expect(parseKillstreakLoadout(loadout).slots).toEqual(loadout.slots);
              legalCount += 1;
            }
          }
        }
      }
    }
    expect(legalCount).toBe(144);

    expect(validateKillstreakLoadout({ schemaVersion: 1, slots: ['yardhawk', 'piloted-drone', 'tri-pass', 'chopper', 'nuke'] })).toMatchObject({ valid: false });
    expect(validateKillstreakLoadout({ schemaVersion: 1, slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'tri-pass', 'nuke'] }).errors).toEqual(expect.arrayContaining([
      'duplicate killstreak tri-pass',
      'slots 3 and 4 must be distinct',
    ]));
    expect(validateKillstreakLoadout({ schemaVersion: 1, slots: ['scout-sweep', 'yardhawk', 'nuke', 'chopper', 'drone-swarm'] }).errors).toEqual(expect.arrayContaining([
      'slot 3 does not allow nuke',
      'nuke and drone-swarm are mutually exclusive slot-5 alternatives',
    ]));
    expect(validateKillstreakLoadout({ schemaVersion: 1, slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'future-free-text'] }).errors).toEqual(expect.arrayContaining([
      'slot 5 contains unknown killstreak future-free-text',
      'slot 5 does not allow future-free-text',
    ]));
    expect(validateKillstreakLoadout({ schemaVersion: 1, slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'], extra: true }).errors).toContain('loadout has unknown key extra');
  });

  it('auto-enrolls two future eligible streaks exactly once and makes every reward reachable', () => {
    const catalog = createKillstreakCatalog([
      ...PASS65_KILLSTREAK_SOURCES,
      futureSource('future-orbital-lance', 5),
      futureSource('future-decoy-wing', 7, 'care-only'),
    ]);
    expect(catalog.carePackagePool.nonNukeBaseWeightTotal).toBe(135);
    expect(catalog.carePackagePool.totalWeightUnits).toBe(13_500);
    expect(catalog.carePackagePool.entries.filter((entry) => entry.id === 'future-orbital-lance')).toHaveLength(1);
    expect(catalog.carePackagePool.entries.filter((entry) => entry.id === 'future-decoy-wing')).toHaveLength(1);
    expect(catalog.carePackagePool.entries.find((entry) => entry.id === 'future-orbital-lance')?.weightUnits).toBe(495);
    expect(catalog.carePackagePool.entries.find((entry) => entry.id === 'future-decoy-wing')?.weightUnits).toBe(693);
    expect(catalog.carePackagePool.entries.find((entry) => entry.id === 'nuke')?.weightUnits).toBe(135);
    for (const entry of catalog.carePackagePool.entries) {
      expect(rewardForCarePackageUnit(catalog, entry.startInclusive)).toBe(entry.id);
      expect(rewardForCarePackageUnit(catalog, entry.endExclusive - 1)).toBe(entry.id);
    }
  });

  it('recomputes on rename, cost, retirement, and base-weight changes without stale mirrors', () => {
    const added = [...PASS65_KILLSTREAK_SOURCES, futureSource('future-strike', 5)];
    const initial = createKillstreakCatalog(added);
    const renamedAndRepriced = createKillstreakCatalog(added.map((entry) => entry.id === 'future-strike'
      ? { ...entry, displayName: 'Future Strike Mk II', cost: 11 }
      : entry));
    expect(renamedAndRepriced.carePackagePool).toEqual(initial.carePackagePool);

    const reweighted = createKillstreakCatalog(added.map((entry) => entry.id === 'future-strike'
      ? { ...entry, carePackageBaseWeightUnits: 8 }
      : entry));
    expect(reweighted.carePackagePool.nonNukeBaseWeightTotal).toBe(131);
    expect(reweighted.carePackagePool.totalWeightUnits).toBe(13_100);
    expect(reweighted.carePackagePool.entries.find((entry) => entry.id === 'future-strike')?.weightUnits).toBe(792);
    expect(reweighted.carePackagePool.entries.find((entry) => entry.id === 'nuke')?.weightUnits).toBe(131);

    const retired = createKillstreakCatalog(added.map((entry) => entry.id === 'future-strike'
      ? { ...entry, availability: 'retired' as const, carePackageBaseWeightUnits: 0 }
      : entry));
    expect(retired.carePackagePool.entries.map((entry) => entry.id)).not.toContain('future-strike');
    expect(retired.definitions.find((entry) => entry.id === 'future-strike')?.carePackageWeightUnits).toBe(0);
    expect(retired.carePackagePool.totalWeightUnits).toBe(12_300);
  });

  it('rejects silent omissions, duplicate IDs, authored derived weights, and unsafe arithmetic', () => {
    expect(() => createKillstreakCatalog([
      ...PASS65_KILLSTREAK_SOURCES,
      futureSource('future-zero-weight', 0),
    ])).toThrow(/requires positive base weight/);
    expect(() => createKillstreakCatalog([
      ...PASS65_KILLSTREAK_SOURCES,
      { ...futureSource('scout-sweep', 5) },
    ])).toThrow(/IDs must be unique/);
    expect(() => createKillstreakCatalog(PASS65_KILLSTREAK_SOURCES.map((entry) => entry.id === 'yardhawk'
      ? { ...entry, carePackageWeightUnits: 1_584 }
      : entry) as unknown as readonly KillstreakCatalogSourceDefinition[])).toThrow(/unknown=\[carePackageWeightUnits\]/);
    expect(() => createKillstreakCatalog([
      ...PASS65_KILLSTREAK_SOURCES,
      futureSource('future-overflow', Number.MAX_SAFE_INTEGER),
    ])).toThrow(/safe-integer range/);
    expect(() => rewardForCarePackageUnit(PASS65_KILLSTREAK_CATALOG, -1)).toThrow(/out of range/);
    expect(() => rewardForCarePackageUnit(
      PASS65_KILLSTREAK_CATALOG,
      PASS65_KILLSTREAK_CATALOG.carePackagePool.totalWeightUnits,
    )).toThrow(/out of range/);
  });

  it('applies the same strict extension boundaries used by the manifest authority gate', () => {
    const boundary = {
      ...futureSource('future-schema-boundary', 5),
      displayName: 'D'.repeat(80),
      relationship: 'r'.repeat(96),
      cost: 100,
    };
    expect(() => createKillstreakCatalog([...PASS65_KILLSTREAK_SOURCES, boundary])).not.toThrow();
    expect(() => createKillstreakCatalog([
      ...PASS65_KILLSTREAK_SOURCES,
      { ...boundary, id: 'future-whitespace-name', displayName: '   ' },
    ])).toThrow(/invalid display name/);
    expect(() => createKillstreakCatalog([
      ...PASS65_KILLSTREAK_SOURCES,
      { ...boundary, id: 'future-long-name', displayName: 'D'.repeat(81) },
    ])).toThrow(/invalid display name/);
    expect(() => createKillstreakCatalog([
      ...PASS65_KILLSTREAK_SOURCES,
      { ...boundary, id: 'future-long-relationship', relationship: 'r'.repeat(97) },
    ])).toThrow(/invalid relationship/);
    expect(() => createKillstreakCatalog([
      ...PASS65_KILLSTREAK_SOURCES,
      { ...boundary, id: 'future-null-cost', cost: null },
    ] as unknown as readonly KillstreakCatalogSourceDefinition[])).toThrow(/invalid cost/);
  });
});
