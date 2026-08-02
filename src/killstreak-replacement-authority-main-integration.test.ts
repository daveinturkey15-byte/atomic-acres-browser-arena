import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function functionBody(name: string, nextName: string): string {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authenticated replacement authority integration', () => {
  it('resets only transient sender domains when an authenticated connection epoch changes', () => {
    const reset = functionBody('resetAuthenticatedGuestReplacement', 'admitLobbyJoin');
    expect(reset).toContain('remote.interpolation.clear()');
    expect(reset).toContain('remote.positionHistory.length = 0');
    expect(reset).toContain('remote.awaitingReplacementState = true');
    expect(reset).toContain('killstreakRuntime.actorLifeId(playerId)');
    expect(reset).toContain("hostTriggerAuthorities.reset(playerId, 'connection-epoch')");
    expect(reset).toContain('killstreakRuntime.recordActorDisconnect(playerId)');
    expect(reset).not.toContain('hostLobbyMembers.delete');
    expect(reset).not.toContain('remoteHealthAuthorities.delete');

    const admission = functionBody('admitLobbyJoin', 'updateHostReady');
    expect(admission).toContain('priorConnectionEpoch !== message.connectionEpoch');
    expect(admission).toContain('resetAuthenticatedGuestReplacement(message.playerId)');
  });

  it('admits a replacement sequence restart but pins registered actor life to host authority', () => {
    expect(source).toContain('incoming.seq > remote.snapshot.seq || replacementState');
    expect(source).toContain('replacementState && replacementLifeId === null');
    expect(source).toContain('registeredActorLifeId !== null');
    expect(source).toContain('? registeredActorLifeId');
    expect(source).toContain('remote.awaitingReplacementState = false');
  });

  it('adopts and persists life only from an admitted recipient-specific host snapshot', () => {
    const stateStart = source.indexOf("if (message.type === 'killstreak-state') {");
    const stateEnd = source.indexOf("if (message.type === 'killstreak-damage-result')", stateStart);
    const state = source.slice(stateStart, stateEnd);
    expect(state).toContain('admitKillstreakStateMessage(message, {');
    expect(state.indexOf('if (!admission.accepted) return;')).toBeLessThan(state.indexOf('localHostConfirmedContinuity = actor.lifeId;'));
    expect(state).toContain('if (awaitingAuthoritativeRejoinContinuity)');
    expect(state).toContain('localContinuity = actor.lifeId;');
    expect(state).toContain('saveActiveRoomIdentity(network.roomCode)');
  });

  it('checkpoints replay identity and charge consumption before post-admission work', () => {
    const remoteActivationStart = source.indexOf("if (message.type === 'killstreak-activate-intent') {");
    const remoteActivationEnd = source.indexOf("if (message.type === 'killstreak-control-intent')", remoteActivationStart);
    const remoteActivation = source.slice(remoteActivationStart, remoteActivationEnd);
    expect(remoteActivation.indexOf('persistActiveHostMatchCheckpoint();'))
      .toBeGreaterThan(remoteActivation.indexOf('if (admission.accepted) {'));
    expect(remoteActivation.indexOf('persistActiveHostMatchCheckpoint();'))
      .toBeLessThan(remoteActivation.indexOf('broadcastKillstreakState();'));

    const localActivation = functionBody('requestKillstreakActivation', 'requestKillstreakControl');
    expect(localActivation.indexOf('persistActiveHostMatchCheckpoint();'))
      .toBeGreaterThan(localActivation.indexOf('if (!admission.accepted)'));
    expect(localActivation.indexOf('persistActiveHostMatchCheckpoint();'))
      .toBeLessThan(localActivation.indexOf('broadcastKillstreakState(now);'));
  });
});
