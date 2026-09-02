/**
 * HF-412 — the drop-shot transition state machine, and the two properties the
 * owner actually asked for: a real transition instead of a teleport, and no
 * slide/dive anywhere near it.
 *
 * The source-pinned half of this file guards the thing a unit test cannot see:
 * that `legacy-main.ts` does not put the prone transition back inside the fire
 * gate. That gate is what made the shipped build refuse 30 consecutive shots
 * across a drop (docs/evidence/pass85/hf412/before-test1-quiet.json - the
 * tracked receipt; an independent re-measurement of the same base reported 29).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DROP_SHOT_TIMING,
  DROP_SHOT_TIMING_BOUNDS,
  IDLE_CROUCH_HOLD,
  beginStanceTransition,
  crouchHeld,
  crouchPressed,
  crouchReleased,
  restingStanceTransitionSample,
  sampleStanceTransition,
  stanceTransitionDurationMs,
  stanceTransitionImpulse,
} from './prone-transition';
import { stanceEyeHeight } from './legacy-pure-helpers-2';

const LEGACY_MAIN = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const PRONE_TRANSITION_SOURCE = readFileSync(new URL('./prone-transition.ts', import.meta.url), 'utf8');

describe('HF-412 drop-shot timing constants', () => {
  it('keeps every transition inside the stated tuning band', () => {
    for (const duration of [
      DROP_SHOT_TIMING.standToProneMs,
      DROP_SHOT_TIMING.proneToStandMs,
      DROP_SHOT_TIMING.crouchStepMs,
    ]) {
      expect(duration).toBeGreaterThanOrEqual(DROP_SHOT_TIMING_BOUNDS.minimumTransitionMs);
      expect(duration).toBeLessThanOrEqual(DROP_SHOT_TIMING_BOUNDS.maximumTransitionMs);
    }
    expect(DROP_SHOT_TIMING.holdCrouchToProneMs)
      .toBeGreaterThanOrEqual(DROP_SHOT_TIMING_BOUNDS.minimumHoldToProneMs);
    expect(DROP_SHOT_TIMING.holdCrouchToProneMs)
      .toBeLessThanOrEqual(DROP_SHOT_TIMING_BOUNDS.maximumHoldToProneMs);
  });

  it('makes getting up slower than dropping, so the technique stays a commitment', () => {
    expect(DROP_SHOT_TIMING.proneToStandMs).toBeGreaterThan(DROP_SHOT_TIMING.standToProneMs);
  });

  it('penalises accuracy during the drop without ever removing the shot', () => {
    expect(DROP_SHOT_TIMING.transitionSpreadPeak).toBeGreaterThan(1);
    expect(DROP_SHOT_TIMING.transitionSpreadPeak)
      .toBeLessThanOrEqual(DROP_SHOT_TIMING_BOUNDS.maximumSpreadPeak);
  });

  it('resolves one fixed duration per stance pair, independent of when it is asked', () => {
    expect(stanceTransitionDurationMs('stand', 'prone')).toBe(DROP_SHOT_TIMING.standToProneMs);
    expect(stanceTransitionDurationMs('crouch', 'prone')).toBe(DROP_SHOT_TIMING.standToProneMs);
    expect(stanceTransitionDurationMs('prone', 'stand')).toBe(DROP_SHOT_TIMING.proneToStandMs);
    expect(stanceTransitionDurationMs('stand', 'crouch')).toBe(DROP_SHOT_TIMING.crouchStepMs);
    expect(stanceTransitionDurationMs('prone', 'prone')).toBe(0);
  });
});

describe('HF-412 stance transition sampling', () => {
  it('holds the camera at the OLD eye height on the press and lands exactly on the new one', () => {
    const transition = beginStanceTransition('stand', 'prone', 1_000);
    expect(transition).not.toBeNull();
    const atPress = sampleStanceTransition(transition, 1_000, 'prone');
    // The capsule is already prone; the rendered eye must still be standing.
    expect(atPress.eyeOffsetMeters).toBeCloseTo(stanceEyeHeight('stand') - stanceEyeHeight('prone'), 6);
    expect(atPress.active).toBe(true);

    const atEnd = sampleStanceTransition(transition, 1_000 + DROP_SHOT_TIMING.standToProneMs, 'prone');
    expect(atEnd.eyeOffsetMeters).toBe(0);
    expect(atEnd.active).toBe(false);
    expect(atEnd.progress).toBe(1);
  });

  it('falls monotonically and never overshoots below the prone seat', () => {
    const transition = beginStanceTransition('stand', 'prone', 0);
    let previous = Infinity;
    for (let step = 0; step <= 40; step += 1) {
      const sample = sampleStanceTransition(transition, (step / 40) * DROP_SHOT_TIMING.standToProneMs, 'prone');
      expect(sample.eyeOffsetMeters).toBeLessThanOrEqual(previous + 1e-9);
      // Negative would put the rendered camera BELOW the authoritative prone
      // eye, i.e. inside the floor.
      expect(sample.eyeOffsetMeters).toBeGreaterThanOrEqual(0);
      previous = sample.eyeOffsetMeters;
    }
  });

  it('never lets more than a third of the fall land in one 60 Hz frame', () => {
    // The shipped build moved 1.09 m in a single frame. A transition worth the
    // name spreads the fall out; this is the mechanical statement of that.
    const transition = beginStanceTransition('stand', 'prone', 0);
    const frameMs = 1_000 / 60;
    let worst = 0;
    let previous = sampleStanceTransition(transition, 0, 'prone').eyeOffsetMeters;
    for (let t = frameMs; t <= DROP_SHOT_TIMING.standToProneMs + frameMs; t += frameMs) {
      const current = sampleStanceTransition(transition, t, 'prone').eyeOffsetMeters;
      worst = Math.max(worst, previous - current);
      previous = current;
    }
    const totalFall = stanceEyeHeight('stand') - stanceEyeHeight('prone');
    expect(worst).toBeLessThan(totalFall / 3);
  });

  it('applies the accuracy penalty only inside a prone transition, peaking mid-drop', () => {
    const drop = beginStanceTransition('stand', 'prone', 0);
    expect(sampleStanceTransition(drop, 0, 'prone').spreadMultiplier).toBeCloseTo(1, 6);
    const middle = sampleStanceTransition(drop, DROP_SHOT_TIMING.standToProneMs / 2, 'prone');
    expect(middle.spreadMultiplier).toBeCloseTo(DROP_SHOT_TIMING.transitionSpreadPeak, 6);
    expect(sampleStanceTransition(drop, DROP_SHOT_TIMING.standToProneMs, 'prone').spreadMultiplier).toBe(1);

    const crouchStep = beginStanceTransition('stand', 'crouch', 0);
    expect(sampleStanceTransition(crouchStep, DROP_SHOT_TIMING.crouchStepMs / 2, 'crouch').spreadMultiplier).toBe(1);
  });

  it('reports resting state for a null transition and for a same-stance request', () => {
    expect(beginStanceTransition('prone', 'prone', 10)).toBeNull();
    const resting = sampleStanceTransition(null, 10, 'crouch');
    expect(resting).toEqual(restingStanceTransitionSample('crouch'));
    expect(resting.eyeOffsetMeters).toBe(0);
    expect(resting.spreadMultiplier).toBe(1);
  });

  it('marks only the downward half as a drop', () => {
    const down = sampleStanceTransition(beginStanceTransition('stand', 'prone', 0), 10, 'prone');
    const up = sampleStanceTransition(beginStanceTransition('prone', 'stand', 0), 10, 'stand');
    expect(down.dropping).toBe(true);
    expect(up.dropping).toBe(false);
  });
});

describe('HF-412 no slide, no dive', () => {
  it('contributes exactly zero impulse at every point of every transition', () => {
    const pairs: Array<[Parameters<typeof beginStanceTransition>[0], Parameters<typeof beginStanceTransition>[1]]> = [
      ['stand', 'prone'], ['crouch', 'prone'], ['prone', 'stand'], ['stand', 'crouch'],
    ];
    for (const [from, to] of pairs) {
      const transition = beginStanceTransition(from, to, 0);
      for (let step = 0; step <= 10; step += 1) {
        const sample = sampleStanceTransition(transition, (step / 10) * stanceTransitionDurationMs(from, to), to);
        expect(stanceTransitionImpulse(sample)).toEqual({ x: 0, y: 0, z: 0 });
      }
    }
  });

  it('has no dive or slide vocabulary anywhere in the transition module', () => {
    // Black Ops 1 had the dolphin dive and later titles had the slide; Black Ops
    // 2 had neither, and the owner named both as things he does NOT want.
    const offenders = /\b(dive|dolphin|slide[A-Z_]|slideImpulse|lungeVelocity)\b/i;
    const codeOnly = PRONE_TRANSITION_SOURCE
      // Strip the block comments — they discuss dives precisely to forbid them.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(offenders);
  });
});

describe('HF-412 hold-crouch-to-prone', () => {
  it('crouches on the press and converts to prone once the hold passes the threshold', () => {
    const press = crouchPressed(IDLE_CROUCH_HOLD, 1_000, 'stand');
    expect(press.action).toBe('crouch');
    expect(crouchHeld(press.state, 1_000 + DROP_SHOT_TIMING.holdCrouchToProneMs - 1).action).toBeNull();
    const converted = crouchHeld(press.state, 1_000 + DROP_SHOT_TIMING.holdCrouchToProneMs);
    expect(converted.action).toBe('prone');
    // Exactly once, however long the button stays down.
    expect(crouchHeld(converted.state, 1_000 + 5_000).action).toBeNull();
  });

  it('a short tap never goes prone', () => {
    const press = crouchPressed(IDLE_CROUCH_HOLD, 0, 'stand');
    expect(crouchHeld(press.state, 80).action).toBeNull();
    expect(crouchReleased().state).toEqual(IDLE_CROUCH_HOLD);
  });

  it('a deliberate 200 ms crouch press is still only a crouch', () => {
    // The regression this guards: a threshold short enough that an ordinary
    // deliberate press - not a flick - drops the player prone by accident.
    const press = crouchPressed(IDLE_CROUCH_HOLD, 0, 'stand');
    for (let heldMs = 16; heldMs <= 200; heldMs += 16) {
      expect(crouchHeld(press.state, heldMs).action).toBeNull();
    }
  });

  it('ignores a repeat press while the button is already down (key auto-repeat)', () => {
    const press = crouchPressed(IDLE_CROUCH_HOLD, 0, 'stand');
    const repeat = crouchPressed(press.state, 40, 'stand');
    expect(repeat.action).toBeNull();
    expect(repeat.state).toBe(press.state);
  });

  it('NEVER converts a press that started from prone - the crouch bind is how you get up', () => {
    // nextStance('prone', 'toggle-crouch') is 'crouch', so a press from prone
    // starts the rise. If the hold could still convert, the poll would force
    // the player back down mid-rise and the crouch key would stop being able to
    // stand a prone player up at all.
    const press = crouchPressed(IDLE_CROUCH_HOLD, 500, 'prone');
    expect(press.action).toBe('crouch');
    expect(press.state.armed).toBe(false);
    for (const heldMs of [
      500 + DROP_SHOT_TIMING.holdCrouchToProneMs,
      500 + DROP_SHOT_TIMING.holdCrouchToProneMs * 2,
      500 + 10_000,
    ]) {
      expect(crouchHeld(press.state, heldMs).action).toBeNull();
    }
  });

  it('re-arms on the NEXT press once the player is no longer prone', () => {
    const fromProne = crouchPressed(IDLE_CROUCH_HOLD, 0, 'prone');
    expect(crouchHeld(fromProne.state, 5_000).action).toBeNull();
    const released = crouchReleased();
    const again = crouchPressed(released.state, 6_000, 'crouch');
    expect(again.state.armed).toBe(true);
    expect(crouchHeld(again.state, 6_000 + DROP_SHOT_TIMING.holdCrouchToProneMs).action).toBe('prone');
  });
});

describe('HF-412 source contract: the fire path does not gate on the prone transition', () => {
  it('never sets a stance recovery block for a prone transition', () => {
    // The shipped line was:
    //   stanceRecoveryUntil = now + (target === 'prone' ? 260 : previous === 'prone' ? 290 : 135);
    // Both prone arms are the drop-shot fire block. Neither may come back.
    expect(LEGACY_MAIN).not.toMatch(/stanceRecoveryUntil\s*=\s*[^;]*target\s*===\s*'prone'/);
    expect(LEGACY_MAIN).not.toMatch(/stanceRecoveryUntil\s*=\s*[^;]*previous\s*===\s*'prone'/);
  });

  it('keeps the drop-shot marker on the stance request so the intent is greppable', () => {
    expect(LEGACY_MAIN).toMatch(/\/\/ HF-412:/);
  });

  it('routes the rendered eye through the transition sampler rather than a clamped lag', () => {
    expect(LEGACY_MAIN).toMatch(/sampleStanceTransition\(/);
    expect(LEGACY_MAIN).toMatch(/stanceTransitionSample\.eyeOffsetMeters/);
  });

  it('arms the hold-to-prone conversion from the stance at the press', () => {
    // Both input paths must pass the current stance in, or the prone player's
    // crouch press becomes a forced re-drop 320 ms later.
    const presses = LEGACY_MAIN.match(/crouchPressed\(crouchHoldState,[^;\n]*/g) ?? [];
    expect(presses.length).toBeGreaterThanOrEqual(2);
    for (const press of presses) expect(press).toMatch(/player\.stance/);
  });

  it('applies the drop-shot cone multiplier to HIP FIRE only', () => {
    // computeSpread has already resolved the ADS cone by this point, so an
    // unconditional multiply would widen the ADS cone too.
    expect(LEGACY_MAIN).toMatch(
      /const dropShotSpreadMultiplier = adsSettled \? 1 : dropShotSample\.spreadMultiplier;/,
    );
    expect(LEGACY_MAIN).toMatch(/admittedSpread = obstructedSpread \* dropShotSpreadMultiplier;/);
    expect(LEGACY_MAIN).not.toMatch(/obstructedSpread \* dropShotSample\.spreadMultiplier/);
  });

  it('leaves the plain stand<->crouch body settle exactly as it shipped', () => {
    // The fixed window is a PRONE-transition change. Putting every operator's
    // crouch step on it would slow down every rig on every arena for a drop-shot
    // row, in a file Lane Z owns, with no measurement behind it.
    const operatorModel = readFileSync(new URL('./operator-model.ts', import.meta.url), 'utf8');
    expect(operatorModel).toMatch(/const proneInvolved = blendFrom === 'prone' \|\| runtimeState\.stance === 'prone';/);
    expect(operatorModel).toMatch(/alpha = 1 - Math\.exp\(-Math\.max\(0, dt\) \* 12\);/);
  });

  it('adds no velocity anywhere in the stance request', () => {
    const start = LEGACY_MAIN.indexOf("function requestStance(");
    expect(start).toBeGreaterThan(0);
    const body = LEGACY_MAIN.slice(start, LEGACY_MAIN.indexOf('\nfunction ', start + 10));
    expect(body).not.toMatch(/player\.velocity\.(set|add|addScaledVector)/);
    expect(body).not.toMatch(/\bdive\b|\bslide\b/i);
  });
});
