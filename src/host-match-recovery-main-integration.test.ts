import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function functionBody(name: string, nextName: string): string {
  const start = main.indexOf(`function ${name}`);
  const end = main.indexOf(`function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('same-browser hosted active-match recovery integration', () => {
  it('offers the bounded checkpoint explicitly and reclaims the same room', () => {
    expect(main).toContain("hostButton.textContent = pendingHostMatchRecovery ? 'RESUME HOSTED MATCH' : 'HOST LOBBY'");
    expect(main).toContain('loadHostMatchCheckpoint(storage, MULTIPLAYER_PROTOCOL_VERSION, roomCode)');
    expect(main).toContain('network.host(initializeHostLobby, preferredRoomCode, recovery !== null)');
    expect(main).toContain('checkpoint.roomCode !== network.roomCode');
    const selection = functionBody('syncArenaSelectionUi', 'atomicQualityHousePresentationActive');
    expect(selection).toContain('refreshHostMatchRecoveryAffordance()');
    expect(selection).not.toContain("hostButton.textContent = 'HOST LOBBY'");
  });

  it('keeps the Pass 63 host-authority shape and admits no host migration', () => {
    const initializer = functionBody('initializeRecoveredHostLobby', 'initializeHostLobby');
    expect(initializer).toContain("network.setCapacity(checkpoint.config.capacity)");
    expect(initializer).toContain('player.id = checkpoint.hostPlayer.id');
    expect(initializer).toContain('privateMatchActiveAtEpochMs = checkpoint.activeAtEpochMs');
    expect(initializer).toContain('killstreakMatchEpoch = checkpoint.matchEpoch');
    expect(initializer).not.toContain("network.role = 'host'");
    expect(main).toContain("if (network.role !== 'host') return");
  });

  it('stores only guest credential digests and fails closed on a bad recovered credential', () => {
    const capture = functionBody('createHostMatchCheckpoint', 'persistActiveHostMatchCheckpoint');
    expect(capture).toContain('resumeTokenDigests');
    expect(capture).toContain('hostLobbyTokenDigests.get(member.id)');
    expect(capture).not.toContain('hostLobbyTokens.get');
    const admission = functionBody('admitLobbyJoin', 'updateHostReady');
    expect(admission).toContain('resumeTokenMatchesDigest(message.resumeToken, digest.sha256)');
    expect(admission).toContain("rejectLobbyPlayer(message.playerId, 'rejoin-denied', message.resumeToken, message.connectionEpoch)");
    expect(admission).toContain('network.confirmPlayerAdmission(message.playerId, message.resumeToken, message.connectionEpoch)');
    expect(main).toContain('network.rejectPlayerAdmission(playerId, provisionalResumeToken, connectionEpoch, reason)');
    expect(admission).toContain('hostLobbyAdmissionAttemptCurrent(attempt)');
  });

  it('holds guest admission until authoritative recovery is ready, then consumes the exact reconnect repair once', () => {
    const admission = functionBody('admitLobbyJoin', 'updateHostReady');
    expect(admission).toContain('if (hostMatchRecoveryPreparing)');
    expect(admission).toContain('pendingHostRecoveryJoins.set(message.playerId, message)');
    const recovery = functionBody('resumeRecoveredHostMatch', 'initializeRecoveredHostLobby');
    expect(recovery.indexOf('hostMatchRecoveryPreparing = false')).toBeLessThan(recovery.indexOf('admitLobbyJoin(message)'));

    const join = functionBody('sendLobbyJoin', 'sendClientWorldRepairReady');
    expect(join).toContain('pendingClientReconnectWorldRepairConnectionEpoch = awaitingCanonicalGuestAuthority\n    ? localConnectionEpoch\n    : null;');
    expect(join.indexOf('localConnectionEpoch = randomLobbyCredential();'))
      .toBeLessThan(join.indexOf('pendingClientReconnectWorldRepairConnectionEpoch = awaitingCanonicalGuestAuthority'));

    const start = main.slice(main.indexOf('async function startGame'), main.indexOf('\nfunction randomNonce'));
    expect(start).toContain("clientWorldRepairAdmission = mode === 'client' && !awaitingCanonicalGuestAuthority");
    const admittedAt = start.indexOf('gameStarted = true;');
    const repairJoinAt = start.indexOf('sendClientWorldRepairReady(frozenKillstreakLoadout)', admittedAt);
    expect(admittedAt).toBeGreaterThanOrEqual(0);
    expect(repairJoinAt).toBeGreaterThan(admittedAt);

    const repair = functionBody('sendClientWorldRepairReady', 'rejectLobbyPlayer');
    expect(repair).toContain('pendingClientReconnectWorldRepairConnectionEpoch === localConnectionEpoch');
    expect(repair).toContain('if (!clientWorldRepairCanAttempt(admission) && !reconnectRepair) return;');
    expect(repair).toContain('if (reconnectRepair) pendingClientReconnectWorldRepairConnectionEpoch = null;');
    expect(repair.match(/pendingClientReconnectWorldRepairConnectionEpoch = null/g)).toHaveLength(1);
    expect(repair.indexOf('network.send(loadoutMessage);'))
      .toBeLessThan(repair.indexOf('pendingClientReconnectWorldRepairConnectionEpoch = null'));

    const lobbyAdmission = functionBody('acceptLobbyState', 'authorizeRedeploy');
    expect(lobbyAdmission).not.toContain('enteringActiveLobby');
    expect(lobbyAdmission).not.toContain('sendClientWorldRepairReady');
    const hostAdmission = functionBody('admitLobbyJoin', 'updateHostReady');
    const confirmAt = hostAdmission.indexOf(
      'network.confirmPlayerAdmission(message.playerId, message.resumeToken, message.connectionEpoch)',
    );
    const connectedAt = hostAdmission.indexOf('hostLobbyMembers.set(message.playerId, restored);');
    const lobbyAt = hostAdmission.indexOf('broadcastHostLobby(currentPhase);');
    const receiverReadyAt = hostAdmission.indexOf(
      'sendKillstreakStateToPlayer(message.playerId, performance.now(), true);',
    );
    const lobbyStartAt = hostAdmission.indexOf("type: 'lobby-start'");
    expect(confirmAt).toBeGreaterThanOrEqual(0);
    expect(connectedAt).toBeGreaterThan(confirmAt);
    expect(lobbyAt).toBeGreaterThan(connectedAt);
    expect(receiverReadyAt).toBeGreaterThan(lobbyAt);
    expect(lobbyStartAt).toBeGreaterThan(receiverReadyAt);
    const activeAdmissionRepair = hostAdmission.slice(lobbyAt, lobbyStartAt);
    expect(activeAdmissionRepair).toContain('if (gameStarted)');
    expect(activeAdmissionRepair).not.toContain('broadcastKillstreakState(');
    expect(activeAdmissionRepair).not.toContain('remotes');
    expect(main).toContain('broadcastHostedBotState(true)');
  });

  it('targets receiver-ready proof when recovery has retained authority but no live remote', () => {
    const admission = functionBody('admitLobbyJoin', 'updateHostReady');
    const proof = 'sendKillstreakStateToPlayer(message.playerId, performance.now(), true);';
    expect(admission.match(new RegExp(proof.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
    expect(admission).not.toContain('if (gameStarted) broadcastKillstreakState(');

    const targeted = functionBody('sendKillstreakStateToPlayer', 'broadcastKillstreakState');
    expect(targeted).toContain('forPlayerId,');
    expect(targeted).toContain('snapshot: killstreakRuntime.snapshotFor(forPlayerId, now)');
    expect(targeted).toContain('network.sendToPlayer(forPlayerId, message)');
    expect(targeted).toContain('network.sendStateCommitReliablyToPlayer(forPlayerId, message)');
    expect(targeted.indexOf('network.sendToPlayer(forPlayerId, message)'))
      .toBeLessThan(targeted.indexOf('network.sendStateCommitReliablyToPlayer(forPlayerId, message)'));
    expect(targeted).not.toContain('remotes');

    const restore = functionBody('restoreRecoveredHostRuntime', 'initializeFreshHostLobby');
    expect(restore).toContain('retainedRemoteAuthorities.set(guest.snapshot.id');
    expect(restore).not.toContain('remotes.set(');
  });

  it('lets exact resume liveness supersede a retired document without treating pose silence as a disconnect', () => {
    const ack = functionBody('acceptGuestResumeAck', 'sendGuestResumeFailure');
    expect(ack).toContain('hostDisconnectedAt.delete(message.by)');
    expect(ack).toContain("hostLobbyMembers.set(message.by, { ...member, connected: true })");
    expect(ack).toContain("broadcastHostLobby(privateLobbySnapshot?.phase ?? 'active')");
    const remotes = functionBody('updateRemotes', 'teamScores');
    expect(remotes).toContain("network.role === 'host' ? new Set(network.activePlayerIds(12_000, now)) : null");
    expect(remotes).toContain('if (activeGuestIds?.has(id)) continue;');
    expect(remotes.indexOf('if (activeGuestIds?.has(id)) continue;'))
      .toBeLessThan(remotes.indexOf("removeRemote(id, 'timed out')"));
  });

  it('repairs the reliable world revision before resume authority and retries a reordered nonce after convergence', () => {
    const joinRepair = main.slice(main.indexOf("if (network.role === 'host' && message.type === 'join')"));
    const worldRepairAt = joinRepair.indexOf('broadcastInteractiveWorldState(true)');
    const resumeAuthorityAt = joinRepair.indexOf('sendGuestResumeAuthority(incoming.id, remote)');
    expect(worldRepairAt).toBeGreaterThanOrEqual(0);
    expect(resumeAuthorityAt).toBeGreaterThan(worldRepairAt);

    const worldAdmission = functionBody('handleInteractiveWorldMessage', 'handleSmokeAuthorityMessage');
    expect(worldAdmission).toContain('pendingGuestResumeAuthority');
    expect(worldAdmission).toContain('guestResumeWorldRevisionReady(');
    expect(worldAdmission).toContain('applyGuestResumeAuthority(pendingResume)');
    const resumeApply = functionBody('applyGuestResumeAuthority', 'admitLobbyJoin');
    expect(resumeApply).toContain('pendingGuestResumeAuthority = message');
    expect(resumeApply).toContain('pendingGuestResumeAuthority = null');
    expect(resumeApply.indexOf('pendingGuestResumeAuthority = null')).toBeLessThan(resumeApply.indexOf('network.send(ack)'));
    expect(resumeApply).toContain('awaitingCanonicalGuestAuthority = false');
  });

  it('applies recovered player/bot state before public match admission and checkpoints before page shutdown', () => {
    const start = main.indexOf('async function startGame');
    const restoreAt = main.indexOf('restoreRecoveredHostRuntime(hostRecovery, performance.now())', start);
    const admittedAt = main.indexOf('gameStarted = true;', start);
    expect(restoreAt).toBeGreaterThan(start);
    expect(admittedAt).toBeGreaterThan(restoreAt);
    const unload = main.slice(main.lastIndexOf("window.addEventListener('beforeunload'"));
    expect(unload.indexOf('persistActiveHostMatchCheckpoint(true)')).toBeLessThan(unload.indexOf('network.close()'));
  });

  it('keeps gameplay-triggered checkpoint serialization off the live shot frame', () => {
    const safeCapture = functionBody('createRecoverySafeHostMatchCheckpoint', 'persistActiveHostMatchCheckpoint');
    expect(safeCapture).toContain('hostRecoveryPoseAudit(checkpoint)');
    expect(safeCapture).toContain('hostCheckpointRejectedPoseWrites += 1');
    expect(safeCapture).toContain('lastHostCheckpointRejectedPoseReason = audit.reason');
    expect(safeCapture).not.toContain('clearHostMatchCheckpoint');
    expect(safeCapture).not.toContain('saveHostMatchCheckpoint');
    const persist = functionBody('persistActiveHostMatchCheckpoint', 'clearStoredHostMatchCheckpoint');
    const forcedBranch = persist.slice(persist.indexOf('if (force) {'), persist.indexOf('if (hostCheckpointPersistScheduled)'));
    const deferredBranch = persist.slice(persist.indexOf('scheduleBrowserPreparationIdleTask'));
    expect(forcedBranch).toContain('createRecoverySafeHostMatchCheckpoint()');
    expect(forcedBranch).toContain('saveHostMatchCheckpoint(storage, checkpoint)');
    expect(deferredBranch).toContain('createRecoverySafeHostMatchCheckpoint()');
    expect(deferredBranch).toContain('saveHostMatchCheckpoint(deferredStorage, checkpoint)');
    expect(deferredBranch).toContain('remainingThrottleMs');
    expect(deferredBranch).toContain('persistActiveHostMatchCheckpoint();');
    const nonForcedPrelude = persist.slice(
      persist.indexOf('if (hostCheckpointPersistScheduled)'),
      persist.indexOf('scheduleBrowserPreparationIdleTask'),
    );
    expect(nonForcedPrelude).not.toContain('createHostMatchCheckpoint()');
    expect(main).toContain("if (document.visibilityState === 'hidden') persistActiveHostMatchCheckpoint(true)");
    expect(main).toContain("window.addEventListener('pagehide', () => {\n  persistActiveHostMatchCheckpoint(true);");
    expect(main).toContain("window.addEventListener('beforeunload', () => {\n  gameplayRuntimeDisposing = true;\n  persistActiveHostMatchCheckpoint(true);");
    expect(main).toContain('if (gameplayRuntimeDisposing) return;');
  });

  it('reports the exact owned recovery admission reason and pose-write diagnostics', () => {
    const recovery = functionBody('resumeRecoveredHostMatch', 'initializeRecoveredHostLobby');
    expect(recovery).toContain('const result = await beginPrivateMatch(');
    expect(recovery).toContain("result.status === 'failed'");
    expect(recovery).toContain('result.error.message');
    expect(recovery).toContain('result.reason');
    expect(recovery).toContain('Stored match could not be restored safely: ${exactReason}');
    expect(main).toContain('hostMatchRecoveryCheckpoint: {');
    expect(main).toContain('rejectedPoseWrites: hostCheckpointRejectedPoseWrites');
    expect(main).toContain('lastRejectedPoseReason: lastHostCheckpointRejectedPoseReason');
  });

  it('checkpoints and restores guest health/loadout/pose/inventory plus finite railgun authority before reconnect repair', () => {
    const capture = functionBody('createHostMatchCheckpoint', 'persistActiveHostMatchCheckpoint');
    expect(capture).toContain('remoteCombatInventories.get(member.id)');
    expect(capture).toContain('checkpointGuestAuthority(snapshot, continuity, health, combatInventory, nowMonoMs)');
    expect(capture).toContain('checkpointRailgunAuthority(railgunState, nowMonoMs)');
    expect(capture).toContain('guests,');
    expect(capture).toContain('railgun,');

    const restore = functionBody('restoreRecoveredHostRuntime', 'initializeFreshHostLobby');
    expect(restore).toContain('restoreGuestAuthorities(checkpoint, Date.now(), nowMonoMs)');
    expect(restore).toContain('remoteHealthAuthorities.set(guest.snapshot.id, guest.health)');
    expect(restore).toContain('setRemoteCombatInventory(guest.snapshot.id, guest.combatInventory)');
    expect(restore).toContain('retainedRemoteAuthorities.set(guest.snapshot.id');
    expect(main).toContain('initializeRailgunForMatch(railgunActiveAt, hostRecovery)');
    expect(main).toContain('restoreRailgunAuthority(recovery, Date.now(), performance.now())');
    const repair = functionBody('sendGuestResumeAuthority', 'acceptGuestResumeAck');
    expect(repair).toContain('canonicalRetainedGuestSnapshot(remote.snapshot, member, score, health)');
    expect(repair).toContain('connectionEpoch');
    expect(repair).toContain('continuity: actor.lifeId');
    expect(repair).toContain('loadout: actor.loadout');
    expect(repair).toContain('combatInventory,');
    const apply = functionBody('applyGuestResumeAuthority', 'admitLobbyJoin');
    expect(apply).toContain('player.primaryWeapon = canonical.primary');
    expect(apply).toContain('player.secondaryWeapon = canonical.secondary');
    expect(apply).toContain('player.selectedGrenade = canonical.grenade');
    expect(apply).toContain('player.weapon = canonical.weapon');
    expect(apply).toContain('player.ammo[weapon] = projection.combatInventory.ammo[weapon]');
    expect(apply).toContain('player.reserve[weapon] = projection.combatInventory.reserve[weapon]');
    expect(apply).toContain('player.grenades = projection.combatInventory.grenades');
    expect(apply).toContain('network.sendStateCommitReliably(createStateMessage())');
    expect(main).toContain('pendingGuestAuthorityRepairs.has(incoming.id)');
  });

  it('keeps ordinary inventory host-owned across admission, shots, timed reload commits, deaths, redeploys and pickups', () => {
    expect(main).toContain('resetRemoteCombatInventory(initialIncoming)');
    const stateMessage = functionBody('createStateMessage', 'scheduleClockPing');
    expect(stateMessage).toContain('localGuestCombatInventoryProjection(playerSnapshot.seq)');
    expect(stateMessage).not.toContain('combatInventory: localGuestCombatInventory()');
    expect(main).not.toContain('reconcileGuestCombatInventoryProjection(');
    expect(main).toContain('State projections are observation-only');
    expect(main).toContain('admitGuestReloadIntent(state, message');
    expect(main).toContain('advanceGuestReloadAuthority(current');
    expect(main).toContain('setRemoteCombatInventory(playerId, advanced.inventory)');
    expect(main).toContain("type: 'reload-result'");
    expect(main).toContain("finish('rejected', 'empty-magazine', admission.appliedRewindMs)");
    expect(main).toContain('consumeGuestCombatRound(combatInventory, request.weapon)');
    const shotReceipt = functionBody('makeShotResult', 'resolveAuthoritativeShot');
    expect(shotReceipt).toContain('combatInventory: isOrdinaryWeapon(request.weapon) ? remoteCombatInventoryProjection(request.by) : null');
    const shotAdmission = functionBody('acceptAuthoritativeShotResult', 'renderRemoteShot');
    expect(shotAdmission).toContain('admitLocalShotInventoryRepair(message');
    expect(shotAdmission).toContain('applyLocalCombatInventoryProjection(message.combatInventory, true, message.shotSeq)');
    expect(main).toContain('setGuestCombatInventoryGrenades(inventory, admission.state.remaining)');
    expect(main).toContain('resetRemoteCombatInventory(admittedIncoming, grenadeCount)');
    expect(main).toContain('setGuestCombatInventoryWeapon(inventory, remote.snapshot.primary, 0, 0)');
    expect(main).toContain('remote.snapshot = { ...remote.snapshot, primary: result.inventory.primary, weapon: result.inventory.primary }');
  });

  it('commits a redeploy loadout, inventory and checkpoint before publishing the receipt', () => {
    const lobby = functionBody('handleLobbyMessage', 'renderPrivateLobby');
    const request = lobby.slice(lobby.indexOf("if (message.type === 'redeploy-request')"));
    expect(request).toContain('remote.snapshot = canonicalSnapshot');
    expect(request).toContain('resetRemoteCombatInventory(canonicalSnapshot, grenadeAuthority.remaining)');
    expect(request).toContain('retainedRemoteAuthorities.set(message.by');
    expect(request.indexOf('persistActiveHostMatchCheckpoint()')).toBeGreaterThan(request.indexOf('retainedRemoteAuthorities.set(message.by'));
    expect(request.indexOf('persistActiveHostMatchCheckpoint()')).toBeLessThan(request.indexOf('network.send(commit)'));
  });

  it('retains the rebased host invulnerability clock instead of granting crash protection', () => {
    const restore = functionBody('restoreRecoveredHostRuntime', 'initializeFreshHostLobby');
    expect(restore).toContain('recoveryRemainingMs(hostState.invulnerabilityRemainingMs, checkpoint)');
    const start = main.slice(main.indexOf('async function startGame'), main.indexOf('function randomNonce'));
    expect(start).toContain('if (!hostRecovery) player.invulnerableUntil = matchStartedAt + playerSpawnProtectionMs(activeSpawnMode())');
    expect(start).not.toContain('\n  player.invulnerableUntil = matchStartedAt + playerSpawnProtectionMs(activeSpawnMode());');
  });

  it('checkpoints active flares, replays only static downtime collision, and repairs presentation reliably', () => {
    const capture = functionBody('createHostMatchCheckpoint', 'persistActiveHostMatchCheckpoint');
    expect(capture).toContain('flareProjectileSystem.checkpointAuthority(nowMonoMs)');
    expect(capture).toContain('checkpointFlareShooterFeedback(flareProjectiles, nowMonoMs)');
    expect(capture).toContain('flareProjectiles,');
    expect(capture).toContain('flareShotFeedback,');

    const restore = functionBody('restoreRecoveredFlareRuntime', 'initializeTimedMapWeaponsForMatch');
    expect(restore).toContain('flareProjectileSystem.restoreAuthorityCheckpoint(');
    expect(restore).toContain('checkpoint.flareProjectiles,');
    expect(restore).toContain('savedAtMonoMs,');
    expect(restore).toContain('directHitTargets: () => Object.freeze([])');
    expect(restore).toContain('burnTargets: () => Object.freeze([])');
    expect(restore).toContain('onDirectHit: () => undefined');
    expect(restore).toContain('onImpact: () => undefined');
    expect(restore).toContain('onBurnPulse: () => undefined');
    expect(restore).toContain('restoreFlareShotFeedback(checkpoint, authority, downtimeMs, nowMonoMs)');

    const joinRepair = main.slice(main.indexOf("if (network.role === 'host' && message.type === 'join')"));
    expect(joinRepair).toContain('broadcastFlarePresentationState(true, incoming.id)');
    const admission = functionBody('acceptFlarePresentationState', 'restoreFlareShotFeedback');
    expect(admission).toContain('message.matchEpoch !== killstreakMatchEpoch');
    expect(admission).toContain("message.weaponGeneration !== timedMapWeaponStates['flare-gun'].generation");
    expect(admission).toContain('flareProjectileSystem.reconcilePresentationState(');
  });

  it('HF-322: bounds guest resume authority handshake and allows retry within attempt cap', () => {
    const mainText = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(mainText).toContain('clientReconnectWorldRepairAttempts < MAX_CLIENT_WORLD_REPAIR_ATTEMPTS');
    expect(mainText).toContain('pendingClientReconnectWorldRepairConnectionEpoch = localConnectionEpoch;');
    expect(mainText).toContain('handleGuestResumeTimeout();');
  });
});
