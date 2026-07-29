import { describe, expect, it } from 'vitest';
import type { InteractionCandidate } from './interaction-arbitration';
import {
  F_INTERACTION_HOLD_MS,
  createFInteractionPressState,
  fInteractionHoldProgress,
  reduceFInteractionPress,
  type FInteractionCancelReason,
} from './interaction-press-lifecycle';

const candidate = (
  kind: InteractionCandidate['kind'],
  targetId: string,
  proximityM = 1,
  enabled = true,
): InteractionCandidate => ({ kind, targetId, proximityM, enabled, prompt: `${kind}:${targetId}` });

const sample = (nowMs: number, candidates: readonly InteractionCandidate[]) => ({
  nowMs,
  matchEpoch: 7,
  lifeId: 3,
  inputEligible: true,
  candidates,
});

describe('pinned F press lifecycle', () => {
  it('commits a tap only on release before 1,000 ms', () => {
    const door = candidate('shed-door', 'door-a');
    const pressed = reduceFInteractionPress(createFInteractionPressState(), {
      type: 'press', pressId: 1, ...sample(100, [door]),
    });
    expect(pressed.commit).toBeNull();
    expect(pressed.state).toMatchObject({ phase: 'pressed', tapCandidate: door, holdCandidate: null });
    expect(reduceFInteractionPress(pressed.state, { type: 'advance', ...sample(999, [door]) }).commit).toBeNull();

    const released = reduceFInteractionPress(pressed.state, { type: 'release', ...sample(1_099, [door]) });
    expect(released.commit).toMatchObject({ pressId: 1, phase: 'tap', candidate: door });
    expect(released.state).toEqual({ phase: 'idle' });
  });

  it('commits support hold exactly once when the threshold is reached', () => {
    const drone = candidate('support-enter-drone', 'drone-a', 999);
    const pressed = reduceFInteractionPress(createFInteractionPressState(), {
      type: 'press', pressId: 2, ...sample(5_000, [drone]),
    });
    expect(fInteractionHoldProgress(pressed.state, 5_500)).toBe(0.5);
    const held = reduceFInteractionPress(pressed.state, {
      type: 'advance', ...sample(5_000 + F_INTERACTION_HOLD_MS, [drone]),
    });
    expect(held.commit).toMatchObject({ pressId: 2, phase: 'hold', candidate: drone });
    expect(reduceFInteractionPress(held.state, {
      type: 'advance', ...sample(6_100, [drone]),
    }).commit).toBeNull();
    const released = reduceFInteractionPress(held.state, {
      type: 'release', ...sample(6_200, [drone]),
    });
    expect(released).toMatchObject({ state: { phase: 'idle' }, commit: null });
  });

  it('pins separate tap and hold winners so a nearby door never overwrites support hold', () => {
    const door = candidate('shed-door', 'door-a', 0.4);
    const chopper = candidate('support-enter-chopper', 'chopper-a', 40);
    const candidates = [chopper, door];
    const pressed = reduceFInteractionPress(createFInteractionPressState(), {
      type: 'press', pressId: 3, ...sample(1_000, candidates),
    });
    expect(pressed.state).toMatchObject({
      phase: 'pressed',
      tapCandidate: { targetId: 'door-a' },
      holdCandidate: { targetId: 'chopper-a' },
    });
    expect(reduceFInteractionPress(pressed.state, {
      type: 'release', ...sample(1_700, candidates),
    }).commit).toMatchObject({ phase: 'tap', candidate: { targetId: 'door-a' } });
    expect(reduceFInteractionPress(pressed.state, {
      type: 'advance', ...sample(2_000, candidates),
    }).commit).toMatchObject({ phase: 'hold', candidate: { targetId: 'chopper-a' } });
  });

  it('never retargets a pinned press when a different candidate appears', () => {
    const crateA = candidate('care-package', 'crate-a');
    const crateB = candidate('care-package', 'crate-b', 0.1);
    const pressed = reduceFInteractionPress(createFInteractionPressState(), {
      type: 'press', pressId: 4, ...sample(1_000, [crateA]),
    });
    const invalidated = reduceFInteractionPress(pressed.state, {
      type: 'release', ...sample(1_100, [crateB]),
    });
    expect(invalidated).toMatchObject({ state: { phase: 'idle' }, commit: null, cancellation: 'target-invalid' });
  });

  it('cancels stale work on eligibility, epoch, life, range and LOS boundaries', () => {
    const drone = candidate('support-enter-drone', 'drone-a');
    const begin = () => reduceFInteractionPress(createFInteractionPressState(), {
      type: 'press' as const, pressId: 5, ...sample(1_000, [drone]),
    }).state;
    expect(reduceFInteractionPress(begin(), {
      type: 'advance', ...sample(1_200, [drone]), inputEligible: false,
    }).cancellation).toBe('input-ineligible');
    expect(reduceFInteractionPress(begin(), {
      type: 'advance', ...sample(1_200, [drone]), matchEpoch: 8,
    }).cancellation).toBe('epoch-change');
    expect(reduceFInteractionPress(begin(), {
      type: 'advance', ...sample(1_200, [drone]), lifeId: 4,
    }).cancellation).toBe('life-change');
    expect(reduceFInteractionPress(begin(), {
      type: 'advance', ...sample(1_200, [{ ...drone, enabled: false }]),
    }).cancellation).toBe('target-invalid');

    for (const reason of ['blur', 'pause', 'death', 'range-invalid', 'line-of-sight-invalid'] as const satisfies readonly FInteractionCancelReason[]) {
      expect(reduceFInteractionPress(begin(), { type: 'cancel', nowMs: 1_200, reason }))
        .toMatchObject({ state: { phase: 'idle' }, commit: null, cancellation: reason });
    }
  });
});
