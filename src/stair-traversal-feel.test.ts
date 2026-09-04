import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildNuketown2,
  NUKETOWN2_HOUSE_STAIR,
  NUKETOWN2_STAIRWELL,
} from './nuketown2-arena';
import { NUKETOWN2_HOUSE_LAYOUT, nuketown2HandedX } from './nuketown2-layout';
import { integrateHorizontalVelocity, movementProfile, PLAYER_JUMP_GRAVITY, SIMULATION_HZ } from './gameplay';
import { CHARACTER_PHYSICS_CONFIG, CharacterPhysics, groundStickReach, MAX_WALKABLE_SLOPE_TANGENT } from './physics';
import { STAIR_FEEL_BANDS } from './movement-feel';
import type { ArenaMap } from './map';

/**
 * HF-497 STAIR FEEL GATE. Owner, twice (HITL 1 and HITL 3): "the stairs are
 * still sticky to navigate".
 *
 * Every stair gate that existed before this one asked whether a flight could
 * be CLIMBED. `nuketown2-fidelity.test.ts` walks a capsule up and down both
 * flights and asserts it arrives - and it passes, and always did, while the
 * owner was reporting the stairs as sticky. It passes because its walker
 * commands a FIXED 3.6 m/s step every frame regardless of what the previous
 * frame achieved: a walker that cannot lose momentum cannot measure momentum
 * loss.
 *
 * This gate runs the REAL loop instead - `integrateHorizontalVelocity` on the
 * profile `movementProfile` returns for the contact state the controller
 * actually reported, then `CharacterPhysics.move`, then the exact post-contact
 * velocity rules `src/legacy-main.ts` applies - and measures the thing the
 * owner can feel: how many frames the player is moving at under 30 % of the
 * speed they are asking for while the input is held.
 */

const DT = 1 / SIMULATION_HZ;

type StairProbe = {
  frames: number;
  /** Frames where realised forward speed < 30 % of the profile speed the input asked for. */
  stallFrames: number;
  /** Longest unbroken run of those - a single 8-frame catch is what "sticky" feels like. */
  worstStallRun: number;
  ungroundedFrames: number;
  groundStickFrames: number;
  minForwardSpeed: number;
  meanForwardSpeed: number;
  completed: boolean;
};

/**
 * One real gameplay movement frame, repeated. Deliberately NOT a fixed-step
 * walker: the velocity carried between frames is the whole measurement.
 */
async function probeFlight(
  map: ArenaMap,
  startEye: readonly [number, number, number],
  route: ReadonlyArray<readonly [number, number]>,
  sprinting: boolean,
): Promise<StairProbe> {
  const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
  try {
    physics.teleportEye({ x: startEye[0], y: startEye[1], z: startEye[2] });
    const velocity = { x: 0, y: 0, z: 0 };
    let grounded = true;
    let frames = 0;
    let stallFrames = 0;
    let worstStallRun = 0;
    let stallRun = 0;
    let ungroundedFrames = 0;
    let groundStickFrames = 0;
    let minForwardSpeed = Number.POSITIVE_INFINITY;
    let forwardSpeedTotal = 0;
    let completed = true;

    // Settle onto the surface before any input, so frame 0 is a standing
    // player and not a spawn transient.
    for (let i = 0; i < 60; i += 1) {
      velocity.y += PLAYER_JUMP_GRAVITY * DT;
      const settle = physics.move({ x: 0, y: velocity.y * DT, z: 0 }, DT);
      if (settle.grounded) velocity.y = 0;
      grounded = settle.grounded;
    }

    for (const waypoint of route) {
      let reached = false;
      for (let step = 0; step < 1_600; step += 1) {
        const eye = physics.eyePosition();
        const dx = waypoint[0] - eye.x;
        const dz = waypoint[1] - eye.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.3) { reached = true; break; }
        const input = { x: dx / distance, z: dz / distance };
        const profile = movementProfile({ crouched: false, prone: false, ads: false, sprinting, grounded });
        const integrated = integrateHorizontalVelocity({ x: velocity.x, z: velocity.z }, input, profile, DT);
        velocity.x = integrated.x;
        velocity.z = integrated.z;
        velocity.y += PLAYER_JUMP_GRAVITY * DT;
        if (grounded) velocity.y = Math.max(0, velocity.y);

        const before = { x: eye.x, z: eye.z };
        const movement = physics.move({ x: velocity.x * DT, y: velocity.y * DT, z: velocity.z * DT }, DT);
        const after = physics.eyePosition();
        grounded = movement.grounded;
        frames += 1;
        if (!grounded) ungroundedFrames += 1;
        if (movement.groundStickApplied) groundStickFrames += 1;

        // The exact post-contact rules from src/legacy-main.ts.
        if (movement.blockedX && !movement.slopeAdjusted) velocity.x = movement.appliedDelta.x / DT;
        if (movement.blockedY && velocity.y < 0) velocity.y = 0;
        if (movement.blockedZ && !movement.slopeAdjusted) velocity.z = movement.appliedDelta.z / DT;

        const forward = ((after.x - before.x) * input.x + (after.z - before.z) * input.z) / DT;
        minForwardSpeed = Math.min(minForwardSpeed, forward);
        forwardSpeedTotal += forward;
        // A STALL IS THE WORLD REFUSING, NOT THE CHARACTER SPINNING UP. The
        // first measurement of this probe counted the acceleration ramp out of
        // a standing start as seven stall frames on a flight with nothing
        // wrong with it - v = 0.26, 0.52, 0.79 ... is exactly 48 m/s^2 from
        // rest. So a frame only counts when the SIMULATION had already reached
        // stall speed and the world took it away.
        const commanded = Math.hypot(velocity.x, velocity.z);
        const stallSpeed = STAIR_FEEL_BANDS.stallSpeedFraction * profile.maxSpeed;
        if (forward < stallSpeed && commanded >= stallSpeed) {
          stallFrames += 1;
          stallRun += 1;
          worstStallRun = Math.max(worstStallRun, stallRun);
        } else stallRun = 0;
      }
      if (!reached) { completed = false; break; }
    }

    return {
      frames,
      stallFrames,
      worstStallRun,
      ungroundedFrames,
      groundStickFrames,
      minForwardSpeed: Number(minForwardSpeed.toFixed(3)),
      meanForwardSpeed: Number((forwardSpeedTotal / Math.max(1, frames)).toFixed(3)),
      completed,
    };
  } finally {
    physics.dispose();
  }
}

describe('HF-497 stair traversal feel', () => {
  it('derives the ground re-acquisition reach from the slope ceiling, and never past the snap distance', () => {
    expect(MAX_WALKABLE_SLOPE_TANGENT)
      .toBeCloseTo(Math.tan(CHARACTER_PHYSICS_CONFIG.maximumSlopeClimbDegrees * Math.PI / 180), 10);
    // Standing still: the floor, and nothing more.
    expect(groundStickReach(0)).toBeCloseTo(CHARACTER_PHYSICS_CONFIG.groundStickFloor, 10);
    // Sprinting on the steepest walkable surface: enough to follow it down.
    const sprintStep = movementProfile({ crouched: false, prone: false, ads: false, sprinting: true, grounded: true })
      .maxSpeed * DT;
    expect(groundStickReach(sprintStep))
      .toBeGreaterThan(sprintStep * Math.tan(NUKETOWN2_STAIRWELL.rampAngleRadians));
    // A ledge Rapier would not have snapped to is still a ledge.
    expect(groundStickReach(100)).toBe(CHARACTER_PHYSICS_CONFIG.snapToGround);
    // And it can never exceed the snap distance for any real frame step.
    for (const speed of [0, 1, 3.15, 6.15, 8.7, 20]) {
      expect(groundStickReach(speed * DT)).toBeLessThanOrEqual(CHARACTER_PHYSICS_CONFIG.snapToGround);
    }
  });

  it('walks and sprints both Nuke Town Rebuild flights, both directions, without a stall run', async () => {
    const map = buildNuketown2(new THREE.Scene());
    const stair = NUKETOWN2_HOUSE_STAIR;
    const cx = stair.x0 + stair.width / 2;
    const deckEye = NUKETOWN2_STAIRWELL.rampTopY + 1.7;
    const report: string[] = [];

    for (const house of NUKETOWN2_HOUSE_LAYOUT) {
      const s = house.facing;
      const at = (x: number, z: number) => [s * nuketown2HandedX(x), s * z] as const;
      // THE INTERIOR FLIGHT ONLY, and the reason is recorded rather than
      // silently omitted. The exterior yard flight was probed with the same
      // harness and produced frames reading -8.1 m/s "backwards" - but that
      // trace is NOT trustworthy as a defect: its route waypoints were
      // authored by hand from NUKETOWN2_YARD_STAIR rather than derived, and a
      // hand-authored waypoint that is overshot flips the measured forward
      // axis and manufactures exactly that signature. The exterior flight is
      // also being rebuilt as timber carpentry on
      // contrib/dave-gaming-pc/claude/nuketown2-rooflines. Asserting a band on
      // a route I cannot defend would be a gate that passes for the wrong
      // reason, so the exterior flight stays an OPEN row in
      // docs/evidence/pass94/gameplay-feel/REPORT.md with its raw numbers, and
      // is not claimed here.
      const flights = [
        {
          id: 'interior',
          up: { start: [s * nuketown2HandedX(cx), 1.7, s * -22.0] as const, route: [at(cx, -21.5), at(cx, -16.5)] },
          down: { start: [s * nuketown2HandedX(cx), deckEye, s * -15.0] as const, route: [at(cx, -16.5), at(cx, -21.8)] },
        },
      ] as const;

      for (const flight of flights) {
        for (const sprinting of [false, true]) {
          for (const direction of ['up', 'down'] as const) {
            const leg = flight[direction];
            const probe = await probeFlight(map, leg.start, leg.route, sprinting);
            const label = `${house.id} ${flight.id} ${direction} ${sprinting ? 'sprint' : 'walk'}`;
            report.push(`${label}: ${JSON.stringify(probe)}`);
            expect(probe.completed, `${label} completed`).toBe(true);
            // THE BAND. A stall run is what a player calls sticky: the input
            // is held and the player is not going anywhere. Isolated frames at
            // a transition are physics; a RUN of them is a catch.
            expect(probe.worstStallRun, `${label} worst stall run`)
              .toBeLessThanOrEqual(STAIR_FEEL_BANDS.maxStallRunFrames);
            expect(probe.stallFrames, `${label} total stall frames`)
              .toBeLessThanOrEqual(STAIR_FEEL_BANDS.maxStallFrames);
            // Never pushed backwards while the input is held forward.
            expect(probe.minForwardSpeed, `${label} minimum forward speed`)
              .toBeGreaterThan(-STAIR_FEEL_BANDS.maxBackwardSpeed);
            // The descent is where the owner's "sticky" lives: contact must
            // hold, because losing it hands the player AIR control on a stair.
            if (direction === 'down') {
              expect(probe.ungroundedFrames / Math.max(1, probe.frames), `${label} ungrounded fraction`)
                .toBeLessThanOrEqual(STAIR_FEEL_BANDS.maxUngroundedFraction);
            }
          }
        }
      }
    }
    if (process.env.STAIR_FEEL_REPORT === '1') for (const line of report) console.log(`STAIR-FEEL ${line}`);
  }, 300_000);
});
