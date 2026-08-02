import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function slice(start: string, end: string, from = 0): string {
  const startIndex = source.indexOf(start, from);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('legacy match admission integration', () => {
  it('captures every authoritative identity field and fences awaited arena work', () => {
    const identity = slice('function matchAdmissionIdentity(', 'function observedMatchAdmissionIdentity(');
    const arena = slice('async function performArenaSelection(', 'function activateArenaSelection(');
    for (const field of [
      'mode,',
      'role: network.role,',
      'arenaId:',
      'roomCode: network.roomCode,',
      'connectionEpoch: localConnectionEpoch,',
      'lobbyRevision:',
      'lobbyPhase:',
      'activeAtHostTimeMs,',
      'activeAtEpochMs,',
    ]) expect(identity).toContain(field);

    expect(arena).toContain('admissionToken?: MatchAdmissionToken');
    expect(arena).toContain('if (admissionToken) assertMatchAdmissionCurrent(admissionToken);');
    expect(arena).toContain('await waitForVisibleBrowserPreparation(admissionToken.signal);');
    expect(arena).toContain('assertAdmission();\n    profileArenaTransition(\'authority-commit\');');
    expect(arena).toContain('assertAdmission();\n    profileArenaTransition(\'commit-bookkeeping\');');
  });

  it('publishes host countdown only after token creation and rolls failure back with a newer waiting revision', () => {
    const hostStart = slice('function hostStartPrivateMatch()', 'function returnPrivateMatchToLobby(');
    const rollback = slice('function returnPrivateMatchToLobby(', 'function acceptLobbyState(');
    const beginIndex = hostStart.indexOf("const admission = beginPrivateMatch(\n    'host'");
    const stateSendIndex = hostStart.indexOf("network.send({ type: 'lobby-state'");
    const startSendIndex = hostStart.indexOf("type: 'lobby-start'");

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(stateSendIndex).toBeGreaterThan(beginIndex);
    expect(startSendIndex).toBeGreaterThan(stateSendIndex);
    expect(hostStart.match(/assertMatchAdmissionCurrent\(admissionToken\)/g)).toHaveLength(2);
    expect(rollback.indexOf("broadcastHostLobby('waiting');"))
      .toBeLessThan(rollback.indexOf("matchAdmissionCoordinator.invalidate('Host returned"));
  });

  it('coalesces telemetry-only revisions but cancels changed lobby authority without treating it as fatal', () => {
    const accept = slice('function acceptLobbyState(', 'function authorizeRedeploy(');
    const lobbyMessages = slice('function handleLobbyMessage(', "if (message.type === 'lobby-reject')");
    const failure = slice('function handleMatchAdmissionFailure(', 'async function runPrivateMatchAdmission(');
    expect(accept).toContain('message.snapshot.revision > previousSnapshot.revision');
    expect(accept).toContain('&& lobbyAuthoritySupersedesActiveAdmission({');
    expect(accept).toContain('invalidateMatchAdmission(`Lobby advanced to revision ${message.snapshot.revision}`)');
    expect(lobbyMessages).toContain('&& lobbyAuthoritySupersedesActiveAdmission({');
    expect(lobbyMessages).toContain('invalidateMatchAdmission(`Lobby start advanced to revision ${message.revision}`)');
    expect(accept).toContain('(gameStarted || matchStartPreparing)');
    expect(failure.indexOf('isMatchAdmissionSuperseded(error)'))
      .toBeLessThan(failure.indexOf('clearBots();'));
    expect(failure).toContain("return matchAdmissionResult(token, 'superseded', error);");
  });

  it('evicts and fence-retires only the exact failed arena generation', () => {
    const construction = slice('function constructArena(', 'function ensureArenaConstructed(');
    const arena = slice('async function performArenaSelection(', 'function activateArenaSelection(');
    expect(construction).toContain('for (const partialRoot of [...stagingScene.children]) scheduleDeferredGpuRetirement(partialRoot);');
    expect(arena).toContain('if (arenaVisualStream.discardGameplayRoot(nextSelection.id, nextArena.root)) arenaVisualReceipt = null;');
    expect(arena).toContain('evictExactFailedArenaGeneration(');
    expect(arena).toContain('(failedArena) => retireArenaAfterGpuFence(nextSelection.id, failedArena)');
    expect(arena.indexOf('if (!committed && nextArena)'))
      .toBeLessThan(arena.indexOf('renderSubmissionPaused = false;'));
  });

  it('returns a failed Solo cold generation to a retryable deployment surface', () => {
    const failure = slice('function handleMatchAdmissionFailure(', 'async function runPrivateMatchAdmission(');
    expect(failure).toContain("} else if (mode === 'solo') {");
    expect(failure).toContain("applyMenuLifecycle({ type: 'return-pre-match' });");
    expect(failure).toContain('matchAdmissionCoordinator.complete(token);');
    expect(failure).toContain('Retry to build fresh assets.');
  });

  it('projects exactly one pending Host or Join attempt into disabled, retryable controls', () => {
    const ui = slice('function syncArenaSelectionUi()', 'function atomicQualityHousePresentationActive(');
    const handlers = slice("element<HTMLButtonElement>('#host').addEventListener", "element<HTMLButtonElement>('#copy-room').addEventListener");
    expect(ui).toContain('const pendingConnectionAttempt = network.pendingConnectionAttempt();');
    expect(ui).toContain("const hostPending = pendingConnectionAttempt?.kind === 'host';");
    expect(ui).toContain("const joinPending = pendingConnectionAttempt?.kind === 'join';");
    expect(ui).toContain("hostButton.setAttribute('aria-busy', String(hostPending));");
    expect(ui).toContain("joinButton.setAttribute('aria-busy', String(joinPending));");
    expect(handlers.match(/network\.role !== 'offline' \|\| network\.pendingConnectionAttempt\(\)/g)).toHaveLength(2);
    expect(handlers.match(/syncArenaSelectionUi\(\);/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
