import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { segmentIntersectsBox, type Box2, type Point3 } from './collision';
import { buildArena, type ArenaMap } from './map';
import { buildNuketown2 } from './nuketown2-arena';
import {
  OVERDRIVE_PICKUP_HEIGHT_WINDOW_M,
  OVERDRIVE_PICKUP_RADIUS,
  OVERDRIVE_POSITION,
  advanceOverdrive,
  claimOverdrive,
  createOverdriveState,
  overdrivePositionForArena,
} from './overdrive';
import { recordResidualReceipt } from './pass87-residual-receipt.test-helper';

/**
 * PASS 87 Lane AR, item 5 - the 2x Damage Core could be claimed through the bus
 * roof slab, on both Nuke Towns.
 *
 * The pickup rule was a horizontal radius plus a SCALAR height window. Both
 * arenas hover the core over the bus roof and rely on that window alone to
 * separate "standing on the roof" (allowed, the contested position the pickup
 * exists to create) from "standing in the aisle" (must be rejected, because a
 * core takeable from inside cover is not contested at all).
 * src/nuketown2-arena.ts states the margin in its own comment: the aisle is
 * rejected by 0.10 m. A jump is worth far more than 0.10 m, so anyone who
 * jumped inside the bus took the core through the roof.
 *
 * These tests measure that from the built arenas rather than restating the
 * arithmetic, and they assert the fix as a property - no eye position inside
 * the bus can claim, at any height - so a future roof, floor or core move
 * cannot silently re-open it.
 */
const NOW = 10_000_000;

/**
 * HF-432 item 5: the core's seat is PER ARENA now, so every probe below takes
 * the seat of the arena it is probing. The shipped map's seat resolves to the
 * same {0, 3.75, 0} it always had, so its half of this file is unchanged in
 * everything but spelling.
 */
type Seat = Readonly<{ x: number; y: number; z: number }>;
const sightPoint = (seat: Seat): Point3 => ({ x: seat.x, y: seat.y + 0.25, z: seat.z });

/** The same trace `overdriveClaimSight` runs in src/legacy-main.ts. */
function sightFrom(eye: Point3, colliders: readonly Box2[], seat: Seat): { lineOfSightClear: boolean } {
  return { lineOfSightClear: !colliders.some((box) => segmentIntersectsBox(eye, sightPoint(seat), box)) };
}

function spawnedState(seat: Seat) {
  return advanceOverdrive(createOverdriveState(0, seat), NOW);
}

function claims(eye: Point3, colliders: readonly Box2[] | null, seat: Seat = OVERDRIVE_POSITION): boolean {
  return claimOverdrive(
    spawnedState(seat), 'probe', eye, true, NOW,
    colliders ? sightFrom(eye, colliders, seat) : undefined,
  ).claimed;
}

/**
 * The roof slab the core hovers over, taken from the arena's own colliders
 * rather than from either arena module's constants: the highest solid whose
 * horizontal span contains the core. On both arenas the bus is authored as a
 * roof slab over an open aisle, not as a filled box, which is exactly why a
 * claim from below is geometrically possible at all.
 */
function roofSlabUnderCore(map: ArenaMap, seat: Seat): Box2 {
  const candidates = map.physicsColliders.filter((box) => (
    box.minX <= seat.x && box.maxX >= seat.x
    && box.minZ <= seat.z && box.maxZ >= seat.z
    && (box.maxY ?? 0) > 1.5
  ));
  expect(candidates.length, 'a solid must stand under the core on this arena').toBeGreaterThan(0);
  return candidates.sort((a, b) => (b.maxY ?? 0) - (a.maxY ?? 0))[0]!;
}

const ARENAS: ReadonlyArray<[string, () => ArenaMap, Seat]> = [
  ['nuke-town (shipped)', () => buildArena(new THREE.Scene()), overdrivePositionForArena('atomic-acres')],
  ['nuke-town rebuild (nuketown2)', () => buildNuketown2(new THREE.Scene()), overdrivePositionForArena('nuketown2')],
];

describe('2x Damage Core line of sight (Lane AR item 5)', () => {
  it.each(ARENAS)('%s: a roof-slab claim from inside the bus is rejected at every height', (_label, build, seat) => {
    const map = build();
    const slab = roofSlabUnderCore(map, seat);
    const slabUnderside = slab.minY ?? 0;

    // Every eye height an aisle player can reach - prone through standing
    // through the top of a jump - at the core's own ground position, i.e. the
    // most favourable spot inside the bus. The ceiling of the sweep is the slab
    // underside: above that the player is no longer under the roof.
    let unguardedClaims = 0;
    let guardedClaims = 0;
    let sweptEyeHeights = 0;
    for (let eyeY = 0.6; eyeY < slabUnderside - 0.02; eyeY += 0.05) {
      const eye: Point3 = { x: seat.x, y: eyeY, z: seat.z };
      sweptEyeHeights += 1;
      if (claims(eye, null, seat)) unguardedClaims += 1;
      if (claims(eye, map.physicsColliders, seat)) guardedClaims += 1;
    }
    // The defect, measured: the scalar window alone DID admit claims from
    // inside the bus. If this ever reaches zero the arena changed and this test
    // is no longer measuring the thing it was written for.
    expect(unguardedClaims, 'the scalar height window alone must be shown to be insufficient here')
      .toBeGreaterThan(0);
    expect(guardedClaims, 'no eye inside the bus may claim the core once sight is required').toBe(0);
    recordResidualReceipt(`item-05-overdrive-${_label.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase()}`, {
      item: 'Lane AR item 5 - 2x Damage Core claimed through the bus roof slab',
      arena: _label,
      slabUndersideM: slabUnderside,
      sweepFromEyeM: 0.6,
      sweepStepM: 0.05,
      sweptEyeHeights: sweptEyeHeights,
      claimsWithHeightWindowOnly: unguardedClaims,
      claimsWithLineOfSight: guardedClaims,
    });
  });

  it.each(ARENAS)('%s: a player standing on the bus roof still claims it', (_label, build, seat) => {
    const map = build();
    const roofY = roofSlabUnderCore(map, seat).maxY ?? 0;
    // A standing eye on the roof: the position the pickup exists to reward.
    const eye: Point3 = { x: seat.x, y: roofY + 1.7, z: seat.z };
    expect(Math.abs(eye.y - seat.y), 'the roof eye must still be inside the height window')
      .toBeLessThanOrEqual(OVERDRIVE_PICKUP_HEIGHT_WINDOW_M);
    expect(claims(eye, map.physicsColliders, seat), 'the roof position must remain claimable').toBe(true);
  });

  it('an unblocked eye is unaffected: the radius and window still decide', () => {
    const open: Point3 = { x: OVERDRIVE_POSITION.x, y: OVERDRIVE_POSITION.y, z: OVERDRIVE_POSITION.z };
    expect(claims(open, [])).toBe(true);
    const tooFar: Point3 = { ...open, x: OVERDRIVE_POSITION.x + OVERDRIVE_PICKUP_RADIUS + 0.1 };
    expect(claims(tooFar, [])).toBe(false);
    const tooHigh: Point3 = { ...open, y: OVERDRIVE_POSITION.y + OVERDRIVE_PICKUP_HEIGHT_WINDOW_M + 0.1 };
    expect(claims(tooHigh, [])).toBe(false);
  });

  it('both shipped claim paths pass a computed sight test', () => {
    // The sight argument is optional, so a caller that forgets it silently gets
    // the old permissive rule. These are the only two call sites that matter -
    // the local host claim and the host's acceptance of a client claim - and
    // this is the cheapest thing that notices one of them regressing.
    const source = readFileSync(resolve(__dirname, 'legacy-main.ts'), 'utf8');
    expect(source).toContain(
      'claimOverdrive(overdriveState, player.id, player.position, true, now, overdriveClaimSight(player.position))',
    );
    expect(source).toContain(
      'claimOverdrive(overdriveState, message.by, authoritativePosition, true, now, overdriveClaimSight(authoritativePosition))',
    );
    expect(source).toContain('function overdriveClaimSight(eye: THREE.Vector3)');
    expect(source, 'the trace must run against the live world colliders')
      .toMatch(/lineOfSightClear: !activeWorldColliders\(\)\.some\(\(box\) => segmentIntersectsBox\(eye, overdriveSightScratch, box\)\)/u);
    expect(
      (source.match(/claimOverdrive\(/gu) ?? []).length,
      'a third claim path appeared; give it a sight test too',
    ).toBe(2);
  });
});
