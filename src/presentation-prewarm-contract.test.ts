import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const presentationSources = [
  './killstreak-presentation.ts',
  './smoke-volume-presentation.ts',
  './grenade-explosion-presentation.ts',
  './support-explosion-presentation.ts',
  './death-drop-presentation.ts',
  './destructible-shed-presentation.ts',
  './house-destruction-presentation.ts',
] as const;

describe('presentation prewarm startup contract', () => {
  it('keeps special-weapon light membership constant and idles the bounded lights at zero intensity', () => {
    const flare = readFileSync(new URL('./flare-projectile-system.ts', import.meta.url), 'utf8');
    const flame = readFileSync(new URL('./flamethrower-stream-system.ts', import.meta.url), 'utf8');
    expect(flare).toContain('this.light = new THREE.PointLight(0xff4a24, 0, 9, 2);');
    expect(flare).toContain('this.root.add(this.light);');
    expect(flare.match(/signal-flare-bounded-light/g)).toHaveLength(1);
    expect(flare).not.toContain('root.add(halo, core, light);');
    expect(flare).toContain('boundedLightCount: 1');
    expect(flare).toContain('boundedLightIntensity: this.light.intensity');
    expect(flame).toContain('this.light = new THREE.PointLight(0xff6a22, 0, 7, 2);');
    expect(flame).toContain('this.light.visible = true;');
    expect(flame).not.toContain('this.light.visible = emitted > 0');
    expect(flame).not.toContain('this.light.visible = remaining > 0');
    expect(flame).not.toContain('this.light.visible = false');
    expect(flame).toContain('boundedLightIntensity: this.light.intensity');
  });

  it('keeps WebKit on real basic-depth shadows instead of invalid PCF comparison samplers', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    // The WebKit floor is the guarantee here, not the exact call text: Pass 74
    // added a quality-profile soft tier, so the selector now takes the profile
    // as a second argument. What must never change is that the sampler comes
    // from webGlShadowSamplerMode and that 'basic-depth' still maps to a real
    // BasicShadowMap rather than a PCF comparison sampler.
    expect(source).toMatch(/const shadowSamplerMode = webGlShadowSamplerMode\(navigator\.userAgent[^)]*\);/);
    // Pass 76 moved the ShadowMapType mapping into shadowMapTypeForFilter so a
    // player-facing filter override exists, but the selection still flows
    // through resolveWebGlShadowSamplerMode, whose WebKit basic-depth floor no
    // override can bypass (proven in webgl-shadow-compatibility.test.ts).
    expect(source).toContain('resolveWebGlShadowSamplerMode(navigator.userAgent, renderProfile, filter)');
    expect(source).toContain("mode === 'basic-depth'");
    expect(source).toContain('? THREE.BasicShadowMap');
    // The soft tier is opt-in/quality-only and must never capture the WebKit branch.
    expect(source).toContain("mode === 'pcf-soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap");
    // Renderer construction, exact-composition prewarm, and the live graphics
    // transaction must all retain the browser-safe sampler selection.
    expect(source.match(/type: shadowMapTypeForFilter\(/g)).toHaveLength(3);
    expect(source).not.toContain('type: THREE.PCFShadowMap');
  });

  it('keeps cold work one-deep and bounds warmed live work to a two-frame completion frontier', () => {
    const source = readFileSync(new URL('./rendering/render-runtime.ts', import.meta.url), 'utf8');
    expect(source).toContain("mode === 'warmed-live' ? 2 : 1");
    expect(source).toContain('Forced WebGPU submission requires an idle completion frontier');
    expect(source).toContain('await this.waitForSubmittedWork(12_000);');
    expect(source).toContain('completionProbeTargetSequence: this.completionProbeTargetSequence');
    expect(source).toContain('submissionPacing: this.submissionPacing.summary()');
    expect(source).toContain('completionPacing: this.completionPacing.summary()');
    expect(source).toContain('maximumPendingForMs: Math.max(this.progressMaximumPendingForMs, pendingForMs)');
    expect(source).toContain('maximumCompletionLatencyMs: this.progressMaximumCompletionLatencyMs');
    const legacy = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(legacy).toContain("matchState.phase === 'active'");
    expect(legacy).toContain("menuLifecycle.surface === 'hidden' && arenaSelectionReady");
    expect(legacy).toContain("? 'input-response'");
    expect(legacy).toContain(": 'warmed-live'");
    expect(legacy).toContain("submitWebGpuFrame(now, false, submissionMode)");
    const coldSettlement = legacy.slice(
      legacy.indexOf('async function settleWebGpuPresentation('),
      legacy.indexOf('function buildSky()'),
    );
    expect(coldSettlement).toContain('await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);');
    expect(coldSettlement.indexOf('await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);'))
      .toBeLessThan(coldSettlement.indexOf('await submitForegroundWebGpuFrame();'));
    expect(coldSettlement).not.toContain('forceDownshift(');
    const adaptiveAdmission = legacy.slice(
      legacy.indexOf('async function collectMatchAdmissionWebGpuSubmissionGaps()'),
      legacy.indexOf('async function settleWebGpuPresentation('),
    );
    expect(adaptiveAdmission).toContain("submitWebGpuFrame(now, false, 'warmed-live')");
    expect(adaptiveAdmission).toContain('presentation.lastSubmittedAt - priorSubmittedAt');
    expect(adaptiveAdmission).toContain('warmupGapsRemaining > 0');
    expect(legacy).toContain('MATCH_ADMISSION_ADAPTIVE_WINDOW_TIMEOUT_MS = 1_500');
    expect(legacy).toContain('MATCH_ADMISSION_ADAPTIVE_MINIMUM_SAMPLES = 24');
    expect(legacy).toContain('MATCH_ADMISSION_SEVERE_P50_MS = 25');
    expect(legacy).toContain('MATCH_ADMISSION_SEVERE_P95_MS = 50');
    expect(adaptiveAdmission).not.toContain('calibrateSevereAdmissionDownshift(sampled.maximumQueueLatencyMs');
    expect(adaptiveAdmission).toContain('assertWebGpuAdmissionCompletionLatency(');
    expect(adaptiveAdmission).toContain('completedPresentation.progress.maximumCompletionLatencyMs');
    expect(adaptiveAdmission).toContain('adaptiveQuality.calibrateSevereAdmissionDownshift(');
    expect(adaptiveAdmission).toContain('submissionAdvances <= 0 || completionAdvances <= 0');
    expect(adaptiveAdmission).toContain('completedPresentation.completedSequence < completedPresentation.submissionSequence');
    expect(adaptiveAdmission).toContain("displayedGraphicsPreset !== 'custom'");
    expect(adaptiveAdmission).toContain('deferredWebGpuAdaptivePixelRatio.request(nextPixelRatio);');
    expect(adaptiveAdmission).toContain('applyDeferredAdaptiveWebGpuRenderBudget(performance.now())');
    expect(adaptiveAdmission).toContain('await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);');
    expect(adaptiveAdmission.indexOf('await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);'))
      .toBeLessThan(adaptiveAdmission.indexOf('applyDeferredAdaptiveWebGpuRenderBudget(performance.now())'));
    expect(coldSettlement).toContain('await settleMatchAdmissionAdaptiveWebGpuPresentation(label);');
    const readbackStart = legacy.indexOf('readbackWebGpuFrame: async () => {');
    const readback = legacy.slice(readbackStart, legacy.indexOf('sampleRendererResidency:', readbackStart));
    expect(readback).toContain('const previousRenderPaused = debugRenderPaused;');
    expect(readback.indexOf('debugRenderPaused = true;'))
      .toBeLessThan(readback.indexOf('await flushWebGpuFrames();'));
    expect(readback.indexOf('await flushWebGpuFrames();'))
      .toBeLessThan(readback.indexOf('await submitForegroundWebGpuFrame();'));
    expect(readback).toContain('finally {');
    expect(readback).toContain('debugRenderPaused = previousRenderPaused;');
  });

  it('locks the admitted preset tier for active play and never reallocates from queue latency', () => {
    const legacy = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const healthMonitor = legacy.slice(
      legacy.indexOf('function monitorCompletedWebGpuQueueHealth('),
      legacy.indexOf('function selectedArenaPresentationRoot('),
    );
    expect(healthMonitor).toContain("presentation.status === 'stalled'");
    expect(healthMonitor).not.toContain('adaptiveQuality.record(');
    expect(healthMonitor).not.toContain('forceDownshift(');
    expect(healthMonitor).not.toContain('deferredWebGpuAdaptivePixelRatio.request(');
    expect(legacy).toContain("if (renderRuntime.backend === 'webgpu' && !matchWebGpuQualityFrozen)");
    expect(legacy).toContain('!matchWebGpuQualityFrozen && gameStarted');
    expect(legacy).toContain('matchWebGpuQualityFrozen = true;');
    expect(legacy).toContain('matchWebGpuQualityFrozen = shouldFreezeAdaptiveQualityForMatch(renderRuntime.backend);');
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
    const arenaVisualConfiguration = source.slice(
      source.indexOf('async function configurePlayableArenaVisuals('),
      source.indexOf('function activeBallisticSurfaces('),
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
    expect(source).toContain("setBootstrapStage('prewarming-grenade-explosion')");
    expect(source).toContain("setBootstrapStage('prewarming-explosive-bolts')");
    expect(arenaPresentationPrewarm).toContain('await Promise.all([');
    expect(arenaPresentationPrewarm).toContain('prewarmExplosiveBoltPresentation(sceneGeneration),');
    expect(arenaPresentationPrewarm).toContain('timedMapWeaponPresentation.prewarm(renderRuntime, camera, sceneGeneration),');
    expect(arenaPresentationPrewarm).toContain('flareProjectileSystem.prewarm(renderRuntime, camera, sceneGeneration),');
    expect(arenaPresentationPrewarm).toContain('flareProjectileSystem.withStagedFirstShotPresentation(camera,');
    expect(arenaPresentationPrewarm).toContain("weaponView.prewarmBrowserWeaponFirePresentation(\n      'flare-gun'");
    expect(arenaPresentationPrewarm).toContain('flamethrowerStreamPresentation.withStagedFirstShotPresentation(camera,');
    expect(arenaPresentationPrewarm).toContain("weaponView.prewarmBrowserWeaponFirePresentation(\n          'flamethrower'");
    expect(arenaPresentationPrewarm).toContain('() => renderRuntime.compileAndRender(scene, camera, scene)');
    expect(arenaPresentationPrewarm).toContain('() => prewarmExactWebGlMatchComposition()');
    expect(arenaPresentationPrewarm).toContain('flamethrowerStreamPresentation.prewarm(renderRuntime, camera, sceneGeneration),');
    expect(arenaPresentationPrewarm).toContain('await prewarmGrenadeWorldPresentations(sceneGeneration);');
    expect(arenaPresentationPrewarm).toContain('await tracerPool.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(arenaPresentationPrewarm).toContain('await impactPresentation.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(sharedAssets).not.toContain('tracerPool.prewarm(');
    expect(sharedAssets).not.toContain('impactPresentation.prewarm(');
    expect(arenaPresentationPrewarm).toContain('await grenadeExplosionPresentation.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(arenaPresentationPrewarm).toContain('await supportExplosionPresentation.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(arenaPresentationPrewarm).toContain('deathDropPresentationPool.prewarm(renderRuntime, camera, player.weapon),');
    expect(arenaPresentationPrewarm).toContain('prewarmWindowGlassDebrisPool(sceneGeneration),');
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
    expect(source).toContain("setBootstrapStage('prewarming-weapon-catalog')");
    expect(matchDeployment).toContain('await weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(');
    expect(matchDeployment).toContain("const arenaTransitionDetail = arenaTransitionFailure ? `: ${arenaTransitionFailure}` : '';");
    expect(matchDeployment).toContain('did not commit before match start${arenaTransitionDetail}');
    expect(matchDeployment).not.toContain('throw new Error(`Selected arena ${requestedArenaId} did not commit before match start`);');
    expect(source).toContain("return localDhv === 'X' ? 'magnum' : 'pistol';");
    const webGlMatchBoundHotset = matchDeployment.indexOf(
      'const webGlMatchBoundCatalog = webGlMatchBoundWeaponPrewarmCatalog(matchStartWeapon);',
    );
    const webGlMatchBoundAssetLoad = matchDeployment.indexOf(
      'await weaponView.prepareBrowserWeaponCatalogAssets(',
      webGlMatchBoundHotset,
    );
    const fullCatalogPrewarm = matchDeployment.indexOf(
      'await weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(',
    );
    expect(webGlMatchBoundHotset).toBeGreaterThan(-1);
    expect(webGlMatchBoundAssetLoad).toBeGreaterThan(webGlMatchBoundHotset);
    expect(fullCatalogPrewarm).toBeGreaterThan(webGlMatchBoundAssetLoad);
    expect(matchDeployment.slice(webGlMatchBoundHotset, fullCatalogPrewarm))
      .toContain('webGlCatalogReadiness.retained.includes(weaponId)');
    expect(matchDeployment.indexOf('prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena('))
      .toBeLessThan(matchDeployment.indexOf('weaponView.setWeapon(player.weapon, true);'));
    expect(arenaDeployment).toContain('await weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(');
    expect(arenaDeployment.indexOf('weaponPrewarmCatalogForArena('))
      .toBeLessThan(arenaDeployment.indexOf('respawn(false);'));
    expect(source).toContain("setBootstrapStage('prewarming-killstreak-presentations')");
    expect(arenaPresentationPrewarm).toContain('await killstreakPresentation.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(source).toContain("setBootstrapStage('prewarming-smoke-presentations')");
    expect(arenaPresentationPrewarm).toContain('await smokeVolumePresentationPool.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(sharedAssets).not.toContain('killstreakPresentation.prewarm(renderRuntime');
    expect(sharedAssets).not.toContain('smokeVolumePresentationPool.prewarm(renderRuntime');
    expect(sharedAssets).not.toContain('prewarmExplosiveBoltPresentation(');
    expect(arenaDeployment.indexOf('await configurePlayableArenaVisuals('))
      .toBeLessThan(arenaDeployment.indexOf('await prewarmArenaBoundGameplayPresentations(arenaTransitionGeneration);'));
    expect(arenaVisualConfiguration.match(/invalidateBrowserWeaponGpuReadinessForPipelineChange\(\)/g)).toHaveLength(1);
    expect(arenaVisualConfiguration.indexOf('invalidateBrowserWeaponGpuReadinessForPipelineChange()'))
      .toBeLessThan(arenaVisualConfiguration.indexOf('if (pass64TslSystems) pass64TslSystems.applyDefinition'));
    expect(arenaDeployment.indexOf('respawn(false);'))
      .toBeLessThan(arenaDeployment.indexOf('await prewarmArenaBoundGameplayPresentations(arenaTransitionGeneration);'));
    expect(source).toContain("setBootstrapStage('prewarming-overdrive')");
    expect(menuBootstrap).toContain("document.documentElement.dataset.gameplayArena = 'deferred-until-deployment'");
    expect(arenaDeployment).toContain('await prepareMenuDeploymentAssets()');
    expect(sharedAssets).toContain('menuDeploymentAssetsCoordinator.prepare(priority');
    expect(source).toContain('soloButton.textContent = soloLaunchLabel(selectedArena);');
    expect(source).toContain('soloButton.disabled = !arenaSelectionReady;');
    expect(source).toContain('hostButton.disabled = !arenaSelectionReady || !selectedArena.multiplayer || !webRtcSupported;');
    expect(source).toContain('joinButton.disabled = !arenaSelectionReady || !selectedArena.multiplayer || !webRtcSupported;');
    expect(source).not.toContain('menuDeploymentAssetsReady');
    expect(sharedAssets).toContain('weaponView.prepareBrowserWeaponCatalogAssets(');
    expect(sharedAssets).not.toContain('weaponView.prewarmBrowserWeaponCatalog(');
    expect(sharedAssets).toContain('prewarmPass65RuntimeWeaponCorpus(checkpoint)');
    expect(menuBootstrap).toContain('menuPreviewVideoController.whenFirstFramePresented().then(() => {');
    expect(menuBootstrap).toContain("prepareMenuDeploymentAssets('idle')");
    expect(menuBootstrap).toContain('arenaSelectionReady = true;');
    expect(menuReturn).toContain('arenaSelectionReady = true;');
    expect(menuReturn).toContain('menuPreviewVideoController.whenFirstFramePresented()');
    expect(menuReturn).toContain("prepareMenuDeploymentAssets('idle')");
    expect(matchDeployment).toContain("setBootstrapStage('ready');");
    expect(sharedAssets).toContain("const sharedAssets = runPhase('shared-assets'");
    expect(sharedAssets).toContain("? runPhase('first-person-catalog'");
    expect(sharedAssets).toContain("const worldDropCorpus = runPhase('world-drop-corpus'");
    expect(sharedAssets).toContain('const botWeaponVocabulary = runPhase(');
    expect(sharedAssets).toContain("'bot-weapon-vocabulary'");
    expect(sharedAssets).toContain('botWeaponGpuVocabulary.prepareCpu(checkpoint)');
    expect(sharedAssets).toContain('const menuWeaponAsset = prepareMenuWeaponAsset();');
    expect(sharedAssets).toContain('const firstPersonCatalog = menuWeaponAsset.then(');
    expect(sharedAssets).not.toContain('const firstPersonCatalog = sharedAssets.then(');
    expect(sharedAssets).toContain('await Promise.all([sharedAssets, worldDropCorpus, firstPersonCatalog, botWeaponVocabulary]);');
    expect(source).toContain('menuDeploymentAssetsProfile: lastMenuDeploymentAssetsProfile');
    expect(arenaPresentationPrewarm).toContain("['tracers-impacts', () => Promise.all([");
    expect(arenaPresentationPrewarm).toContain("['death-drops-glass', () => Promise.all([");
    expect(arenaPresentationPrewarm).toContain("['world-ordnance', () => prewarmGrenadeWorldPresentations(sceneGeneration)]");
    expect(arenaPresentationPrewarm).not.toContain("['world-drops-ordnance'");
    expect(arenaPresentationPrewarm).toContain("['bot-world-weapons', () => botWeaponGpuVocabulary.prewarm(");
    const concurrentEffectDefinitions = arenaPresentationPrewarm.slice(
      arenaPresentationPrewarm.indexOf('const groupDefinitions = ['),
      arenaPresentationPrewarm.indexOf('const groups = await Promise.all(groupDefinitions.map('),
    );
    expect(concurrentEffectDefinitions).not.toContain('killstreakPresentation.prewarm(');
    const flareFirstShotIndex = arenaPresentationPrewarm.indexOf("runGroup('flare-first-shot'");
    const flameFirstShotIndex = arenaPresentationPrewarm.indexOf("runGroup('flamethrower-first-shot'");
    const killstreakVocabularyIndex = arenaPresentationPrewarm.indexOf("'killstreak-vocabulary'");
    expect(flareFirstShotIndex).toBeGreaterThan(0);
    expect(flameFirstShotIndex).toBeGreaterThan(flareFirstShotIndex);
    expect(killstreakVocabularyIndex).toBeGreaterThan(flameFirstShotIndex);
    const killstreakVocabularyPrewarm = arenaPresentationPrewarm.slice(
      killstreakVocabularyIndex,
      arenaPresentationPrewarm.indexOf('lastArenaEffectPrewarmProfile = Object.freeze({'),
    );
    expect(killstreakVocabularyPrewarm).toContain('weaponView.setPresentationVisible(true);');
    expect(killstreakVocabularyPrewarm).toContain(
      'await killstreakPresentation.prewarm(renderRuntime, camera, sceneGeneration);',
    );
    expect(killstreakVocabularyPrewarm).toContain('finally {\n        weaponView.setPresentationVisible(false);');
    expect(arenaPresentationPrewarm).toContain('const groups = await Promise.all(groupDefinitions.map(');
    expect(arenaPresentationPrewarm).not.toContain('await yieldDeploymentPrewarmFrame();');
    expect(source).toContain('botWeaponVocabulary: botWeaponGpuVocabulary.telemetry()');
    expect(matchDeployment).not.toContain('await killstreakPresentation.prewarm(renderRuntime, camera, -killstreakMatchEpoch);');
    expect(matchDeployment).not.toContain('await smokeVolumePresentationPool.prewarm(renderRuntime, camera, -killstreakMatchEpoch);');
    expect(matchDeployment).not.toContain('await prewarmExplosiveBoltPresentation(-killstreakMatchEpoch);');
    expect(matchDeployment).toContain("await settleWebGpuPresentation('Initial match')");
    const dmrThermalAdsPrewarm = source.slice(
      source.indexOf('async function prewarmMatchBoundDmrThermalAdsPresentation('),
      source.indexOf('async function prewarmMatchBoundFirstShotPresentations('),
    );
    expect(dmrThermalAdsPrewarm).toContain("await weaponView.prepareBrowserWeapon('m14-ebr');");
    expect(dmrThermalAdsPrewarm).toContain("deploymentTransition.hidden || menuLifecycle.surface !== 'deploying'");
    expect(dmrThermalAdsPrewarm).toContain("weaponView.setWeapon('m14-ebr', true);");
    expect(dmrThermalAdsPrewarm).toContain('weaponView.snapToMatchStartRestPose(currentViewmodelSurfaceRetreat());');
    expect(dmrThermalAdsPrewarm).toContain(
      'camera.fov = magnifiedFovDegrees(preferredFov, DMR_THERMAL_MAGNIFICATION);',
    );
    expect(dmrThermalAdsPrewarm).toContain('weaponView.suppressForFullscreenPresentation(true);');
    expect(dmrThermalAdsPrewarm).toContain('dmrThermalPresentation.update(camera, dmrThermalContacts(), true);');
    expect(dmrThermalAdsPrewarm).toContain('dmrThermalPresentation.worldRoot.visible = false;');
    expect(dmrThermalAdsPrewarm).toContain('prewarmThermalGhostPipelines();');
    expect(dmrThermalAdsPrewarm).toContain('await runStagedDmrThermalPrewarm({');
    expect(dmrThermalAdsPrewarm.match(/yieldVisibleBrowserPresentationFrame\(token\.signal\)/g)).toHaveLength(2);
    expect(dmrThermalAdsPrewarm).not.toContain('yieldVisibleBrowserPresentationFrame();');
    const dmrThrowRestore = dmrThermalAdsPrewarm.slice(
      dmrThermalAdsPrewarm.indexOf('restore: (restoreState) => {'),
    );
    for (const restore of [
      'dmrThermalPresentation.update(camera, [], false);',
      'thermalGhostPresentation.sync([], false);',
      "hudRoot.classList.toggle('dmr-thermal-active', restoreState.hudThermalClass);",
      'weaponView.suppressForFullscreenPresentation(false);',
      'weaponView.setWeapon(restoreState.weapon, true);',
      'camera.position.copy(restoreState.cameraPosition);',
      'camera.quaternion.copy(restoreState.cameraQuaternion);',
      'camera.fov = restoreState.cameraFov;',
      'camera.updateProjectionMatrix();',
    ]) expect(dmrThrowRestore).toContain(restore);
    const matchBoundFirstShots = source.slice(
      source.indexOf('async function prewarmMatchBoundFirstShotPresentations('),
      source.indexOf('function disposeCorpsePresentation('),
    );
    expect(matchBoundFirstShots).toContain('weaponView.prewarmBrowserWeaponFirePresentation(player.weapon,');
    expect(matchBoundFirstShots).toContain('flareProjectileSystem.withStagedFirstShotPresentation(camera,');
    expect(matchBoundFirstShots).toContain("weaponView.prewarmBrowserWeaponFirePresentation('flare-gun',");
    expect(matchBoundFirstShots).toContain('flareProjectileSystem.withStagedImpactBurnPresentation(camera,');
    expect(matchBoundFirstShots).toContain("weaponView.prewarmBrowserWeaponReloadPresentation('flare-gun',");
    expect(matchBoundFirstShots).toContain('flamethrowerStreamPresentation.withStagedFirstShotPresentation(camera,');
    expect(matchBoundFirstShots).toContain("weaponView.prewarmBrowserWeaponFirePresentation('flamethrower',");
    expect(matchBoundFirstShots).toContain('renderRuntime.compileAndRender(scene, camera, scene)');
    expect(matchBoundFirstShots).toContain('prewarmExactWebGlMatchComposition(token.signal)');
    expect(matchBoundFirstShots).toContain("weaponView.prewarmBrowserWeaponFirePresentation('m14-ebr',");
    expect(matchBoundFirstShots).toContain('prewarmMatchBoundDmrThermalAdsPresentation(submitExactMatchComposition, token);');
    expect(matchBoundFirstShots).toContain(
      'await grenadeWorldPresentationPool.withStagedFirstAcquisitionVocabulary(',
    );
    const glassImpactStage = matchBoundFirstShots.indexOf(
      'await impactPresentation.withStagedVocabulary(camera,',
    );
    const glassPoolStage = matchBoundFirstShots.indexOf(
      'withStagedWindowGlassDebrisPool(',
      glassImpactStage,
    );
    const glassImpactSubmit = matchBoundFirstShots.indexOf(
      '() => submitExactMatchComposition()',
      glassPoolStage,
    );
    const ordinaryFireStage = matchBoundFirstShots.indexOf(
      'weaponView.prewarmBrowserWeaponFirePresentation(player.weapon,',
    );
    const grenadeVocabularyStage = matchBoundFirstShots.indexOf(
      'await grenadeWorldPresentationPool.withStagedFirstAcquisitionVocabulary(',
    );
    expect(glassImpactStage).toBeGreaterThan(-1);
    expect(glassPoolStage).toBeGreaterThan(glassImpactStage);
    expect(glassImpactSubmit).toBeGreaterThan(glassPoolStage);
    expect(glassImpactStage).toBeLessThan(ordinaryFireStage);
    expect(grenadeVocabularyStage).toBeGreaterThan(glassImpactSubmit);
    expect(grenadeVocabularyStage).toBeLessThan(ordinaryFireStage);
    expect(matchBoundFirstShots.slice(glassImpactStage, ordinaryFireStage))
      .toContain('arenaTransitionGeneration');
    expect(matchBoundFirstShots.indexOf('player.weapon'))
      .toBeLessThan(matchBoundFirstShots.indexOf("'m14-ebr'"));
    expect(matchBoundFirstShots.indexOf("'m14-ebr'"))
      .toBeLessThan(matchBoundFirstShots.indexOf("'flare-gun'"));
    expect(matchBoundFirstShots.indexOf("'flare-gun'"))
      .toBeLessThan(matchBoundFirstShots.indexOf("'flamethrower'"));
    const flareFlightStage = matchBoundFirstShots.indexOf('flareProjectileSystem.withStagedFirstShotPresentation(camera,');
    const flareBurnStage = matchBoundFirstShots.indexOf('flareProjectileSystem.withStagedImpactBurnPresentation(camera,');
    const flareBurnImpactStage = matchBoundFirstShots.indexOf(
      'impactPresentation.withStagedVocabulary(camera,',
      flareBurnStage,
    );
    const flareReloadStage = matchBoundFirstShots.indexOf(
      "weaponView.prewarmBrowserWeaponReloadPresentation('flare-gun',",
      flareBurnImpactStage,
    );
    const flameStage = matchBoundFirstShots.indexOf('flamethrowerStreamPresentation.withStagedFirstShotPresentation(camera,');
    const flameImpactStage = matchBoundFirstShots.indexOf(
      'impactPresentation.withStagedVocabulary(camera,',
      flameStage,
    );
    expect(flareFlightStage).toBeLessThan(flareBurnStage);
    expect(flareBurnStage).toBeLessThan(flareBurnImpactStage);
    expect(flareBurnImpactStage).toBeLessThan(flareReloadStage);
    expect(flareReloadStage).toBeLessThan(flameStage);
    expect(flameStage).toBeLessThan(flameImpactStage);
    expect(flameImpactStage).toBeLessThan(matchBoundFirstShots.indexOf(
      "weaponView.prewarmBrowserWeaponFirePresentation('flamethrower',",
      flameImpactStage,
    ));
    const firstMatchBoundCall = matchDeployment.indexOf('await prewarmMatchBoundFirstShotPresentations(token);');
    expect(firstMatchBoundCall).toBeGreaterThan(matchDeployment.indexOf('await prewarmBotPresentations();'));
    expect(matchDeployment.match(/await prewarmMatchBoundFirstShotPresentations\(token\);/g)).toHaveLength(2);
    expect(firstMatchBoundCall).toBeLessThan(matchDeployment.indexOf("await settleWebGpuPresentation('Initial match')"));
    expect(arenaDeployment.indexOf('await prewarmArenaBoundGameplayPresentations(arenaTransitionGeneration);'))
      .toBeLessThan(source.indexOf('async function startGame('));
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
      .toBeLessThan(matchDeployment.indexOf('initializeRailgunForMatch(railgunActiveAt'));
    expect(matchDeployment.indexOf('const matchStartedAt = performance.now();'))
      .toBeLessThan(matchDeployment.indexOf('player.invulnerableUntil = matchStartedAt'));
    expect(matchDeployment).toContain('await weaponView.prepareBrowserWeapon(matchStartWeapon);');
    expect(matchDeployment).toContain('await prewarmExactWebGlMatchComposition();');
    // Pass 79 MAX admission: exactly ONE unsuppressed full-scene compile is
    // allowed inside match deployment - the cold-generation-fenced prewarm
    // submitted BEFORE the first guarded MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS
    // flush (the weapon-switch exercise). Every earlier prewarm renders one-deep,
    // so without it the complete composition's first draw carries cold pipeline
    // creation into a 4s-bounded flush and bounces MAX deployments to the menu.
    // More than one whole-scene compile in startGame remains forbidden.
    const fullSceneCompiles = matchDeployment.match(/await renderRuntime\.compileAndRender\(scene, camera, scene\);/g) ?? [];
    expect(fullSceneCompiles).toHaveLength(1);
    expect(matchDeployment.indexOf('await renderRuntime.compileAndRender(scene, camera, scene);'))
      .toBeLessThan(matchDeployment.indexOf('await exercisePreparedWebGpuWeaponSwitches();'));
    const webGlMatchPrewarm = source.slice(
      source.indexOf('async function prewarmExactWebGlMatchComposition('),
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
      source.indexOf('function synchronizeFrozenMatchPrimePresentation()'),
      source.indexOf('async function primeFinalWebGlMatchPresentation()'),
    );
    expect(finalWebGlPresentationSync).toContain('camera.position.copy(player.position);');
    expect(finalWebGlPresentationSync).toContain("camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');");
    expect(finalWebGlPresentationSync).toContain('weaponView.snapToMatchStartRestPose(currentViewmodelSurfaceRetreat());');
    expect(finalWebGlPresentationSync).toContain('camera.updateMatrixWorld(true);');
    expect(finalWebGlPresentationSync).not.toContain('updatePhysics(');
    // Pass 79 farcrysis MAX: the frozen final WebGPU prime is the first frame
    // with the spawn camera, restored corpse pool and rest-pose viewmodel
    // together, so its 4000ms-bounded flush still carried cold pipeline
    // creation for arena materials outside every earlier prewarm's frustum
    // (measured bounce: "WebGPU queue completion exceeded 4000 ms for
    // submission 141"). The prime must therefore compile that EXACT
    // composition once - frustum culling disabled - behind the runtime's own
    // 12s cold-generation fence, BEFORE any bounded sample flush runs. The
    // MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS guard itself is untouched.
    const finalWebGpuPrime = source.slice(
      source.indexOf('async function primeFinalWebGpuMatchPresentation('),
      source.indexOf('function buildSky()'),
    );
    expect(finalWebGpuPrime).toContain('synchronizeFrozenMatchPrimePresentation();');
    expect(finalWebGpuPrime.indexOf('await withArenaFrustumCullingDisabled(scene,'))
      .toBeGreaterThan(-1);
    expect(finalWebGpuPrime.indexOf('await withArenaFrustumCullingDisabled(scene,'))
      .toBeLessThan(finalWebGpuPrime.indexOf('for (let sample = 0; sample < 2; sample += 1) {'));
    expect(finalWebGpuPrime).toContain('renderRuntime.compileAndRender(scene, camera, scene)');
    expect(finalWebGlPresentationSync).not.toContain('weaponView.update(');
    expect(finalWebGlPrime).toContain("renderRuntime.backend === 'webgpu'");
    expect(finalWebGlPrime).toContain('synchronizeFrozenMatchPrimePresentation();');
    expect(finalWebGlPrime).toContain('atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);');
    expect(finalWebGlPresentationSync).not.toContain('function yieldPresentationFrameOrBackgroundTask()');
    expect(finalWebGlPrime).toContain('const nextForegroundPresentationFrame = async (): Promise<number> => {');
    expect(finalWebGlPrime).toContain('await new Promise<number>((resolve) => requestAnimationFrame(resolve));');
    expect(finalWebGlPrime).toContain("document.visibilityState === 'visible' && document.hasFocus()");
    expect(finalWebGlPrime).not.toContain('setTimeout(');
    expect(finalWebGlPrime.match(/await nextForegroundPresentationFrame\(\);/g)).toHaveLength(2);
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
    const liveWeaponUpdate = weaponPresentationSource.slice(
      weaponPresentationSource.indexOf('  update(pose: WeaponPose)'),
      weaponPresentationSource.lastIndexOf('\n}'),
    );
    const flameAdmissionProof = weaponPresentationSource.slice(
      weaponPresentationSource.indexOf('  async prewarmBrowserWeaponFirePresentation('),
      weaponPresentationSource.indexOf('  private async performBrowserWeaponCatalogPrewarm('),
    );
    expect(liveWeaponUpdate).not.toContain('this.enforceNearPlaneClearance(');
    expect(liveWeaponUpdate).not.toContain('measureCameraFraming(');
    expect(liveWeaponUpdate).toContain('const authoredContactRetreat = authoredNearPlaneContactRetreat(');
    expect(liveWeaponUpdate).toContain('const fireNearPlaneCapZ =');
    expect(liveWeaponUpdate).toContain('Math.min(\n        viewmodelBaseZ');
    expect(liveWeaponUpdate).toContain(') - authoredContactRetreat');
    expect(liveWeaponUpdate).toContain('flamethrowerHeldFireClearanceEntryTransitions += 1');
    expect(liveWeaponUpdate).toContain('flamethrowerHeldFireClearanceExitTransitions += 1');
    expect(liveWeaponUpdate).not.toContain('ClearanceEntryChecks');
    expect(liveWeaponUpdate).not.toContain('ClearanceExitChecks');
    expect(flameAdmissionProof).toContain("if (id === 'flamethrower') {");
    expect(flameAdmissionProof).toContain('this.enforceNearPlaneClearance(model,');
    expect(weaponPresentationSource.match(/this\.enforceNearPlaneClearance\(/g)).toHaveLength(1);
    expect(source).toContain('const minimumStableWindowMs = 1_000;');
    expect(source).toContain('const hitchThresholdMs = 50;');
    const cadenceAdmission = source.slice(
      source.indexOf('async function waitForStableMatchAdmissionCadence()'),
      source.indexOf('function synchronizeFinalWebGlMatchPrimePresentation()'),
    );
    expect(cadenceAdmission).toContain('await waitForVisibleBrowserPreparation();');
    expect(cadenceAdmission).toContain("const ownsForeground = (): boolean => document.visibilityState === 'visible' && document.hasFocus();");
    expect(cadenceAdmission).toContain("document.addEventListener('visibilitychange', onOwnershipChange);");
    expect(cadenceAdmission).toContain("window.addEventListener('focus', onOwnershipChange);");
    expect(cadenceAdmission).toContain('if (!ownsForeground()) {');
    expect(cadenceAdmission).toContain('pauseSampling();');
    expect(cadenceAdmission).toContain('now - foregroundEpochStartedAt >= maximumWaitMs');
    expect(cadenceAdmission).toContain('finish(performance.now(), true);');
    expect(cadenceAdmission).toContain('visibilityState: document.visibilityState');
    expect(cadenceAdmission).toContain('documentHasFocus: document.hasFocus()');
    expect(cadenceAdmission).toContain('fail(new Error(`Match admission renderer was ${presentation.status}');
    expect(cadenceAdmission).toContain('fail(error);');
    expect(cadenceAdmission).toContain("submitWebGpuFrame(now, false, 'warmed-live')");
    expect(cadenceAdmission).toContain('progress.submissionAdvances > 0');
    expect(cadenceAdmission).toContain('progress.completionAdvances > 0');
    expect(cadenceAdmission).toContain('endingCompletedSequence === endingSubmissionSequence');
    expect(cadenceAdmission).toContain('maximumCompletionLatencyMs <= hitchThresholdMs');
    expect(cadenceAdmission).toContain('admittedDegraded: sampledCadence.admittedDegraded || !drained');
    expect(cadenceAdmission).toContain('exact-SHA cold WebGPU release gate rejects');
    expect(source).toContain('matchAdmissionCadence: lastMatchAdmissionCadence');
    expect(source).toContain('async function submitForegroundWebGpuFrame(');
    expect(source).toContain('if (submitWebGpuFrame(performance.now(), force, submissionMode)) return;');
    expect(matchDeployment.indexOf("await settleWebGpuPresentation('Initial match');"))
      .toBeLessThan(matchDeployment.indexOf('await waitForStableMatchAdmissionCadence();'));
    expect(arenaDeployment).toContain('await withArenaFrustumCullingDisabled(scene, async () => {');
    expect(arenaDeployment).toContain('const exactScenePass = pass64TslSystems;');
    expect(arenaDeployment).toContain('await waitForVisibleBrowserPreparation();');
    expect(arenaDeployment).toContain('await exactScenePass.precompileExactScenePass(scene);');
    expect(arenaDeployment.indexOf('await exactScenePass.precompileExactScenePass(scene);'))
      .toBeLessThan(arenaDeployment.indexOf('await waitForVisibleBrowserPreparation();'));
    expect(arenaDeployment.indexOf('await waitForVisibleBrowserPreparation();'))
      .toBeLessThan(arenaDeployment.indexOf('await submitForegroundWebGpuFrame();'));
    expect(arenaDeployment.indexOf('requestStaticShadowRefresh();'))
      .toBeLessThan(arenaDeployment.indexOf('await submitForegroundWebGpuFrame();'));
    expect(arenaDeployment.indexOf('withArenaFrustumCullingDisabled(scene'))
      .toBeLessThan(arenaDeployment.indexOf('auditArenaRenderLiveness('));
    expect(source).toContain('await flushWebGpuFrames(12_000)');
    expect(source).toContain('for (let sample = 0; sample < 3; sample += 1)');
    expect(source).toContain('MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS = 4_000');
    expect(source).toContain('assertWebGpuAdmissionCompletionLatency(');
    expect(readFileSync(new URL('./gpu-retirement-scheduler.ts', import.meta.url), 'utf8'))
      .toContain('if (!isSharedMeshGeometry(geometry)) geometry.dispose();');
    expect(source).toContain("presentation.status === 'stalled'");
    expect(source).not.toContain('consecutiveMinimumTierSlowSamples');
    expect(source).not.toContain('Live WebGPU queue latency');
    expect(matchDeployment).toContain("resetWebGpuPresentationEpoch('match admitted', lastFrame);");
    expect(matchDeployment).toContain('matchWebGpuQualityFrozen = shouldFreezeAdaptiveQualityForMatch(renderRuntime.backend);');
    expect(source).toContain("reconcilePresentationScheduling(document.hidden ? 'tab visibility hidden' : 'tab visibility regained');");
    expect(source).toContain("reconcilePresentationScheduling('window focus regained');");
    const presentationEpochReset = source.slice(
      source.indexOf('function resetWebGpuPresentationEpoch('),
      source.indexOf('let lastHudAt'),
    );
    expect(presentationEpochReset).toContain('lastObservedWebGpuCompletionSequence = renderRuntime.presentationTelemetry(now).completedSequence;');
    expect(presentationEpochReset).toContain('deferredWebGpuAdaptivePixelRatio.clear();');
    expect(source).toContain("source: 'webgpu-submission' as const");
    expect(source).toContain('document.documentElement.dataset.graphicsLiveProfile = liveGraphicsProfile;');
    expect(source).toContain('LIVE_WEBGPU_PRESENTATION_STALL_MS = 1_000');
    expect(source).toContain('detectLivePresentationStall({');
    expect(source).toContain('documentFocused: document.hasFocus()');
    expect(source).toContain("resetWebGpuPresentationEpoch('foreground scheduler gap', now);");
    expect(source).toContain('currentSubmissionGapMs: presentation.progress.currentSubmissionGapMs');
    expect(source).toContain('backpressureActive: presentation.backpressureActive');
    expect(source).toContain('debugRenderPaused,');
    expect(source).toContain('renderSubmissionPaused,');
    expect(source).toContain('monitorCompletedWebGpuQueueHealth(now);');
    expect(source).toContain('deferredWebGpuAdaptivePixelRatio.takeWhenPresentationIdle(');
    expect(source).toContain("if (renderRuntime.backend === 'webgpu' && !matchWebGpuQualityFrozen)");
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
    expect(source).toContain('await renderRuntime.compileAndRender(weaponView.root, camera, scene);');
    expect(source).not.toContain('await renderRuntime.compileAndRender(priorStates[0].model, camera, scene);');
    const preparedSwitchExercise = source.slice(
      source.indexOf('async function exercisePreparedWebGpuWeaponSwitches()'),
      source.indexOf('async function waitForStableMatchAdmissionCadence()'),
    );
    expect(preparedSwitchExercise).toContain("const exercisesSniperScope = weaponId === 'sniper';");
    expect(preparedSwitchExercise).toContain('camera.fov = magnifiedFovDegrees(preferredFov, 3);');
    expect(preparedSwitchExercise).toContain('sniperScopeOverlay.hidden = false;');
    expect(preparedSwitchExercise).toContain('weaponView.suppressForSniperScope(true);');
    expect(preparedSwitchExercise).toContain('sniperScopeOverlay.hidden = true;');
    const dmrThermalExerciseStart = preparedSwitchExercise.indexOf('} else if (exercisesDmrThermal) {');
    const dmrThermalExercise = preparedSwitchExercise.slice(
      dmrThermalExerciseStart,
      preparedSwitchExercise.indexOf('camera.updateMatrixWorld(true);', dmrThermalExerciseStart),
    );
    expect(dmrThermalExercise).toContain('weaponView.suppressForFullscreenPresentation(true);');
    const dmrThermalRestoreStart = preparedSwitchExercise.lastIndexOf('} else if (exercisesDmrThermal) {');
    const dmrThermalRestore = preparedSwitchExercise.slice(
      dmrThermalRestoreStart,
      preparedSwitchExercise.indexOf('const presentation = renderRuntime.presentationTelemetry();', dmrThermalRestoreStart),
    );
    expect(dmrThermalRestore).toContain('weaponView.suppressForFullscreenPresentation(false);');
    expect(dmrThermalRestore).toContain("hudRoot.classList.remove('dmr-thermal-active');");
    expect(dmrThermalRestore).toContain('thermalGhostPresentation.sync([], false);');
    expect(source).toContain('streamedWeaponGpuPrewarmer,');
    expect(source).toContain('streamedWeaponCatalogGpuPrewarmer,');
    expect(menuLoadoutApply).toContain('const retainedCatalog = menuDeploymentAssetsPromise');
    expect(menuLoadoutApply).toContain('weaponView.prepareBrowserWeaponCatalogAssets(retainedCatalog)');
    expect(menuLoadoutApply).not.toContain('weaponView.prewarmBrowserWeaponCatalog(');
    const webGpuMenuPreparation = menuLoadoutApply.slice(menuLoadoutApply.indexOf('const generation'));
    expect(webGpuMenuPreparation).not.toContain('weaponView.setWeapon(');
    expect(source).toContain("setBootstrapStage('ready')");
  });

  it('yields cold pool construction, vocabulary state walks and fenced retirement cleanup', () => {
    const grenadeSource = readFileSync(new URL('./grenade-presentation.ts', import.meta.url), 'utf8');
    const killstreakSource = readFileSync(new URL('./killstreak-presentation.ts', import.meta.url), 'utf8');
    const operatorSource = readFileSync(new URL('./operator-model.ts', import.meta.url), 'utf8');
    const runtimeSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const operatorPrewarm = runtimeSource.slice(
      runtimeSource.indexOf('async function prewarmBotPresentations()'),
      runtimeSource.indexOf('function activateDormantBot('),
    );
    const webGpuOperatorPrewarm = operatorPrewarm.slice(
      operatorPrewarm.indexOf("if (renderRuntime.backend === 'webgpu')"),
      operatorPrewarm.indexOf('} else {'),
    );
    const retirementSource = readFileSync(new URL('./gpu-retirement-scheduler.ts', import.meta.url), 'utf8');
    const retirementDrain = retirementSource.slice(
      retirementSource.indexOf('async function drainDeferredGpuRetirements()'),
      retirementSource.indexOf('function scheduleDeferredGpuRetirement('),
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
    expect(operatorPrewarm).toContain('...corpsePresentationPool.map((entry) => entry.root)');
    expect(operatorPrewarm).toContain('await withArenaFrustumCullingDisabled(scene, async () => {');
    expect(operatorPrewarm).toContain('const rootsPerSubmission = 2;');
    expect(operatorPrewarm).toContain('const batch = operatorRoots.slice(offset, offset + rootsPerSubmission);');
    expect(operatorPrewarm).toContain('await Promise.all(batch.map((root) => renderRuntime.compileAndRender(root, camera, scene)));');
    expect(operatorPrewarm).toContain('await yieldDeploymentPrewarmFrame();');
    expect(operatorPrewarm).not.toContain('Promise.all(operatorRoots.map((root) => renderRuntime.compileAndRender(root, camera, scene)))');
    expect(webGpuOperatorPrewarm).not.toContain('renderRuntime.compileAndRender(scene, camera, scene)');
    expect(runtimeSource).toContain('const restoreCorpsePoolPrewarm = stageCorpsePresentationPoolForPrewarm();\n  try {\n    await prewarmBotPresentations();\n  } catch (error) {\n    restoreCorpsePoolPrewarm();\n    throw error;\n  }');
    expect(runtimeSource).toContain('scheduleBrowserPreparationIdleTask(resolve, 180)');
    expect(runtimeSource.match(/await yieldBrowserPreparationFrame\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(retirementDrain).toContain('for (const [retirementIndex, retirement] of batch.entries())');
    expect(retirementDrain).toContain('await yieldDeferredGpuRetirementTask();');
    // Pass 79 extraction: legacy-main must wire the real backend and the
    // flushWebGpuFrames fence into the scheduler, never a stub.
    expect(runtimeSource).toContain("const gpuRetirement = createGpuRetirementScheduler({\n  backend: () => renderRuntime.backend,\n  flushSubmittedFrames: (timeoutMs?: number) => flushWebGpuFrames(timeoutMs),\n});");
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
    expect(source).toContain('maximumInFlightSubmissions === 2');
    expect(source).toContain("presentation.submissionMode === 'warmed-live'");
    expect(source).toContain('advancedBy <= maximumInFlightSubmissions');
    expect(source).toContain('completionLatencyMs <= maximumCompletionMs');
    expect(source).toContain('completionProgressGapMs <= maximumCompletionMs');
    expect(source).toContain('recoveryWindowMs >= minimumWindowMs');
    expect(source).toContain('minimumWindowMs: minimumCaptureRecoveryWindowMs');
    expect(source).toContain('qualifyingCompletionCount += advancedBy');
    expect(source).toContain('qualifyingCompletionCount >= requiredCompletions');
    expect(source).toContain('qualifyingFrontierCount: consecutiveCompletionFrontiers.length');
    expect(source).toContain('firstQualifyingCompletion: consecutiveCompletionFrontiers[0]');
    expect(source).toContain('lastQualifyingCompletion: consecutiveCompletionFrontiers.at(-1)');
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
    expect(pilotWorkflow).toContain("const sampleWorkflow = () => api.sampleEnduranceHealth('piloted-workflow');");
    expect(pilotWorkflow).not.toContain('api.snapshot()');
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
    expect(carpetWorkflow).toContain("const sampleWorkflow = () => api.sampleEnduranceHealth('carpet-workflow');");
    expect(carpetWorkflow).not.toContain('api.snapshot()');
    expect(carpetWorkflow).toContain("new KeyboardEvent('keydown', { code: 'KeyF'");
    expect(carpetWorkflow).toContain("marker.shape === 'ground-x'");
    expect(carpetWorkflow).toContain("marker.shape === 'corridor'");
    const enduranceSampler = runtimeSource.slice(
      runtimeSource.indexOf('function sampleEnduranceHealth('),
      runtimeSource.indexOf('function sampleAdmissionState()'),
    );
    expect(enduranceSampler).toContain("detail === 'carpet-workflow'");
    expect(enduranceSampler).toContain("entity.kind === 'aircraft'");
    expect(enduranceSampler).toContain("entity.id.includes('carpet-aircraft')");
    expect(enduranceSampler).toContain('killstreakPresentation.carpetWorkflowTelemetry()');
    expect(enduranceSampler).not.toContain('killstreakPresentation.telemetry()');
    const captureCameraUpdate = runtimeSource.slice(
      runtimeSource.lastIndexOf('if (debugCaptureCameraActive) {', runtimeSource.indexOf('updateCrosshairSupportPreview();')),
      runtimeSource.indexOf('updateCrosshairSupportPreview();'),
    );
    expect(captureCameraUpdate).toContain('camera.updateWorldMatrix(true, false);');
    expect(captureCameraUpdate).not.toContain('camera.updateMatrixWorld(true);');
    expect(carpetWorkflow).toContain('result.aircraft.displacementM <= 0.1');
    expect(carpetWorkflow).toContain("}, 'authored shell drop');");
    expect(carpetWorkflow).toContain("}, 'flight and first impact');");
    expect(carpetWorkflow).toContain('result.impactPresentation.droppedBombShells <= result.impactPresentation.baselineBombShells');
    expect(carpetWorkflow).toContain('result.impactPresentation.impactFlashes <= result.impactPresentation.baselineImpactFlashes');

    expect(verifierSource).toContain('const requiredLifecycleRecoveryCyclesPerVisit = 2;');
    expect(lifecycleWorkflow).toContain('api.sampleEnduranceHealth()');
    expect(lifecycleWorkflow).not.toContain('api.snapshot()');
    expect(lifecycleWorkflow).toContain('await coverPage.bringToFront();');
    expect(lifecycleWorkflow).toContain('if (!nativeLifecycleEventsComplete)');
    expect(lifecycleWorkflow.indexOf('await coverPage.bringToFront();')).toBeLessThan(
      lifecycleWorkflow.indexOf('if (!nativeLifecycleEventsComplete)'),
    );
    expect(lifecycleWorkflow).toContain("visibilityState = 'hidden';");
    expect(lifecycleWorkflow).toContain("document.dispatchEvent(new Event('visibilitychange'));");
    expect(lifecycleWorkflow).toContain("window.dispatchEvent(new Event('blur'));");
    expect(lifecycleWorkflow).toContain("window.dispatchEvent(new Event('focus'));");
    expect(lifecycleWorkflow).toContain("lifecycleStimulus: nativeLifecycleEventsComplete ? 'native-page-focus' : 'headless-event-fallback'");
    expect(lifecycleWorkflow).toContain("entry.type === 'visibilitychange' && entry.visibilityState === 'hidden'");
    expect(lifecycleWorkflow).toContain("entry.type === 'visibilitychange' && entry.visibilityState === 'visible'");
    expect(lifecycleWorkflow).toContain(
      '/^(?:tab visibility regained|window focus regained) · recovery [1-9]\\d*$/',
    );
    expect(lifecycleWorkflow).toContain("lifecycleResetReasonPattern.test(receipt.framePacing.lastResetReason ?? '')");

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
    expect(drainIsolation).toContain('Resolve with the same allocation-light health sample that first');
    expect(drainIsolation).toContain('api.sampleEnduranceHealth()');
    expect(drainIsolation).not.toContain('api.snapshot()');
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
      runtimeSource.indexOf('function sampleEnduranceHealth('),
      runtimeSource.indexOf('const debugWindow = window'),
    );
    expect(enduranceHealth).toContain('renderRuntime.healthTelemetry()');
    expect(enduranceHealth).toContain('weaponView.browserCatalogHealth()');
    expect(enduranceHealth).not.toContain('snapshot()');
    expect(enduranceHealth).not.toContain('estimateRendererResidency');
    expect(enduranceHealth).not.toContain('presentationState()');
    expect(enduranceHealth).not.toContain('.traverse(');
    expect(enduranceHealth).not.toContain('killstreakPresentation.telemetry()');
    expect(runtimeSource).toContain(
      'sampleEnduranceHealth: (detail?: EnduranceHealthDetail) => ReturnType<typeof sampleEnduranceHealth>;',
    );
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

  it('quarantines the paused admission-audit tail before measured live endurance', () => {
    const source = readFileSync(new URL('../scripts/qa/verify-pass65-webgpu-endurance.mjs', import.meta.url), 'utf8');
    const drain = source.slice(
      source.indexOf('async function pauseAndDrainPresentation('),
      source.indexOf('async function requireCaptureRecoveryCompletions('),
    );
    const recovery = source.slice(
      source.indexOf('async function requireCaptureRecoveryCompletions('),
      source.indexOf('async function captureCanvasOnly('),
    );
    expect(drain).toContain('const health = api.sampleEnduranceHealth();');
    expect(drain).not.toContain('api.snapshot()');
    expect(recovery).toContain('api.sampleEnduranceHealth()?.runtime?.presentation');
    expect(recovery).not.toContain('api.snapshot()');
    expect(recovery).toContain('maximumInFlightSubmissions === 2');
    expect(recovery).toContain('advancedBy <= maximumInFlightSubmissions');
    expect(recovery).toContain('completionLatencyMs <= maximumCompletionMs');
    expect(recovery).toContain('completionProgressGapMs <= maximumCompletionMs');
    expect(recovery).toContain('qualifyingCompletionCount >= requiredCompletions');
    expect(recovery).toContain('recoveryWindowMs >= minimumWindowMs');
    expect(recovery).toContain('api.setRenderPaused(true);\n            resolve({');
    expect(source).toContain('const requiredCaptureRecoveryCompletions = 12;');
    expect(source).toContain('const minimumCaptureRecoveryWindowMs = 250;');
    expect(source).toContain('const maximumCaptureRecoveryCompletionMs = 50;');

    const auditIndex = source.indexOf('const arenaAdmissionAudit = await page.evaluate');
    const baselineIndex = source.indexOf('const auditTailBaseline = await page.evaluate', auditIndex);
    const unpauseIndex = source.indexOf('api.setRenderPaused(false);', baselineIndex);
    const recoveryIndex = source.indexOf('const auditTailRecovery = await requireCaptureRecoveryCompletions', baselineIndex);
    const heldIndex = source.indexOf('const auditTailHeldFrontier = await pauseAndDrainPresentation(page);', recoveryIndex);
    const liveIndex = source.indexOf('while (measuredLiveDurationMs < durationMs) {', heldIndex);
    expect(auditIndex).toBeGreaterThan(0);
    expect(baselineIndex).toBeGreaterThan(auditIndex);
    expect(unpauseIndex).toBeGreaterThan(baselineIndex);
    expect(recoveryIndex).toBeGreaterThan(unpauseIndex);
    expect(heldIndex).toBeGreaterThan(recoveryIndex);
    expect(liveIndex).toBeGreaterThan(heldIndex);
    const boundary = source.slice(baselineIndex, liveIndex);
    expect(boundary).toContain('presentation.submissionSequence !== presentation.completedSequence');
    expect(boundary).toContain('baseline: summarizeHeldFrontier(auditTailBaseline)');
    expect(boundary).toContain('recovery: summarizeCaptureRecovery(auditTailRecovery)');
    expect(boundary).toContain('heldFrontier: summarizeHeldFrontier(auditTailHeldFrontier)');
    expect(source).toContain('activeStressBudget,\n      arenaAdmissionRecovery,');
  });

  it('samples presentation progress without a full scene snapshot at frame-window boundaries', () => {
    const runtimeSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(runtimeSource).toContain('samplePresentationTelemetry: () => ReturnType<typeof renderRuntime.presentationTelemetry>;');
    expect(runtimeSource).toContain('samplePresentationTelemetry: () => renderRuntime.presentationTelemetry(),');

    const verifierSource = readFileSync(new URL('../scripts/qa/verify-pass65-frame-pacing.ts', import.meta.url), 'utf8');
    const frameWindow = verifierSource.slice(
      verifierSource.indexOf('async function collectFrameWindow('),
      verifierSource.indexOf('async function runTrial('),
    );
    expect(frameWindow).toContain('samplePresentationTelemetry: () => Record<string, any>');
    expect(frameWindow).toContain('target.__ATOMIC_ACRES_DEBUG__?.samplePresentationTelemetry()');
    expect(frameWindow).not.toContain('.snapshot()');
    expect(frameWindow).toContain('const presentationStarted = readPresentation();');
    expect(frameWindow).toContain('const presentationEnded = readPresentation();');
  });

  it('rejects degraded foreground cadence in the cold physical-menu gate', () => {
    const source = readFileSync(new URL('../scripts/qa/verify-pass65-cold-webgpu-admission.mjs', import.meta.url), 'utf8');
    expect(source).toContain("state.bootstrap.stage === 'failed'");
    expect(source).toContain('admissionCadence.admittedDegraded !== false');
    expect(source).toContain("admissionCadence.visibilityState !== 'visible'");
    expect(source).toContain("admissionCadence.backend !== 'webgpu'");
    expect(source).toContain('admissionCadence.drained !== true');
    expect(source).toContain('admissionCadence.submissionAdvances <= 0');
    expect(source).toContain('admissionCadence.completionAdvances <= 0');
    expect(source).toContain('admissionCadence.endingCompletedSequence !== admissionCadence.endingSubmissionSequence');
    expect(source).toContain('admissionCadence.maximumCompletionLatencyMs > maximumAdmissionGapMs');
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

  it('keeps prerecorded-menu gameplay deferred while proving the one fenced retained-asset submission', () => {
    const source = readFileSync(new URL('../scripts/qa/verify-pass64-webgpu.mjs', import.meta.url), 'utf8');
    const gate = source.slice(
      source.indexOf('const deferredMenuState = await switchPage.evaluate'),
      source.indexOf('const switchReceipts = [];'),
    );
    expect(gate).toContain('constructionCount: state.arenaSelection.streaming.constructionCount');
    expect(gate).toContain('residentArenaRoots: state.arenaSelection.streaming.residentArenaRoots');
    expect(gate).toContain("gameplayArena !== 'deferred-until-deployment'");
    expect(gate).toContain("previewMode !== 'prerecorded-video'");
    expect(gate).toContain('menuVisible !== true');
    expect(gate).toContain('gameStarted !== false');
    expect(gate).toContain('submissionSequence !== 1');
    expect(gate).toContain('completedSequence !== deferredMenuState.submissionSequence');
    expect(gate).toContain("presentationStatus !== 'healthy'");
    expect(gate).toContain('completionFailures !== 0');
    expect(gate).toContain('deviceLost !== false');
    expect(gate).toContain('uncapturedErrors !== 0');
    expect(gate).toContain('preparation?.completed !== true');
    expect(gate).toContain('preparation?.error !== null');
    expect(gate).toContain('weaponCatalog?.loaded !== deferredMenuState.weaponCatalog?.available');
    expect(gate).toContain('weaponCatalog?.gpuReady !== deferredMenuState.weaponCatalog?.available');
    expect(gate).toContain('weaponCatalog?.retainedCount !== deferredMenuState.weaponCatalog?.available');
    expect(gate).not.toContain('submissionSequence !== 0');
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
