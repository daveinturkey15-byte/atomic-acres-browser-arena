/**
 * PASS 94 — the posture layer against the animation director.
 *
 * Kept in its own file rather than added to
 * `rigged-operator-animation-director.test.ts`: the director's suite is shared
 * with other lanes, and these cases are about the new hook rather than about
 * the director's own contract.
 */
import { describe, expect, it } from 'vitest';

import { LOCOMOTION_PLAYBACK_LIMITS } from './animation-locomotion';
import {
  advanceOperatorPosture,
  createOperatorPostureLayer,
  type OperatorPostureStance,
} from './operator-posture-layer';
import {
  advanceOperatorAnimation,
  createOperatorAnimationDirector,
} from './rigged-operator-animation-director';

const CLIPS = Object.freeze([
  'Idle_Gun', 'Walk', 'Run', 'Run_Shoot', 'Run_Back', 'Run_Left', 'Run_Right', 'Death',
]);

const STEP = 1 / 60;

function settle(stance: OperatorPostureStance, groundSpeedMps: number, seconds = 1.5) {
  const director = createOperatorAnimationDirector('default', 'bot-alpha');
  const posture = createOperatorPostureLayer('stand');
  let animation = advanceOperatorAnimation(director, {
    deltaSeconds: 0,
    forwardMps: 0,
    strafeMps: 0,
    aimPitchRadians: 0,
    yawErrorRadians: 0,
    dead: false,
    availableClips: CLIPS,
  });
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    const stanceOutput = advanceOperatorPosture(posture, {
      deltaSeconds: STEP,
      stance,
      groundSpeedMps,
    });
    animation = advanceOperatorAnimation(director, {
      deltaSeconds: STEP,
      forwardMps: groundSpeedMps,
      strafeMps: 0,
      aimPitchRadians: 0.4,
      yawErrorRadians: 0,
      dead: false,
      availableClips: CLIPS,
      stance: stanceOutput,
    });
  }
  return { animation, director };
}

/** No posture supplied: the pre-PASS-94 path, used as the control. */
function settleWithoutPosture(groundSpeedMps: number, seconds = 1.5) {
  const director = createOperatorAnimationDirector('default', 'bot-alpha');
  let animation = advanceOperatorAnimation(director, {
    deltaSeconds: 0,
    forwardMps: 0,
    strafeMps: 0,
    aimPitchRadians: 0,
    yawErrorRadians: 0,
    dead: false,
    availableClips: CLIPS,
  });
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    animation = advanceOperatorAnimation(director, {
      deltaSeconds: STEP,
      forwardMps: groundSpeedMps,
      strafeMps: 0,
      aimPitchRadians: 0.4,
      yawErrorRadians: 0,
      dead: false,
      availableClips: CLIPS,
    });
  }
  return animation;
}

describe('posture through the animation director', () => {
  it('leaves a standing operator byte-for-byte where it was', () => {
    const withPosture = settle('stand', 3.1).animation;
    const without = settleWithoutPosture(3.1);
    expect(withPosture.layers).toEqual(without.layers);
    expect(withPosture.selectedClip).toBe(without.selectedClip);
  });

  it('reports null stance when no posture is supplied, so callers can tell', () => {
    expect(settleWithoutPosture(3.1).stance).toBeNull();
    expect(settle('crouch', 1.8).animation.stance).not.toBeNull();
  });

  it('runs the cycle faster when crouched, at the same ground speed', () => {
    const crouched = settle('crouch', 1.8).animation;
    const standing = settleWithoutPosture(1.8);
    const crouchRate = crouched.layers[0]!.timeScale;
    const standRate = standing.layers[0]!.timeScale;
    expect(crouchRate).toBeGreaterThan(standRate);
  });

  it('never leaves the playback window the locomotion module defends', () => {
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      for (const speed of [0.4, 1.8, 4.2, 8.7]) {
        const { animation } = settle(stance, speed);
        for (const layer of animation.layers) {
          expect(layer.timeScale, `${stance}@${speed}`).toBeGreaterThanOrEqual(LOCOMOTION_PLAYBACK_LIMITS.minimum - 1e-9);
          expect(layer.timeScale, `${stance}@${speed}`).toBeLessThanOrEqual(LOCOMOTION_PLAYBACK_LIMITS.maximum + 1e-9);
        }
      }
    }
  });

  it('keeps the base layer weights summing to one after the cadence rescale', () => {
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const { animation } = settle(stance, 2.4);
      if (animation.layers.length === 0) continue;
      const sum = animation.layers.reduce((total, layer) => total + layer.weight, 0);
      expect(sum, stance).toBeCloseTo(1, 6);
    }
  });

  it('stops a prone operator selecting a full run', () => {
    const prone = settle('prone', 4.5).animation;
    // Prone caps clip selection at 1.1 m/s, which is walk territory. The
    // uncapped control picks a run at the same ground speed.
    expect(prone.selectedClip).toBe('Walk');
    expect(settleWithoutPosture(4.5).selectedClip).not.toBe('Walk');
  });

  it('reports the residual speed a prone crawl cannot represent', () => {
    const prone = settle('prone', 4.5).animation;
    expect(prone.stance!.residualSpeedMps).toBeGreaterThan(3);
  });

  it('reduces the aim pitch the body reaches when prone', () => {
    const prone = settle('prone', 0).animation;
    const standing = settle('stand', 0).animation;
    expect(Math.abs(prone.aim.aimPitchRadians))
      .toBeLessThan(Math.abs(standing.aim.aimPitchRadians));
  });

  it('drops the aim authority while sprinting', () => {
    const sprinting = settle('stand', 8.7).animation;
    expect(sprinting.stance!.sprint).toBeCloseTo(1, 2);
    const walking = settle('stand', 1.2).animation;
    expect(Math.abs(sprinting.aim.aimPitchRadians))
      .toBeLessThan(Math.abs(walking.aim.aimPitchRadians));
  });
});
