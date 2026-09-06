import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const soak = readFileSync(new URL('../scripts/qa/mp-soak-gate.mjs', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../scripts/qa/mp-audit.mjs', import.meta.url), 'utf8');

describe('HF-499 active-match rejoin authority', () => {
  it('retains a voluntary active-match reservation instead of deleting its credential', () => {
    const leaveStart = main.indexOf("if (message.type === 'leave' && privateLobbySnapshot) {");
    const leaveEnd = main.indexOf('\n  return false;', leaveStart);
    const leave = main.slice(leaveStart, leaveEnd);
    expect(leave).toContain('const hostMatchIsActive =');
    expect(leave).toContain('const retainActiveMatchRejoin =');
    expect(leave).toContain('!message.voluntary || retainActiveMatchRejoin');
    expect(leave).toContain('if (message.voluntary && !retainActiveMatchRejoin)');
  });

  it('directly repairs the rejoiner and broadcasts its fresh slot to observers', () => {
    expect(main).toContain('function sendAuthoritativeRemoteSnapshotToPlayer(');
    expect(main).toContain('function broadcastFreshRejoinerSlotToObservers(');
    const joinStart = main.indexOf("if (network.role === 'host' && message.type === 'join') {");
    const joinEnd = main.indexOf('\n    }', main.indexOf('sendGuestResumeRepairSent', joinStart));
    const join = main.slice(joinStart, joinEnd > joinStart ? joinEnd : joinStart + 2_000);
    expect(join).toContain('const connectionEpoch = hostLobbyConnectionEpochs.get(incoming.id);');
    expect(join).toContain('sendAuthoritativeRemoteSnapshotToPlayer(incoming.id, remote, repairNow);');
    expect(join).toContain('broadcastFreshRejoinerSlotToObservers(incoming.id, connectionEpoch, remote, repairNow);');
    expect(join).toContain('for (const candidate of remotes.values())');
    expect(join).toContain('sendAuthoritativeRemoteSnapshotToPlayer(incoming.id, candidate, repairNow);');
    expect(main).toContain('sessionBoundCreditKey(playerId, epoch)');
    expect(main).toContain('verifiedRemoteKills.set(creditKey,');
  });

  it('re-arms the replacement world handshake for a voluntary active-match rejoin', () => {
    const leave = main.slice(main.indexOf('function returnToMainMenu(): void {'), main.indexOf('function resumeActiveMatchFromMenu('));
    const join = main.slice(main.indexOf('function sendLobbyJoin(): void {'), main.indexOf('function sendClientWorldRepairReady('));
    const repair = main.slice(main.indexOf('function sendClientWorldRepairReady('), main.indexOf('function rejectLobbyPlayer('));
    expect(leave).toContain('pendingVoluntaryActiveMatchRejoinRoomCode = network.role ===');
    expect(leave).toContain('privateMatchActiveAtEpochMs !== null');
    expect(leave).toContain('saveActiveRoomIdentity(network.roomCode)');
    expect(join).toContain('resumingVoluntaryActiveMatch');
    expect(join).toContain('resumingVoluntaryActiveMatch || gameStarted');
    expect(repair).toContain('const voluntaryRejoin =');
    expect(repair).toContain('awaitingAuthoritativeRejoinContinuity = true;');
    expect(repair).toContain('pendingClientReconnectWorldRepairConnectionEpoch = localConnectionEpoch;');
    expect(repair).toContain("pendingVoluntaryActiveMatchRejoinRoomCode = ''");
  });
});

describe('HF-499 replication evidence', () => {
  it('records rejoin damage from the post-mutation host baseline and broadcasts the canonical remote state', () => {
    const damageHook = main.slice(main.indexOf('damageRemoteAuthoritatively: (amount: number, playerId) => {'), main.indexOf('\n  earnSupport:', main.indexOf('damageRemoteAuthoritatively: (amount: number, playerId) => {')));
    expect(damageHook).toContain('createCanonicalRemoteState(remote.snapshot');
    // HF-535, ADDED not replaced: the canonical re-broadcast above re-uses the
    // last sequence the host admitted from the victim, so a third observer that
    // already applied that sequence rejects it and learns the new hp only from
    // the victim's next self-authored packet - the measured firstSeenMs.guestA
    // === null conjunct. The health authority carries the same fact on its own
    // monotonic revision, admissible immediately. Both calls must be here.
    expect(damageHook).toContain('publishRemoteHealthAuthority(targetId);');
    expect(soak).toContain('firstSeen.host = 0;');
    expect(soak).toContain('applied?.storedAfter');
  });

  it('compares host authority with each guest presentation and records the required forensic fields', () => {
    expect(soak).toContain("const hostPlayers = views.host?.players ?? {};");
    expect(soak).toContain("source: 'host-authoritative'");
    expect(soak).toContain('hostAuthoritativePosition');
    expect(soak).toContain('guestViewPosition');
    expect(soak).toContain('guestSnapshotAgeMs');
    expect(soak).toContain('classificationCounts');
    expect(soak).toContain("bundle.replication.pairDirections[`host->${to}`] = true;");
    expect(soak).toContain("bundle.replication.pairDirections[`${from}->${to}`] = true;");
    expect(main).toContain('if (network.role === \'client\') network.sendStateCommitReliably(teleportState);');
  });

  it('keeps rendered and last-authoritative remote positions distinct', () => {
    expect(audit).toContain('position: renderedPosition');
    expect(audit).toContain('visualPosition: (remote.visualPosition ?? remote.position ?? []).map(round)');
    expect(audit).toContain('const authoritativePosition = (remote.authoritativePosition ?? remote.position ?? []).map(round)');
    expect(audit).toContain('authoritativePosition,');
    expect(audit).toContain('snapshotAgeMs: round(remote.snapshotAgeMs)');
    expect(audit).toContain('snapshotBuffer: remote.snapshotBuffer ?? null');
  });

  it('applies continuity before the remote sequence fence and reconciles guest prediction to host authority', () => {
    expect(main).toContain('admitRemoteSnapshot(');
    expect(main).toContain('continuity: message.type === \'state\' ? message.continuity : remote.continuity');
    expect(main).toContain('reconcileLocalAuthoritativeSnapshot({');
    expect(main).toContain("reconciliation.correction === 'snap'");
    expect(main).toContain('lastAcknowledgedLocalInputSeq = incoming.seq;');
  });
});
