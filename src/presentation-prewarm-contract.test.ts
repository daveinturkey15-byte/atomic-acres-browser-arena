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
    expect(arenaDeployment.match(/renderRuntime\.compile\(scene, camera\)/g)).toHaveLength(1);
    expect(matchDeployment.match(/renderRuntime\.compile\(scene, camera\)/g)).toHaveLength(1);
    expect(matchDeployment).toContain('const matchActiveOverdrivePrewarm = selectedArena.overdrive;');
    expect(matchDeployment).toContain('overdriveRoot.visible = true;');
    expect(matchDeployment).toContain('overdriveRoot.visible = selectedArena.overdrive;');
    expect(source).toContain('overdriveRoot.visible = gameStarted;');
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
    expect(source).toContain('const grenadeWorldPresentationPool = new GrenadeWorldPresentationPool(scene);');
    expect(source).toContain('await grenadeWorldPresentationPool.prewarm(renderRuntime, camera, sceneGeneration);');
    expect(source).not.toContain('createGrenadePresentation(');
    expect(source).not.toContain('disposeGrenadePresentation(');
    expect(source).toContain("bootstrapStage = 'prewarming-weapon-catalog'");
    expect(matchDeployment).toContain('await weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(selectedArena.id));');
    expect(source).toContain("const rangeSidearm: WeaponId = localDhv === 'X' ? 'magnum' : 'pistol';");
    expect(matchDeployment.indexOf('prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(selectedArena.id))'))
      .toBeLessThan(matchDeployment.indexOf('weaponView.setWeapon(player.weapon, true);'));
    expect(arenaDeployment).toContain('await weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(nextSelection.id));');
    expect(arenaDeployment.indexOf('weaponPrewarmCatalogForArena(nextSelection.id)'))
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
    expect(matchDeployment).toContain("await settleWebGpuPresentation('Initial match')");
    expect(source).toContain('submitWebGpuFrame(performance.now(), true)');
    expect(source).toContain('await flushWebGpuFrames(12_000)');
    expect(source).toContain('adaptiveQuality.forceDownshift(');
    expect(source).toContain('const streamedWeaponGpuPrewarmer: WeaponViewmodelGpuPrewarmer | undefined');
    expect(source).toContain('streamedWeaponGpuPrewarmQueue.run(() => runStreamedWeaponGpuPrewarm(model, context))');
    expect(source).toContain('revealAncestors();');
    expect(source).toContain('for (const [ancestor, visible] of ancestorVisibility) ancestor.visible = visible;');
    const weaponPrewarm = source.slice(
      source.indexOf('const runStreamedWeaponGpuPrewarm:'),
      source.indexOf('const streamedWeaponGpuPrewarmer:'),
    );
    expect(weaponPrewarm).not.toContain('multiplyScalar(0.0001)');
    expect(source).toContain('await renderRuntime.compileAndRender(model, camera, scene);');
    expect(source).toContain('streamedWeaponGpuPrewarmer,');
    expect(menuLoadoutApply).toContain('weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(selectedArena.id))');
    expect(menuLoadoutApply.indexOf('prewarmBrowserWeaponCatalog'))
      .toBeLessThan(menuLoadoutApply.indexOf('weaponView.setWeapon(selectedWeapon, true)'));
    expect(source).toContain("bootstrapStage = 'ready'");
  });

  it('adds the four readiness terms and bootstrap stage to timeout evidence', () => {
    const source = readFileSync(new URL('../tests/e2e/atomic-acres.spec.ts', import.meta.url), 'utf8');
    for (const term of ['statusKind', 'soloDisabled', 'weaponReady', 'originalArtLoaded', 'bootstrap']) {
      expect(source).toContain(term);
    }
    expect(source).toContain('Readiness diagnostic:');
  });
});
