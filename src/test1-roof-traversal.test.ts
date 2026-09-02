import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  collectRoofTraversalEvidence,
  FALL_THROUGH_DROP_M,
  ROOF_LEVEL_MIN_Y_M,
  type DropResult,
  type WalkResult,
} from '../scripts/qa/roof-traversal-probe';
import { TEST1_WALKABLE_DRESSING, buildTest1 } from './test-maps';

/**
 * HF-411 (owner, Firing Range, 2026-09-02): "on firing range sometimes you go
 * to run onto a metal fence layed as a floor on the roof level of the map and
 * you fall through it, fix all that shit."
 *
 * This is the EXPERIENTIAL half of the fix. The geometric half
 * (src/walkable-surface-parity-gate.test.ts) asks whether a collider exists
 * under every walkable visual; this one puts the shipped Rapier character on
 * every roof-level surface of Test1, in stand and in crouch, at nine points
 * each including all four corners and all four edge midpoints, holds for two
 * seconds, and then walks it edge-to-edge along both axes.
 *
 * It exists as a separate gate because the two can disagree: a collider can be
 * present and still not hold a player (too thin to catch a fall, top buried in
 * the visual, capsule slides off the lip). Only this one answers the owner's
 * verb.
 *
 * Measured on the PASS 84 tree before the fix: 32 of 396 drop samples and 8
 * of 88 walk legs fell 2.6-3.2 m, all of them on the two camo-netting panels
 * over the container yard. After: zero.
 */
const EVIDENCE_OUT = process.env.HF411_EVIDENCE_OUT
  ?? resolve('artifacts/qa/hf411-test1-roof-traversal.json');

type Evidence = Awaited<ReturnType<typeof collectRoofTraversalEvidence>>;

let evidence: Evidence;

function describeRow(row: DropResult | WalkResult): string {
  return 'point' in row
    ? `${row.surface} ${row.point} ${row.stance} @ (${row.x}, ${row.z}) fell ${row.dropM} m`
    : `${row.surface} walk ${row.stance} ${JSON.stringify(row.from)}->${JSON.stringify(row.to)} fell ${row.maxDropM} m`;
}

describe('HF-411 Test1 roof-level traversal (Rapier, stand and crouch)', () => {
  beforeAll(async () => {
    evidence = await collectRoofTraversalEvidence('test1');
    // The gate's own samples ARE the evidence, so a report can never quote a
    // number the gate did not measure. artifacts/ is git-ignored; the tracked
    // copies under docs/evidence/pass85/hf411/ are taken from these runs.
    mkdirSync(dirname(EVIDENCE_OUT), { recursive: true });
    writeFileSync(EVIDENCE_OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  }, 300_000);

  it('finds every roof-level walkable surface Test1 authors', () => {
    // A roster that can silently shrink is a gate that stops looking. These are
    // the seven authored roof families plus the yard's stacked containers and
    // the camo netting: container stacks (5.20), stores roofs (3.50), firing
    // line roof (3.46), spawn shed roofs (3.30), camo nets (3.14 high corner),
    // tower deck and its top stair tread (2.90), annex roofs (2.64), backstop
    // berm and the container tops (2.60).
    expect(evidence.roofSurfaces.length).toBeGreaterThanOrEqual(22);
    const names = new Set(evidence.roofSurfaces.map((surface) => surface.name));
    for (const expected of [
      'test1 tower deck',
      'test1 annex roof -1',
      'test1 annex roof 1',
      'test1 stores roof -1',
      'test1 stores roof 1',
      'test1 spawn shed roof -1',
      'test1 spawn shed roof 1',
      'test1 firing line roof',
      'test1 container stack -1',
      'test1 container stack 1',
      'test1-camo-net-tarp',
    ]) {
      expect(names.has(expected), `roof roster is missing ${expected}`).toBe(true);
    }
    for (const surface of evidence.roofSurfaces) {
      expect(surface.topY, `${surface.name} is not roof level`).toBeGreaterThanOrEqual(ROOF_LEVEL_MIN_Y_M);
    }
  });

  it('holds the player on every roof surface, at every probe point, standing and crouched', () => {
    const fell = evidence.drops.filter((row) => row.fellThrough);
    expect(fell.map(describeRow), `${fell.length}/${evidence.drops.length} drop samples fell through`).toEqual([]);
    // Not just "did not fall": the controller must be GROUNDED on the surface,
    // so a player who lands one autostep down still counts as supported and a
    // player floating on nothing does not.
    const airborne = evidence.drops.filter((row) => !row.grounded);
    expect(airborne.map(describeRow), 'probe points where the controller never grounded').toEqual([]);
    expect(evidence.drops.length).toBeGreaterThan(300);
  });

  it('walks the player edge-to-edge across every roof surface without a drop', () => {
    const fell = evidence.walks.filter((row) => row.fellThrough);
    expect(fell.map(describeRow), `${fell.length}/${evidence.walks.length} walk legs fell through`).toEqual([]);
    for (const row of evidence.walks) {
      expect(
        row.maxDropM,
        `${row.surface} ${row.stance} dropped ${row.maxDropM} m mid-walk`,
      ).toBeLessThanOrEqual(FALL_THROUGH_DROP_M);
    }
    expect(evidence.walks.length).toBeGreaterThan(40);
  });

  it('keeps roof-level eye clearance: no new low ceiling over a standable roof', () => {
    // The shipped eye-clearance sweep (scripts/qa/sweep-eye-clearance-spots.ts)
    // samples eye heights 1.70 / 1.16 / 0.61 in ABSOLUTE world Y, so every spot
    // it has ever generated stands on grade - it has never looked at a roof on
    // any arena. This is that sweep one storey up.
    //
    // A standing capsule is 1.82 m tall (2 x (0.53 + 0.38)). Every roof-level
    // surface on Test1 clears it except three families, all measured, all
    // explained, none of them a head-height trap:
    //
    //   container a +/-1 (0.18 m) - CREATED BY THIS FIX, deliberately. The
    //     netting now rests 0.18 m above the easternmost strip of each
    //     container-A roof. No stance fits in 0.18 m and none needs to: it is
    //     well inside the 0.42 m autostep, so a player crossing that strip
    //     steps UP onto the netting (measured 2.62 -> 2.67 m feet). Before the
    //     fix the same strip dropped them 3.0 m.
    //   annex roof +/-1 (0.10 m) - PRE-EXISTING. The 0.16 m tower deck slab
    //     overhangs the annex roof edge by 0.55 m; the annex top is 2.64 and
    //     the deck soffit 2.74. You step up onto the deck, you never stand
    //     under its lip.
    //   camo net (0.02 m) - PRE-EXISTING ART. The netting's east end is strung
    //     INTO the stacked container it hangs from (stack 2.60-5.20 m), so its
    //     last 1 m is inside solid geometry. That is the art's own
    //     "resting on the container tops"; nothing can stand there either way.
    const STANDING_CAPSULE_M = 1.82;
    const lowCeilings = evidence.clearance.filter((row) => row.minClearanceM < STANDING_CAPSULE_M);
    expect(
      lowCeilings.map((row) => `${row.name} clears ${row.minClearanceM} m`).sort(),
      'roof surfaces with less than standing clearance',
    ).toEqual([
      'test1 annex roof -1 clears 0.1 m',
      'test1 annex roof 1 clears 0.1 m',
      'test1 container a -1 clears 0.18 m',
      'test1 container a 1 clears 0.18 m',
      'test1-camo-net-tarp clears 0.02 m',
      'test1-camo-net-tarp clears 0.02 m',
    ]);
    // Everything else keeps a full standing pose overhead.
    const clear = evidence.clearance.filter((row) => row.minClearanceM >= STANDING_CAPSULE_M);
    expect(clear.length, 'roof surfaces with full standing clearance').toBe(evidence.clearance.length - 6);
  });

  it('gives the camo netting real movement authority derived from the mesh', () => {
    // The regression this lane closes, pinned by its own numbers rather than by
    // the absence of a finding: two panels, each with a collider whose top
    // tracks the tilted visual within a centimetre.
    const scene = new THREE.Scene();
    const map = buildTest1(scene);
    scene.updateMatrixWorld(true);
    const nets: THREE.Mesh[] = [];
    map.root.traverse((object) => {
      if (object instanceof THREE.Mesh && TEST1_WALKABLE_DRESSING.includes(object.name)) nets.push(object);
    });
    expect(nets.length, 'test1 camo netting panels').toBe(2);
    for (const net of nets) {
      const bounds = new THREE.Box3().setFromObject(net);
      // MATCHES the panel, not merely contains it: the 150 x 130 m hardpan
      // slab contains every footprint on the map and would "explain" anything.
      const matching = map.physicsColliders.filter((collider) => (
        collider.maxY !== undefined
        && Math.abs(collider.minX - bounds.min.x) < 0.05 && Math.abs(collider.maxX - bounds.max.x) < 0.05
        && Math.abs(collider.minZ - bounds.min.z) < 0.05 && Math.abs(collider.maxZ - bounds.max.z) < 0.05
      ));
      expect(matching.length, `movement authority under ${net.name} @ ${JSON.stringify(bounds.getCenter(new THREE.Vector3()))}`).toBe(1);
      const collider = matching[0]!;
      // The panel is authored with a 2 degree tilt; the collider carries the
      // same rotation, so its top follows the visual instead of splitting the
      // difference by 0.16 m at each end.
      expect(collider.rotation, 'collider inherits the mesh rotation').toBeDefined();
      expect(Math.abs(collider.rotation![2] - net.rotation.z)).toBeLessThan(1e-6);
      expect(Math.abs(collider.maxY! - net.position.y - 0.03)).toBeLessThan(0.01);
    }
    // Movement only. Netting stays shoot-through, which is what the art says
    // and what the ballistic census already excludes as cloth.
    for (const net of nets) {
      expect(net.userData.ballisticSurfaceId, `${net.name} must stay shoot-through`).toBeUndefined();
    }
  });
});
