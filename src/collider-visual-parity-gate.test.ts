import { expect, it, describe } from 'vitest';
import {
  ALL_ARENA_IDS,
  runColliderVisualParityAudit,
  type ArenaAuditResult,
} from '../scripts/qa/collider-visual-parity-core';

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
    // Documented deferral (map.ts "the sills stay decorative" block +
    // nuketown-traversal.test.ts pins ZERO 'greenhouse frame wall' colliders):
    // giving the greenhouse frame walls movement authority seals the west
    // spawn into the rear sill volume and blocks the yard's only street
    // connection. Walk-through here is the accepted cosmetic mismatch until
    // environment-assets authors REAL openings together with the proxies.
    { name: 'greenhouse-frame-wall', centre: [-30, 1.5, 21], reason: 'documented traversal deferral (see map.ts + nuketown-traversal.test.ts)' },
    { name: 'greenhouse-frame-wall', centre: [-28.02, 1.5, 24.8], reason: 'documented traversal deferral (see map.ts + nuketown-traversal.test.ts)' },
    { name: 'greenhouse-frame-wall', centre: [-23.5, 1.5, 17.2], reason: 'documented traversal deferral (see map.ts + nuketown-traversal.test.ts)' },
    // addTree() root flares (environment-assets.ts): decorative buttress roots
    // hugging the base of an authored tree whose trunk IS collided
    // (authored-tree-trunk-collider-*). Ankle-height dressing partially sunk
    // into the ground; the player collides with the trunk beside them.
    { name: '(unnamed Mesh)', centre: [-18.53, 0.22, -28], reason: 'decorative root flare around a collided trunk' },
    { name: '(unnamed Mesh)', centre: [18.53, 0.22, 28], reason: 'decorative root flare around a collided trunk' },
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
    { name: 'gun-range-wallbang-panel-interior-wall', centre: [-12.3, 1.45, -7.6], reason: 'penetration-lab panel: authored shots:true/solid:false behind the firing-line barrier' },
    { name: 'gun-range-wallbang-panel-brick', centre: [-9.9, 1.45, -7.6], reason: 'penetration-lab panel: authored shots:true/solid:false behind the firing-line barrier' },
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
    }
  }, 120_000);

  it('explains EVERY movement collider with a visible mesh (zero invisible colliders)', async () => {
    const results = await audit();
    for (const result of results) {
      expect(result.invisibleColliders ?? [], `${result.id}: unexplained colliders`).toEqual([]);
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
