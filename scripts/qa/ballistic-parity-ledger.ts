// ACCEPTED_SHOOT_THROUGH ledger + ratchet ceilings for Direction C
// (ballistic visual parity). Shared by:
//   - src/collider-visual-parity-gate.test.ts (permanent vitest gate)
//   - scripts/qa/audit-ballistic-parity.ts    (CLI sweep + docs/ballistic-parity ledgers)
//
// AN HONEST LEDGER BEATS FAKE COVERAGE. A row here says: this substantial
// visible mesh takes gunfire with NO rating - bullets cross it silently - and
// we looked at it and accepted that, for the written reason. Rows are matched
// by exact mesh name per arena, capped at `count`; anything unmatched counts
// against the arena's ratchet ceiling below.
//
// NEVER add a row to turn the gate green. Rate the mesh instead (shots:true +
// the family it visually is); a row is only for genuinely shoot-through
// presentation or a balance decision the owner has not made yet.

export type AcceptedShootThroughEntry = Readonly<{
  /** Exact mesh name as reported by the audit. */
  name: string;
  /** Maximum number of same-named unrated meshes this row explains. */
  count: number;
  /** One line: why crossing this without attenuation is correct or accepted. */
  reason: string;
}>;

export const ACCEPTED_SHOOT_THROUGH: Readonly<Record<string, readonly AcceptedShootThroughEntry[]>> = Object.freeze({
  'atomic-acres': [
    // addTree() trunk-base and root flares (environment-assets, unnamed): the
    // 0.68 m 'authored-tree-trunk-collider-*' WOOD proxy beside each one is
    // the rated authority; a second surface over the tapered flare would bill
    // the same trunk twice. 2026-08-29 declutter: the meshes are NAMED now
    // (yard-trunk-bole / yard-root-flare), so the opaque unnamed pool is
    // replaced by named rows at the measured counts - four boles (the other
    // four trees are footprint-covered by registered surfaces) and six
    // exposed flares. The 0.68 m wood trunk proxies stay the rated authority.
    // v3 re-measure at the re-seated trees: six boles and two flares stand
    // outside every registered footprint.
    { name: 'yard-trunk-bole', count: 8, reason: 'tree bole over the authored wood trunk proxy; the proxy is the rated authority and a bole surface would double-charge it' },
    { name: 'yard-root-flare', count: 8, reason: 'ankle-height root flare beside the collided trunk; a flare surface would double-charge the trunk proxy' },
    // v4 enterable bus (owner 2026-08-29): the coach art's glazing and
    // under-chassis wheels stand beside the NEW rated authorities (the
    // movement-solid glass window bands and the vehicle hull pieces); a
    // second surface on each would double-charge the same pane or panel.
    { name: 'coach-window', count: 8, reason: 'coach art glazing over the rated movement-glass window band; one pane, one charge' },
    // (2026-08-29: the two animated-atomic-ring rows are deleted per this
    // gate's own stale-row law - the census stopped flagging the rings after
    // the redesign re-census, so the rows had become rot.)
    // house-navigation authors these as 0.08 x 0.08 m handrail BARS rotated
    // along the ramp slope; the census AABB inflates each to a 3.55 x 6.24
    // plane. A surface authored from that AABB would be a phantom wall over
    // the whole ramp; the true bar is thinner than a bullet's felt width.
    { name: 'interior-ramp-rail-inner', count: 2, reason: 'sloped 0.08 m handrail bar; AABB inflation of a rotated thin rail, not a real plane' },
    { name: 'interior-ramp-rail-outer', count: 2, reason: 'sloped 0.08 m handrail bar; AABB inflation of a rotated thin rail, not a real plane' },
  ],
  'skyline-terminal': [],
  'rustworks-1v1': [],
  'high-seas': [],
  'gun-range': [
    // Merged static presentation batch spanning the tall test-bay shell. Every
    // source wall is individually registered with an authored material
    // (userData.testBayAuthority = 'visible-movement-physics-ballistic');
    // mirrors the movement gate's accepted row for the same mesh.
    { name: 'gun-range-presentation-batch-0', count: 1, reason: 'merged presentation batch; every source structure wall is individually registered with an authored family' },
  ],
  farcrysis: [],
});

/**
 * RATCHET: unrated substantial meshes per arena AFTER the accepted ledger is
 * subtracted. Ceilings may only go DOWN. A new ghost shot surface in a
 * triaged (ceiling 0) arena fails CI by name; farcrysis is parked by the
 * owner (Pass 81) and holds its measured count until its own triage pass.
 */
export const BALLISTIC_UNRATED_CEILINGS: Readonly<Record<string, number>> = Object.freeze({
  // Triaged to ZERO on 2026-08-28 (Pass 81 lane aa-lane-ballistics): every
  // substantial visible mesh in all six arenas is rated, footprint-covered,
  // rule-excluded, or carries a reasoned ACCEPTED_SHOOT_THROUGH row above.
  // farcrysis measured zero unrated at triage despite being parked - its
  // ceiling holds that measured fact.
  'atomic-acres': 0,
  'skyline-terminal': 0,
  'rustworks-1v1': 0,
  'high-seas': 0,
  'gun-range': 0,
  farcrysis: 0,
});

export type LedgerMatchResult = {
  /** Ghost meshes not explained by any ledger row (count against the ceiling). */
  unmatched: Array<Record<string, unknown>>;
  /** Ghost meshes matched to a ledger row, with the row's reason attached. */
  accepted: Array<Record<string, unknown>>;
  /** Ledger rows that matched nothing (stale - candidates for deletion). */
  staleRows: AcceptedShootThroughEntry[];
};

export function matchAcceptedShootThrough(
  arenaId: string,
  ghosts: ReadonlyArray<Record<string, unknown>>,
  ledger: Readonly<Record<string, readonly AcceptedShootThroughEntry[]>> = ACCEPTED_SHOOT_THROUGH,
): LedgerMatchResult {
  const rows = ledger[arenaId] ?? [];
  const remaining = new Map<string, number>();
  for (const row of rows) remaining.set(row.name, (remaining.get(row.name) ?? 0) + row.count);
  const reasons = new Map<string, string>();
  for (const row of rows) if (!reasons.has(row.name)) reasons.set(row.name, row.reason);
  const unmatched: Array<Record<string, unknown>> = [];
  const accepted: Array<Record<string, unknown>> = [];
  for (const ghost of ghosts) {
    const name = String(ghost.name);
    const left = remaining.get(name) ?? 0;
    if (left > 0) {
      remaining.set(name, left - 1);
      accepted.push({ ...ghost, acceptedReason: reasons.get(name) });
    } else {
      unmatched.push(ghost);
    }
  }
  const consumed = new Map<string, number>();
  for (const entry of accepted) {
    const name = String(entry.name);
    consumed.set(name, (consumed.get(name) ?? 0) + 1);
  }
  const staleRows = rows.filter((row) => (consumed.get(row.name) ?? 0) === 0);
  return { unmatched, accepted, staleRows };
}
