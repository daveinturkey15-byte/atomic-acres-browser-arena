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

  it('verifies HF-323 lobby start hold, countdown admission, and active rejection invariants in legacy-main', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

    // 1. hostHasPendingGuestConnection checks in-flight admissions and network diagnostics
    expect(source).toContain('function hostHasPendingGuestConnection(): boolean');
    expect(source).toContain('hostLobbyAdmissionInFlight.size > 0 || pendingHostRecoveryJoins.size > 0');
    expect(source).toContain('Number(diag.guestConnections) > network.connectedPlayerIds().length');

    // 2. hostStartPrivateMatch refuses start on pending guest
    const startMatch = source.slice(source.indexOf('function hostStartPrivateMatch'), source.indexOf('function returnPrivateMatchToLobby'));
    expect(startMatch).toContain('const pendingGuest = hostHasPendingGuestConnection();');
    expect(startMatch).toContain('if (pendingGuest)');
    expect(startMatch).toContain('canHostCommitStart(candidate, pendingGuest)');
    expect(startMatch).toContain('canHostStart(current, pendingGuest)');

    // 3. admitLobbyJoin admits in countdown lead and rejects with match-active ONLY for phase active
    const admission = source.slice(source.indexOf('async function admitLobbyJoin'), source.indexOf('function updateHostReady'));
    expect(admission).toContain("if (currentPhase === 'active')");
    expect(admission).toContain("rejectLobbyPlayer(message.playerId, 'match-active'");
    expect(admission).not.toContain("if (currentPhase !== 'waiting') {\n        rejectLobbyPlayer(message.playerId, 'match-active'");
    expect(admission).toContain("type: 'lobby-start'");

    // 4. renderPrivateLobby renders PLAYER JOINING... and disables start button on pending guest
    const renderStart = source.indexOf('function renderPrivateLobby');
    const renderEnd = source.indexOf('renderHighScores();', renderStart);
    const renderLobby = source.slice(renderStart, renderEnd);
    expect(renderLobby).toContain('const pendingGuest = hostHasPendingGuestConnection();');
    expect(renderLobby).toContain('start.disabled = network.role !== \'host\' || !snapshot || !lobbyArenaSynchronized || !canHostCommitStart(snapshot, pendingGuest);');
    expect(renderLobby).toContain('PLAYER JOINING...');
  });
});

