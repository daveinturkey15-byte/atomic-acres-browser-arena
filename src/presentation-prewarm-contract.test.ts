import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const presentationSources = [
  './killstreak-presentation.ts',
  './smoke-volume-presentation.ts',
  './grenade-explosion-presentation.ts',
  './support-explosion-presentation.ts',
  './death-drop-presentation.ts',
] as const;

describe('presentation prewarm startup contract', () => {
  it('keeps one in-flight WebGPU submission while exposing truthful queue progress', () => {
    const source = readFileSync(new URL('./rendering/render-runtime.ts', import.meta.url), 'utf8');
    expect(source).toContain('MAX_IN_FLIGHT_SUBMISSIONS = 1');
    expect(source).toContain('submissionPacing: this.submissionPacing.summary()');
    expect(source).toContain('completionPacing: this.completionPacing.summary()');
    expect(source).toContain('maximumPendingForMs: Math.max(this.progressMaximumPendingForMs, pendingForMs)');
  });

  it.each(presentationSources)('%s scopes shader compilation to its presentation root', (path) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    expect(source).toContain("import type { PresentationPrewarmRuntime } from './rendering/render-runtime'");
    expect(source).toContain('runtime.compileAndRender(this.root, camera, parentScene)');
    expect(source).not.toContain('renderer.compileAsync(');
    expect(source).not.toContain('renderer.render(');
    expect(source).not.toContain('compileAsync(this.root.parent');
  });

  it('scopes nuke and overdrive prewarms while deferring whole-scene compiles until deployment', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const sharedAssets = source.slice(
      source.indexOf('async function prepareSharedGameplayAssets()'),
      source.indexOf('async function prewarmArenaBoundGameplayPresentations('),
    );
    const arenaPresentationPrewarm = source.slice(
      source.indexOf('async function prewarmArenaBoundGameplayPresentations('),
      source.indexOf('function bootstrapMenuPreview()'),
    );
    const menuBootstrap = source.slice(source.indexOf('function bootstrapMenuPreview()'), source.indexOf('bootstrapMenuPreview();'));
    const menuReturn = source.slice(source.indexOf('function returnToMainMenu()'), source.indexOf('resumeButton.addEventListener'));
    const arenaDeployment = source.slice(
      source.indexOf('async function performArenaSelection('),
      source.indexOf('function activateArenaSelection('),
    );
    const matchDeployment = source.slice(source.indexOf('async function startGame('), source.indexOf('function randomNonce()'));
    const menuLoadoutApply = source.slice(
      source.indexOf('function applyMenuLoadoutImmediately()'),
      source.indexOf('let activeMenuTabId'),
    );
    expect(source).toContain('renderRuntime.compileAndRender(nukeShockwave, camera, scene)');
    expect(source).toContain('renderRuntime.compileAndRender(overdriveRoot, camera, scene)');
    expect(sharedAssets).not.toContain('renderRuntime.compile(scene, camera)');
    expect(menuBootstrap).not.toContain('renderRuntime.compile(scene, camera)');
    expect(arenaDeployment).not.toContain('renderRuntime.compile(scene, camera)');
    expect(matchDeployment).not.toContain('renderRuntime.compile(scene, camera)');
    expect(matchDeployment).toContain('const matchActiveOverdrivePrewarm = selectedArena.overdrive;');
    expect(matchDeployment).toContain('overdriveRoot.visible = true;');
    expect(matchDeployment).toContain('overdriveRoot.visible = selectedArena.overdrive;');
    expect(source).toContain('overdriveRoot.visible = gameStarted || matchStartPreparing;');
    expect(source).not.toContain("quadGlow = new THREE.PointLight");
    expect(source).toContain('overdriveRoot.add(overdriveCore, ...overdriveRings, overdrivePedestal, quadWorldIcon, quadBeacon);');
    expect(source).not.toContain("overdriveRoot.visible = gameStarted && matchState.phase === 'active';");
    expect(source).not.toContain('const renderer = renderRuntime.renderer as unknown as THREE.WebGLRenderer');
    expect(source).toContain("bootstrapStage = 'prewarming-grenade-explosion'");
    expect(source).toContain("bootstrapStage = 'prewarming-explosive-bolts'");
    expect(arenaPresentationPrewarm).toContain('await prewarmExplosiveBoltPresentation(sceneGeneration);');
    expect(arenaPresentationPrewarm).toContain('await prewarmGrenadeWorldPresentations(sceneGeneration);');
    expect(arenaPresentationPrewarm).toContain('await tracerPool.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(arenaPresentationPrewarm).toContain('await impactPresentation.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(sharedAssets).not.toContain('tracerPool.prewarm(');
    expect(sharedAssets).not.toContain('impactPresentation.prewarm(');
    expect(arenaPresentationPrewarm).toContain('await grenadeExplosionPresentation.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(arenaPresentationPrewarm).toContain('await supportExplosionPresentation.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(arenaPresentationPrewarm).toContain('await deathDropPresentationPool.prewarm(renderRuntime, camera, player.weapon);');
    expect(arenaPresentationPrewarm).toContain('await prewarmNukePresentation();');
    expect(arenaPresentationPrewarm).toContain('await prewarmOverdrivePresentation();');
    expect(sharedAssets).not.toContain('grenadeExplosionPresentation.prewarm(');
    expect(sharedAssets).not.toContain('supportExplosionPresentation.prewarm(');
    expect(sharedAssets).not.toContain('deathDropPresentationPool.prewarm(');
    expect(sharedAssets).not.toContain('prewarmNukePresentation(');
    expect(sharedAssets).not.toContain('prewarmOverdrivePresentation(');
    expect(source).toContain('const grenadeWorldPresentationPool = new GrenadeWorldPresentationPool(scene);');
    expect(source).toContain('await grenadeWorldPresentationPool.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(source).not.toContain('createGrenadePresentation(');
    expect(source).not.toContain('disposeGrenadePresentation(');
    expect(source).toContain("bootstrapStage = 'prewarming-weapon-catalog'");
    expect(matchDeployment).toContain('await weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(');
    expect(matchDeployment).toContain("const arenaTransitionDetail = arenaTransitionFailure ? `: ${arenaTransitionFailure}` : '';");
    expect(matchDeployment).toContain('did not commit before match start${arenaTransitionDetail}');
    expect(matchDeployment).not.toContain('throw new Error(`Selected arena ${requestedArenaId} did not commit before match start`);');
    expect(source).toContain("return localDhv === 'X' ? 'magnum' : 'pistol';");
    expect(matchDeployment.indexOf('prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena('))
      .toBeLessThan(matchDeployment.indexOf('weaponView.setWeapon(player.weapon, true);'));
    expect(arenaDeployment).toContain('await weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(');
    expect(arenaDeployment.indexOf('weaponPrewarmCatalogForArena('))
      .toBeLessThan(arenaDeployment.indexOf('respawn(false);'));
    expect(source).toContain("bootstrapStage = 'prewarming-killstreak-presentations'");
    expect(arenaPresentationPrewarm).toContain('await killstreakPresentation.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(source).toContain("bootstrapStage = 'prewarming-smoke-presentations'");
    expect(arenaPresentationPrewarm).toContain('await smokeVolumePresentationPool.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(sharedAssets).not.toContain('killstreakPresentation.prewarm(renderRuntime');
    expect(sharedAssets).not.toContain('smokeVolumePresentationPool.prewarm(renderRuntime');
    expect(sharedAssets).not.toContain('prewarmExplosiveBoltPresentation(');
    expect(arenaDeployment.indexOf('await configurePlayableArenaVisuals('))
      .toBeLessThan(arenaDeployment.indexOf('await prewarmArenaBoundGameplayPresentations(arenaTransitionGeneration);'));
    expect(arenaDeployment.indexOf('respawn(false);'))
      .toBeLessThan(arenaDeployment.indexOf('await prewarmArenaBoundGameplayPresentations(arenaTransitionGeneration);'));
    expect(source).toContain("bootstrapStage = 'prewarming-overdrive'");
    expect(menuBootstrap).toContain("document.documentElement.dataset.gameplayArena = 'deferred-until-deployment'");
    expect(arenaDeployment).toContain('await prepareMenuDeploymentAssets()');
    expect(sharedAssets).toContain('weaponView.prewarmBrowserWeaponCatalog(WEAPON_IDS)');
    expect(sharedAssets).toContain('prewarmPass65RuntimeWeaponCorpus()');
    expect(menuBootstrap).toContain('void prepareMenuDeploymentAssets().then(() => {');
    expect(menuBootstrap).toContain('arenaSelectionReady = true;');
    expect(menuReturn).toContain('arenaSelectionReady = true;');
    expect(menuReturn).toContain('void prepareMenuDeploymentAssets().catch(showFatalError);');
    expect(menuBootstrap).toContain("bootstrapStage = 'ready';");
    expect(sharedAssets).toContain("await runPhase('shared-assets'");
    expect(sharedAssets).toContain("await runPhase('first-person-catalog'");
    expect(sharedAssets).toContain("await runPhase('world-drop-corpus'");
    expect(source).toContain('menuDeploymentAssetsProfile: lastMenuDeploymentAssetsProfile');
    expect(arenaPresentationPrewarm).toContain("await runGroup('tracers-impacts'");
    expect(arenaPresentationPrewarm).toContain("await runGroup('death-drops'");
    expect(arenaPresentationPrewarm).toContain("await runGroup('world-ordnance'");
    expect(arenaPresentationPrewarm).not.toContain("runGroup('world-drops-ordnance'");
    expect(arenaPresentationPrewarm).toContain("await runGroup('killstreak-vocabulary'");
    expect(arenaPresentationPrewarm).toContain('await yieldDeploymentPrewarmFrame();');
    expect(matchDeployment).toContain('await killstreakPresentation.prewarm(renderRuntime, camera, -killstreakMatchEpoch);');
    expect(matchDeployment).toContain('await smokeVolumePresentationPool.prewarm(renderRuntime, camera, -killstreakMatchEpoch);');
    expect(matchDeployment).toContain('await prewarmExplosiveBoltPresentation(-killstreakMatchEpoch);');
    expect(matchDeployment.indexOf('await spawnBots()'))
      .toBeLessThan(matchDeployment.indexOf('await killstreakPresentation.prewarm(renderRuntime, camera, -killstreakMatchEpoch);'));
    expect(matchDeployment).toContain("await settleWebGpuPresentation('Initial match')");
    expect(matchDeployment.indexOf("await settleWebGpuPresentation('Initial match')"))
      .toBeLessThan(matchDeployment.indexOf('await smokeVolumePresentationPool.prewarm(renderRuntime, camera, -killstreakMatchEpoch);'));
    expect(matchDeployment.indexOf('await smokeVolumePresentationPool.prewarm(renderRuntime, camera, -killstreakMatchEpoch);'))
      .toBeLessThan(matchDeployment.indexOf('await prewarmExplosiveBoltPresentation(-killstreakMatchEpoch);'));
    expect(matchDeployment.indexOf('await prewarmExplosiveBoltPresentation(-killstreakMatchEpoch);'))
      .toBeLessThan(matchDeployment.indexOf('await killstreakPresentation.prewarm(renderRuntime, camera, -killstreakMatchEpoch);'));
    expect(matchDeployment).toContain('await waitForStableMatchAdmissionCadence();');
    expect(matchDeployment.indexOf('await waitForStableMatchAdmissionCadence();'))
      .toBeLessThan(matchDeployment.indexOf('gameStarted = true;'));
    expect(source).toContain('const minimumStableWindowMs = 1_000;');
    expect(source).toContain('const hitchThresholdMs = 50;');
    const cadenceAdmission = source.slice(
      source.indexOf('async function waitForStableMatchAdmissionCadence()'),
      source.indexOf('function buildSky()'),
    );
    expect(cadenceAdmission).toContain('admittedDegraded: true');
    expect(cadenceAdmission).toContain('visibilityState: document.visibilityState');
    expect(cadenceAdmission).toContain('documentHasFocus: document.hasFocus()');
    expect(cadenceAdmission).not.toContain('reject(');
    expect(cadenceAdmission).not.toContain('throw new Error(');
    expect(cadenceAdmission).toContain('exact-SHA cold WebGPU release gate rejects');
    expect(source).toContain('matchAdmissionCadence: lastMatchAdmissionCadence');
    expect(source).toContain('submitWebGpuFrame(performance.now(), true)');
    expect(arenaDeployment).toContain('await withArenaFrustumCullingDisabled(presentationRoot, async () => {');
    expect(arenaDeployment.indexOf('withArenaFrustumCullingDisabled(presentationRoot'))
      .toBeLessThan(arenaDeployment.indexOf('auditArenaRenderLiveness('));
    expect(source).toContain('await flushWebGpuFrames(12_000)');
    expect(source).toContain('const requiredConsecutiveHealthySamples = 3;');
    expect(source).toContain('const requiredConsecutiveMinimumTierSlowSamples = 3;');
    expect(source).toContain('if (consecutiveMinimumTierSlowSamples < requiredConsecutiveMinimumTierSlowSamples) continue;');
    expect(source).toContain('WebGPU queue latency remained ${Math.round(completionLatencyMs)}ms for ${consecutiveMinimumTierSlowSamples} consecutive samples at the minimum quality tier');
    expect(source).toContain('adaptiveQuality.forceDownshift(');
    expect(matchDeployment).toContain("resetWebGpuPresentationEpoch('match admitted', performance.now());");
    expect(source).toContain("recoverFromSchedulingInterruption('tab visibility regained');");
    expect(source).toContain("recoverFromSchedulingInterruption('window focus regained');");
    const presentationEpochReset = source.slice(
      source.indexOf('function resetWebGpuPresentationEpoch('),
      source.indexOf('let lastHudAt'),
    );
    expect(presentationEpochReset).toContain('lastAdaptedWebGpuCompletionSequence = renderRuntime.presentationTelemetry(now).completedSequence;');
    expect(presentationEpochReset).toContain('deferredWebGpuAdaptivePixelRatio.clear();');
    expect(source).toContain("source: 'webgpu-submission' as const");
    expect(source).toContain('LIVE_WEBGPU_PRESENTATION_STALL_MS = 1_000');
    expect(source).toContain('detectLivePresentationStall({');
    expect(source).toContain('documentFocused: document.hasFocus()');
    expect(source).toContain("resetWebGpuPresentationEpoch('foreground scheduler gap', now);");
    expect(source).toContain('currentSubmissionGapMs: presentation.progress.currentSubmissionGapMs');
    expect(source).toContain('backpressureActive: presentation.backpressureActive');
    expect(source).toContain('debugRenderPaused,');
    expect(source).toContain('renderSubmissionPaused,');
    expect(source).toContain('adaptToCompletedWebGpuQueueLatency(now);');
    expect(source).toContain('deferredWebGpuAdaptivePixelRatio.takeWhenPresentationIdle(');
    expect(source).toContain("if (renderRuntime.backend === 'webgpu') applyDeferredAdaptiveWebGpuRenderBudget(now);");
    expect(source).toContain('cadenceWithNoProgressAge(');
    const fpsHudCadence = source.slice(
      source.indexOf('if (now - lastFpsHudAt >= 250) {'),
      source.indexOf('const frameDt = Math.min(0.05, rawFrameMs / 1000);'),
    );
    expect(fpsHudCadence).toContain('const pacing = effectiveFramePacing(now);');
    expect(fpsHudCadence).toContain("element<HTMLElement>('#refresh-warning')");
    expect(source).toContain("buildOperator(botTeam, 'bot-operator', renderProfile !== 'blender', weapon, 'neon-purple')");
    expect(source).toContain('const streamedWeaponGpuPrewarmer: WeaponViewmodelGpuPrewarmer | undefined');
    expect(source).toContain('streamedWeaponGpuPrewarmQueue.run(() => runStreamedWeaponGpuPrewarm(model, context))');
    expect(source).toContain('const streamedWeaponCatalogGpuPrewarmer: WeaponViewmodelCatalogGpuPrewarmer | undefined');
    expect(source).toContain('streamedWeaponGpuPrewarmQueue.run(() => runStreamedWeaponCatalogGpuPrewarm(entries, context))');
    expect(source).toContain('revealAncestors(model);');
    expect(source).toContain('for (const [ancestor, visible] of ancestorVisibility) ancestor.visible = visible;');
    const weaponPrewarm = source.slice(
      source.indexOf('const runStreamedWeaponGpuPrewarm:'),
      source.indexOf('const streamedWeaponGpuPrewarmer:'),
    );
    expect(weaponPrewarm).not.toContain('renderRuntime.compile(');
    expect(weaponPrewarm).not.toContain('multiplyScalar(0.0001)');
    expect(source).toContain('await renderRuntime.compileAndRender(priorStates[0].model, camera, scene);');
    expect(source).toContain('streamedWeaponGpuPrewarmer,');
    expect(source).toContain('streamedWeaponCatalogGpuPrewarmer,');
    expect(menuLoadoutApply).toContain('const retainedCatalog = menuDeploymentAssetsPromise');
    expect(menuLoadoutApply).toContain('weaponView.prewarmBrowserWeaponCatalog(retainedCatalog)');
    expect(menuLoadoutApply.indexOf('prewarmBrowserWeaponCatalog'))
      .toBeLessThan(menuLoadoutApply.indexOf('weaponView.setWeapon(selectedWeapon, true)'));
    expect(source).toContain("bootstrapStage = 'ready'");
  });

  it('runs the shed reset probe only across the final two RustRig visits and gates continuous GPU progress', () => {
    const source = readFileSync(new URL('../scripts/qa/verify-pass65-webgpu-endurance.mjs', import.meta.url), 'utf8');
    expect(source).toContain("arenaId === 'rustworks-1v1' ? visit : -1");
    expect(source).toContain('rustworksVisitIndices.length >= 2');
    expect(source).toContain('rustworksVisitIndices[rustworksVisitIndices.length - 2]');
    expect(source).toContain('rustworksVisitIndices[rustworksVisitIndices.length - 1]');
    expect(source).not.toContain('const doorResetProbeDetachVisit = arenaSequence.length - 2;');
    expect(source).not.toContain('const doorResetProbeRestoreVisit = arenaSequence.length - 1;');
    expect(source).toContain('const maximumLiveSubmissionGapMs = 250;');
    expect(source).toContain('const maximumLiveCompletionGapMs = 500;');
    expect(source).toContain('const maximumLivePendingMs = 750;');
    expect(source).toContain('const requiredCaptureRecoveryCompletions = 12;');
    expect(source).toContain('const minimumCaptureRecoveryWindowMs = 250;');
    expect(source).toContain('const maximumCaptureRecoveryCompletionMs = 50;');
    expect(source).toContain('const maximumLiveLongTaskEntries = 8;');
    expect(source).toContain('api.resetPresentationProgressWindow();');
    expect(source).toContain('presentation.progress.maximumSubmissionGapMs > maximumLiveSubmissionGapMs');
    expect(source).toContain('presentation.progress.maximumCompletionGapMs > maximumLiveCompletionGapMs');
    expect(source).toContain('presentation.progress.maximumPendingForMs > maximumLivePendingMs');
    const captureIsolation = source.slice(
      source.indexOf('async function captureCanvasOnly'),
      source.indexOf('await mkdir(artifactRoot'),
    );
    expect(captureIsolation.indexOf('await page.screenshot({ clip })'))
      .toBeLessThan(captureIsolation.indexOf('await requireCaptureRecoveryCompletions'));
    expect(captureIsolation.indexOf('await requireCaptureRecoveryCompletions'))
      .toBeLessThan(captureIsolation.lastIndexOf('await pauseAndDrainPresentation'));
    expect(source).toContain('advancedBy === 1');
    expect(source).toContain('completionLatencyMs <= maximumCompletionMs');
    expect(source).toContain('recoveryWindowMs >= minimumWindowMs');
    expect(source).toContain('minimumWindowMs: minimumCaptureRecoveryWindowMs');
    expect(source).toContain('qualifyingCompletionCount: consecutiveCompletions.length');
    expect(source).toContain('firstQualifyingCompletion: consecutiveCompletions[0]');
    expect(source).toContain('lastQualifyingCompletion: consecutiveCompletions.at(-1)');
    expect(source).toContain('liveLongTaskEvidence.entries.length < maximumLongTaskEntries');
    expect(source).toContain('maximumLongTaskEntries: maximumLiveLongTaskEntries');
    expect(source).toContain('recordEntries(longTaskSample.observer.takeRecords())');
    expect(source).toContain('sample.liveLongTasks.count !== 0');
    expect(source).toContain('sample.verifierBoundaryOwnWorkMs >= maximumVerifierOwnedTaskMs');
    expect(source).toContain('const verifierBoundaryAudit = auditVerifierBoundaryOwnWork(samples);');
    expect(source).toContain('if (!verifierBoundaryAudit.pass)');
    expect(source).toContain('verifierCaptureRecovery: summarizeCaptureRecovery(capture.recovery)');
    expect(source).toContain("const skipDiagnosticCapture = process.env.PASS65_DIAGNOSTIC_SKIP_CAPTURE === '1';");
    expect(source).toContain('const captureEnabled = !diagnosticMode || !skipDiagnosticCapture;');
    expect(source).toContain('if (captureEnabled) {\n    visualPhaseStarted = true;');
    expect(source).toContain('if (captureEnabled && visualPhaseStarted) {\n    try {\n      await page?.screenshot');
    expect(source).toContain('let lastCompletedLiveSample = null;');
    const failureBreadcrumb = source.slice(
      source.indexOf('lastCompletedLiveSample = {'),
      source.indexOf('sampleIndex += 1;'),
    );
    expect(failureBreadcrumb).toContain('visit,');
    expect(failureBreadcrumb).toContain('arenaId,');
    expect(failureBreadcrumb).toContain('sampleIndex,');
    expect(failureBreadcrumb).toContain('liveMetrics: {');
    expect(failureBreadcrumb).toContain('nextLiveWindowStart: boundary.nextLiveWindowStart');
    expect(failureBreadcrumb).toContain('finalHeldFrontier: null');
    expect(failureBreadcrumb).toContain('liveLongTasks: sample.liveLongTasks');
    expect(failureBreadcrumb).not.toContain('...sample');
    expect(source).toContain('completedLivePhaseSummary,\n    livePhaseEvidenceDigest,\n    lastCompletedLiveSample,');
    expect(source).toContain('lastCompletedVisualEvidence,\n    error:');
  });

  it('keeps the complete live tour separate and immutable before the global visual tour', () => {
    const source = readFileSync(new URL('../scripts/qa/verify-pass65-webgpu-endurance.mjs', import.meta.url), 'utf8');
    const liveTour = source.slice(
      source.indexOf('for (const [visit, arenaId] of arenaSequence.entries()) {'),
      source.indexOf('if (arenaReceipts.length !== arenaSequence.length'),
    );
    expect(liveTour).not.toContain('page.screenshot');
    expect(liveTour).not.toContain('captureCanvasOnly');
    expect(liveTour).not.toContain("locator('#game').boundingBox()");
    expect(liveTour).not.toContain('visualEvidence');
    const liveLoop = source.slice(
      source.indexOf('while (measuredLiveDurationMs < durationMs) {'),
      source.indexOf('if (samples.length < 5 || measuredLiveDurationMs < durationMs)'),
    );
    expect(liveLoop).not.toContain('page.screenshot');
    expect(liveLoop).not.toContain('captureCanvasOnly');
    expect(liveLoop).not.toContain('pauseAndDrainPresentation');
    expect(liveLoop).not.toContain('api.snapshot()');
    expect(liveLoop).not.toContain('api.sampleRendererResidency()');
    expect(liveLoop).toContain('api.sampleEnduranceHealth()');
    expect(liveLoop).toContain('api.resetPresentationProgressWindow();');
    expect(liveLoop).toContain('presentation.progress.maximumSubmissionGapMs > maximumLiveSubmissionGapMs');
    expect(liveLoop).toContain('presentation.progress.maximumCompletionGapMs > maximumLiveCompletionGapMs');
    expect(liveLoop).toContain('presentation.progress.maximumPendingForMs > maximumLivePendingMs');
    expect(liveLoop).toContain('requireDrained: false');
    expect(liveLoop).toContain('measuredLiveDurationMs += elapsedMs;');
    expect(liveLoop).toContain('samples.push(receipt);');
    expect(liveLoop).toContain('verifierBoundaryOwnWorkSubstages');
    expect(liveLoop).toContain('sample.liveLongTasks.count !== 0');

    const liveGateIndex = source.indexOf('if (samples.length < 5 || measuredLiveDurationMs < durationMs)');
    const finalDrainIndex = source.indexOf('const finalLiveHeldFrontier = summarizeHeldFrontier');
    expect(finalDrainIndex).toBeGreaterThan(liveGateIndex);
    expect(source).toContain('measuredLiveDurationMs,\n        actualDurationMs: measuredLiveDurationMs');
    expect(source).toContain('finalLiveFrontier.presentation.submissionSequence !== finalLiveFrontier.presentation.completedSequence');
    expect(source).toContain('finalLiveFrontier.presentation.lastCompletionLatencyMs > maximumLiveCompletionGapMs');
    expect(source).toContain('finalLiveFrontier.presentation.completionFailures !== 0');
    expect(source).toContain('finalLiveFrontier.presentation.progress.maximumPendingForMs > maximumLivePendingMs');
    const drainIsolation = source.slice(
      source.indexOf('async function pauseAndDrainPresentation'),
      source.indexOf('async function requireCaptureRecoveryCompletions'),
    );
    expect(drainIsolation).toContain('Resolve with the same snapshot that first proves equality');
    expect(drainIsolation).not.toContain('page.waitForFunction');

    const liveTourGateIndex = source.indexOf('if (arenaReceipts.length !== arenaSequence.length');
    const liveDigestIndex = source.indexOf('livePhaseEvidenceDigest = digest(Buffer.from(JSON.stringify(arenaReceipts)))');
    const liveFreezeIndex = source.indexOf('Object.freeze(arenaReceipts);');
    const visualPhaseIndex = source.indexOf('visualPhaseStarted = true;');
    const visualPhaseEnd = source.indexOf('const endingLivePhaseEvidenceDigest');
    expect(liveDigestIndex).toBeGreaterThan(liveTourGateIndex);
    expect(liveFreezeIndex).toBeGreaterThan(liveDigestIndex);
    expect(visualPhaseIndex).toBeGreaterThan(liveFreezeIndex);
    expect(visualPhaseEnd).toBeGreaterThan(visualPhaseIndex);
    expect(source).toContain('arenaReceipts.length !== arenaSequence.length');
    expect(source).toContain('receipt.live.measuredLiveDurationMs < receipt.live.requestedDurationMs');
    expect(source).toContain('Live tour emitted browser/GPU errors before visual capture began');
    expect(source).toContain('endingLivePhaseEvidenceDigest !== livePhaseEvidenceDigest');

    const visualPhase = source.slice(visualPhaseIndex, visualPhaseEnd);
    expect(visualPhase).toContain('for (const [tourIndex, arenaId] of visualArenaSequence.entries())');
    expect(visualPhase).toContain('for (const [visualIndex, pose] of visualEvidencePoses.entries())');
    expect(visualPhase).toContain("state.render.runtime.actualBackend === 'webgpu'");
    expect(visualPhase).toContain("state.render.runtime.presentation.status === 'healthy'");
    expect(visualPhase).toContain("state.arenaSelection.streaming.transition.phase === 'idle'");
    expect(visualPhase).toContain('state.arenaSelection.streaming.transition.failure === null');
    expect(visualPhase).toContain('state.arenaSelection.streaming.transition.renderSubmissionPaused === false');
    expect(visualPhase).toContain("state.render.playableScene.renderWatchdog.status === 'healthy'");
    expect(visualPhase).toContain('const capture = await captureCanvasOnly(page, canvasClip);');
    expect(visualPhase).toContain('visualEvidence.capturedFrames < minimumVisualEvidenceFrames');
    expect(visualPhase).toContain('!visualEvidence.adjacentHashesDistinct');
    expect(visualPhase).toContain('visualEvidence.distinctScreenshots < minimumDistinctScreenshots');
    expect(visualPhase).toContain('minimumVisualEvidenceDistinctRatio');
    expect(visualPhase).toContain('await writeFile(`${artifactRoot}/visual-${tourIndex}-${arenaId}-final.png`, lastScreenshot);');
    expect(visualPhase).toContain('visual-tour menu return did not retire presentation safely');
    expect(visualPhase).toContain('visualEvidenceByArena.push(visualEvidence);');
    expect(source).toContain('const minimumVisualEvidenceFrames = 5;');
    expect(source).toContain('const minimumVisualEvidenceDistinctRatio = 0.8;');
    expect(source).toContain('lastCompletedVisualEvidence = { tourIndex, arenaId, ...frame };');
    expect(source).toContain('visualEvidenceByArena,');
    expect(source).toContain('if (captureEnabled && visualPhaseStarted) {');
  });

  it('keeps continuous endurance telemetry allocation-light and isolates full audits behind pauses', () => {
    const runtimeSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const enduranceHealth = runtimeSource.slice(
      runtimeSource.indexOf('function sampleEnduranceHealth()'),
      runtimeSource.indexOf('const debugWindow = window'),
    );
    expect(enduranceHealth).toContain('renderRuntime.healthTelemetry()');
    expect(enduranceHealth).toContain('weaponView.browserCatalogHealth()');
    expect(enduranceHealth).not.toContain('snapshot()');
    expect(enduranceHealth).not.toContain('estimateRendererResidency');
    expect(enduranceHealth).not.toContain('presentationState()');
    expect(enduranceHealth).not.toContain('.traverse(');
    expect(runtimeSource).toContain('sampleEnduranceHealth: () => ReturnType<typeof sampleEnduranceHealth>;');
    expect(runtimeSource).toContain('sampleWeaponCatalogReadiness: () => weaponView.browserCatalogReadiness()');

    const verifierSource = readFileSync(new URL('../scripts/qa/verify-pass65-webgpu-endurance.mjs', import.meta.url), 'utf8');
    const admissionAudit = verifierSource.indexOf('const arenaAdmissionAudit = await page.evaluate');
    const admissionPause = verifierSource.lastIndexOf('await pauseAndDrainPresentation(page);', admissionAudit);
    expect(admissionPause).toBeGreaterThan(0);
    expect(admissionPause).toBeLessThan(admissionAudit);
    const liveLoop = verifierSource.slice(
      verifierSource.indexOf('while (measuredLiveDurationMs < durationMs) {'),
      verifierSource.indexOf('if (samples.length < 5 || measuredLiveDurationMs < durationMs)'),
    );
    expect(liveLoop).not.toContain('.snapshot()');
    expect(liveLoop).not.toContain('sampleRendererResidency');
    expect(verifierSource).toContain('api.setRenderPaused(true);\n      return {\n        state: api.snapshot(),\n        residency: api.sampleRendererResidency(),');
  });

  it('rejects degraded foreground cadence in the cold physical-menu gate', () => {
    const source = readFileSync(new URL('../scripts/qa/verify-pass65-cold-webgpu-admission.mjs', import.meta.url), 'utf8');
    expect(source).toContain("state.bootstrap.stage === 'failed'");
    expect(source).toContain('after.bootstrap.matchAdmissionCadence.admittedDegraded !== false');
    expect(source).toContain("after.bootstrap.matchAdmissionCadence.visibilityState !== 'visible'");
    expect(source).toContain('const maximumColdTransitionMs = 10_000;');
    expect(source).toContain('const maximumMenuDeploymentPrewarmMs = 10_000;');
    expect(source).toContain('const maximumPreparedSwitchFrameMs = 50;');
    expect(source).toContain("phaseDuration('weapon-catalog-prewarm')");
    expect(source).toContain("phaseDuration('prewarm-batched-effects')");
    expect(source).toContain("new PerformanceObserver((list) => {");
    expect(source).toContain(".observe({ type: 'longtask', buffered: true });");
    expect(source).toContain('menuPrewarmLongTasks.length > 0');
    expect(source).toContain('admissionLongTasks.length > 0');
    expect(source).toContain('postCorpusPrewarmLoads.length > 0');
    expect(source).toContain("menuPhaseDuration('first-person-catalog') > maximumWeaponCatalogPrewarmMs");
    expect(source).toContain('coldPreparationWorkMs > maximumColdTransitionMs');
    expect(source).toContain('menuInteractionAudit.mapButtonsEnabled');
    expect(source).toContain("earlyDeploymentAudit.lifecycle !== 'deploying'");
    expect(source).toContain('firstSwitchAudit.before.gpuReady !== firstSwitchAudit.before.available');
  });

  it('adds the four readiness terms and bootstrap stage to timeout evidence', () => {
    const source = readFileSync(new URL('../tests/e2e/atomic-acres.spec.ts', import.meta.url), 'utf8');
    for (const term of ['statusKind', 'soloDisabled', 'weaponReady', 'originalArtLoaded', 'bootstrap']) {
      expect(source).toContain(term);
    }
    expect(source).toContain('Readiness diagnostic:');
  });
});
