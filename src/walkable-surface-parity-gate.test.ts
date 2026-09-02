import { describe, expect, it } from 'vitest';
import {
  ALL_ARENA_IDS,
  WALKABLE_NAME_RULES,
  runWalkableSurfaceParityAudit,
  type WalkableArenaResult,
} from '../scripts/qa/walkable-surface-parity-core';

/**
 * PERMANENT GATE for Direction D - FALL-THROUGH FLOOR
 * (scripts/qa/walkable-surface-parity-core.ts, the same engine the CLI sweep
 * `npx tsx scripts/qa/audit-walkable-surface-parity.ts` runs).
 *
 * HF-411, owner on Firing Range 2026-09-02: "on firing range sometimes you go
 * to run onto a metal fence layed as a floor on the roof level of the map and
 * you fall through it, fix all that shit."
 *
 * The question: every VISIBLE mesh with a real, horizontal, elevated top face
 * big enough to stand on must have movement authority under ALL of it. The
 * existing collider/visual gate cannot ask this - Direction A walks from
 * colliders (so a surface with none is invisible to it) and Direction B only
 * censuses tall narrow cover and explicitly name-excludes "walkable surface".
 *
 * SCOPE, stated honestly. Direction D has no reachability model: it does not
 * know whether a player can GET to an elevated slab. Every entry in the ledger
 * below was triaged by hand for that, and the ledger is the mechanism that
 * keeps a real regression from hiding among them. It may only ever SHRINK.
 */
type LedgerRow = {
  name: string;
  centre: [number, number, number];
  reason: string;
};

const CENTRE_TOLERANCE = 0.06;

/**
 * Triaged 2026-09-02 against the PASS 84 tree. Arenas this lane owns (test1,
 * test2) and the arena that entered at zero (map3) have NO ledger and must
 * stay at zero. Everything else is a pre-existing finding on geometry owned by
 * another PASS 85 lane, recorded with what it is and who owns it rather than
 * silently excused by a threshold.
 */
const ACCEPTED_FALL_THROUGH: Record<string, LedgerRow[]> = {
  test1: [],
  test2: [],
  map3: [],
  'atomic-acres': [
    // Nuke Town geometry - Lane U (HF-407) is rebuilding this arena's layout.
    // Four garage roof planes whose ridge sits 1.05 m above the box collider
    // under them: a pitched roof modelled as two slabs with one prism collider.
    { name: 'garage-pitched-roof', centre: [-2.33, 5.12, -12.5], reason: 'pitched garage roof over a prism collider; Nuke Town geometry, Lane U' },
    { name: 'garage-pitched-roof', centre: [2.33, 5.12, 12.5], reason: 'pitched garage roof over a prism collider; Nuke Town geometry, Lane U' },
    { name: 'garage-pitched-roof', centre: [-7.87, 5.12, -12.5], reason: 'pitched garage roof over a prism collider; Nuke Town geometry, Lane U' },
    { name: 'garage-pitched-roof', centre: [7.87, 5.12, 12.5], reason: 'pitched garage roof over a prism collider; Nuke Town geometry, Lane U' },
    // Jersey-barrier caps overhanging their collider by 0.2 m - a step, not a
    // fall: the drop equals SUPPORT_TOLERANCE exactly and lands on the barrier.
    { name: 'barrier-cap', centre: [27, 2.26, -13], reason: '0.20 m cap overhang onto the barrier below; Nuke Town geometry, Lane U' },
    { name: 'barrier-cap', centre: [-27, 2.26, 13], reason: '0.20 m cap overhang onto the barrier below; Nuke Town geometry, Lane U' },
    { name: 'barrier-cap', centre: [-9, 2.26, -26], reason: '0.20 m cap overhang onto the barrier below; Nuke Town geometry, Lane U' },
    { name: 'barrier-cap', centre: [9, 2.26, 26], reason: '0.20 m cap overhang onto the barrier below; Nuke Town geometry, Lane U' },
    { name: 'barrier-cap', centre: [-10.1, 0.81, -1.3], reason: '0.20 m cap overhang onto the barrier below; Nuke Town geometry, Lane U' },
    { name: 'barrier-cap', centre: [10.1, 0.81, 1.3], reason: '0.20 m cap overhang onto the barrier below; Nuke Town geometry, Lane U' },
    { name: 'barrier-cap', centre: [-8.1, 1.56, -1.6], reason: '0.20 m cap overhang onto the barrier below; Nuke Town geometry, Lane U' },
    { name: 'barrier-cap', centre: [8.1, 1.56, 1.6], reason: '0.20 m cap overhang onto the barrier below; Nuke Town geometry, Lane U' },
    { name: 'cargo-crate', centre: [-8.05, 1.21, -26], reason: 'crate lid overhanging its collider by 0.24 m; Nuke Town geometry, Lane U' },
    // The bus. Lane K owns its doors and interior; the deck lips overhang the
    // floor collider by ~0.11 m at the aisle edge.
    { name: 'coach-deck', centre: [-5.2, 2.25, 0.1], reason: 'coach deck lip over the aisle collider; bus interior, Lane K' },
    { name: 'coach-deck', centre: [5.2, 2.25, -0.1], reason: 'coach deck lip over the aisle collider; bus interior, Lane K' },
  ],
  'rustworks-1v1': [
    { name: 'rustworks-derrick-service-platform', centre: [0, 11.32, 0], reason: 'derrick platform 11.3 m up with no collider; no authored route to it - reachability unverified, needs its own lane' },
  ],
  'gun-range': [
    // Gun Range geometry belongs to Lane J today (HF-411 brief, boundaries).
    { name: 'gun-range-ceiling', centre: [0, 7.32, -14.5], reason: 'range shell ceiling seen from above; Gun Range geometry, Lane J' },
  ],
  'skyline-terminal': [
    // Skyline Terminal geometry belongs to Lane J today (HF-411 brief).
    { name: 'skyline-presentation-batch-32', centre: [0, 5.57, -6], reason: 'merged presentation batch AABB, not a single surface; Terminal geometry, Lane J' },
    { name: 'skyline-quality-wing-port', centre: [-0.25, 2.96, 12], reason: 'aircraft wing overhanging its collider by 0.20 m; Terminal geometry, Lane J' },
    { name: 'skyline-quality-wing-starboard', centre: [-0.25, 2.96, -8], reason: 'aircraft wing overhanging its collider by 0.20 m; Terminal geometry, Lane J' },
    { name: 'skyline-quality-uld--20-18', centre: [-20, 2.66, 18], reason: 'ULD container lid 0.20 m proud of its collider; Terminal geometry, Lane J' },
    { name: 'skyline-quality-uld-20-18', centre: [20, 2.66, 18], reason: 'ULD container lid 0.20 m proud of its collider; Terminal geometry, Lane J' },
    { name: 'skyline-quality-uld--12-26', centre: [-12, 2.66, 26], reason: 'ULD container lid 0.20 m proud of its collider; Terminal geometry, Lane J' },
    { name: 'skyline-quality-uld-12-26', centre: [12, 2.66, 26], reason: 'ULD container lid 0.20 m proud of its collider; Terminal geometry, Lane J' },
    { name: 'skyline-quality-uld-0-28', centre: [0, 2.66, 28], reason: 'ULD container lid 0.20 m proud of its collider; Terminal geometry, Lane J' },
  ],
  farcrysis: [
    // Farcrysis is selectable:false (map-selection.ts) until its load path is
    // fixed; every row here is a real finding on a hidden arena.
    { name: 'farcrysis-art-tower-platform', centre: [-8.5, 4.89, -8.5], reason: 'radio-tower platform with no collider; hidden arena, Farcrysis lane' },
    { name: 'farcrysis-art-cave-arch-top', centre: [52, 3.18, 32], reason: 'cave arch crown with no collider; hidden arena, Farcrysis lane' },
    { name: '(unnamed Mesh)', centre: [47.66, 1.55, -47.71], reason: 'unnamed shore slab overhanging its plate; hidden arena, Farcrysis lane' },
    { name: 'farcrysis-art-tower-dish', centre: [-8.5, 6.23, -8.5], reason: 'tower dish top face; hidden arena, Farcrysis lane' },
    { name: 'farcrysis-crate-ne-stack-top', centre: [27.43, 3.5, -30.34], reason: 'crate stack lid 0.9 m proud of its collider; hidden arena, Farcrysis lane' },
    { name: 'farcrysis-crate-sw-stack-top', centre: [-27.43, 6.3, 30.34], reason: 'crate stack lid 0.9 m proud of its collider; hidden arena, Farcrysis lane' },
    { name: 'farcrysis-crate-se-stack-top', centre: [30.34, 6.15, 27.43], reason: 'crate stack lid 0.9 m proud of its collider; hidden arena, Farcrysis lane' },
    { name: 'farcrysis-crate-nw-stack-top', centre: [-30.34, 6.56, -27.43], reason: 'crate stack lid 0.9 m proud of its collider; hidden arena, Farcrysis lane' },
  ],
  'high-seas': [
    { name: 'high-seas-bow-upper-chart-table-top', centre: [6.6, 6.98, -18], reason: 'chart table top 0.8 m proud of the table collider; High Seas lane' },
    { name: 'high-seas-stern-upper-chart-table-top', centre: [6.6, 6.98, 18], reason: 'chart table top 0.8 m proud of the table collider; High Seas lane' },
    { name: 'high-seas-cabana-table', centre: [6.55, 4.03, 0], reason: 'cabana table top 0.85 m proud of the table collider; High Seas lane' },
  ],
};

let auditPromise: Promise<WalkableArenaResult[]> | null = null;
function audit(): Promise<WalkableArenaResult[]> {
  auditPromise ??= runWalkableSurfaceParityAudit(ALL_ARENA_IDS);
  return auditPromise;
}

describe('walkable-surface parity gate (Direction D, all nine arenas)', () => {
  it('constructs every arena without audit errors', async () => {
    const results = await audit();
    expect(results.map(({ id }) => id)).toEqual([...ALL_ARENA_IDS]);
    for (const result of results) {
      expect(result.error, `${result.id} failed to construct`).toBeUndefined();
    }
  }, 300_000);

  it('censuses walkable visuals on EVERY arena (a zero census is a blind gate)', async () => {
    const results = await audit();
    // Two arenas censused zero surfaces in the first run of this sweep, and the
    // cause was an exclusion pattern colliding with their NAME: /sea/ ate all
    // 260 meshes of `high-seas`, /sky/ ate all of `skyline-terminal`. A sweep
    // that reports "clean" because it looked at nothing is the failure mode
    // this repo has already paid for; pin it.
    for (const result of results) {
      expect(result.census ?? 0, `${result.id} censused no walkable visuals`).toBeGreaterThan(0);
    }
  }, 300_000);

  it('never lets an exclusion pattern match an arena id', () => {
    for (const arenaId of ALL_ARENA_IDS) {
      for (const rule of WALKABLE_NAME_RULES) {
        expect(
          rule.pattern.test(arenaId),
          `${rule.pattern} matches the arena id "${arenaId}", so every mesh on it would be excluded`,
        ).toBe(false);
      }
    }
  });

  it('finds NO fall-through floor beyond the accepted, triaged ledger', async () => {
    const results = await audit();
    for (const result of results) {
      const accepted = ACCEPTED_FALL_THROUGH[result.id] ?? [];
      const unexpected = (result.findings ?? []).filter((finding) => !accepted.some((row) => (
        row.name === finding.name
        && Math.abs(row.centre[0] - finding.centre[0]) <= CENTRE_TOLERANCE
        && Math.abs(row.centre[1] - finding.centre[1]) <= CENTRE_TOLERANCE
        && Math.abs(row.centre[2] - finding.centre[2]) <= CENTRE_TOLERANCE
      )));
      expect(
        unexpected.map((finding) => `${finding.name} @ ${JSON.stringify(finding.centre)}`
          + ` ${Math.round(finding.unsupportedShare * 100)}% unsupported, ${finding.dropM} m drop`),
        `${result.id}: new fall-through floors need a fix or a triaged ledger row`,
      ).toEqual([]);
    }
  }, 300_000);

  it('keeps Firing Range, Raid and Map 3 at ZERO fall-through floors', async () => {
    const results = await audit();
    // HF-411's own arenas. These have no ledger and never get one: a finding
    // here is the owner's bug coming back.
    for (const arenaId of ['test1', 'test2', 'map3']) {
      const result = results.find(({ id }) => id === arenaId)!;
      expect(ACCEPTED_FALL_THROUGH[arenaId], `${arenaId} must keep an empty ledger`).toEqual([]);
      expect(result.findings ?? [], `${arenaId}: fall-through floors`).toEqual([]);
      expect(result.supported).toBe(result.census);
    }
  }, 300_000);

  it('has no stale ledger row (a row that excuses geometry that is gone)', async () => {
    const results = await audit();
    for (const result of results) {
      const findings = result.findings ?? [];
      const stale = (ACCEPTED_FALL_THROUGH[result.id] ?? []).filter((row) => !findings.some((finding) => (
        row.name === finding.name
        && Math.abs(row.centre[0] - finding.centre[0]) <= CENTRE_TOLERANCE
        && Math.abs(row.centre[1] - finding.centre[1]) <= CENTRE_TOLERANCE
        && Math.abs(row.centre[2] - finding.centre[2]) <= CENTRE_TOLERANCE
      )));
      expect(
        stale.map((row) => `${row.name} @ ${JSON.stringify(row.centre)}`),
        `${result.id}: stale ledger rows - the geometry they excused is fixed or gone, delete them`,
      ).toEqual([]);
    }
  }, 300_000);

  it('gives every arena an explicit ledger, even an empty one', () => {
    for (const arenaId of ALL_ARENA_IDS) {
      expect(ACCEPTED_FALL_THROUGH[arenaId], `${arenaId} must have an explicit (possibly empty) ledger`).toBeDefined();
    }
    expect(Object.keys(ACCEPTED_FALL_THROUGH).sort()).toEqual([...ALL_ARENA_IDS].sort());
  });
});
