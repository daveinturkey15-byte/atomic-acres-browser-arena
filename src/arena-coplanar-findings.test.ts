/**
 * HF-434 instrument, pass 96 all-arenas lane: the per-arena FINDING-class
 * ceilings, derived from the ARENA_IDS roster itself and never above the
 * measured value.
 *
 * WHY A TABLE OF CEILINGS. `scripts/qa/find-coplanar-pairs.ts` counts, per
 * arena, the pairs of horizontal TOP faces within 0.03 m whose plans overlap
 * and whose materials differ with no polygonOffset to pin the race - the
 * geometry class that actually z-fights. This file pins what that instrument
 * measured on the pass 96 base so the counts can only go DOWN without a
 * deliberate edit here: a new flush pair anywhere fails its arena's row, and
 * fixing an arena below its ceiling never goes stale.
 *
 * raid2 and farcrysis are pinned AT zero - pass 96 tiered or cleared every
 * pair their sweeps found (raid2 by the COPLANAR_CLEARANCE stagger; every
 * farcrysis pair was authored-invisible proxy geometry the instrument now
 * names UNAUDITED). The remaining arenas keep their measured counts as
 * ceilings: they are honest headroom, not permissions.
 *
 * The roster comes from `ARENA_IDS`. A new arena id with no row here is a
 * compile error (the table is `Record<ArenaId, ...>`), and an arena retired
 * from the roster cannot leave a stale row behind.
 */
import { describe, expect, it } from 'vitest';
import { ARENA_IDS, type ArenaId } from './arena-identity';
import { prepareMap3 } from './map3-arena';
import { scanArena, type CoplanarScan } from '../scripts/qa/find-coplanar-pairs';

/**
 * MEASURED 2026-09-04, `npx tsx scripts/qa/find-coplanar-pairs.ts --all` at
 * head 465ae6b7 with the pass 96 raid2 clearance applied (full outputs:
 * `docs/evidence/pass96/all-arenas-air-and-coplanar/{before,after}-sweep.txt`).
 * HOUSE-INTERIOR and STREET are authored-footprint classes and their tables
 * exist only on nuketown2; they measured 0 everywhere.
 */
const MEASURED_FINDING_CLASSES: Record<ArenaId, Readonly<{
  findings: number;
  houseInterior: number;
  street: number;
}>> = {
  nuketown2: { findings: 0, houseInterior: 0, street: 0 },
  raid2: { findings: 0, houseInterior: 0, street: 0 },
  'atomic-acres': { findings: 25, houseInterior: 0, street: 0 },
  'skyline-terminal': { findings: 39, houseInterior: 0, street: 0 },
  'rustworks-1v1': { findings: 11, houseInterior: 0, street: 0 },
  'gun-range': { findings: 43, houseInterior: 0, street: 0 },
  farcrysis: { findings: 0, houseInterior: 0, street: 0 },
  'high-seas': { findings: 8, houseInterior: 0, street: 0 },
  test1: { findings: 21, houseInterior: 0, street: 0 },
  test2: { findings: 33, houseInterior: 0, street: 0 },
  map3: { findings: 1, houseInterior: 0, street: 0 },
};

// MAP3's eighth corridor needs its wasm resolved before the synchronous
// build, exactly as in the arena's own layout suites.
await prepareMap3();

const scanByArena: Partial<Record<ArenaId, CoplanarScan>> = {};
for (const arenaId of ARENA_IDS) scanByArena[arenaId] = scanArena(arenaId);

describe('every arena stays at or under its measured coplanar findings', () => {
  it('audits the whole roster - no arena without a scan, none without a ceiling', () => {
    for (const arenaId of ARENA_IDS) {
      expect(scanByArena[arenaId], `${arenaId} was not scanned`).toBeDefined();
      expect(MEASURED_FINDING_CLASSES[arenaId], `${arenaId} has no measured ceiling row`).toBeDefined();
    }
  });

  for (const arenaId of ARENA_IDS) {
    const ceiling = MEASURED_FINDING_CLASSES[arenaId];
    it(`${arenaId}: FINDINGS <= ${ceiling.findings}`, () => {
      const counts = scanByArena[arenaId]!.counts;
      expect(counts.findings, `${arenaId} FINDINGS ${counts.findings} exceeds the measured ceiling ${ceiling.findings}`)
        .toBeLessThanOrEqual(ceiling.findings);
    });
    it(`${arenaId}: HOUSE-INTERIOR <= ${ceiling.houseInterior}, STREET <= ${ceiling.street}`, () => {
      const counts = scanByArena[arenaId]!.counts;
      expect(counts.houseInterior, `${arenaId} HOUSE-INTERIOR ${counts.houseInterior} exceeds the measured ceiling ${ceiling.houseInterior}`)
        .toBeLessThanOrEqual(ceiling.houseInterior);
      expect(counts.street, `${arenaId} STREET ${counts.street} exceeds the measured ceiling ${ceiling.street}`)
        .toBeLessThanOrEqual(ceiling.street);
    });
  }

  it('raid2 and farcrysis read zero on every finding class', () => {
    for (const arenaId of ['raid2', 'farcrysis'] as const) {
      const counts = scanByArena[arenaId]!.counts;
      expect(counts.findings, `${arenaId} FINDINGS`).toBe(0);
      expect(counts.houseInterior, `${arenaId} HOUSE-INTERIOR`).toBe(0);
      expect(counts.street, `${arenaId} STREET`).toBe(0);
    }
  });
});
