import { describe, expect, it } from 'vitest';
import {
  HostTriggerAuthorityRegistry,
  admitHostTriggerState,
  type HostTriggerAdmissionContext,
} from './host-trigger-authority';
import { MULTIPLAYER_PROTOCOL_VERSION, type PlayerSnapshot, type TriggerStateMessage } from './protocol';

const sender: PlayerSnapshot = {
  id: 'guest', name: 'Guest', team: 1, x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0,
  hp: 100, kills: 0, deaths: 0, primary: 'minigun', secondary: 'pistol', grenade: 'frag',
  weapon: 'minigun', seq: 10,
};

const context = (overrides: Partial<HostTriggerAdmissionContext> = {}): HostTriggerAdmissionContext => ({
  expectedConnectionEpoch: 'connection-1',
  expectedLifeId: 4,
  shooterAlive: true,
  ...overrides,
});

const edge = (actionSequence: number, pressed: boolean, overrides: Partial<TriggerStateMessage> = {}): TriggerStateMessage => ({
  type: 'trigger-state',
  protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
  by: 'guest',
  connectionEpoch: 'connection-1',
  lifeId: 4,
  actionSequence,
  weapon: 'minigun',
  pressed,
  nonce: actionSequence + 10,
  ...overrides,
});

describe('host-receipt trigger authority', () => {
  it('timestamps a press only when the host receives the admitted edge', () => {
    const pressed = admitHostTriggerState(edge(0, true), sender, 1_250, undefined, context());
    expect(pressed).toMatchObject({ accepted: true, reason: 'accepted' });
    expect(pressed.state).toMatchObject({ pressed: true, pressedAtHostTimeMs: 1_250 });

    const repeated = admitHostTriggerState(edge(1, true), sender, 9_999, pressed.state, context());
    expect(repeated).toMatchObject({ accepted: false, reason: 'duplicate-edge' });
    expect(repeated.state?.pressedAtHostTimeMs).toBe(1_250);
  });

  it('rejects replayed, wrong-life, wrong-connection, dead, and wrong-weapon edges', () => {
    const first = admitHostTriggerState(edge(5, true), sender, 1_000, undefined, context());
    expect(admitHostTriggerState(edge(5, false), sender, 1_100, first.state, context()).reason).toBe('duplicate-sequence');
    expect(admitHostTriggerState(edge(6, false, { lifeId: 3 }), sender, 1_100, first.state, context()).reason).toBe('life-mismatch');
    expect(admitHostTriggerState(edge(6, false, { connectionEpoch: 'connection-2' }), sender, 1_100, first.state, context()).reason)
      .toBe('connection-epoch-mismatch');
    expect(admitHostTriggerState(edge(6, false), sender, 1_100, first.state, context({ shooterAlive: false })).reason)
      .toBe('shooter-dead');
    expect(admitHostTriggerState(edge(6, false, { weapon: 'm4a1' }), sender, 1_100, first.state, context()).reason)
      .toBe('weapon-mismatch');
  });

  it('clears the hold on release and every authoritative lifecycle reset', () => {
    const registry = new HostTriggerAuthorityRegistry();
    expect(registry.admit(edge(0, true), sender, 1_000, context()).accepted).toBe(true);
    expect(registry.admit(edge(1, false), sender, 1_100, context()).state).toMatchObject({ pressed: false, pressedAtHostTimeMs: null });

    for (const reason of ['death', 'disconnect', 'respawn', 'connection-epoch'] as const) {
      expect(registry.admit(edge(2, true), sender, 1_200, context()).accepted).toBe(true);
      expect(registry.reset('guest', reason)).toBe(true);
      expect(registry.stateFor('guest')).toBeUndefined();
    }

    expect(registry.admit(edge(0, true), sender, 1_500, context()).accepted).toBe(true);
    expect(registry.resetIfWeaponChanged('guest', 'm4a1')).toBe(true);
    expect(registry.stateFor('guest')).toBeUndefined();
    registry.clear('match-reset');
  });
});
