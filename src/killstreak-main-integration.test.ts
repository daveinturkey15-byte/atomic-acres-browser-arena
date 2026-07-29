import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SUPPORT_ENTRY_INTERACTION_RANGE_M,
  primaryInteraction,
  type InteractionCandidate,
} from './interaction-arbitration';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Pass 65 playable killstreak integration', () => {
  it('freezes the persisted five-slot selection at match start and maps keys 3-7 by slot order', () => {
    expect(source).toContain('killstreakLoadoutController.freezeAtMatchStart()');
    expect(source).toContain('projectFieldSupportActor(');
    expect(source).not.toContain('let fieldSupport =');
    expect(source).not.toContain('createFieldSupportState(');
    expect(source).not.toContain('recordSupportElimination(');
    expect(source).not.toContain('recordSupportDeath(');
    expect(source).not.toContain('consumeFieldSupport(');
    expect(source).toContain("['Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(event.code)");
    expect(source).toContain('activateFieldSupport(localFieldSupportProjection().loadout.slots[supportSlot])');
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
    expect(clearBlock).toContain('weaponView.root.visible = player.alive;');
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
    expect(block).toContain('projectSupportDamageAnchor(targetPosition, camera, viewport)');
    expect(block).toContain('supportDamageFeedbackTelemetry.record(event, anchor, viewport)');
    expect(block).toContain("showDamageNumber(event.damage, 'body', undefined, { ...anchor, targetId: event.targetId })");
    expect(block).not.toContain('showHitmarker(');
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
    expect(source).toContain('requestKillstreakActivation(targeting.id, confirmedAt, [point.x, point.y, point.z])');
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

  it('routes F to gun-only chopper handoff, autonomous/manual drone toggle, care capture, or shed interaction before weapon pickup', () => {
    expect(source).toContain("import { primaryInteraction, type InteractionCandidate } from './interaction-arbitration'");
    expect(source).toContain('function selectedFInteraction(');
    expect(source).toContain('function executePrimaryFInteraction(');
    expect(source).toContain("if (event.code === 'KeyF' && !event.repeat) {");
    expect(source).toContain("interaction.kind === 'support-enter-chopper'");
    expect(source).toContain("interaction.kind === 'support-enter-drone'");
    expect(source).toContain("type: 'killstreak-care-capture-intent'");
    expect(source).not.toContain("if (event.code === 'KeyF') releaseCareCapture();");
    expect(source).toMatch(/function clearGameplayInput\(\): void \{\s+releaseCareCapture\(\);/);
    expect(source).toContain('if (appliedDamage > 0) releaseCareCapture(now);');
    expect(source).toContain('killstreakRuntime.recordActorDamage(victimId)');
    expect(source).not.toMatch(/!interactWithKillstreakSupport\(\)[\s\S]{0,100}!interactWithShedDoor\(\)/);
  });

  it('integrates one world-over-support F contract for both drone and chopper possession', () => {
    const candidate = (kind: InteractionCandidate['kind'], targetId: string, proximityM: number): InteractionCandidate => ({
      kind, targetId, proximityM, prompt: kind,
    });
    for (const supportKind of ['support-exit', 'support-enter-drone', 'support-enter-chopper'] as const) {
      for (const worldKind of ['care-package', 'shed-door', 'weapon-pickup'] as const) {
        expect(primaryInteraction([
          candidate(supportKind, `support-${supportKind}`, 0),
          candidate(worldKind, `world-${worldKind}`, 1),
        ])).toMatchObject({ kind: worldKind });
      }
    }
    expect(primaryInteraction([
      candidate('support-enter-drone', 'far-drone', SUPPORT_ENTRY_INTERACTION_RANGE_M + 1),
    ])).toBeNull();
    expect(primaryInteraction([
      candidate('support-enter-chopper', 'near-chopper', SUPPORT_ENTRY_INTERACTION_RANGE_M),
    ])).toMatchObject({ kind: 'support-enter-chopper' });
    expect(primaryInteraction([
      candidate('support-exit', 'possessed-chopper', 0),
    ])).toMatchObject({ kind: 'support-exit' });
  });

  it('offers only claimable landed crates and correlates pending, acknowledged, released and rejected capture state', () => {
    const selectionStart = source.indexOf('function selectedFInteraction(');
    const selectionEnd = source.indexOf('\nfunction updateFInteractionPrompt(', selectionStart);
    const selectionBlock = source.slice(selectionStart, selectionEnd);
    expect(selectionBlock).toContain('const activeCareCrateId = careCaptureCrateId(localCareCaptureState);');
    expect(selectionBlock).toContain("crate.kind !== 'care-crate' || crate.phase !== 'landed' || crate.id === activeCareCrateId");
    expect(selectionBlock).not.toContain("crate.phase !== 'capturing'");

    const interactionStart = source.indexOf('function interactWithSelectedKillstreakSupport(');
    const interactionEnd = source.indexOf('\nfunction executePrimaryFInteraction(', interactionStart);
    const interactionBlock = source.slice(interactionStart, interactionEnd);
    expect(interactionBlock).toContain("if (!crate || crate.phase !== 'landed' || localCareCaptureState.status !== 'idle') return false;");
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
  });
});
