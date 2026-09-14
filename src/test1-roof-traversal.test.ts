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
import { traceBallisticPath } from './ballistics';
import { LEGACY_WEAPONS } from './combat/legacy-weapon-adapter';
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
    // "Did not fall" is not "walked". A leg blocked at its first step reports
    // zero drop and would read as clean, so the distance actually covered is
    // asserted too. The legs that legitimately cannot finish are ledgered by
    // name below with the geometry that stops them - a NEW blocked leg fails,
    // and a ledgered leg that starts completing fails as stale.
    const BLOCKED_LEG_TOLERANCE_M = 0.5;
    const blocked = evidence.walks
      .filter((row) => row.remainingM > BLOCKED_LEG_TOLERANCE_M)
      .map((row) => `${row.surface} ${row.stance} ${row.from.join(',')}->${row.to.join(',')} stopped ${row.remainingM} m short`)
      .sort();
    // MEASURED on the fixed tree, 2026-09-02; 12 of 88 legs, every one of them
    // a capsule meeting authored geometry that stands ON the surface it is
    // crossing, not a hole:
    //   backstop berm  - the berm is a 43 m long wall of earth walked along its
    //     own length; the capsule leaves the flat cap almost immediately.
    //   firing line roof - the tower and its stair head sit on this roof.
    //   spawn shed roofs - the shed's own ridge/parapet at each end.
    //   stores roofs - the stores' cinder side walls rise past the roof slab.
    // None is on the camo netting: all eight net legs complete with 0 m
    // remaining, which is the HF-411 headline. A NEW blocked leg fails here,
    // and a row that starts completing fails as stale, so this cannot rot.
    expect(blocked, 'walk legs that did not cover their leg').toEqual([
      'test1 backstop berm crouch -29.75,-21.55->-29.75,21.55 stopped 34.94 m short',
      'test1 backstop berm stand -29.75,-21.55->-29.75,21.55 stopped 34.97 m short',
      'test1 firing line roof crouch -13.8,-16.55->-13.8,16.55 stopped 24.97 m short',
      'test1 firing line roof stand -13.8,-16.55->-13.8,16.55 stopped 24.94 m short',
      'test1 spawn shed roof -1 crouch -4.85,-20->4.85,-20 stopped 1.57 m short',
      'test1 spawn shed roof -1 stand -4.85,-20->4.85,-20 stopped 1.54 m short',
      'test1 spawn shed roof 1 crouch -4.85,20->4.85,20 stopped 1.54 m short',
      'test1 spawn shed roof 1 stand -4.85,20->4.85,20 stopped 1.57 m short',
      'test1 stores roof -1 crouch 16.75,-16.7->27.25,-16.7 stopped 2.34 m short',
      'test1 stores roof -1 stand 16.75,-16.7->27.25,-16.7 stopped 2.35 m short',
      'test1 stores roof 1 crouch 16.75,16.7->27.25,16.7 stopped 2.4 m short',
      'test1 stores roof 1 stand 16.75,16.7->27.25,16.7 stopped 2.38 m short',
    ]);
    expect(
      blocked.filter((row) => row.includes('camo-net')),
      'no camo-netting leg may be blocked',
    ).toEqual([]);
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
    // MATCHING AUTHORITY (AGENTS.md). The first version of this fix granted
    // movement and deliberately withheld shot authority, which would have made
    // the netting the only surface in the game a body stops on and a round
    // ignores - a player standing on it could be shot through the floor under
    // their boots with nothing to register the hit. Both halves are now
    // authored from the same bounds.
    for (const net of nets) {
      const surfaceId = net.userData.ballisticSurfaceId as string | undefined;
      expect(surfaceId, `${net.name} needs shot authority to match its movement authority`).toBeDefined();
      const surface = map.shotSurfaces.find((entry) => entry.id === surfaceId);
      expect(surface, `${net.name} shot surface is registered on the arena`).toBeDefined();
      // Rated, not guessed: `reinforced` is the fallback and would make camo
      // netting the hardest cover on the map.
      expect(surface!.material).toBe('fence');
      expect(surface!.classification).toBe('explicit');
      // Same box, same tilt as the movement collider.
      expect(surface!.bounds.rotation?.[2]).toBeCloseTo(net.rotation.z, 6);
      // Knife and world raycasts reach it now that it is a floor.
      expect(net.userData.blocksShots, `${net.name} must be raycastable`).toBe(true);
      expect(map.raycastMeshes.includes(net), `${net.name} is a raycast target`).toBe(true);
      expect(Object.hasOwn(net, 'raycast'), `${net.name} keeps the real Mesh.raycast`).toBe(false);
    }
  });

  it('keeps the netting penetrable: every catalogue weapon still shoots through it', () => {
    // The gameplay half of matching authority. A floor that stops rounds would
    // be a NEW defect on a shipped arena, so this measures the actual crossing
    // rather than asserting the material name and hoping.
    //
    // The shot is fired straight up through one net panel from the container
    // yard floor, which is exactly the "shoot the player standing on it" case.
    const scene = new THREE.Scene();
    const map = buildTest1(scene);
    scene.updateMatrixWorld(true);
    const netSurfaces = map.shotSurfaces.filter((surface) => TEST1_WALKABLE_DRESSING.includes(surface.name));
    expect(netSurfaces.length, 'rated netting panels').toBe(2);
    const panel = netSurfaces[0]!;
    const origin = {
      x: (panel.bounds.minX + panel.bounds.maxX) / 2,
      y: 1.2,
      z: (panel.bounds.minZ + panel.bounds.maxZ) / 2,
    };
    const stopped: string[] = [];
    const costs: Array<[string, number]> = [];
    for (const [id, weapon] of Object.entries(LEGACY_WEAPONS)) {
      const trace = traceBallisticPath(origin, { x: 0, y: 1, z: 0 }, 6, weapon.penetration, [panel]);
      const crossing = trace.impacts.find((impact) => impact.surface.id === panel.id);
      expect(crossing, `${id} never met the netting on a vertical shot`).toBeDefined();
      if (!crossing!.penetrated) stopped.push(id);
      costs.push([id, Number((1 - trace.damageMultiplier).toFixed(4))]);
    }
    // MEASURED. Exactly four weapons are stopped, and all four are the
    // catalogue's `power: 0, maximumSurfaces: 0` entries - an explosive bolt
    // that detonates on contact, two fuel streams and a signal flare. They are
    // already stopped by EVERY rated surface in the game; a floor a player is
    // standing on stopping them is consistent, not a new rule. No bullet
    // weapon is stopped.
    const ZERO_PENETRATION = ['crimson-flamethrower', 'explosive-crossbow', 'flamethrower', 'flare-gun'];
    expect([...stopped].sort(), 'weapons the camo netting now stops').toEqual(ZERO_PENETRATION);
    for (const id of ZERO_PENETRATION) {
      expect(LEGACY_WEAPONS[id as keyof typeof LEGACY_WEAPONS].penetration.maxPenetratedSurfaces, id).toBe(0);
    }
    // Everything else pays for the crossing and keeps almost all of its
    // damage. The WHOLE table is pinned rather than a ceiling, so a future
    // change to the material, the panel thickness or the resistance table
    // shows up as a named diff instead of sliding under a threshold.
    //
    // The one outlier is the M14 EBR at 21.2%, and it is the weapon's own
    // design, not the netting's: its penetration power is 0.55 against 2.15-9.4
    // for every other bullet weapon (it is the deliberately poor wallbanger),
    // so a fixed 0.203 entry cost is a fifth of its budget. Railgun 0 is the
    // 100,000-power sabot.
    const ranked = costs
      .filter(([id]) => !ZERO_PENETRATION.includes(id))
      .sort((a, b) => b[1] - a[1]);
    expect(ranked.map(([id, cost]) => `${id} ${cost}`), 'damage lost crossing the netting').toEqual([
      'm14-ebr 0.2119',
      'scattergun 0.0943',
      'mini-uzi 0.0822',
      'machine-pistol 0.0696',
      'smg 0.0616',
      'mp5 0.0596',
      'pistol 0.0514',
      'flashlight-pistol 0.0458',
      'magnum 0.04',
      'm4a1 0.0318',
      'carbine 0.0312',
      'minigun 0.0279',
      'lmg 0.0258',
      'ak-47 0.024',
      'slug-shotgun 0.0228',
      'sniper 0.0186',
      'railgun 0',
    ]);
  });
});
