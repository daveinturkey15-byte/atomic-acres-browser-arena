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
    expect(sharedAssets).toContain('menuDeploymentAssetsCoordinator.prepare(priority');
    expect(sharedAssets).toContain('weaponView.prewarmBrowserWeaponCatalog(');
    expect(sharedAssets).toContain('prewarmPass65RuntimeWeaponCorpus(checkpoint)');
    expect(menuBootstrap).toContain('menuPreviewVideoController.whenFirstFramePresented().then(() => {');
    expect(menuBootstrap).toContain("prepareMenuDeploymentAssets('idle')");
    expect(menuBootstrap).toContain('arenaSelectionReady = true;');
    expect(menuReturn).toContain('arenaSelectionReady = true;');
    expect(menuReturn).toContain('menuPreviewVideoController.whenFirstFramePresented()');
    expect(menuReturn).toContain("prepareMenuDeploymentAssets('idle')");
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
    expect(matchDeployment.indexOf('await primeFinalWebGlMatchPresentation();'))
      .toBeLessThan(matchDeployment.indexOf('deploymentTransition.dataset.readyAt'));
    expect(matchDeployment.indexOf('await primeFinalWebGlMatchPresentation();'))
      .toBeLessThan(matchDeployment.indexOf('const matchStartedAt = performance.now();'));
    expect(matchDeployment.indexOf('const matchStartedAt = performance.now();'))
      .toBeLessThan(matchDeployment.indexOf('beginMatchDiagnostics(mode, matchStartedAt);'));
    expect(matchDeployment.indexOf('const matchStartedAt = performance.now();'))
      .toBeLessThan(matchDeployment.indexOf('overdriveState = createOverdriveState('));
    expect(matchDeployment.indexOf('const matchStartedAt = performance.now();'))
      .toBeLessThan(matchDeployment.indexOf('initializeRailgunForMatch(railgunActiveAt);'));
    expect(matchDeployment.indexOf('const matchStartedAt = performance.now();'))
      .toBeLessThan(matchDeployment.indexOf('player.invulnerableUntil = matchStartedAt'));
    expect(matchDeployment).toContain('await weaponView.prepareBrowserWeapon(matchStartWeapon);');
    expect(matchDeployment).toContain('await prewarmExactWebGlMatchComposition();');
    expect(matchDeployment).not.toContain('await renderRuntime.compileAndRender(scene, camera, scene);');
    const webGlMatchPrewarm = source.slice(
      source.indexOf('async function prewarmExactWebGlMatchComposition()'),
      source.indexOf('function disposeCorpsePresentation('),
    );
    expect(webGlMatchPrewarm).toContain("renderRuntime.backend !== 'webgl2' || !atomicSignal");
    expect(webGlMatchPrewarm).toContain('const priorCameraLayerMask = camera.layers.mask;');
    expect(webGlMatchPrewarm).toContain('await withArenaFrustumCullingDisabled(scene, async () => {');
    expect(webGlMatchPrewarm).toContain('atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);');
    expect(webGlMatchPrewarm).toContain('camera.layers.mask = priorCameraLayerMask;');
    const finalWebGlPrime = source.slice(
      source.indexOf('async function primeFinalWebGlMatchPresentation()'),
      source.indexOf('function buildSky()'),
    );
    const finalWebGlPresentationSync = source.slice(
      source.indexOf('function synchronizeFinalWebGlMatchPrimePresentation()'),
      source.indexOf('async function primeFinalWebGlMatchPresentation()'),
    );
    expect(finalWebGlPresentationSync).toContain('camera.position.copy(player.position);');
    expect(finalWebGlPresentationSync).toContain("camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');");
    expect(finalWebGlPresentationSync).toContain('weaponView.snapToMatchStartRestPose(currentViewmodelSurfaceRetreat());');
    expect(finalWebGlPresentationSync).toContain('camera.updateMatrixWorld(true);');
    expect(finalWebGlPresentationSync).not.toContain('updatePhysics(');
    expect(finalWebGlPresentationSync).not.toContain('weaponView.update(');
    expect(finalWebGlPrime).toContain("renderRuntime.backend === 'webgpu'");
    expect(finalWebGlPrime).toContain('synchronizeFinalWebGlMatchPrimePresentation();');
    expect(finalWebGlPrime).toContain('atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);');
    expect(finalWebGlPrime).toContain('requestAnimationFrame(resolve)');
    expect(finalWebGlPrime).toContain('renderSubmissionPaused = true;');
    expect(finalWebGlPrime).toContain('renderSubmissionPaused = priorRenderSubmissionPaused;');
    expect(finalWebGlPrime).toContain('matchAdmissionPresentationPaused = true;');
    expect(finalWebGlPrime).toContain('matchAdmissionPresentationPaused = priorMatchAdmissionPresentationPaused;');
    expect(finalWebGlPrime).toContain('lastFrame = performance.now();');
    expect(finalWebGlPrime).toContain('accumulator = 0;');
    expect(finalWebGlPrime.indexOf('synchronizeFinalWebGlMatchPrimePresentation();'))
      .toBeLessThan(finalWebGlPrime.indexOf('atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);'));
    expect(finalWebGlPrime.match(/atomicSignal\.render\(scene, camera, VIEWMODEL_RENDER_LAYER\);/g)).toHaveLength(2);
    expect(finalWebGlPrime).not.toContain('lastGameplayPresentedFrame =');
    expect(source).toContain('webGlReadyPrime: lastWebGlReadyPrime');
    const frameLoop = source.slice(source.indexOf('function frame('), source.indexOf('// Multiplayer transport'));
    expect(frameLoop).toContain("schedulingDecision.mode !== 'foreground-presentation'");
    expect(frameLoop.indexOf("schedulingDecision.mode !== 'foreground-presentation'"))
      .toBeLessThan(frameLoop.indexOf('frameCount += 1;'));
    expect(source).not.toContain('frame(performance.now(), false)');
    expect(frameLoop).toContain('if (matchAdmissionPresentationPaused) {');
    expect(frameLoop.indexOf('if (matchAdmissionPresentationPaused) {')).toBeLessThan(frameLoop.indexOf('frameCount += 1;'));
    expect(frameLoop.indexOf('if (matchAdmissionPresentationPaused) {')).toBeLessThan(frameLoop.indexOf('presentationFrameDue('));
    expect(frameLoop).toContain('accumulator = 0;');
    const stateBroadcast = source.slice(source.indexOf('function scheduleStateBroadcast()'), source.indexOf('scheduleStateBroadcast();'));
    expect(stateBroadcast).toContain('gameStarted && !matchAdmissionPresentationPaused');
    const matchStateUpdate = source.slice(source.indexOf('function updateMatchState('), source.indexOf('function endMatch('));
    expect(matchStateUpdate).toContain('if (matchAdmissionPresentationPaused) return;');
    const weaponPresentationSource = readFileSync(new URL('./weapon-presentation.ts', import.meta.url), 'utf8');
    const matchStartSnap = weaponPresentationSource.slice(
      weaponPresentationSource.indexOf('snapToMatchStartRestPose('),
      weaponPresentationSource.indexOf('private configureWeaponFlashlight('),
    );
    expect(matchStartSnap).toContain('resetImportedWeaponAnimations(activeModel);');
    expect(matchStartSnap).toContain('resetFirstPersonArmAnimations(this.authoredArmsRoot);');
    expect(matchStartSnap.indexOf('resetFirstPersonArmAnimations(this.authoredArmsRoot);'))
      .toBeLessThan(matchStartSnap.indexOf('resetFirstPersonArmFingers(this.riggedFingerBones);'));
    expect(source).toContain('const minimumStableWindowMs = 1_000;');
    expect(source).toContain('const hitchThresholdMs = 50;');
    const cadenceAdmission = source.slice(
      source.indexOf('async function waitForStableMatchAdmissionCadence()'),
      source.indexOf('function synchronizeFinalWebGlMatchPrimePresentation()'),
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
    expect(source).toContain('if (!isSharedMeshGeometry(geometry)) geometry.dispose();');
    expect(source).toContain('if (consecutiveMinimumTierSlowSamples < requiredConsecutiveMinimumTierSlowSamples) continue;');
    expect(source).toContain('WebGPU queue latency remained ${Math.round(completionLatencyMs)}ms for ${consecutiveMinimumTierSlowSamples} consecutive samples at the minimum quality tier');
    expect(source).toContain('adaptiveQuality.forceDownshift(');
    expect(matchDeployment).toContain("resetWebGpuPresentationEpoch('match admitted', performance.now());");
    expect(source).toContain("reconcilePresentationScheduling(document.hidden ? 'tab visibility hidden' : 'tab visibility regained');");
    expect(source).toContain("reconcilePresentationScheduling('window focus regained');");
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

  it('yields cold pool construction, vocabulary state walks and fenced retirement cleanup', () => {
    const grenadeSource = readFileSync(new URL('./grenade-presentation.ts', import.meta.url), 'utf8');
    const killstreakSource = readFileSync(new URL('./killstreak-presentation.ts', import.meta.url), 'utf8');
    const operatorSource = readFileSync(new URL('./operator-model.ts', import.meta.url), 'utf8');
    const runtimeSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const retirementDrain = runtimeSource.slice(
      runtimeSource.indexOf('async function drainDeferredGpuRetirements()'),
      runtimeSource.indexOf('function scheduleDeferredGpuRetirement('),
    );

    expect(grenadeSource).toContain('GRENADE_WORLD_PRESENTATION_BUILD_BATCH_SIZE = 2');
    expect(grenadeSource).toContain('await this.ensureInitializedBatched();');
    expect(grenadeSource).toContain('built % GRENADE_WORLD_PRESENTATION_BUILD_BATCH_SIZE === 0');
    expect(killstreakSource).toContain('PREWARM_STATE_ROOTS_PER_TASK = 4');
    expect(killstreakSource).toContain('await yieldPresentationCpuTask();');
    expect(killstreakSource.match(/await yieldPresentationPreparation\(\);/g)?.length ?? 0).toBeGreaterThan(4);
    expect(operatorSource).toContain('RIGGED_OPERATOR_ACTIONS_PER_TASK = 2');
    expect(operatorSource).toContain('performRiggedOperatorActionPrewarm(runtimeState, actionNames)');
    expect(operatorSource).not.toContain('for (const clip of operatorAsset.clips) actions.set');
    expect(runtimeSource.match(/await prewarmRiggedOperatorActions\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(retirementDrain).toContain('for (const [retirementIndex, retirement] of batch.entries())');
    expect(retirementDrain).toContain('await yieldDeferredGpuRetirementTask();');
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

  it('exercises every HF-138 support and lifecycle workflow through production paths', () => {
    const verifierSource = readFileSync(new URL('../scripts/qa/verify-pass65-webgpu-endurance.mjs', import.meta.url), 'utf8');
    const runtimeSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const pilotWorkflow = verifierSource.slice(
      verifierSource.indexOf('async function runPilotedDroneWorkflow('),
      verifierSource.indexOf('async function runCarpetBomberWorkflow('),
    );
    const carpetWorkflow = verifierSource.slice(
      verifierSource.indexOf('async function runCarpetBomberWorkflow('),
      verifierSource.indexOf('async function runLifecycleRecoveryProbe('),
    );
    const lifecycleWorkflow = verifierSource.slice(
      verifierSource.indexOf('async function runLifecycleRecoveryProbe('),
      verifierSource.indexOf('await mkdir(artifactRoot'),
    );
    const doorProbe = verifierSource.slice(
      verifierSource.indexOf('if (visit === doorResetProbeDetachVisit)'),
      verifierSource.indexOf('} else if (visit === doorResetProbeRestoreVisit)'),
    );
    const grenadeShedHook = runtimeSource.slice(
      runtimeSource.indexOf('detonateGrenadeAtShed: (placementId, surfaceId'),
      runtimeSource.indexOf('\n\n};', runtimeSource.indexOf('detonateGrenadeAtShed: (placementId, surfaceId')),
    );

    expect(verifierSource).toContain("slots: ['scout-sweep', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm']");
    expect(pilotWorkflow).toContain("api.activateSupport('piloted-drone')");
    expect(pilotWorkflow).toContain("api.togglePilotedDroneControl(activated.id)");
    for (const [code, axis] of [
      ['KeyW', 'forward'], ['KeyS', 'backward'], ['KeyD', 'right'],
      ['KeyA', 'left'], ['Space', 'up'], ['ControlLeft', 'down'],
    ]) {
      expect(pilotWorkflow).toContain(`controls.push(await phase('${code}', '${axis}'`);
    }
    expect(pilotWorkflow).toContain('api.setTriggerHeld(true)');
    expect(pilotWorkflow).toContain('result.firedRounds < 1');
    expect(pilotWorkflow).toContain('result.autonomousDisplacementM <= 0.02');

    expect(carpetWorkflow).toContain("api.activateSupport('carpet-bomber')");
    expect(carpetWorkflow).toContain("new KeyboardEvent('keydown', { code: 'KeyF'");
    expect(carpetWorkflow).toContain("marker.shape === 'ground-x'");
    expect(carpetWorkflow).toContain("marker.shape === 'corridor'");
    expect(carpetWorkflow).toContain("entity.kind === 'aircraft'");
    expect(carpetWorkflow).toContain("entity.id.includes('carpet-aircraft')");
    expect(carpetWorkflow).toContain('result.aircraft.displacementM <= 0.1');
    expect(carpetWorkflow).toContain("}, 'authored shell drop');");
    expect(carpetWorkflow).toContain("}, 'flight and first impact');");
    expect(carpetWorkflow).toContain('result.impactPresentation.droppedBombShells <= result.impactPresentation.baselineBombShells');
    expect(carpetWorkflow).toContain('result.impactPresentation.impactFlashes <= result.impactPresentation.baselineImpactFlashes');

    expect(verifierSource).toContain('const requiredLifecycleRecoveryCyclesPerVisit = 2;');
    expect(lifecycleWorkflow).toContain('await coverPage.bringToFront();');
    expect(lifecycleWorkflow).toContain("entry.type === 'visibilitychange' && entry.visibilityState === 'hidden'");
    expect(lifecycleWorkflow).toContain("entry.type === 'visibilitychange' && entry.visibilityState === 'visible'");
    expect(lifecycleWorkflow).toContain("['tab visibility regained', 'window focus regained']");

    expect(doorProbe).toContain("api.detonateGrenadeAtShed(shed.placementId, 'door-south')");
    expect(doorProbe).not.toContain('api.damageShed(');
    expect(grenadeShedHook).toContain('spawnGrenadeExplosionVisual(point, detonatedAt);');
    expect(grenadeShedHook).toContain('breakWindowsInGrenadeBlast(point, randomNonce(), true, GRENADE_RADIUS);');
    expect(grenadeShedHook).toContain("applyInteractiveWorldExplosion(point, GRENADE_RADIUS, 100, 'grenade-major-collapse');");

    expect(verifierSource).toContain('pilotedDroneProbe,\n      carpetBomberProbe,\n      lifecycleRecoveryProbe,');
    expect(verifierSource).toContain('frameTail: samples.slice(-5)');
    expect(verifierSource).toContain('deviceErrorTelemetry: {');
    expect(verifierSource).toContain("deviceErrorTelemetry.actualBackend !== 'webgpu'");
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

  it('returns active-match Options Escape directly to play through one settings flush', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const resume = source.slice(
      source.indexOf('function resumeActiveMatchFromMenu()'),
      source.indexOf("resumeButton.addEventListener('click'"),
    );
    expect(resume.match(/flushPendingGraphics\(\)/g)).toHaveLength(1);
    expect(resume).toContain("setMenuTab('deploy', false)");
    expect(resume).toContain("applyMenuLifecycle({ type: 'resume' })");
    expect(resume).toContain("requestGamePointerLock('resume')");
    const keydown = source.slice(
      source.indexOf("window.addEventListener('keydown', (event) => {", source.indexOf('submitTextChat();')),
      source.indexOf("window.addEventListener('keyup'"),
    );
    expect(keydown).toContain("activeMenuTabId === 'options'");
    expect(keydown).toContain('resumeActiveMatchFromMenu();');
  });
});
