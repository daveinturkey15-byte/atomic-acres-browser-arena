import { describe, expect, it } from 'vitest';
import { MAX_LAG_COMPENSATION_MS, admitCombatTiming, createPeerTimingState, shouldRetainRemoteCombatAuthority, updatePeerTiming } from './network-fairness';

describe('bounded host fairness timing', () => {
  it('admits ordered modest-latency actions with capped rewind', () => {
    const synchronized = updatePeerTiming(createPeerTimingState(), { clockOffsetMs: 20, rttMs: 120 });
    const result = admitCombatTiming(synchronized, { eventSeq: 1, sentAtEpochMs: 1_000 }, 1_260);
    expect(result).toMatchObject({ accepted: true, reason: 'accepted', sampleAgeMs: 240 });
    expect(result.rewindMs).toBe(MAX_LAG_COMPENSATION_MS);
  });

  it('rejects duplicates, large gaps, stale actions, and future claims', () => {
    const base = { ...createPeerTimingState(), lastEventSeq: 10 };
    expect(admitCombatTiming(base, { eventSeq: 10, sentAtEpochMs: 1_000 }, 1_010).reason).toBe('duplicate');
    expect(admitCombatTiming(base, { eventSeq: 1_000, sentAtEpochMs: 1_000 }, 1_010).reason).toBe('sequence-gap');
    expect(admitCombatTiming(base, { eventSeq: 11, sentAtEpochMs: 1_000 }, 1_500).reason).toBe('stale');
    expect(admitCombatTiming(base, { eventSeq: 11, sentAtEpochMs: 1_200 }, 1_000).reason).toBe('future');
  });

  it('retains host combat authority only for an active lobby member rejoin window', () => {
    expect(shouldRetainRemoteCombatAuthority('host', 'active', true)).toBe(true);
    expect(shouldRetainRemoteCombatAuthority('host', 'waiting', true)).toBe(false);
    expect(shouldRetainRemoteCombatAuthority('host', 'active', false)).toBe(false);
    expect(shouldRetainRemoteCombatAuthority('client', 'active', true)).toBe(false);
  });
});
