import { integrateHorizontalVelocity, movementProfile, PLAYER_JUMP_GRAVITY, SIMULATION_HZ } from './gameplay';
import type { MovementContext } from './gameplay';

/**
 * HF-497 MOVEMENT AND STAIR FEEL CONTRACT.
 *
 * Owner, 2026-09-04 (ledger HF-497): the remaining asks include "gameplay
 * feeling good", and twice before that (HITL 1, HITL 3) "the stairs are still
 * sticky to navigate".
 *
 * "Feels good" is not a test, so this module turns it into four measurable
 * quantities that a player can actually perceive, states the band each must
 * land in, and says where the band comes from. `src/movement-feel.test.ts`
 * measures the SHIPPED profile against them, so a future tuning pass that
 * makes the character mushy or twitchy reds a gate instead of reaching an
 * owner.
 *
 * THE REFERENCE. Atomic Acres is a BO2-class arena shooter and the arena the
 * owner reviews is Nuke Town Rebuild, so the reference class is the Black
 * Ops 2 ground character: near-instant but not instantaneous acquisition of
 * top speed, a short crisp stop, a low fast jump, and air control that exists
 * but does not steer. These bands are deliberately BANDS, not targets: the
 * shipped numbers are inside them and were not moved by this pass, because
 * nothing in the owner's feedback said the ground character was wrong - the
 * stairs were. Recording the bands is what stops the next pass from silently
 * drifting out of them.
 *
 * CLAIM-STATE. The band EDGES are an inference from the reference class and
 * from what these same numbers already produce; they are not measurements of
 * Black Ops 2. The values inside them are VERIFIED against the shipped
 * `movementProfile` by the paired test.
 */
export const MOVEMENT_FEEL_BANDS = Object.freeze({
  /**
   * Time from a standing start to 99 % of top speed, seconds. A shooter that
   * takes longer reads as heavy; much shorter and strafing loses its weight
   * entirely. Shipped: walk 6.15 / 48 = 0.128 s, sprint 8.7 / 54 = 0.161 s.
   */
  timeToTopSpeedSeconds: Object.freeze({ min: 0.06, max: 0.24 }),
  /**
   * Distance travelled between releasing the stick at top speed and full stop,
   * metres. This is the number that decides whether a corner peek commits you.
   * An UPPER bound only, and every stance shares it: past this the character
   * slides and a peek stops being a decision. Shipped walk 0.305 m, sprint
   * 0.610 m, crouch 0.105 m.
   */
  stopDistanceMetres: Object.freeze({ max: 0.65 }),
  /**
   * Time between releasing the stick at top speed and full stop, seconds - and
   * the reason there is no stop-DISTANCE minimum.
   *
   * A distance floor was written first and the crouch stance immediately
   * failed it at 0.105 m against a 0.12 m band. The band was wrong, not the
   * stance: stop distance is v^2 / 2a, so a stance that is half the speed
   * stops in a quarter of the distance no matter how much weight it has. What
   * the floor was actually protecting - that releasing the stick is a
   * deceleration and not a snap to zero - is a TIME, and it holds in every
   * stance. Shipped: walk 6.15 / 62 = 0.099 s, sprint 0.140 s, crouch
   * 3.15 / 42 = 0.075 s, prone 1.55 / 25 = 0.062 s.
   */
  stopTimeSeconds: Object.freeze({ min: 0.05, max: 0.22 }),
  /** Time from leaving the ground to the top of a neutral jump, seconds. Shipped: 6.35 / 24.5 = 0.259 s. */
  jumpApexSeconds: Object.freeze({ min: 0.20, max: 0.33 }),
  /** Height of that apex above the take-off plane, metres. Shipped: 6.35^2 / (2 x 24.5) = 0.823 m. */
  jumpApexMetres: Object.freeze({ min: 0.62, max: 1.05 }),
  /**
   * Airborne acceleration as a fraction of the standing ground value. Air
   * control must EXIST - a jump you cannot adjust reads as a cutscene - and
   * must not steer, or the arena becomes a bunny-hop map. Shipped: 10.5 / 48.
   */
  airControlFraction: Object.freeze({ min: 0.10, max: 0.36 }),
  /**
   * Crouch speed as a fraction of walk speed. HF-433 recorded WHY this is
   * below the reference's ~0.6 and must not be raised toward it. Shipped:
   * 3.15 / 6.15 = 0.512.
   */
  crouchSpeedFraction: Object.freeze({ min: 0.42, max: 0.58 }),
  /** Sprint speed as a fraction of walk speed. Shipped: 8.7 / 6.15 = 1.415. */
  sprintSpeedFraction: Object.freeze({ min: 1.30, max: 1.55 }),
});

/**
 * HF-497 STAIR FEEL BANDS - what `src/stair-traversal-feel.test.ts` asserts on
 * every flight, both directions, walking and sprinting.
 *
 * A "stall frame" is a frame in which the player realised less than
 * `stallSpeedFraction` of the speed their held input asked for. Isolated stall
 * frames are honest physics: a capsule meeting a 36 degree ramp loses forward
 * speed for a frame or two at the transition and that is what a stair IS. A
 * RUN of them is the defect - it is the input being held with nothing
 * happening, which is exactly what "sticky" describes.
 */
export const STAIR_FEEL_BANDS = Object.freeze({
  stallSpeedFraction: 0.30,
  /** Longest unbroken stall run tolerated on any flight, at 120 Hz. 6 frames = 50 ms - under a single 60 Hz display frame pair. */
  maxStallRunFrames: 6,
  /** Total stall frames tolerated over one flight. */
  maxStallFrames: 12,
  /** A held-forward input must never move the player backwards faster than this, m/s. */
  maxBackwardSpeed: 0.35,
  /**
   * Descending, the controller may report no ground contact on at most this
   * fraction of frames. Every ungrounded frame hands the player the AIRBORNE
   * movement profile - acceleration 10.5 instead of 48 - on a staircase.
   */
  maxUngroundedFraction: 0.06,
});

/** Seconds to reach `fraction` of top speed from a standing start, measured through the shipped integrator. */
export function measureTimeToTopSpeed(context: MovementContext, fraction = 0.99): number {
  const profile = movementProfile(context);
  const dt = 1 / SIMULATION_HZ;
  let velocity = { x: 0, z: 0 };
  for (let frame = 1; frame <= SIMULATION_HZ * 4; frame += 1) {
    velocity = integrateHorizontalVelocity(velocity, { x: 0, z: 1 }, profile, dt);
    if (Math.hypot(velocity.x, velocity.z) >= profile.maxSpeed * fraction) return frame * dt;
  }
  return Number.POSITIVE_INFINITY;
}

/** Metres travelled and seconds taken between releasing the input at top speed and stopping, through the shipped integrator. */
export function measureStop(context: MovementContext): { metres: number; seconds: number } {
  const profile = movementProfile(context);
  const dt = 1 / SIMULATION_HZ;
  let velocity = { x: 0, z: profile.maxSpeed };
  let metres = 0;
  let seconds = 0;
  for (let frame = 0; frame < SIMULATION_HZ * 4; frame += 1) {
    velocity = integrateHorizontalVelocity(velocity, { x: 0, z: 0 }, profile, dt);
    const speed = Math.hypot(velocity.x, velocity.z);
    metres += speed * dt;
    seconds += dt;
    if (speed <= 1e-6) break;
  }
  return { metres, seconds };
}

/** Neutral-jump apex, integrated at the simulation rate rather than solved, so it measures what the loop does. */
export function measureJumpApex(context: MovementContext): { seconds: number; metres: number } {
  const profile = movementProfile({ ...context, grounded: true });
  const dt = 1 / SIMULATION_HZ;
  let velocityY = profile.jumpVelocity;
  let height = 0;
  let seconds = 0;
  for (let frame = 0; frame < SIMULATION_HZ * 4; frame += 1) {
    velocityY += PLAYER_JUMP_GRAVITY * dt;
    const next = height + velocityY * dt;
    seconds += dt;
    if (next <= height) return { seconds, metres: height };
    height = next;
  }
  return { seconds, metres: height };
}
