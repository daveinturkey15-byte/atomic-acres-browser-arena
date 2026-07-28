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
    expect(arenaDeployment).toContain("await prepareSharedGameplayAssets()");
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
    expect(source).toContain('revealAncestors();');
    expect(source).toContain('for (const [ancestor, visible] of ancestorVisibility) ancestor.visible = visible;');
    const weaponPrewarm = source.slice(
      source.indexOf('const runStreamedWeaponGpuPrewarm:'),
      source.indexOf('const streamedWeaponGpuPrewarmer:'),
    );
    expect(weaponPrewarm).not.toContain('renderRuntime.compile(');
    expect(weaponPrewarm).not.toContain('multiplyScalar(0.0001)');
    expect(source).toContain('await renderRuntime.compileAndRender(model, camera, scene);');
    expect(source).toContain('streamedWeaponGpuPrewarmer,');
    expect(menuLoadoutApply).toContain('weaponView.prewarmBrowserWeaponCatalog(menuWeaponPrewarmCatalog(selection.primary, selection.secondary))');
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
    expect(source).toContain('api.resetPresentationProgressWindow();');
    expect(source).toContain('presentation.progress.maximumSubmissionGapMs > maximumLiveSubmissionGapMs');
    expect(source).toContain('presentation.progress.maximumCompletionGapMs > maximumLiveCompletionGapMs');
    expect(source).toContain('presentation.progress.maximumPendingForMs > maximumLivePendingMs');
  });

  it('rejects degraded foreground cadence in the cold physical-menu gate', () => {
    const source = readFileSync(new URL('../scripts/qa/verify-pass65-cold-webgpu-admission.mjs', import.meta.url), 'utf8');
    expect(source).toContain("state.bootstrap.stage === 'failed'");
    expect(source).toContain('after.bootstrap.matchAdmissionCadence.admittedDegraded !== false');
    expect(source).toContain("after.bootstrap.matchAdmissionCadence.visibilityState !== 'visible'");
  });

  it('adds the four readiness terms and bootstrap stage to timeout evidence', () => {
    const source = readFileSync(new URL('../tests/e2e/atomic-acres.spec.ts', import.meta.url), 'utf8');
    for (const term of ['statusKind', 'soloDisabled', 'weaponReady', 'originalArtLoaded', 'bootstrap']) {
      expect(source).toContain(term);
    }
    expect(source).toContain('Readiness diagnostic:');
  });
});
