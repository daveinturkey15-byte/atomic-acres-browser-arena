import { describe, expect, it } from 'vitest';
import {
  hostLobbyAdmissionAttemptIsCurrent,
  type HostLobbyAdmissionAttempt,
} from './host-lobby-admission-generation';

const attempt: HostLobbyAdmissionAttempt = Object.freeze({
  generation: 7,
  playerId: 'guest-a',
  connectionEpoch: 'connection_epoch_007',
});

describe('host lobby asynchronous admission generation', () => {
  it('admits mutation only for the exact attempt in the current host session', () => {
    expect(hostLobbyAdmissionAttemptIsCurrent(attempt, {
      role: 'host', generation: 7, currentAttempt: attempt, queuedConnectionEpoch: undefined,
    })).toBe(true);
    expect(hostLobbyAdmissionAttemptIsCurrent(attempt, {
      role: 'host', generation: 8, currentAttempt: attempt, queuedConnectionEpoch: undefined,
    })).toBe(false);
    expect(hostLobbyAdmissionAttemptIsCurrent(attempt, {
      role: 'client', generation: 7, currentAttempt: attempt, queuedConnectionEpoch: undefined,
    })).toBe(false);
    expect(hostLobbyAdmissionAttemptIsCurrent(attempt, {
      role: 'host', generation: 7, currentAttempt: { ...attempt }, queuedConnectionEpoch: undefined,
    })).toBe(false);
  });

  it('invalidates an older await continuation as soon as a newer epoch is queued', () => {
    expect(hostLobbyAdmissionAttemptIsCurrent(attempt, {
      role: 'host', generation: 7, currentAttempt: attempt,
      queuedConnectionEpoch: 'connection_epoch_008',
    })).toBe(false);
    expect(hostLobbyAdmissionAttemptIsCurrent(attempt, {
      role: 'host', generation: 7, currentAttempt: attempt,
      queuedConnectionEpoch: attempt.connectionEpoch,
    })).toBe(true);
  });
});
