import { describe, expect, it } from 'vitest';
import {
  admitRemoteSupportActivation,
  admitRemoteSupportHit,
  createRemoteSupportAuthorityState,
  recordRemoteSupportDeath,
  recordRemoteSupportElimination,
} from './remote-support-authority';

function earn(count: number) {
  let state = createRemoteSupportAuthorityState();
  for (let index = 0; index < count; index += 1) state = recordRemoteSupportElimination(state);
  return state;
}

describe('remote support authority', () => {
  it('rejects forged activation before the verified elimination threshold', () => {
    const result = admitRemoteSupportActivation(createRemoteSupportAuthorityState(), {
      type: 'support-activate', by: 'guest', source: 'nuke', activationNonce: 7, effectOrigins: [], targetIds: [], nonce: 8,
    }, 1_000);
    expect(result.accepted).toBe(false);
  });

  it('admits one earned activation and consumes its availability', () => {
    const state = earn(15);
    const message = { type: 'support-activate' as const, by: 'guest', source: 'nuke' as const, activationNonce: 7, effectOrigins: [], targetIds: [], nonce: 8 };
    const first = admitRemoteSupportActivation(state, message, 1_000);
    expect(first.accepted).toBe(true);
    expect(admitRemoteSupportActivation(first.state, { ...message, activationNonce: 9 }, 1_001).accepted).toBe(false);
  });

  it('requires the matching activation nonce and rejects duplicate target damage', () => {
    const activation = admitRemoteSupportActivation(earn(7), {
      type: 'support-activate', by: 'guest', source: 'tri-pass', activationNonce: 17, effectOrigins: [[0, 0, 2], [1, 0, 2], [2, 0, 2]], targetIds: [], nonce: 18,
    }, 1_000);
    const forged = admitRemoteSupportHit(activation.state, {
      source: 'tri-pass', activationNonce: 99, origin: [1, 0, 2], target: 'victim', now: 1_500,
    });
    expect(forged.accepted).toBe(false);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'tri-pass', activationNonce: 17, origin: [9, 0, 9], target: 'victim', now: 1_500,
    }).accepted).toBe(false);
    const first = admitRemoteSupportHit(activation.state, {
      source: 'tri-pass', activationNonce: 17, origin: [1, 0, 2], target: 'victim', now: 1_500,
    });
    expect(first.accepted).toBe(true);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'tri-pass', activationNonce: 17, origin: [1, 0, 2], target: 'early', now: 1_499,
    }).accepted).toBe(false);
    expect(admitRemoteSupportHit(first.state, {
      source: 'tri-pass', activationNonce: 17, origin: [1, 0, 2], target: 'victim', now: 1_501,
    }).accepted).toBe(false);
  });

  it('enforces source-specific blast quotas and expiry', () => {
    const activation = admitRemoteSupportActivation(earn(7), {
      type: 'support-activate', by: 'guest', source: 'tri-pass', activationNonce: 17, effectOrigins: [[0, 0, 2], [1, 0, 2], [2, 0, 2]], targetIds: [], nonce: 18,
    }, 1_000);
    let state = activation.state;
    for (let index = 0; index < 3; index += 1) {
      const result = admitRemoteSupportHit(state, {
        source: 'tri-pass', activationNonce: 17, origin: [index, 0, 2], target: 'victim', now: 1_500,
      });
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(admitRemoteSupportHit(state, {
      source: 'tri-pass', activationNonce: 17, origin: [4, 0, 2], target: 'victim', now: 1_500,
    }).accepted).toBe(false);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'tri-pass', activationNonce: 17, origin: [1, 0, 2], target: 'late', now: 31_001,
    }).accepted).toBe(false);
  });

  it('clears unused high-tier authority and active authorizations on death', () => {
    const activation = admitRemoteSupportActivation(earn(15), {
      type: 'support-activate', by: 'guest', source: 'nuke', activationNonce: 7, effectOrigins: [], targetIds: [], nonce: 8,
    }, 1_000);
    const dead = recordRemoteSupportDeath(activation.state);
    expect(admitRemoteSupportHit(dead, {
      source: 'nuke', activationNonce: 7, origin: [0, 1.5, 0], target: 'victim', now: 1_500,
    }).accepted).toBe(false);
  });

  it('binds target-seeking support damage to targets declared at activation', () => {
    const activation = admitRemoteSupportActivation(earn(5), {
      type: 'support-activate', by: 'guest', source: 'yardhawk', activationNonce: 5,
      effectOrigins: [], targetIds: ['victim'], nonce: 6,
    }, 1_000);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'yardhawk', activationNonce: 5, origin: [1, 1, 1], target: 'other', now: 1_400,
    }).accepted).toBe(false);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'yardhawk', activationNonce: 5, origin: [1, 1, 1], target: 'victim', now: 1_400,
    }).accepted).toBe(true);
  });

  it('requires the authored nuke delay and fixed world origin', () => {
    const activation = admitRemoteSupportActivation(earn(15), {
      type: 'support-activate', by: 'guest', source: 'nuke', activationNonce: 7, effectOrigins: [], targetIds: [], nonce: 8,
    }, 1_000);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'nuke', activationNonce: 7, origin: [0, 1.5, 0], target: 'victim', now: 5_499,
    }).accepted).toBe(false);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'nuke', activationNonce: 7, origin: [4, 1.5, 0], target: 'victim', now: 5_500,
    }).accepted).toBe(false);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'nuke', activationNonce: 7, origin: [0, 1.5, 0], target: 'victim', now: 5_500,
    }).accepted).toBe(true);
  });
});
