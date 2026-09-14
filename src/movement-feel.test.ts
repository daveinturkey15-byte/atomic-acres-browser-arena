import { describe, expect, it } from 'vitest';
import {
  MOVEMENT_FEEL_BANDS,
  measureJumpApex,
  measureStop,
  measureTimeToTopSpeed,
} from './movement-feel';
import { MOVEMENT_SPEED_M_S, movementProfile } from './gameplay';

/**
 * HF-497 MOVEMENT FEEL CONTRACT. The bands and their justification live in
 * `src/movement-feel.ts`; this file measures the SHIPPED profile against them
 * through the same integrator the game runs, so a future tuning pass cannot
 * drift the ground character out of the reference class without reddening a
 * gate.
 *
 * Nothing here retunes anything. The shipped values were measured first and
 * every one of them already lands inside its band, which is itself the
 * finding: the owner's "sticky" was never the ground character.
 */

const stand = { crouched: false, prone: false, ads: false, grounded: true };

describe('HF-497 movement feel bands', () => {
  it('reaches top speed fast enough to feel responsive and slow enough to have weight', () => {
    for (const [label, context] of [
      ['walk', { ...stand, sprinting: false }],
      ['sprint', { ...stand, sprinting: true }],
      ['ads', { ...stand, sprinting: false, ads: true }],
      ['crouch', { ...stand, sprinting: false, crouched: true }],
    ] as const) {
      const seconds = measureTimeToTopSpeed(context);
      expect(seconds, `${label} time to top speed`)
        .toBeGreaterThanOrEqual(MOVEMENT_FEEL_BANDS.timeToTopSpeedSeconds.min);
      expect(seconds, `${label} time to top speed`)
        .toBeLessThanOrEqual(MOVEMENT_FEEL_BANDS.timeToTopSpeedSeconds.max);
    }
  });

  it('stops in a distance that makes a corner peek a commitment, not a slide', () => {
    for (const [label, context] of [
      ['walk', { ...stand, sprinting: false }],
      ['sprint', { ...stand, sprinting: true }],
      ['crouch', { ...stand, sprinting: false, crouched: true }],
      ['prone', { ...stand, sprinting: false, prone: true }],
    ] as const) {
      const stop = measureStop(context);
      expect(stop.metres, `${label} stop distance`)
        .toBeLessThanOrEqual(MOVEMENT_FEEL_BANDS.stopDistanceMetres.max);
      expect(stop.seconds, `${label} stop time`)
        .toBeGreaterThanOrEqual(MOVEMENT_FEEL_BANDS.stopTimeSeconds.min);
      expect(stop.seconds, `${label} stop time`)
        .toBeLessThanOrEqual(MOVEMENT_FEEL_BANDS.stopTimeSeconds.max);
    }
  });

  it('jumps low and fast, the way an arena shooter jumps', () => {
    const apex = measureJumpApex({ ...stand, sprinting: false });
    expect(apex.seconds, 'jump apex time').toBeGreaterThanOrEqual(MOVEMENT_FEEL_BANDS.jumpApexSeconds.min);
    expect(apex.seconds, 'jump apex time').toBeLessThanOrEqual(MOVEMENT_FEEL_BANDS.jumpApexSeconds.max);
    expect(apex.metres, 'jump apex height').toBeGreaterThanOrEqual(MOVEMENT_FEEL_BANDS.jumpApexMetres.min);
    expect(apex.metres, 'jump apex height').toBeLessThanOrEqual(MOVEMENT_FEEL_BANDS.jumpApexMetres.max);
  });

  it('keeps air control real but non-steering, and never lets an airborne player out-accelerate a grounded one', () => {
    const ground = movementProfile({ ...stand, sprinting: false });
    const air = movementProfile({ ...stand, sprinting: false, grounded: false });
    const fraction = air.acceleration / ground.acceleration;
    expect(fraction, 'air control fraction').toBeGreaterThanOrEqual(MOVEMENT_FEEL_BANDS.airControlFraction.min);
    expect(fraction, 'air control fraction').toBeLessThanOrEqual(MOVEMENT_FEEL_BANDS.airControlFraction.max);
    expect(air.acceleration, 'airborne acceleration never exceeds grounded').toBeLessThan(ground.acceleration);
    // Air deceleration must be far weaker than ground, or a jump would brake
    // in mid-air and every hop would read as hitting treacle.
    expect(air.deceleration, 'airborne deceleration').toBeLessThan(ground.deceleration / 4);
  });

  it('holds the stance speed relationships the reference class has', () => {
    const crouchFraction = MOVEMENT_SPEED_M_S.crouch / MOVEMENT_SPEED_M_S.walk;
    expect(crouchFraction, 'crouch / walk').toBeGreaterThanOrEqual(MOVEMENT_FEEL_BANDS.crouchSpeedFraction.min);
    expect(crouchFraction, 'crouch / walk').toBeLessThanOrEqual(MOVEMENT_FEEL_BANDS.crouchSpeedFraction.max);
    const sprintFraction = MOVEMENT_SPEED_M_S.sprint / MOVEMENT_SPEED_M_S.walk;
    expect(sprintFraction, 'sprint / walk').toBeGreaterThanOrEqual(MOVEMENT_FEEL_BANDS.sprintSpeedFraction.min);
    expect(sprintFraction, 'sprint / walk').toBeLessThanOrEqual(MOVEMENT_FEEL_BANDS.sprintSpeedFraction.max);
    // Ordering is a contract in its own right: every tighter stance is slower.
    expect(MOVEMENT_SPEED_M_S.prone).toBeLessThan(MOVEMENT_SPEED_M_S.crouch);
    expect(MOVEMENT_SPEED_M_S.crouch).toBeLessThan(MOVEMENT_SPEED_M_S.ads);
    expect(MOVEMENT_SPEED_M_S.ads).toBeLessThan(MOVEMENT_SPEED_M_S.walk);
    expect(MOVEMENT_SPEED_M_S.walk).toBeLessThan(MOVEMENT_SPEED_M_S.sprint);
  });

  it('accelerates a sprint harder than a walk, so the sprint reads as a commitment', () => {
    const walk = movementProfile({ ...stand, sprinting: false });
    const sprint = movementProfile({ ...stand, sprinting: true });
    expect(sprint.acceleration).toBeGreaterThan(walk.acceleration);
    // ...but not so hard that the extra top speed is free: sprint must still
    // take longer to reach its (higher) top speed than a walk takes to reach
    // its own, or sprinting would be strictly better in every situation.
    expect(measureTimeToTopSpeed({ ...stand, sprinting: true }))
      .toBeGreaterThan(measureTimeToTopSpeed({ ...stand, sprinting: false }));
  });
});
