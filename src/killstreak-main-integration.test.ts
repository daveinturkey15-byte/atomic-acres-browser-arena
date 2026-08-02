import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const deathDropSource = readFileSync(new URL('./death-drops.ts', import.meta.url), 'utf8');

describe('Pass 65 playable killstreak integration', () => {
  it('freezes the persisted five-slot selection and routes keys 3-7 through activation or possession', () => {
    expect(source).toContain('killstreakLoadoutController.freezeAtMatchStart()');
    expect(source).toContain('projectFieldSupportActor(');
    expect(source).not.toContain('let fieldSupport =');
    expect(source).not.toContain('createFieldSupportState(');
    expect(source).not.toContain('recordSupportElimination(');
    expect(source).not.toContain('recordSupportDeath(');
    expect(source).not.toContain('consumeFieldSupport(');
    expect(source).toContain("['Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(event.code)");
    expect(source).toContain('activateOrToggleFieldSupportSlot(supportSlot)');
    expect(source).toContain('selectControllableSupportEntity(id, player.id, killstreakSnapshot.entities)');
    expect(source).not.toContain("activateFieldSupport('hunter-swarm');");
  });

  it('drives host runtime snapshots/damage and admits only host messages on clients', () => {
    expect(source).toContain('killstreakRuntime.advance(now, killstreakWorldState())');
    expect(source).toContain("message.type === 'killstreak-activate-intent'");
    expect(source).toContain("message.type === 'killstreak-damage-result'");
    expect(source).toContain('admitKillstreakStateMessage(message, {');
    expect(source).toContain('seenNonces: processedNonces');
    expect(source).toContain('event.targetLifeId !== localContinuity');
    expect(source).toContain('killstreakPresentation.presentImpacts(message.impacts, presentedAt)');
  });

  it('admits the one-life guest match-start race without granting replacement continuity', () => {
    expect(source).toContain('message.lifeId === remote.continuity || message.lifeId === remote.continuity + 1');
    expect(source).toContain('if (!member?.connected || !remote || !initialLifeAccepted) return;');
    expect(source.indexOf('killstreakRegisteredActors.has(message.by)')).toBeLessThan(
      source.indexOf('message.lifeId === remote.continuity || message.lifeId === remote.continuity + 1'),
    );
  });

  it('keeps QA teleport continuity aligned with host support authority', () => {
    expect(source).toContain("network.role === 'host' && localMultiplayerQa && movement.resynchronized");
    expect(source).toContain('claimedContinuity === registeredActorLifeId + 1');
    expect(source).toContain('killstreakRuntime.recordActorDeath(incoming.id, claimedContinuity);');
    expect(source).toContain('registeredActorLifeId = claimedContinuity;');
  });

  it('keeps host authority per-frame while bounding only the immutable local presentation snapshot', () => {
    expect(source).toContain('const LOCAL_KILLSTREAK_SNAPSHOT_REFRESH_INTERVAL_MS = 50;');
    const updateStart = source.indexOf('function updatePass65KillstreakRuntime(');
    const updateEnd = source.indexOf('\nfunction overdriveStateMessage(', updateStart);
    const updateBlock = source.slice(updateStart, updateEnd);
    expect(updateBlock).toContain('killstreakRuntime.advance(now, killstreakWorldState())');
    expect(updateBlock).toContain('refreshLocalKillstreakSnapshot(now,');
    expect(updateBlock).toContain('result.damageEvents.length > 0 || result.impactEvents.length > 0 || result.expiredEntityIds.length > 0');
    expect(updateBlock.indexOf('killstreakRuntime.advance(now, killstreakWorldState())'))
      .toBeLessThan(updateBlock.indexOf('refreshLocalKillstreakSnapshot(now,'));

    const refreshStart = source.indexOf('function refreshLocalKillstreakSnapshot(');
    const refreshEnd = source.indexOf('\nfunction broadcastKillstreakState(', refreshStart);
    const refreshBlock = source.slice(refreshStart, refreshEnd);
    expect(refreshBlock).toContain('if (!force && !clockRegressed');
    expect(refreshBlock).toContain('killstreakRuntime.snapshotFor(player.id, now)');
    expect(source).toContain('lastLocalKillstreakSnapshotRefreshAt = Number.NEGATIVE_INFINITY;\n  broadcastKillstreakState(now);');

    const controlStart = source.indexOf('function requestKillstreakControl(');
    const controlEnd = source.indexOf('\nfunction interactWithSelectedKillstreakSupport(', controlStart);
    expect(source.slice(controlStart, controlEnd)).toContain('refreshLocalKillstreakSnapshot(now);');
  });

  it('restores support possession immediately, then retains or removes the actor with the bounded rejoin reservation', () => {
    expect(source).toContain('killstreakRegisteredActors.has(message.by)');
    expect(source).toContain('shouldRetainRemoteCombatAuthority(');
    expect(source).toContain("privateLobbySnapshot?.phase ?? null");
    const removeStart = source.indexOf('function removeRemote(');
    const removeEnd = source.indexOf('\nfunction activeSpawnMode(', removeStart);
    const removeBlock = source.slice(removeStart, removeEnd);
    expect(removeBlock).toContain('if (retainCombatAuthority) killstreakRuntime.recordActorDisconnect(id);');
    expect(removeBlock).toContain('killstreakRuntime.unregisterActor(id);');
    expect(removeBlock).toContain('killstreakRegisteredActors.delete(id);');
    expect(removeBlock).toContain('markLobbyDisconnected(id);');
    expect(source).toContain('killstreakRuntime.unregisterActor(playerId);');
    expect(source).toContain('killstreakMatchEpoch === reservationMatchEpoch');
  });

  it('restores ordinary camera and weapon presentation on match termination', () => {
    expect(source).toContain('killstreakRuntime.endMatch();');
    const clearStart = source.indexOf('function clearFieldSupport()');
    const clearEnd = source.indexOf('\nfunction updatePhysics(', clearStart);
    const clearBlock = source.slice(clearStart, clearEnd);
    expect(clearBlock).toContain('killstreakPresentation.setFirstPersonEntity(null);');
    expect(clearBlock).toContain("document.documentElement.dataset.killstreakPossession = 'none';");
    expect(clearBlock).toContain('camera.near = 0.08;');
    expect(clearBlock).toContain('weaponView.setPresentationVisible(player.alive);');
  });

  it('keeps legacy offensive effects as admitted presentation adapters, never a second reward queue', () => {
    const activationStart = source.indexOf('function activateFieldSupport(');
    const activationEnd = source.indexOf('\nfunction detonateYardhawk(', activationStart);
    const block = source.slice(activationStart, activationEnd);
    expect(block).toContain('beginTriPassTargeting()');
    expect(source).toContain("requestKillstreakActivation('tri-pass'");
    expect(block).toContain("authorizeLocalOffensiveSupport('yardhawk'");
    expect(block).toContain("authorizeLocalOffensiveSupport('hunter-swarm'");
    expect(block).toContain("authorizeLocalOffensiveSupport('nuke'");
    expect(block).not.toContain('available:');
    expect(block).not.toContain('consumeFieldSupport');
    expect(block).not.toContain('recordSupport');
  });

  it('reports the slot-key-toggle piloted-drone ammunition contract', () => {
    expect(source).toContain('PILOTED DRONE · 20 ROUNDS + TWO SPARE CLIPS · PRESS SLOT KEY AGAIN TO ENTER');
    expect(source).not.toContain('PILOTED DRONE · 20 LOADED + 60 RESERVE · FOUR MAGAZINES · F EXITS');
  });

  it('binds legacy offensive effects to the exact host-admitted activation request', () => {
    expect(source).toContain('registerRemoteSupportActivation(state, {');
    expect(source).toContain('activationRequestId: message.activationId');
    expect(source).toContain('canonicalActivationId: admission.activationId');
    expect(source).toContain("type: 'support-activate', by: player.id, source, activationRequestId");
    expect(source).not.toContain('recordRemoteSupportElimination');
  });

  it('projects support damage from the admitted victim and never flashes the caller reticle', () => {
    const start = source.indexOf('function recordOwnerSupportDamage(');
    const end = source.indexOf('\nfunction killstreakActorModifiers(', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);
    expect(block).toContain('new THREE.Vector3(...event.targetPosition)');
    expect(block).toContain('new THREE.Vector3(...event.tracerOrigin)');
    expect(block).toContain('new THREE.Vector3(...event.endpoint)');
    expect(block).toContain('projectSupportDamageAnchor(targetPosition, camera, viewport)');
    expect(block).toContain('supportDamageFeedbackTelemetry.record(event, anchor, viewport)');
    expect(block).toContain("showDamageNumber(event.damage, 'body', undefined, { ...anchor, targetId: event.targetId })");
    expect(block).not.toContain('showHitmarker(');
  });

  it('derives the possessed chopper camera from authority snapshots instead of presentation interpolation', () => {
    const start = source.indexOf('function updateKillstreakPossession(');
    const end = source.indexOf('\nfunction updatePass65KillstreakRuntime(', start);
    const block = source.slice(start, end);
    expect(block).toContain("possession.kind === 'chopper-gunner'");
    expect(block).toContain('chopperGunnerCameraOrigin(entity.position, entity.attitude)');
    expect(block).toContain('killstreakPossessionCameraScratch.set(origin[0], origin[1], origin[2])');
    expect(block).not.toContain('new THREE.Vector3(...chopperGunnerCameraOrigin');
  });

  it('uses a world-space crosshair for Care/Carpet placement and host-owned surface height', () => {
    expect(source).toContain("beginPointSupportTargeting('care-package')");
    expect(source).toContain("beginPointSupportTargeting('carpet-bomber')");
    const targetingStart = source.indexOf('function beginPointSupportTargeting(');
    const targetingEnd = source.indexOf('\nfunction cancelSupportTargeting(', targetingStart);
    const targetingBlock = source.slice(targetingStart, targetingEnd);
    expect(targetingBlock).toContain('tacticalMapOpen = false;');
    expect(targetingBlock).toContain("if (id === 'care-package' || id === 'carpet-bomber') {");
    expect(source).toContain('function updateCrosshairSupportPreview()');
    expect(source).toContain('function confirmCrosshairSupportTarget(');
    expect(source).toMatch(/requestKillstreakActivation\(\s*targeting\.id,\s*confirmedAt,\s*\[point\.x, point\.y, point\.z\],\s*targeting\.id === 'carpet-bomber' \? crosshairPreviewFacing \?\? undefined : undefined,\s*\)/);
    expect(source).toContain("targeting.id === 'carpet-bomber' ? crosshairPreviewFacing ?? undefined : undefined");
    expect(source).toContain("label.textContent = 'LEFT CLICK or [F] to confirm target  [RMB] to cancel'");
    expect(source).toContain("? 'CLICK ONE LOCATION TO CONFIRM · <kbd>RMB</kbd> CANCELS AND REFUNDS'");
    expect(source).not.toContain("LEFT CLICK or [F] to confirm target  [ESC] to cancel");
    expect(source).toContain('cancelSupportTargeting(true)');
    expect(source).toContain('let groundSampler: SupportPlacementGroundSampler | null = null;');
    expect(source).toContain('groundSampler ??= new SupportPlacementGroundSampler({');
    expect(source).toContain('colliders: flightSolids');
    expect(source).toContain('arena.root.updateWorldMatrix(true, true);');
    expect(source).toContain('groundHeightAt,');
    expect(source).toContain('crosshairTarget: crosshairPreviewLastPoint?.toArray() ?? null');
    expect(source).toContain('CARE PACKAGE · TARGET CONFIRMED · DELIVERY INBOUND');
    expect(source).not.toContain('CARE PACKAGE · TARGET CONFIRMED · PRESS F TO SECURE');
    expect(source).not.toContain('nearestSupportTarget()?.point ?? player.position.clone().addScaledVector');
  });

  it('feeds arena-owned portal/no-fly data and current static plus dynamic solids into support flight', () => {
    expect(source).toContain('PASS65_FLIGHT_NAVIGATION[selectedArena.id]');
    expect(source).toContain('const flightSolids = activeWorldColliders();');
    expect(source).toContain('resolveFlightPosition: (from, desired, radius)');
    expect(source).toContain('resolveSupportFlightStep({');
    expect(source).toContain('solids: flightSolids');
    expect(source).toContain('!flightSolids.some((solid) => sphereIntersectsBox(point, 0.35, solid))');
  });

  it('routes one pinned F press only through exact world interactions', () => {
    expect(source).toContain("from './interaction-press-lifecycle';");
    expect(source).toContain('function fInteractionCandidates(');
    expect(source).toContain('function selectedFInteraction(');
    expect(source).toContain('function beginFInteractionPress(');
    expect(source).toContain('function advanceFInteractionPress(');
    expect(source).toContain('function releaseFInteractionPress(');
    expect(source).toContain('function cancelFInteractionPress(');
    expect(source).toContain('function executePinnedFInteraction(');
    expect(source).toContain("if (event.code === 'KeyF' && !event.repeat) {");
    expect(source).toContain("if (event.code === 'KeyF') {");
    expect(source).toContain('releaseFInteractionPress(now);');
    expect(source).toContain('if (localCareCaptureRequiresHold) releaseCareCapture(now);');
    expect(source).toContain("cancelFInteractionPress('blur', lastWindowBlurAt);");
    expect(source).toContain("cancelFInteractionPress('pause');");
    expect(source).toContain("cancelFInteractionPress('death', now);");
    expect(source).toContain("cancelFInteractionPress('epoch-change');");
    const candidatesStart = source.indexOf('function fInteractionCandidates(');
    const candidatesEnd = source.indexOf('\nfunction selectedFInteraction(', candidatesStart);
    const candidatesBlock = source.slice(candidatesStart, candidatesEnd);
    expect(candidatesBlock).not.toContain("'support-enter-chopper'");
    expect(candidatesBlock).not.toContain("'support-enter-drone'");
    expect(candidatesBlock).not.toContain("'support-exit'");
    expect(source).toContain("type: 'killstreak-care-capture-intent'");
    expect(source).toMatch(/function clearGameplayInput\(\): void \{\s+cancelFInteractionPress\('manual-reset'\);\s+releaseCareCapture\(\);/);
    expect(source).toContain('if (appliedDamage > 0) releaseCareCapture(now);');
    expect(source).toContain('killstreakRuntime.recordActorDamage(victimId)');
    expect(source).not.toMatch(/!interactWithKillstreakSupport\(\)[\s\S]{0,100}!interactWithShedDoor\(\)/);
    const keydownStart = source.indexOf("if (event.code === 'KeyF' && !event.repeat) {");
    const keydownEnd = source.indexOf("\n  if (event.code === 'Tab')", keydownStart);
    expect(source.slice(keydownStart, keydownEnd)).toContain('beginFInteractionPress(now);');
    expect(source.slice(keydownStart, keydownEnd)).not.toContain('executePinnedFInteraction(');
  });

  it('makes every visible world prompt an exact-target authority transaction', () => {
    const selectionStart = source.indexOf('function fInteractionCandidates(');
    const selectionEnd = source.indexOf('\nfunction selectedFInteraction(', selectionStart);
    const selectionBlock = source.slice(selectionStart, selectionEnd);
    expect(selectionBlock).toContain("let careLineOfSightSolids: ArenaMap['colliders'] | null = null;");
    expect(selectionBlock).toContain('careLineOfSightSolids ??= activeWorldColliders()');
    expect(selectionBlock).toContain('killstreakLineOfSight(');
    expect(selectionBlock).toContain('[player.position.x, player.position.y, player.position.z]');
    expect(selectionBlock).toContain('crate.position,');
    expect(selectionBlock).toContain('interactiveWorldLineOfSight(');
    expect(selectionBlock).toContain('interactiveWorldRuntime.collisions()');
    expect(selectionBlock).toContain('selectDeathDropWeaponPickup(');

    const worldStart = source.indexOf('function killstreakWorldState()');
    const worldEnd = source.indexOf('\nfunction localKillstreakActorSnapshot(', worldStart);
    expect(source.slice(worldStart, worldEnd)).toContain(
      'hasLineOfSight: (from, to) => killstreakLineOfSight(flightSolids, from, to)',
    );

    const pickupStart = source.indexOf('function interactWithWeaponPickup(');
    const pickupEnd = source.indexOf('\nfunction interactWithShedDoor(', pickupStart);
    const pickupBlock = source.slice(pickupStart, pickupEnd);
    expect(pickupBlock).toContain("if (expectedTargetId === 'railgun') return interactWithRailgunPickup(now);");
    expect(pickupBlock).toContain("if (expectedTargetId?.startsWith('station:'))");
    expect(pickupBlock).toContain('if (expectedTargetId) return interactWithDeathDrop(now, expectedTargetId);');

    const dropStart = source.indexOf('function interactWithDeathDrop(');
    const dropEnd = source.indexOf('\nfunction autoScavengeDeathDrop(', dropStart);
    expect(source.slice(dropStart, dropEnd)).toContain('selectDeathDropWeaponPickup(');
    expect(source.slice(dropStart, dropEnd)).toContain('expectedTargetId,');
    expect(deathDropSource).toContain('deathDropWeaponPickupAvailable(drop, equippedPrimary, now)');
    expect(deathDropSource).toContain("const expected = eligible.find((drop) => drop.id === expectedTargetId);");
    expect(deathDropSource).toContain("nearestDeathDrop([expected], position, range, now, 'weapon')");
  });

  it('routes secure test-bay stations through canonical weapon and support authority', () => {
    const candidateStart = source.indexOf('function fInteractionCandidates(');
    const candidateEnd = source.indexOf('\nfunction selectedFInteraction(', candidateStart);
    const candidates = source.slice(candidateStart, candidateEnd);
    expect(candidates).toContain("kind: 'test-bay-weapon'");
    expect(candidates).toContain("kind: 'test-bay-support'");
    expect(source).toContain('grantTrainingRailgun(railgunState, player.id');
    expect(source).toContain('killstreakRuntime.grantTrainingReward(player.id, localContinuity, id');
    expect(source).toContain("if (network.role === 'client') {");
    expect(source).toContain('activateFieldSupport(id);');
    const worldStart = source.indexOf('function killstreakWorldState()');
    const worldEnd = source.indexOf('\nfunction refreshLocalKillstreakSnapshot(', worldStart);
    const world = source.slice(worldStart, worldEnd);
    expect(world).toContain("target.kind !== 'training-dummy'");
    expect(world).toContain("kind: 'bot'");
    const damageStart = source.indexOf('function applyKillstreakDamageEvent(');
    const damageEnd = source.indexOf('\nlet lastKillstreakControlSentAt', damageStart);
    const damage = source.slice(damageStart, damageEnd);
    expect(damage).toContain("target.kind === 'training-dummy'");
    expect(damage).toContain('hitPracticeTarget(practiceTarget.id, event.damage');
    expect(damage).toContain('{ weaponOrEffect: event.source }');
  });

  it('supersedes and exits possession with the equipped support slot key, never F', () => {
    const start = source.indexOf('function activateOrToggleFieldSupportSlot(');
    const end = source.indexOf('\nfunction interactWithSelectedKillstreakSupport(', start);
    const block = source.slice(start, end);
    expect(block).toContain("const action = id === 'chopper' ? 'toggle-chopper-gunner' : 'toggle-piloted-drone'");
    expect(block).toContain('requestKillstreakControl(entity.id, action, {}, now)');
    expect(block).toContain('localKillstreakActorSnapshot()?.possession?.entityId !== entity.id');
    expect(block).toContain('if (!localKillstreakActorSnapshot()?.possession) activateFieldSupport(id)');
    expect(source).toContain("const supportSlot = ['Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(event.code)");
    expect(source).toContain('if (supportSlot >= 0 && !event.repeat) activateOrToggleFieldSupportSlot(supportSlot)');
  });

  it('offers only claimable landed crates and correlates pending, acknowledged, released and rejected capture state', () => {
    const selectionStart = source.indexOf('function fInteractionCandidates(');
    const selectionEnd = source.indexOf('\nfunction updateFInteractionPrompt(', selectionStart);
    const selectionBlock = source.slice(selectionStart, selectionEnd);
    expect(selectionBlock).toContain('const activeCareCrateId = careCaptureCrateId(localCareCaptureState);');
    expect(selectionBlock).toContain("crate.kind !== 'care-crate' || crate.phase !== 'landed' || crate.id === activeCareCrateId");
    expect(selectionBlock).toContain('const enemySteal = actor != null && crate.team !== actor.team;');
    expect(selectionBlock).toContain("...(enemySteal ? { requiresSustainedHold: true } : {})");
    expect(selectionBlock).not.toContain("crate.phase !== 'capturing'");

    const interactionStart = source.indexOf('function interactWithSelectedKillstreakSupport(');
    const interactionEnd = source.indexOf('\nfunction executePinnedFInteraction(', interactionStart);
    const interactionBlock = source.slice(interactionStart, interactionEnd);
    expect(interactionBlock).toContain("if (!crate || crate.phase !== 'landed' || localCareCaptureState.status !== 'idle') return false;");
    expect(interactionBlock).toContain('localCareCaptureRequiresHold = interaction.requiresSustainedHold === true;');
    expect(interactionBlock).toContain('const requested = requestCareCapture(localCareCaptureState, {');
    expect(interactionBlock).toContain("addFeed('CARE PACKAGE - REQUESTING AUTHORITY', 'gold')");
    expect(interactionBlock).toContain('const admission = killstreakRuntime.beginCareCapture(');
    expect(interactionBlock).toContain('const result = applyCareCaptureResult(localCareCaptureState, {');
    expect(interactionBlock).toContain('if (!admission.accepted) {');
    expect(interactionBlock).toContain('CARE PACKAGE - CLAIM REJECTED');
    expect(interactionBlock.indexOf("addFeed('CARE PACKAGE - SECURING', 'gold')"))
      .toBeGreaterThan(interactionBlock.indexOf('if (!admission.accepted) {'));

    const refreshStart = source.indexOf('function refreshLocalKillstreakSnapshot(');
    const refreshEnd = source.indexOf('\nfunction broadcastKillstreakState(', refreshStart);
    const refreshBlock = source.slice(refreshStart, refreshEnd);
    expect(refreshBlock).toContain('const reconciliation = applyCareCaptureProjection(localCareCaptureState, {');
    expect(refreshBlock).toContain('captureActorId: heldCrate?.captureActorId ?? null');
    expect(refreshBlock).toContain('CARE PACKAGE - CLAIM INTERRUPTED / UNAVAILABLE');

    expect(source).toContain("if (message.type === 'killstreak-care-capture-result') {");
    expect(source).toContain('admitKillstreakCareCaptureResultMessage(message, {');
    expect(source).toContain('const release = requestCareCaptureRelease(localCareCaptureState, sequence, killstreakSnapshot.revision);');
  });

  it('applies the exact Adrenaline stage to damage, movement and reload duration', () => {
    expect(source).toContain('* killstreakActorModifiers(player.id, now).damage');
    expect(source).toContain('maxSpeed: baseProfile.maxSpeed * movementBoost');
    expect(source).toContain('(reloadState.endsAt - reloadStartedAt) * reloadDuration');
    const modifierStart = source.indexOf('function killstreakActorModifiers(');
    const modifierEnd = source.indexOf('\nfunction killstreakLineOfSight(', modifierStart);
    const modifierBlock = source.slice(modifierStart, modifierEnd);
    expect(modifierBlock).toContain("if (matchState.phase !== 'active') return { damage: 1, movement: 1, reloadDuration: 1 };");
    const hudStart = source.indexOf('function updateSupportStatusHud(');
    const hudEnd = source.indexOf('\nfunction refreshLocalKillstreakSnapshot(', hudStart);
    const hudBlock = source.slice(hudStart, hudEnd);
    expect(hudBlock).toContain("adrenalineRemainingMs > 0 && matchState.phase === 'active' && player.alive");
  });
});
