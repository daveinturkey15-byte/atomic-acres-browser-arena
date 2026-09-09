import { describe, expect, it } from 'vitest';

import { DROP_SHOT_TIMING } from './prone-transition';
import {
  OPERATOR_GAIT_NAMES,
  OPERATOR_POSTURE_GAITS,
  OPERATOR_POSTURE_TRANSITIONS,
  POSTURE_RUN_SPEED_MPS,
  SPRINT_AIM_PITCH_SCALE,
  SPRINT_ENTER_MPS,
  SPRINT_EXIT_MPS,
  SPRINT_LEAN_RADIANS,
  advanceOperatorPosture,
  blendedGaitProfile,
  createOperatorPostureLayer,
  gaitNameFor,
  type OperatorPostureInput,
  type OperatorPostureLayerState,
  type OperatorPostureStance,
} from './operator-posture-layer';

const STEP = 1 / 60;

function run(
  state: OperatorPostureLayerState,
  seconds: number,
  overrides: Partial<OperatorPostureInput> = {},
): ReturnType<typeof advanceOperatorPosture> {
  let output = advanceOperatorPosture(state, {
    deltaSeconds: 0,
    stance: 'stand',
    groundSpeedMps: 0,
    ...overrides,
  });
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    output = advanceOperatorPosture(state, {
      deltaSeconds: STEP,
      stance: 'stand',
      groundSpeedMps: 0,
      ...overrides,
    });
  }
  return output;
}

describe('posture transition durations', () => {
  it('are derived from the single gameplay timing source, not a second table', () => {
    expect(OPERATOR_POSTURE_TRANSITIONS.transitions['stand->prone'])
      .toBeCloseTo(DROP_SHOT_TIMING.standToProneMs / 1000, 10);
    expect(OPERATOR_POSTURE_TRANSITIONS.transitions['prone->stand'])
      .toBeCloseTo(DROP_SHOT_TIMING.proneToStandMs / 1000, 10);
    expect(OPERATOR_POSTURE_TRANSITIONS.transitions['stand->crouch'])
      .toBeCloseTo(DROP_SHOT_TIMING.crouchStepMs / 1000, 10);
  });

  it('makes getting up slower than going down, as the drop-shot contract requires', () => {
    expect(OPERATOR_POSTURE_TRANSITIONS.transitions['prone->stand'])
      .toBeGreaterThan(OPERATOR_POSTURE_TRANSITIONS.transitions['stand->prone']!);
  });

  it('makes a crouch-to-prone drop shorter than a stand-to-prone one', () => {
    expect(OPERATOR_POSTURE_TRANSITIONS.transitions['crouch->prone'])
      .toBeLessThan(OPERATOR_POSTURE_TRANSITIONS.transitions['stand->prone']!);
  });
});

describe('posture weights', () => {
  it('start fully standing', () => {
    const state = createOperatorPostureLayer();
    const output = advanceOperatorPosture(state, { deltaSeconds: 0, stance: 'stand', groundSpeedMps: 0 });
    expect(output.weights.stand).toBeCloseTo(1, 6);
    expect(output.dominant).toBe('stand');
  });

  it('always sum to one, through every transition, at every step', () => {
    const state = createOperatorPostureLayer();
    const script: OperatorPostureStance[] = ['crouch', 'prone', 'crouch', 'stand', 'prone'];
    for (const stance of script) {
      for (let i = 0; i < 40; i += 1) {
        const output = advanceOperatorPosture(state, { deltaSeconds: STEP, stance, groundSpeedMps: 1.2 });
        const sum = output.weights.stand + output.weights.crouch + output.weights.prone;
        expect(sum).toBeCloseTo(1, 6);
      }
    }
  });

  it('reaches the requested stance and reports it as dominant', () => {
    const state = createOperatorPostureLayer();
    const crouched = run(state, 0.6, { stance: 'crouch' });
    expect(crouched.weights.crouch).toBeCloseTo(1, 4);
    expect(crouched.dominant).toBe('crouch');
    const prone = run(state, 1.2, { stance: 'prone' });
    expect(prone.weights.prone).toBeCloseTo(1, 4);
    expect(prone.dominant).toBe('prone');
  });

  it('never lets the incoming posture weight go backwards mid-transition', () => {
    const state = createOperatorPostureLayer();
    let previous = 0;
    for (let i = 0; i < 30; i += 1) {
      const output = advanceOperatorPosture(state, { deltaSeconds: STEP, stance: 'prone', groundSpeedMps: 0 });
      expect(output.weights.prone).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = output.weights.prone;
    }
  });

  it('is deterministic for identical input sequences', () => {
    const a = createOperatorPostureLayer();
    const b = createOperatorPostureLayer();
    for (let i = 0; i < 25; i += 1) {
      const outA = advanceOperatorPosture(a, { deltaSeconds: STEP, stance: 'crouch', groundSpeedMps: 1.7 });
      const outB = advanceOperatorPosture(b, { deltaSeconds: STEP, stance: 'crouch', groundSpeedMps: 1.7 });
      expect(outA).toEqual(outB);
    }
  });

  it('clamps a stalled-tab delta instead of teleporting the blend', () => {
    const state = createOperatorPostureLayer();
    const output = advanceOperatorPosture(state, { deltaSeconds: 9, stance: 'prone', groundSpeedMps: 0 });
    expect(output.weights.prone).toBeLessThan(1);
    expect(output.weights.prone).toBeGreaterThan(0);
  });

  it('freezes the posture the instant the operator dies', () => {
    const state = createOperatorPostureLayer();
    const crouched = run(state, 0.6, { stance: 'crouch' });
    expect(crouched.weights.crouch).toBeCloseTo(1, 4);
    // A corpse must keep the shape it fell in even though the gameplay stance
    // snaps back to stand on respawn bookkeeping.
    const dead = run(state, 1.5, { stance: 'stand', dead: true });
    expect(dead.weights.crouch).toBeCloseTo(1, 4);
    expect(dead.gait).toBe('dead');
  });
});

describe('cadence and clip selection', () => {
  it('leaves a standing operator exactly as it is today', () => {
    const state = createOperatorPostureLayer();
    const output = run(state, 0.3, { stance: 'stand', groundSpeedMps: 3.1 });
    expect(output.cadenceScale).toBeCloseTo(1, 6);
    expect(output.clipSelectionSpeedMps).toBeCloseTo(3.1, 6);
    expect(output.residualSpeedMps).toBe(0);
    expect(output.aimPitchScale).toBeCloseTo(1, 6);
  });

  it('speeds the cycle up when crouched, because the stride is shorter', () => {
    const state = createOperatorPostureLayer();
    const output = run(state, 0.6, { stance: 'crouch', groundSpeedMps: 1.8 });
    // 1 / 0.54 stride fraction. Without this the compressed legs cover a full
    // standing stride per cycle and the feet skate.
    expect(output.cadenceScale).toBeCloseTo(1 / OPERATOR_POSTURE_GAITS.crouch.strideFraction, 3);
    expect(output.cadenceScale).toBeGreaterThan(1);
  });

  it('caps clip selection at what the posture can honestly show, and reports the rest', () => {
    const state = createOperatorPostureLayer();
    const output = run(state, 1.4, { stance: 'prone', groundSpeedMps: 4.5 });
    expect(output.clipSelectionSpeedMps).toBeCloseTo(OPERATOR_POSTURE_GAITS.prone.maximumClipSpeedMps, 3);
    expect(output.residualSpeedMps).toBeCloseTo(4.5 - OPERATOR_POSTURE_GAITS.prone.maximumClipSpeedMps, 3);
  });

  it('never lets the cadence multiplier blur the leg cycle', () => {
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const state = createOperatorPostureLayer();
      const output = run(state, 1.5, { stance, groundSpeedMps: 2 });
      expect(output.cadenceScale, stance).toBeGreaterThanOrEqual(1);
      expect(output.cadenceScale, stance).toBeLessThanOrEqual(3.4);
    }
  });

  it('blends the gait constants through the transition rather than snapping', () => {
    const mid = blendedGaitProfile({ stand: 0.5, crouch: 0.5, prone: 0 });
    expect(mid.strideFraction).toBeGreaterThan(OPERATOR_POSTURE_GAITS.crouch.strideFraction);
    expect(mid.strideFraction).toBeLessThan(OPERATOR_POSTURE_GAITS.stand.strideFraction);
  });

  it('falls back to the standing profile for degenerate weights', () => {
    expect(blendedGaitProfile({ stand: 0, crouch: 0, prone: 0 })).toBe(OPERATOR_POSTURE_GAITS.stand);
  });
});

describe('sprint', () => {
  it('does not flicker across the entry threshold', () => {
    const state = createOperatorPostureLayer();
    run(state, 0.6, { groundSpeedMps: SPRINT_ENTER_MPS + 0.2 });
    expect(state.sprinting).toBe(true);
    // Between the exit and entry speeds the latch must hold.
    const between = (SPRINT_ENTER_MPS + SPRINT_EXIT_MPS) / 2;
    run(state, 0.5, { groundSpeedMps: between });
    expect(state.sprinting).toBe(true);
    run(state, 0.5, { groundSpeedMps: SPRINT_EXIT_MPS - 0.2 });
    expect(state.sprinting).toBe(false);
  });

  it('reaches a full lean and returns to none', () => {
    const state = createOperatorPostureLayer();
    const fast = run(state, 1, { groundSpeedMps: 8.7 });
    expect(fast.sprint).toBeCloseTo(1, 3);
    expect(fast.leanRadians).toBeCloseTo(SPRINT_LEAN_RADIANS, 3);
    const stopped = run(state, 1, { groundSpeedMps: 0 });
    expect(stopped.sprint).toBeCloseTo(0, 3);
    expect(stopped.leanRadians).toBeCloseTo(0, 4);
  });

  it('drops the aim authority while sprinting, because the weapon is down', () => {
    const state = createOperatorPostureLayer();
    const fast = run(state, 1, { groundSpeedMps: 8.7 });
    expect(fast.aimPitchScale).toBeCloseTo(SPRINT_AIM_PITCH_SCALE, 2);
  });

  it('cannot sprint while crouched or prone', () => {
    for (const stance of ['crouch', 'prone'] as const) {
      const state = createOperatorPostureLayer();
      const output = run(state, 1.5, { stance, groundSpeedMps: 9 });
      expect(output.sprint, stance).toBeCloseTo(0, 4);
    }
  });

  it('cannot sprint when the caller forbids it', () => {
    const state = createOperatorPostureLayer();
    const output = run(state, 1, { groundSpeedMps: 9, sprintAllowed: false });
    expect(output.sprint).toBeCloseTo(0, 4);
  });

  it('stops sprinting on death', () => {
    const state = createOperatorPostureLayer();
    run(state, 1, { groundSpeedMps: 9 });
    const dead = run(state, 1, { groundSpeedMps: 9, dead: true });
    expect(dead.sprint).toBeCloseTo(0, 3);
  });
});

describe('gait naming', () => {
  it('covers every declared gait name', () => {
    const produced = new Set<string>([
      gaitNameFor('stand', 0, 0, false),
      gaitNameFor('stand', 1, 0, false),
      gaitNameFor('stand', POSTURE_RUN_SPEED_MPS + 1, 0, false),
      gaitNameFor('stand', 9, 1, false),
      gaitNameFor('crouch', 0, 0, false),
      gaitNameFor('crouch', 1.5, 0, false),
      gaitNameFor('prone', 0, 0, false),
      gaitNameFor('prone', 0.8, 0, false),
      gaitNameFor('stand', 0, 0, true),
    ]);
    expect([...produced].sort()).toEqual([...OPERATOR_GAIT_NAMES].sort());
  });

  it('reports death regardless of speed or posture', () => {
    expect(gaitNameFor('prone', 9, 1, true)).toBe('dead');
  });
});
