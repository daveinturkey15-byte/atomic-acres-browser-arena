import { describe, expect, it } from 'vitest';
import type { KillstreakDamageResultMessage } from './killstreak-protocol';
import {
  KILLSTREAK_DAMAGE_RESULT_REPLAY_CAPACITY,
  KillstreakDamageResultReplayLedger,
} from './killstreak-damage-result-admission';

function message(overrides: Partial<KillstreakDamageResultMessage> = {}): KillstreakDamageResultMessage {
  return {
    type: 'killstreak-damage-result',
    by: 'host',
    matchEpoch: 7,
    revision: 12,
    events: [{
      resultId: 'ks-result-7-1', activationId: 'ks-activation-7-1', source: 'chopper', ownerId: 'owner',
      targetId: 'target-a', targetLifeId: 3, targetPosition: [0, 1, -8], damage: 18,
      origin: [0, 8, 0], endpoint: [0, 1, -8], tracerOrigin: [0, 7, -1], atMs: 1_000,
    }],
    impacts: [{
      activationId: 'ks-activation-7-1', source: 'chopper', ordinal: 0, phase: 'impact',
      position: [0, 0, -8], launchPosition: [0, 8, 0], impactAtMs: 1_000, atMs: 1_000,
    }],
    nonce: 41,
    ...overrides,
  };
}

describe('killstreak damage-result replay admission', () => {
  it('rejects forged, stale-epoch, and exact nonce replays before presentation', () => {
    const ledger = new KillstreakDamageResultReplayLedger();
    const context = { expectedHostId: 'host', expectedMatchEpoch: 7 } as const;
    expect(ledger.admit(message({ by: 'guest' }), context).reason).toBe('forged-host');
    expect(ledger.admit(message({ matchEpoch: 8 }), context).reason).toBe('match-epoch-mismatch');
    expect(ledger.admit(message(), context)).toMatchObject({ accepted: true, events: [{ resultId: 'ks-result-7-1' }] });
    expect(ledger.admit(message(), context)).toEqual({
      accepted: false, reason: 'duplicate-nonce', events: [], impacts: [],
    });
  });

  it('filters repackaged result and impact replays without dropping distinct entries at the same revision', () => {
    const ledger = new KillstreakDamageResultReplayLedger();
    const context = { expectedHostId: 'host', expectedMatchEpoch: 7 } as const;
    ledger.admit(message(), context);
    const distinctEvent = {
      ...message().events[0]!, resultId: 'ks-result-7-2', targetId: 'target-b',
    };
    const distinctImpact = {
      ...message().impacts[0]!, ordinal: 1,
    };
    const admitted = ledger.admit(message({
      nonce: 42,
      events: [message().events[0]!, distinctEvent],
      impacts: [message().impacts[0]!, distinctImpact],
    }), context);
    expect(admitted).toMatchObject({ accepted: true, reason: 'accepted' });
    if (!admitted.accepted) throw new Error('expected distinct message admission');
    expect(admitted.events.map((event) => event.resultId)).toEqual(['ks-result-7-2']);
    expect(admitted.impacts.map((event) => event.ordinal)).toEqual([1]);
  });

  it('is bounded and resets at a match authority boundary', () => {
    const ledger = new KillstreakDamageResultReplayLedger();
    const context = { expectedHostId: 'host', expectedMatchEpoch: 7 } as const;
    for (let index = 0; index <= KILLSTREAK_DAMAGE_RESULT_REPLAY_CAPACITY; index += 1) {
      ledger.admit(message({ nonce: index, events: [], impacts: [] }), context);
    }
    expect(ledger.snapshot()).toMatchObject({
      nonces: KILLSTREAK_DAMAGE_RESULT_REPLAY_CAPACITY,
      bounded: true,
    });
    ledger.reset();
    expect(ledger.snapshot()).toEqual({ nonces: 0, resultIds: 0, impactKeys: 0, bounded: true });
  });
});
