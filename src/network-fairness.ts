export const MAX_COMBAT_EVENT_AGE_MS = 350;
export const MAX_COMBAT_EVENT_FUTURE_MS = 80;
export const MAX_COMBAT_SEQUENCE_GAP = 512;
export const MAX_LAG_COMPENSATION_MS = 180;

export type CombatTiming = Readonly<{ eventSeq: number; sentAtEpochMs: number }>;
export type PeerTimingState = Readonly<{ lastEventSeq: number; clockOffsetMs: number; rttMs: number; jitterMs: number }>;
export type CombatTimingAdmission = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'duplicate' | 'sequence-gap' | 'stale' | 'future' | 'invalid';
  sampleAgeMs: number;
  rewindMs: number;
  state: PeerTimingState;
}>;

export function createPeerTimingState(): PeerTimingState {
  return { lastEventSeq: -1, clockOffsetMs: 0, rttMs: 0, jitterMs: 0 };
}

export function admitCombatTiming(state: PeerTimingState, timing: CombatTiming, receivedAtEpochMs: number): CombatTimingAdmission {
  if (!Number.isSafeInteger(timing.eventSeq) || timing.eventSeq < 0
    || !Number.isFinite(timing.sentAtEpochMs) || !Number.isFinite(receivedAtEpochMs)) {
    return { accepted: false, reason: 'invalid', sampleAgeMs: 0, rewindMs: 0, state };
  }
  if (timing.eventSeq <= state.lastEventSeq) {
    return { accepted: false, reason: 'duplicate', sampleAgeMs: 0, rewindMs: 0, state };
  }
  if (state.lastEventSeq >= 0 && timing.eventSeq - state.lastEventSeq > MAX_COMBAT_SEQUENCE_GAP) {
    return { accepted: false, reason: 'sequence-gap', sampleAgeMs: 0, rewindMs: 0, state };
  }
  const estimatedHostSentAt = timing.sentAtEpochMs + state.clockOffsetMs;
  const sampleAgeMs = receivedAtEpochMs - estimatedHostSentAt;
  if (sampleAgeMs > MAX_COMBAT_EVENT_AGE_MS) {
    return { accepted: false, reason: 'stale', sampleAgeMs, rewindMs: 0, state };
  }
  if (sampleAgeMs < -MAX_COMBAT_EVENT_FUTURE_MS) {
    return { accepted: false, reason: 'future', sampleAgeMs, rewindMs: 0, state };
  }
  return {
    accepted: true,
    reason: 'accepted',
    sampleAgeMs,
    rewindMs: Math.min(MAX_LAG_COMPENSATION_MS, Math.max(0, sampleAgeMs - state.rttMs / 2)),
    state: { ...state, lastEventSeq: timing.eventSeq },
  };
}

export function updatePeerTiming(state: PeerTimingState, sample: Readonly<{ clockOffsetMs: number; rttMs: number }>): PeerTimingState {
  if (!Number.isFinite(sample.clockOffsetMs) || !Number.isFinite(sample.rttMs) || sample.rttMs < 0 || sample.rttMs > 5_000) return state;
  const nextRtt = state.rttMs === 0 ? sample.rttMs : state.rttMs * 0.75 + sample.rttMs * 0.25;
  const deviation = Math.abs(sample.rttMs - nextRtt);
  return {
    ...state,
    clockOffsetMs: state.rttMs === 0 ? sample.clockOffsetMs : state.clockOffsetMs * 0.75 + sample.clockOffsetMs * 0.25,
    rttMs: nextRtt,
    jitterMs: state.rttMs === 0 ? 0 : state.jitterMs * 0.75 + deviation * 0.25,
  };
}

export function shouldRetainRemoteCombatAuthority(
  role: 'offline' | 'host' | 'client',
  phase: 'waiting' | 'countdown' | 'active' | 'ended' | null,
  hasLobbyMember: boolean,
): boolean {
  return role === 'host' && phase === 'active' && hasLobbyMember;
}
