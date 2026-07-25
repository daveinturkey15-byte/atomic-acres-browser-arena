import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('fails the default playable WebGPU route closed on the CI adapter without mounting gameplay', async ({ page }) => {
  const pageError = page.waitForEvent('pageerror');
  await page.goto('/?render=blender');
  const error = await pageError;
  expect(error.message).toMatch(/WebGPU|TSL/);
  const state = await page.evaluate(() => ({
    backend: document.documentElement.dataset.renderBackend,
    debugApi: '__ATOMIC_ACRES_DEBUG__' in window,
    blocked: document.querySelector('#webgpu-gameplay-blocked')?.textContent,
  }));
  expect(state).toMatchObject({ backend: 'blocked', debugApi: false });
  expect(state.blocked).toContain('GAMEPLAY RENDERER BLOCKED');
  expect(state.backend).not.toBe('webgl2');
});

test('reports the active WebGL adapter and offscreen HDR samples separately', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?renderer=webgl2&render=blender&signal=on&grass=off&mist=off&clouds=off&rays=off&seed=6401&map=skyline-terminal');
  await page.waitForFunction(() => {
    const state = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any } }).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true && state?.render?.atomicSignal?.samples > 0;
  }, undefined, { timeout: 45_000 });
  const render = await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().render);
  expect(render.runtime).toMatchObject({
    requestedBackend: 'webgl2',
    actualBackend: 'webgl2',
    initialized: true,
    failClosed: false,
    renderPipelineApi: 'legacy-direct',
    principalHdrSamples: render.atomicSignal.principalHdrSamples,
    bloomSamples: 0,
  });
  expect(render.atomicSignal.principalHdrSamples).toBeGreaterThan(0);
  expect(render.atomicSignal.bloomSamples).toBe(0);
  expect(render.atomicSignal.targetValidated).toBe(true);
  expect(render.atomicSignal.outputValidated).toBe(true);
});

test('renders Terminal cabin ceiling with only shadowed contrast keys and an open boarding route', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?renderer=webgl2&render=blender&signal=on&grass=off&mist=off&clouds=off&rays=off&seed=6401&map=skyline-terminal');
  await page.waitForFunction(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any } }).__ATOMIC_ACRES_DEBUG__;
    return api?.snapshot().weaponReady === true;
  }, undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
  });
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true, undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    api.setCaptureCameraPose(0, 4.25, 2, -Math.PI / 2, -0.38);
  });
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().render.playableScene.renderWatchdog.lastAudit !== null, undefined, { timeout: 10_000 });
  await page.waitForTimeout(350);
  const evidence = await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    const state = api.snapshot();
    return {
      lightOcclusion: state.render.arenaContrastLighting,
      renderWatchdog: state.render.playableScene.renderWatchdog,
      boardingBlocked: api.collisionProbeAt(0, 4.25, 1),
      renderedMeshes: api.renderAudit().map((entry: { name: string }) => entry.name),
    };
  });
  expect(evidence.lightOcclusion.arenaId).toBe('skyline-terminal');
  expect(evidence.renderWatchdog).toMatchObject({
    status: 'healthy',
    fatal: false,
    lastAudit: {
      arenaId: 'skyline-terminal',
      rootAttached: true,
      rootVisible: true,
      definitionMatches: true,
      activeDefinitionRoots: 1,
    },
  });
  expect(evidence.renderWatchdog.lastAudit.visibleRenderableDescendants).toBeGreaterThan(20);
  expect(evidence.renderWatchdog.lastAudit.cameraLayerRenderableDescendants).toBeGreaterThan(20);
  // Software Chromium deliberately bypasses the rig. Any admitted hardware
  // keys must all be shadowed; zero unshadowed keys is also valid.
  expect([0, 2]).toContain(evidence.lightOcclusion.activeLights);
  expect(evidence.lightOcclusion.shadowCastingLights).toBe(evidence.lightOcclusion.activeLights);
  expect(evidence.lightOcclusion.occlusion).toMatchObject({
    activeLocalLights: evidence.lightOcclusion.activeLights,
    shadowedLocalLights: evidence.lightOcclusion.activeLights,
    violations: [],
  });
  expect(evidence.boardingBlocked).toBe(false);
  // The cabin-centre camera faces one half at a time; unit geometry gates
  // separately prove that both halves exist and preserve the central gap.
  expect(evidence.renderedMeshes.filter((name: string) => name.startsWith('skyline-quality-cabin-ceiling-shell-')).length).toBeGreaterThanOrEqual(1);
  await mkdir('artifacts/pass64/renderer-foundation', { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/pass64/renderer-foundation/terminal-cabin-ceiling.png', animations: 'disabled' });
});
