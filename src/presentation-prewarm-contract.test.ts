import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const presentationSources = [
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
      source.indexOf('function bootstrapMenuPreview()'),
    );
    const menuBootstrap = source.slice(source.indexOf('function bootstrapMenuPreview()'), source.indexOf('bootstrapMenuPreview();'));
    const arenaDeployment = source.slice(
      source.indexOf('async function performArenaSelection('),
      source.indexOf('function activateArenaSelection('),
    );
    const matchDeployment = source.slice(source.indexOf('async function startGame('), source.indexOf('function randomNonce()'));
    expect(source).toContain('renderRuntime.compileAndRender(nukeShockwave, camera, scene)');
    expect(source).toContain('renderRuntime.compileAndRender(overdriveRoot, camera, scene)');
    expect(sharedAssets).not.toContain('renderRuntime.compile(scene, camera)');
    expect(menuBootstrap).not.toContain('renderRuntime.compile(scene, camera)');
    expect(arenaDeployment.match(/renderRuntime\.compile\(scene, camera\)/g)).toHaveLength(1);
    expect(matchDeployment.match(/renderRuntime\.compile\(scene, camera\)/g)).toHaveLength(1);
    expect(source).not.toContain('const renderer = renderRuntime.renderer as unknown as THREE.WebGLRenderer');
    expect(source).toContain("bootstrapStage = 'prewarming-grenade-explosion'");
    expect(source).toContain("bootstrapStage = 'prewarming-overdrive'");
    expect(menuBootstrap).toContain("document.documentElement.dataset.gameplayArena = 'deferred-until-deployment'");
    expect(arenaDeployment).toContain("await prepareSharedGameplayAssets()");
    expect(matchDeployment).toContain("await settleWebGpuPresentation('Initial match')");
    expect(source).toContain('submitWebGpuFrame(performance.now(), true)');
    expect(source).toContain('await flushWebGpuFrames(12_000)');
    expect(source).toContain('adaptiveQuality.forceDownshift(');
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
