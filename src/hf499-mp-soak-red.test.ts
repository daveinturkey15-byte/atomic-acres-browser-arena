import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

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
    const joinStart = main.indexOf("if (network.role === 'host' && message.type === 'join') {");
    const joinEnd = main.indexOf('\n    }', main.indexOf('sendGuestResumeRepairSent', joinStart));
    const join = main.slice(joinStart, joinEnd > joinStart ? joinEnd : joinStart + 2_000);
    expect(join).toContain("network.sendToPlayer(incoming.id, { type: 'join', player: snapshot() });");
    expect(join).toContain('network.sendToPlayer(incoming.id, createStateMessage());');
    expect(join).toContain('for (const candidate of remotes.values())');
    expect(join).toContain('sendAuthoritativeRemoteSnapshotToPlayer(incoming.id, candidate, repairNow);');
    expect(join).toContain("network.send({\n        type: 'join',");
  });

  it('re-arms the replacement world handshake for a voluntary active-match rejoin', () => {
    const join = main.slice(main.indexOf('function sendLobbyJoin(): void {'), main.indexOf('function sendClientWorldRepairReady('));
    const repair = main.slice(main.indexOf('function sendClientWorldRepairReady('), main.indexOf('function rejectLobbyPlayer('));
    expect(join).toContain('resumingVoluntaryActiveMatch');
    expect(join).toContain('resumingVoluntaryActiveMatch || gameStarted');
    expect(repair).toContain('const voluntaryRejoin =');
    expect(repair).toContain('awaitingAuthoritativeRejoinContinuity = true;');
    expect(repair).toContain('pendingClientReconnectWorldRepairConnectionEpoch = localConnectionEpoch;');
    expect(repair).toContain("pendingVoluntaryActiveMatchRejoinRoomCode = ''");
  });
});
