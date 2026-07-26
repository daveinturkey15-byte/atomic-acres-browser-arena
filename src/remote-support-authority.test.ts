import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import { HostKillstreakRuntime, type KillstreakAdmission } from './killstreak-runtime';
import type { OffensiveSupportSource, SupportActivateMessage } from './protocol';
import {
  admitRemoteSupportActivation,
  admitRemoteSupportHit,
  createRemoteSupportAuthorityState,
  recordRemoteSupportDeath,
  registerRemoteSupportActivation,
  type RemoteSupportAuthorityState,
} from './remote-support-authority';

const world = {
  bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20, floorY: 0, ceilingY: 20 },
  targets: [
    { id: 'guest', kind: 'player' as const, team: 0 as const, lifeId: 1, alive: true, position: [0, 1.7, 0] as const },
    { id: 'victim', kind: 'player' as const, team: 1 as const, lifeId: 1, alive: true, position: [0, 1.7, 8] as const },
  ],
};

function message(
  source: OffensiveSupportSource,
  activationRequestId = `activation-${source}-1`,
  overrides: Partial<SupportActivateMessage> = {},
): SupportActivateMessage {
  const shapes: Record<OffensiveSupportSource, Pick<SupportActivateMessage, 'effectOrigins' | 'targetIds'>> = {
    yardhawk: { effectOrigins: [], targetIds: ['victim'] },
    'tri-pass': { effectOrigins: [[0, 0, 2], [1, 0, 2], [2, 0, 2]], targetIds: [] },
    'hunter-swarm': { effectOrigins: [], targetIds: ['victim'] },
    nuke: { effectOrigins: [], targetIds: [] },
  };
  return {
    type: 'support-activate', by: 'guest', source, activationRequestId,
    activationNonce: 7, ...shapes[source], nonce: 8, ...overrides,
  };
}

function register(
  state: RemoteSupportAuthorityState,
  source: OffensiveSupportSource,
  activationRequestId = `activation-${source}-1`,
  canonicalActivationId = 'ks-activation-7-1',
  now = 900,
): RemoteSupportAuthorityState {
  return registerRemoteSupportActivation(state, {
    source, activationRequestId, canonicalActivationId, now,
  });
}

function activate(
  source: OffensiveSupportSource,
  now = 1_000,
  state = register(createRemoteSupportAuthorityState(), source),
) {
  return admitRemoteSupportActivation(state, message(source), now);
}

describe('remote support authority', () => {
  it('rejects every compatibility activation without a host-runtime proof', () => {
    for (const source of ['yardhawk', 'tri-pass', 'hunter-swarm', 'nuke'] as const) {
      expect(admitRemoteSupportActivation(createRemoteSupportAuthorityState(), message(source), 1_000).accepted).toBe(false);
    }
  });

  it('links a custom Hunter Swarm loadout to the exact host-generated activation and consumes proof once', () => {
    const loadout = parseKillstreakLoadout({
      schemaVersion: 1,
      slots: ['adrenaline', 'piloted-drone', 'hunter-swarm', 'chopper', 'drone-swarm'],
    });
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('guest', 0, 1, loadout);
    for (let index = 0; index < 8; index += 1) runtime.recordEligibleElimination('guest', 'weapon');
    const activationRequestId = 'activation-custom-hunter-1';
    const admission: KillstreakAdmission = runtime.activate({
      by: 'guest', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 3,
      activationId: activationRequestId, expectedId: 'hunter-swarm',
    }, 900, world);
    expect(admission).toMatchObject({
      accepted: true, activationId: 'ks-activation-7-1', activatedId: 'hunter-swarm',
    });
    const registered = register(
      createRemoteSupportAuthorityState(),
      'hunter-swarm',
      activationRequestId,
      admission.activationId!,
      900,
    );
    const activationMessage = message('hunter-swarm', activationRequestId);
    const first = admitRemoteSupportActivation(registered, activationMessage, 1_000);
    expect(first.accepted).toBe(true);
    expect(first.state.authorizations['hunter-swarm']?.canonicalActivationId).toBe(admission.activationId);
    expect(admitRemoteSupportActivation(first.state, { ...activationMessage, activationNonce: 9 }, 1_001).accepted).toBe(false);
  });

  it('cannot turn a Hunter proof into a forged default Tri-Pass or Nuke', () => {
    const state = register(createRemoteSupportAuthorityState(), 'hunter-swarm', 'activation-custom-hunter-1');
    expect(admitRemoteSupportActivation(state, message('tri-pass', 'activation-custom-hunter-1'), 1_000).accepted).toBe(false);
    expect(admitRemoteSupportActivation(state, message('nuke', 'activation-custom-hunter-1'), 1_000).accepted).toBe(false);
  });

  it('expires unconfirmed activation proof and preserves a confirmed effect across owner death', () => {
    const expired = register(createRemoteSupportAuthorityState(), 'nuke', 'activation-nuke-expired', 'ks-activation-7-2', 0);
    expect(admitRemoteSupportActivation(expired, message('nuke', 'activation-nuke-expired'), 5_001).accepted).toBe(false);
    const admitted = activate('nuke');
    const dead = recordRemoteSupportDeath(admitted.state);
    expect(Object.keys(dead.pending)).toHaveLength(0);
    expect(admitRemoteSupportHit(dead, {
      source: 'nuke', activationNonce: 7, origin: [0, 1.5, 0], target: 'victim', now: 5_500,
    }).accepted).toBe(true);
  });

  it('requires the matching nonce and admitted Tri-Pass origins, then rejects duplicate damage', () => {
    const activation = activate('tri-pass');
    expect(admitRemoteSupportHit(activation.state, {
      source: 'tri-pass', activationNonce: 99, origin: [1, 0, 2], target: 'victim', now: 1_500,
    }).accepted).toBe(false);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'tri-pass', activationNonce: 7, origin: [9, 0, 9], target: 'victim', now: 1_500,
    }).accepted).toBe(false);
    const first = admitRemoteSupportHit(activation.state, {
      source: 'tri-pass', activationNonce: 7, origin: [1, 0, 2], target: 'victim', now: 1_500,
    });
    expect(first.accepted).toBe(true);
    expect(admitRemoteSupportHit(first.state, {
      source: 'tri-pass', activationNonce: 7, origin: [1, 0, 2], target: 'victim', now: 1_501,
    }).accepted).toBe(false);
  });

  it('enforces source-specific blast quotas and expiry', () => {
    const activation = activate('tri-pass');
    let state = activation.state;
    for (let index = 0; index < 3; index += 1) {
      const result = admitRemoteSupportHit(state, {
        source: 'tri-pass', activationNonce: 7, origin: [index, 0, 2], target: 'victim', now: 1_500,
      });
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(admitRemoteSupportHit(state, {
      source: 'tri-pass', activationNonce: 7, origin: [4, 0, 2], target: 'victim', now: 1_500,
    }).accepted).toBe(false);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'tri-pass', activationNonce: 7, origin: [1, 0, 2], target: 'late', now: 31_001,
    }).accepted).toBe(false);
  });

  it('binds target-seeking support damage to the targets declared at activation', () => {
    const activation = activate('yardhawk');
    expect(admitRemoteSupportHit(activation.state, {
      source: 'yardhawk', activationNonce: 7, origin: [1, 1, 1], target: 'other', now: 1_400,
    }).accepted).toBe(false);
    expect(admitRemoteSupportHit(activation.state, {
      source: 'yardhawk', activationNonce: 7, origin: [1, 1, 1], target: 'victim', now: 1_400,
    }).accepted).toBe(true);
  });

  it('requires the authored nuke delay and fixed world origin', () => {
    const activation = activate('nuke');
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
