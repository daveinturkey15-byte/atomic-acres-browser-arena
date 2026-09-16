import { expect, it, describe } from 'vitest';
import {
  ALL_ARENA_IDS,
  runColliderVisualParityAudit,
  type ArenaAuditResult,
} from '../scripts/qa/collider-visual-parity-core';
import {
  ACCEPTED_SHOOT_THROUGH,
  BALLISTIC_UNRATED_CEILINGS,
  matchAcceptedShootThrough,
} from '../scripts/qa/ballistic-parity-ledger';

/**
 * PERMANENT GATE for the mechanical collider/visual parity audit
 * (scripts/qa/collider-visual-parity-core.ts — the same engine the CLI sweep
 * `npx tsx scripts/qa/audit-collider-visual-parity.ts` runs).
 *
 * Direction A is a HARD zero-findings gate: every authoritative movement
 * collider in all six arenas must be explained by a visible mesh.
 *
 * Direction B (visible meshes the player can walk through) currently has eight
 * ACCEPTED findings across two arenas, each triaged with a documented reason
 * below. The gate fails on any NEW walk-through mesh so an arena rebuild can
 * never silently reintroduce this defect class again. Removing geometry that
 * fixes an accepted entry shrinks the ledger; it must never grow without a new
 * documented reason here.
 */
const ACCEPTED_WALK_THROUGH: Record<string, Array<{ name: string; centre: [number, number, number]; reason: string }>> = {
  'atomic-acres': [
    // REDESIGN 2026-08-29: the three greenhouse-frame-wall rows are CLOSED -
    // the walls carry real movement colliders now the west side spawns (the
    // deferral's reason) are gone. The ledger shrinks, as its own contract
    // demands for fixed entries.
    // addTree() root flares (environment-assets.ts): decorative buttress roots
    // hugging the base of an authored tree whose trunk IS collided
    // (authored-tree-trunk-collider-*). Ankle-height dressing partially sunk
    // into the ground; the player collides with the trunk beside them. The
    // rear hedges that used to swallow two of the four flares died in the
    // 2026-08-29 redesign, so all four now stand in the open rear yards.
    // v3: the rear-yard trees re-seated to (+/-9, -/+28.5); all four flares
    // of each stand in the open yards now. Same reason as ever: the trunk's
    // wood proxy is the authority and a flare is ankle-height dressing.
    { name: 'yard-root-flare', centre: [-9, 0.22, -28.03], reason: 'decorative root flare around a collided trunk' },
    { name: 'yard-root-flare', centre: [-8.53, 0.22, -28.5], reason: 'decorative root flare around a collided trunk' },
    { name: 'yard-root-flare', centre: [-9, 0.22, -28.97], reason: 'decorative root flare around a collided trunk' },
    { name: 'yard-root-flare', centre: [-9.47, 0.22, -28.5], reason: 'decorative root flare around a collided trunk' },
    { name: 'yard-root-flare', centre: [9, 0.22, 28.97], reason: 'decorative root flare around a collided trunk' },
    { name: 'yard-root-flare', centre: [9.47, 0.22, 28.5], reason: 'decorative root flare around a collided trunk' },
    { name: 'yard-root-flare', centre: [9, 0.22, 28.03], reason: 'decorative root flare around a collided trunk' },
    { name: 'yard-root-flare', centre: [8.53, 0.22, 28.5], reason: 'decorative root flare around a collided trunk' },
  ],
  map3: [
    // MAP3 (HF-409, 2026-09-02): the two self-driving rovers - one on the
    // forest trail, one fording the shoreline shallows. They are the moving
    // half of two exhibits (vegetation bending under a vehicle; a bow wave and
    // wheel roostertails on water), they drive themselves every frame, and a
    // Box2 collider is a STATIC world rectangle. Colliding them where they
    // stood at t=0 would put an invisible car in the middle of the trail and
    // leave the real one intangible: strictly worse than presentation. Every
    // static solid these corridors own IS collided - 225 colliders, zero
    // invisible (re-measured 2026-09-02; an earlier note said 209, taken
    // before the sixteen hub waymarkers existed) - so this ledger covers the
    // moving bodies and nothing else.
    { name: 'map3-forest-rover-frame', centre: [0, 1.24, 33.8], reason: 'self-driving rover; a static collider would sit where it no longer is' },
    { name: 'map3-shoreline-rover-body', centre: [-26, 1.06, -33.87], reason: 'self-driving rover fording the shallows; a static collider would sit where it no longer is' },
    // MAP3 (HF-409 finisher 2, 2026-09-02): the eighth corridor - the Rapier
    // playground - joined the arena, and it is 131 rigid bodies in its own
    // physics world. These two are the same class as the rovers above and for
    // the same reason: a Box2 collider is a STATIC world rectangle, and the
    // paddle wheel is spinning on a revolute joint while the jenga instances
    // are a tower you knock over. Pinning either where it stood at t = 0
    // leaves an invisible obstacle in the aisle AND the real object
    // intangible, which is strictly worse than presentation.
    //
    // Everything in that corridor that does NOT move is collided: both kerbs
    // over its 51 m, the mouth threshold, the far back wall, the see-saw
    // fulcrum and both guide rails - seven new colliders, 225 -> 232 for the
    // arena, still zero invisible.
    { name: 'map3-physics-paddle-wheel', centre: [-24, 0.88, 75], reason: 'paddle wheel on a revolute joint; it spins every frame the balls hit it' },
    { name: 'map3-physics-jenga-block', centre: [-24, 0.88, 43], reason: 'the jenga tower: 45 dynamic bodies in one instanced mesh, authored to be knocked down' },
  ],
  'gun-range': [
    // Merged static presentation batch (userData.presentationOnly): a batched
    // copy of visual-detail sources whose solidity is owned by the real
    // colliders; its own AABB spans the test-bay shell interior.
    { name: 'gun-range-presentation-batch-0', centre: [75.7, 12.54, 6.32], reason: 'presentation-only merged static batch; solidity owned by source colliders' },
    // Wallbang penetration lab panels are authored solid:false / shots:true
    // (additional-maps.ts): they exist to be shot THROUGH, sit behind the
    // firing-line physics barrier players cannot cross, and are flanked by
    // solid lab side walls.
    // HF-467: the lab went from four lanes to six (a thin-metal and a
    // structural-metal lane were added), so the row is re-pitched and these
    // two centres moved with it. Only the CENTRES changed - both panels are
    // the same authored shots:true/solid:false penetration targets they were.
    { name: 'gun-range-wallbang-panel-interior-wall', centre: [-12.7, 1.45, -7.6], reason: 'penetration-lab panel: authored shots:true/solid:false behind the firing-line barrier' },
    { name: 'gun-range-wallbang-panel-brick', centre: [-9.5, 1.45, -7.6], reason: 'penetration-lab panel: authored shots:true/solid:false behind the firing-line barrier' },
  ],
  'atomic-acres-rebuild': [
    // REBUILD graybox (2026-09-14): portal pillars in the entry gaps. The
    // pillar loop (atomic-acres-rebuild-arena.ts) runs px over
    // [-20,-12,-4,4,12,20] and pair() mirrors every step, so baseName
    // aarr-pillar-{south,north}-4 is built TWICE (px=-4 and px=+4) with the
    // east/west suffixes swapped - two meshes share each portal centre.
    // All eight stand inside the wall gaps that must stay passable (south
    // 8 m entry gap, north 6 m entrance gap); AuthorityGray commits the
    // wall runs only, so portal furniture stays non-solid and the lane
    // reads open. Pillars on the collided wall runs (+/-12, +/-20) are
    // explained by the wall colliders and are not listed here.
    { name: 'aarr-pillar-south-4-west', centre: [-6.4, 1.5, 38.4], reason: 'portal pillar in the south 8 m entry gap; gap must stay passable, solidity owned by the wall runs' },
    { name: 'aarr-pillar-south-4-east', centre: [6.4, 1.5, 38.4], reason: 'portal pillar in the south 8 m entry gap; gap must stay passable, solidity owned by the wall runs' },
    { name: 'aarr-pillar-north-4-west', centre: [-6.4, 1.5, -41.6], reason: 'portal pillar in the north 6 m entrance gap; gap must stay passable, solidity owned by the wall runs' },
    { name: 'aarr-pillar-north-4-east', centre: [6.4, 1.5, -41.6], reason: 'portal pillar in the north 6 m entrance gap; gap must stay passable, solidity owned by the wall runs' },
    { name: 'aarr-pillar-south-4-east', centre: [-6.4, 1.5, 38.4], reason: 'portal pillar in the south 8 m entry gap; second mesh at this centre from the mirrored pair() step' },
    { name: 'aarr-pillar-south-4-west', centre: [6.4, 1.5, 38.4], reason: 'portal pillar in the south 8 m entry gap; second mesh at this centre from the mirrored pair() step' },
    { name: 'aarr-pillar-north-4-east', centre: [-6.4, 1.5, -41.6], reason: 'portal pillar in the north 6 m entrance gap; second mesh at this centre from the mirrored pair() step' },
    { name: 'aarr-pillar-north-4-west', centre: [6.4, 1.5, -41.6], reason: 'portal pillar in the north 6 m entrance gap; second mesh at this centre from the mirrored pair() step' },
    // REBUILD graybox (2026-09-14): hedge rows are low planting massing
    // (1.0-1.2 m green blobs, atomic-acres-rebuild-arena.ts). AuthorityGray
    // commits no proxy for any hedge - they are soft lane/yard edging the
    // player steps through by design, keeping the yard lanes flowing; only
    // walls, fences, crates, vehicles, sheds and trunks are solid.
    { name: 'aarr-hedge-entry-east', centre: [-10.24, 0.6, 32], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-entry-west', centre: [10.24, 0.6, 32], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-loop-east', centre: [-19.52, 0.6, -6.88], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-loop-west', centre: [19.52, 0.6, -6.88], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-yard-east', centre: [-22.4, 0.6, 10.4], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-yard-west', centre: [22.4, 0.6, 10.4], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-back-east', centre: [-19.2, 0.6, -20.8], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-back-west', centre: [19.2, 0.6, -20.8], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-wall-east', centre: [-28.8, 0.6, 34.4], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-wall-west', centre: [28.8, 0.6, 34.4], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-pad-east', centre: [-22.4, 0.6, 23.36], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    { name: 'aarr-hedge-pad-west', centre: [22.4, 0.6, 23.36], reason: 'low planting massing; hedges are non-solid lane edging by design' },
    // Wave-3 prickly-pear placeholders: same class as hedges (non-solid
    // planting; Trellis GLBs land over them async with no authority).
    { name: 'aarr-pear--24-10', centre: [-38.4, 0.5, 16], reason: 'pear placeholder blob; non-solid planting by design' },
    { name: 'aarr-pear-24--8', centre: [38.4, 0.5, -12.8], reason: 'pear placeholder blob; non-solid planting by design' },
    { name: 'aarr-pear--8-24', centre: [-12.8, 0.5, 38.4], reason: 'pear placeholder blob; non-solid planting by design' },
    { name: 'aarr-pear-12--22', centre: [19.2, 0.5, -35.2], reason: 'pear placeholder blob; non-solid planting by design' },
  ],
};

/**
 * ACCEPTED merged-proxy colliders (Direction A). AuthorityGray commits
 * invisible merged proxies (proxy() hides the mesh so LayoutGray massing
 * stays the only visual) while LayoutGray authors the same volume as many
 * small individual meshes. Direction A matches ONE collider against ONE
 * mesh with a 0.35 footprint-share floor (EXPLAIN_XZ_COVERAGE), so a merged
 * proxy spanning N small meshes can never be "explained" no matter how
 * exactly the visuals cover it. Each row names the authority collider, its
 * measured centre/size, the visual mesh family that covers it, the
 * bestPartialCoverage the audit measured, and the design reason. The gate
 * fails on any NEW partially-covered collider, so a rebuild can never
 * silently grow this class without a documented row here.
 */
const ACCEPTED_MERGED_PROXY_COVERAGE: Record<string, Array<{
  collider: string;
  centre: [number, number, number];
  size: [number, number, number];
  mesh: string;
  coverage: number;
  reason: string;
}>> = {
  'atomic-acres-rebuild': [
    // South choke barricade (authority 257-260): ONE 4x3x1 merged proxy over
    // the 12 individual 1 m crates (4-wide x 3-tall, arena 245-249). Best
    // single-crate footprint share 1/4 = 0.25 < 0.35 floor. Merged by
    // design: one unbroken 4 m barricade body with no 1-crate gaps to snag on.
    { collider: 'aarr-choke-base', centre: [0, 1.5, 22.4], size: [6.4, 3, 1.6], mesh: 'aarr-choke-crate-* (12 individual 1 m crates)', coverage: 0.25, reason: 'merged-per-barricade proxy over 12 individual crates; single unbroken barricade body by design' },
    // Choke top row (authority 260): ONE 3x1x1 merged proxy over the 3
    // individual top-row crates (arena 250-252). Share 1/3 = 0.33 < 0.35.
    { collider: 'aarr-choke-top', centre: [0, 3.5, 22.4], size: [4.8, 1, 1.6], mesh: 'aarr-choke-crate-top-* (3 individual top-row crates)', coverage: 0.33, reason: 'merged top-row proxy over 3 individual crates; crowns the barricade as one body by design' },
    // Island cluster (authority 262-264): ONE 2.6x2.2x2.6 merged proxy over
    // the 5 individual island crates (2x2 + top, arena 254-257). Merged by
    // design: closes the gaps between the island crates so players cannot
    // wedge between them.
    { collider: 'aarr-island-crates', centre: [0, 1.1, 4.8], size: [4.16, 2.2, 4.16], mesh: 'aarr-island-crate-* (4 ground + top individual crates)', coverage: 0.32, reason: 'merged-per-cluster proxy over 5 individual crates; gap-free island stack by design' },
    // Yard clusters (authority 266-276): ONE 2x2x2 merged proxy per 4-crate
    // stack (3 ground + stacked top, arena 260-268). Best single-crate
    // share 1/4 = 0.25 < 0.35. Merged by design: one box per stack instead
    // of four touching bodies.
    { collider: 'aarr-yard-crates-west-north', centre: [-12, 1, -18.4], size: [3.2, 2, 3.2], mesh: 'aarr-yard-crate-w-n-* (4 individual crates)', coverage: 0.25, reason: 'merged-per-cluster proxy over a 4-crate yard stack by design' },
    { collider: 'aarr-yard-crates-east-north', centre: [13.6, 1, -20], size: [3.2, 2, 3.2], mesh: 'aarr-yard-crate-e-n-* (4 individual crates)', coverage: 0.25, reason: 'merged-per-cluster proxy over a 4-crate yard stack by design' },
    { collider: 'aarr-yard-crates-west-south', centre: [-8.8, 1, 15.2], size: [3.2, 2, 3.2], mesh: 'aarr-yard-crate-w-s-* (4 individual crates)', coverage: 0.25, reason: 'merged-per-cluster proxy over a 4-crate yard stack by design' },
    { collider: 'aarr-yard-crates-east-south', centre: [10.4, 1, 13.6], size: [3.2, 2, 3.2], mesh: 'aarr-yard-crate-e-s-* (4 individual crates)', coverage: 0.25, reason: 'merged-per-cluster proxy over a 4-crate yard stack by design' },
  ],
};

const CENTRE_TOLERANCE = 0.06;

let auditPromise: Promise<ArenaAuditResult[]> | null = null;
function audit(): Promise<ArenaAuditResult[]> {
  auditPromise ??= runColliderVisualParityAudit(ALL_ARENA_IDS);
  return auditPromise;
}

describe('collider/visual parity gate (all six arenas)', () => {
  it('constructs every arena without audit errors', async () => {
    const results = await audit();
    expect(results.map(({ id }) => id)).toEqual([...ALL_ARENA_IDS]);
    for (const result of results) {
      expect(result.error, `${result.id} failed to construct`).toBeUndefined();
      expect(result.unmeasurableMeshes ?? [], `${result.id}: visible meshes with unusable bounds`).toEqual([]);
      expect(result.meshComponents?.malformedAnchorMeshes ?? 0, `${result.id}: malformed vehicle ownership`).toBe(0);
    }
  }, 120_000);

  it('explains EVERY movement collider with a visible mesh (zero invisible colliders)', async () => {
    const results = await audit();
    for (const result of results) {
      const accepted = ACCEPTED_MERGED_PROXY_COVERAGE[result.id] ?? [];
      const unexpected = (result.invisibleColliders ?? []).filter((finding) => {
        const centre = finding.centre as number[];
        const size = finding.size as number[];
        return !accepted.some((entry) => (
          Math.abs(entry.centre[0] - centre[0]) <= CENTRE_TOLERANCE
          && Math.abs(entry.centre[1] - centre[1]) <= CENTRE_TOLERANCE
          && Math.abs(entry.centre[2] - centre[2]) <= CENTRE_TOLERANCE
          && Math.abs(entry.size[0] - size[0]) <= CENTRE_TOLERANCE
          && Math.abs(entry.size[1] - size[1]) <= CENTRE_TOLERANCE
          && Math.abs(entry.size[2] - size[2]) <= CENTRE_TOLERANCE
        ));
      });
      expect(unexpected, `${result.id}: unexplained colliders`).toEqual([]);
    }
  }, 120_000);

  it('flags NO walk-through mesh beyond the accepted, triaged ledger', async () => {
    const results = await audit();
    for (const result of results) {
      const accepted = ACCEPTED_WALK_THROUGH[result.id] ?? [];
      const unexpected = (result.walkThroughMeshes ?? []).filter((finding) => {
        const centre = finding.centre as number[];
        return !accepted.some((entry) => (
          entry.name === finding.name
          && Math.abs(entry.centre[0] - centre[0]) <= CENTRE_TOLERANCE
          && Math.abs(entry.centre[1] - centre[1]) <= CENTRE_TOLERANCE
          && Math.abs(entry.centre[2] - centre[2]) <= CENTRE_TOLERANCE
        ));
      });
      expect(unexpected, `${result.id}: new walk-through meshes need triage and a ledger row`).toEqual([]);
    }
  }, 120_000);

  it('Direction C: rates every substantial visible mesh for gunfire beyond the accepted shoot-through ledger', async () => {
    // HF-390 / Pass 81 lane aa-lane-ballistics. castShot's penetration path
    // traces registered BallisticSurfaces ONLY, so a substantial visible mesh
    // with no rating is GHOST cover: bullets cross it with no impact, no
    // sound and no cost. Fix a red run by RATING the mesh (shots:true + the
    // family it visually is) or - only for genuinely shoot-through
    // presentation - a reasoned ACCEPTED_SHOOT_THROUGH row in
    // scripts/qa/ballistic-parity-ledger.ts. Never raise a ceiling.
    const results = await audit();
    for (const result of results) {
      const { unmatched, staleRows } = matchAcceptedShootThrough(result.id, result.ballisticGhostMeshes ?? []);
      const ceiling = BALLISTIC_UNRATED_CEILINGS[result.id] ?? 0;
      const summary = unmatched.map((ghost) => `${String(ghost.name)} @ ${JSON.stringify(ghost.centre)} size ${JSON.stringify(ghost.size)}`);
      expect(
        summary.length,
        `${result.id}: ${summary.length} unrated ghost shot surface(s) over ceiling ${ceiling}: ${summary.join(' | ')}`,
      ).toBeLessThanOrEqual(ceiling);
      // A row that matches nothing is rot: the geometry it excused is gone.
      // Delete the row so the ledger only ever shrinks truthfully.
      expect(staleRows, `${result.id}: stale ACCEPTED_SHOOT_THROUGH rows`).toEqual([]);
    }
  }, 120_000);

  it('Direction C: the ballistic ratchet ceilings stay at their triaged floor (they may only go DOWN)', () => {
    // Triaged 2026-08-28: zero unrated in all six arenas. Raising any ceiling
    // is weakening a gate; a genuine contract change must edit BOTH the
    // ledger module and this pin, with evidence, in review.
    expect(BALLISTIC_UNRATED_CEILINGS).toEqual({
      'atomic-acres': 0,
      'skyline-terminal': 0,
      'rustworks-1v1': 0,
      'high-seas': 0,
      // Owner 2026-08-30: new arenas enter at ceiling 0 - the strictest floor.
      test1: 0,
      test2: 0,
      // MAP3 (owner 2026-09-02, HF-405): same rule, same floor. This is the
      // mirror pin of scripts/qa/ballistic-parity-ledger.ts, and it is here so
      // that raising a ceiling has to be done TWICE, in two files, in review.
      // Adding a row at 0 is the strictest possible entry, not a relaxation:
      // it means every ghost shot surface Map 3 has is a failure.
      map3: 0,
      // NUKETOWN2 (owner 2026-09-02, HF-407): same rule, same floor.
      nuketown2: 0,
      // RAID2 (owner 2026-09-02, HF-408): enters at the same strictest floor.
      // The audit measured 0 invisible colliders and 0 walk-through meshes on
      // this arena, so a row above 0 would forgive something it does not do.
      raid2: 0,
      'gun-range': 0,
      farcrysis: 0,
    });
    for (const arenaId of ALL_ARENA_IDS) {
      expect(ACCEPTED_SHOOT_THROUGH[arenaId], `${arenaId} must have an explicit (possibly empty) ledger`).toBeDefined();
    }
  });

  it('atomic-acres replaces exactly 8 house statics at runtime and leaves none invisible', async () => {
    const results = await audit();
    const atomicAcres = results.find(({ id }) => id === 'atomic-acres');
    expect(atomicAcres, 'atomic-acres audit result').toBeDefined();
    // Pass 80: pins the runtime-replaced-static ledger so a ninth hidden
    // house fragment without a definition change fails CI instead of
    // silently re-entering the invisible-wall regression window.
    expect(atomicAcres!.runtimeReplacedStaticColliders).toBe(8);
    expect(atomicAcres!.invisibleColliders ?? []).toEqual([]);
  }, 120_000);
});
