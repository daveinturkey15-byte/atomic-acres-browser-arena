import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Gun Range test-bay match timer integration', () => {
  it('keeps HUD rendering free of client-local timer authorship', () => {
    const start = source.indexOf('function updateHud(now: number): void {');
    const end = source.indexOf('\n  const spec = WEAPONS[player.weapon];', start);
    const block = source.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain('if (gameStarted) updateMatchState(now);');
    expect(block).not.toContain('GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds');
    expect(block).not.toContain('matchState =');
  });

  it('computes host occupancy from admitted authority rows and publishes reliable transition revisions', () => {
    const start = source.indexOf('function updateGunRangeMatchClockAuthority');
    const end = source.indexOf('\nfunction hostSnapshot', start);
    const block = source.slice(start, end);
    expect(block).toContain("if (network.role === 'client') {");
    expect(block).toContain('projectActiveGunRangeMatchClock(nowLocalMonoMs);');
    expect(block).toContain('gunRangeTestBayOccupants(');
    expect(block).toContain('admittedGunRangeClockParticipants(),');
    expect(block).toContain('GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds,');
    expect(block).toContain('persistActiveHostMatchCheckpoint(true);');
    expect(block).toContain("broadcastHostLobby('active');");

    const participantStart = source.indexOf('function admittedGunRangeClockParticipants');
    const participantEnd = source.indexOf('\nfunction sampleAuthoritativeGunRangeMatchClock', participantStart);
    const participants = source.slice(participantStart, participantEnd);
    expect(participants).toContain('const hostMember = hostLobbyMembers.get(player.id);');
    expect(participants).toContain('const retained = retainedRemoteAuthorities.get(member.id)?.snapshot;');
    expect(participants).toContain('alive: health?.alive === true');
  });

  it('carries the revisioned clock in active lobby snapshots, host recovery, and authenticated rejoin', () => {
    const hostSnapshotStart = source.indexOf('function hostSnapshot(');
    const hostSnapshotEnd = source.indexOf('\nfunction broadcastHostLobby', hostSnapshotStart);
    const hostSnapshot = source.slice(hostSnapshotStart, hostSnapshotEnd);
    expect(hostSnapshot).toContain("const matchClock = phase === 'active'");
    expect(hostSnapshot).toContain('sampleAuthoritativeGunRangeMatchClock(snapshotHostTimeMs)');
    expect(hostSnapshot).toContain('matchClock,');

    const recoveryStart = source.indexOf('function initializeRecoveredHostLobby');
    const recoveryEnd = source.indexOf('\nfunction initializeHostLobby', recoveryStart);
    const recovery = source.slice(recoveryStart, recoveryEnd);
    expect(recovery.indexOf('gunRangeMatchClockState = timing.matchClock;'))
      .toBeLessThan(recovery.indexOf('privateLobbySnapshot = hostSnapshot(phase);'));

    const rejoinStart = source.indexOf('async function admitLobbyJoin');
    const rejoinEnd = source.indexOf('\nfunction acceptLobbyReady', rejoinStart);
    const rejoin = source.slice(rejoinStart, rejoinEnd);
    expect(rejoin).toContain('network.confirmPlayerAdmission(message.playerId');
    expect(rejoin).toContain('broadcastHostLobby(currentPhase);');

    const projectionStart = source.indexOf('function projectActiveGunRangeMatchClock');
    const projectionEnd = source.indexOf('\nfunction initializeGunRangeMatchClock', projectionStart);
    const projection = source.slice(projectionStart, projectionEnd);
    expect(projection).toContain("network.role === 'client'");
    expect(projection).toContain('hostTimeToGuestMono(');
    expect(projection).toContain('gunRangeMatchClockState.sampledAtHostTimeMs');
    expect(projection).toContain('privateLobbySnapshot?.snapshotHostTimeMs');

    const acceptanceStart = source.indexOf('function acceptLobbyState');
    const acceptanceEnd = source.indexOf('\nfunction acceptMessage', acceptanceStart);
    const acceptance = source.slice(acceptanceStart, acceptanceEnd);
    expect(acceptance.indexOf('gunRangeMatchClockState = message.snapshot.matchClock;'))
      .toBeLessThan(acceptance.indexOf('projectActiveGunRangeMatchClock(performance.now());'));

    const updateStart = source.indexOf('function updateMatchState(now: number): void {');
    const updateEnd = source.indexOf('\nfunction checkMatchEnd', updateStart);
    const update = source.slice(updateStart, updateEnd);
    expect(update).toContain('holdGunRangeReplicaAtAuthorityBoundary(');
    expect(update).toContain("network.role === 'client'");
    expect(update).toContain("privateLobbySnapshot?.config.arenaId === 'gun-range'");
    expect(update).toContain("privateLobbySnapshot.phase === 'active'");

    const heartbeatStart = source.indexOf('function scheduleStateBroadcast(): void {');
    const heartbeatEnd = source.indexOf('\nscheduleStateBroadcast();', heartbeatStart);
    const heartbeat = source.slice(heartbeatStart, heartbeatEnd);
    expect(heartbeat).toContain('const now = performance.now();');
    expect(heartbeat).toContain("if (gameStarted && network.role === 'host') {");
    expect(heartbeat).toContain('updateGunRangeMatchClockAuthority(now);');
    expect(heartbeat).toContain('updateTimedMapWeapons(now);');
    expect(heartbeat.indexOf('updateGunRangeMatchClockAuthority(now);'))
      .toBeLessThan(heartbeat.indexOf('network.send(createStateMessage())'));
    expect(heartbeat.match(/const now = performance\.now\(\);/g)).toHaveLength(1);
  });
});
