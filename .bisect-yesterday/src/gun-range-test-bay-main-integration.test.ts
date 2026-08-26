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
    expect(block).toContain('gunRangeTestBayOccupancyBoundaryCount(previousOccupantIds, nextOccupantIds)');
    expect(block).toContain('boundaryEdgeCount,');
    expect(block).toContain('if (step.boundaryEdgeCount > 0');
    expect(block).toContain('const sampleTimeMs = Math.max(nowLocalMonoMs, gunRangeMatchClockState.sampledAtHostTimeMs);');
    expect(block).toContain('persistActiveHostMatchCheckpoint(true);');
    expect(block).toContain("broadcastHostLobby('active');");

    const participantStart = source.indexOf('function admittedGunRangeClockParticipants');
    const participantEnd = source.indexOf('\nfunction sampleAuthoritativeGunRangeMatchClock', participantStart);
    const participants = source.slice(participantStart, participantEnd);
    expect(participants).toContain('const hostMember = hostLobbyMembers.get(player.id);');
    expect(participants).toContain('const retained = retainedRemoteAuthorities.get(member.id)?.snapshot;');
    expect(participants).toContain('member.connected && remote !== undefined && !remote.awaitingReplacementState');
    expect(participants).toContain('alive: health?.alive === true');

    const sampleStart = source.indexOf('function sampleAuthoritativeGunRangeMatchClock');
    const sampleEnd = source.indexOf('\nfunction projectActiveGunRangeMatchClock', sampleStart);
    const sample = source.slice(sampleStart, sampleEnd);
    expect(sample).toContain('const sampleTimeMs = Math.max(nowHostTimeMs, gunRangeMatchClockState.sampledAtHostTimeMs);');
  });

  it('carries the revisioned clock in active lobby snapshots, host recovery, and authenticated rejoin', () => {
    const syncStart = source.indexOf('async function synchronizeLobbyArena');
    const syncEnd = source.indexOf('\nfunction matchAdmissionIdentity', syncStart);
    const sync = source.slice(syncStart, syncEnd);
    expect(sync).toContain('activateArenaSelection(arenaId, admissionToken !== undefined, admissionToken)');

    const hostSnapshotStart = source.indexOf('function hostSnapshot(');
    const hostSnapshotEnd = source.indexOf('\nfunction broadcastHostLobby', hostSnapshotStart);
    const hostSnapshot = source.slice(hostSnapshotStart, hostSnapshotEnd);
    expect(hostSnapshot).toContain("const matchClock = phase === 'active'");
    expect(hostSnapshot).toContain('gunRangeMatchClockState?.sampledAtHostTimeMs ?? 0');
    expect(hostSnapshot).toContain('gunRangeTestBayDoorState?.updatedAtMs ?? 0');
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
    expect(heartbeat).toContain('const doorState = updateGunRangeTestBayDoorAuthority(now);');
    expect(heartbeat).toContain('synchronizeGunRangeTestBayDoorWorld(doorState, false);');
    expect(heartbeat).toContain('flushGunRangeTestBayDoorBroadcast();');
    expect(heartbeat).toContain('updateGunRangeMatchClockAuthority(now);');
    expect(heartbeat).toContain('updateTimedMapWeapons(now);');
    expect(heartbeat.indexOf('updateGunRangeMatchClockAuthority(now);'))
      .toBeLessThan(heartbeat.indexOf('network.send(createStateMessage())'));
    expect(heartbeat.match(/const now = performance\.now\(\);/g)).toHaveLength(1);
  });

  it('applies hidden-heartbeat door motion to render, collision, and ballistic authority before replication', () => {
    const syncStart = source.indexOf('function synchronizeGunRangeTestBayDoorWorld');
    const syncEnd = source.indexOf('\nfunction sampleAuthoritativeGunRangeMatchClock', syncStart);
    const sync = source.slice(syncStart, syncEnd);
    expect(syncStart).toBeGreaterThanOrEqual(0);
    expect(sync).toContain('applyGunRangeTestBayDoorState(arena.root, doorState)');
    expect(sync).toContain('gunRangeTestBayDoorColliders = doorFrame.dynamicColliders;');
    expect(sync).toContain('gunRangeTestBayDoorBallisticSurfaces = doorFrame.dynamicBallisticSurfaces;');
    expect(sync).toContain('if (doorArenaChanged || doorFrame.collisionChanged) syncInteractiveWorldPhysics();');

    const updateStart = source.indexOf('function updateGunRangeTestBayDoorAuthority');
    const updateEnd = source.indexOf('\nfunction synchronizeGunRangeTestBayDoorWorld', updateStart);
    const update = source.slice(updateStart, updateEnd);
    expect(update).toContain('gunRangeTestBayDoorBroadcastPending = true;');
    expect(update).not.toContain("broadcastHostLobby('active');");

    const heartbeatStart = source.indexOf('function scheduleStateBroadcast(): void {');
    const heartbeatEnd = source.indexOf('\nscheduleStateBroadcast();', heartbeatStart);
    const heartbeat = source.slice(heartbeatStart, heartbeatEnd);
    const synchronized = heartbeat.indexOf('synchronizeGunRangeTestBayDoorWorld(doorState, false);');
    const flushed = heartbeat.indexOf('flushGunRangeTestBayDoorBroadcast();');
    const sent = heartbeat.indexOf('network.send(createStateMessage())');
    expect(synchronized).toBeLessThan(flushed);
    expect(flushed).toBeLessThan(sent);

    const broadcastStart = source.indexOf('function broadcastHostLobby');
    const broadcastEnd = source.indexOf('\nconst LAST_HOSTED_ROOM_KEY', broadcastStart);
    const broadcast = source.slice(broadcastStart, broadcastEnd);
    expect(broadcast).toContain('synchronizeGunRangeTestBayDoorWorld(');
    expect(broadcast.indexOf('synchronizeGunRangeTestBayDoorWorld('))
      .toBeLessThan(broadcast.indexOf('network.send(message);'));

    const frameStart = source.indexOf("} else if (selectedArena.id === 'gun-range') {");
    const frameEnd = source.indexOf('\n    waterSystem.update', frameStart);
    const frame = source.slice(frameStart, frameEnd);
    expect(frame).toContain('synchronizeGunRangeTestBayDoorWorld(doorState, true);');
    expect(frame).not.toContain('gunRangeTestBayDoorColliders = doorFrame.dynamicColliders;');
  });
});

describe('HF-347 Gun Range multiplayer: dummies are posed on host time', () => {
  // gunRangeTestBayRenderedDummyPose is a pure function of time with no replicated
  // phase input. A peer that feeds it its OWN performance.now() renders every dummy
  // somewhere the host does not think it is, so a guest aims at a dummy that has
  // already moved host-side. This pins the clock choice at the call site, because
  // there is no runtime assertion that can catch a silent revert to local time.
  const frameStart = source.indexOf("} else if (selectedArena.id === 'gun-range') {");
  const frame = source.slice(frameStart, source.indexOf('\n    waterSystem.update', frameStart));

  it('poses dummies from currentHostTimeMs, not the local visual clock', () => {
    expect(frameStart).toBeGreaterThanOrEqual(0);
    expect(frame).toContain('const dummyNow = debugCaptureFixedVisualTimeMs ?? currentHostTimeMs();');
    expect(frame).toContain('updateGunRangePresentation(arena.root, dummyNow);');
    expect(frame).not.toContain('updateGunRangePresentation(arena.root, visualNow);');
  });

  it('derives the dummy colliders from the same clock that posed them', () => {
    // HF-318 established that a collider on a different clock than the mesh lags the
    // visible position. Two clocks would reintroduce that, so pin them together.
    expect(frame).toContain('refreshGunRangeTestBayDummyColliders(dummyNow);');
    expect(frame).not.toContain('refreshGunRangeTestBayDummyColliders(visualNow);');
  });
});
