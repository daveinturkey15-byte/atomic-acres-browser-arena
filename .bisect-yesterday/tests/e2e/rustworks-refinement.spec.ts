import { expect, test } from '@playwright/test';

const renderer = process.env.PASS66_WATER_RENDERER ?? 'webgl2';

test('renders the lowered dynamic ocean and symmetric authored Rustworks layout', async ({ page }) => {
  test.setTimeout(90_000);
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&renderer=${renderer}${requireWebGpu}&render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=72254&map=rustworks-1v1`);
  await page.waitForFunction(() => {
    const api = (window as unknown as {
      __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any };
    }).__ATOMIC_ACRES_DEBUG__;
    const state = api?.snapshot();
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return state?.bootstrap?.stage === 'ready' && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });

  await page.evaluate(() => {
    (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: { startSolo: () => void };
    }).__ATOMIC_ACRES_DEBUG__.startSolo();
  });
  await page.waitForFunction(() => {
    const state = (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
    ).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.matchPhase === 'active'
      && state.render.qualityAssetStreaming.rustworks === 'ready';
  }, undefined, { timeout: 60_000 });

  const telemetry = await page.evaluate(() => {
    const api = (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: {
        setBotsFrozen: (frozen: boolean) => void;
        setCaptureViewmodelHidden: (hidden: boolean) => void;
        setCaptureCameraPose: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
        snapshot: () => any;
      };
    }).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    api.setCaptureCameraPose(0, 46, 0, 0, -1.48);
    const state = api.snapshot();
    return {
      water: state.render.water,
      tslWater: state.render.playableScene.tslSystemVisibility,
      runtime: state.render.runtime,
      rustworksBlender: state.render.rustworksBlender,
      arenaId: state.arenaSelection.id,
    };
  });

  expect(telemetry.arenaId).toBe('rustworks-1v1');
  expect(telemetry.water).toMatchObject({
    enabled: true,
    physicsActive: true,
    waterLevel: -19.5,
    nearSize: 960,
    horizonRadius: 3_200,
    waveBands: 5,
    waveAuthority: 'shared-render-physics-ocean-spectrum',
  });
  expect(telemetry.water.waveAmp).toBeCloseTo(1.55);
  if (renderer === 'webgpu') {
    expect(telemetry.runtime).toMatchObject({
      actualBackend: 'webgpu',
      deviceLost: false,
      uncapturedErrors: 0,
    });
    expect(telemetry.tslWater).toMatchObject({
      waterVisible: true,
      waterWaveBands: 5,
      waterWaveAmplitude: 1.55,
      waterWaveAuthority: 'shared-render-physics-ocean-spectrum',
    });
  }
  expect(telemetry.rustworksBlender).toMatchObject({
    // The 206 MiB duplicate GLB overlay is deliberately retired. Quality mode
    // now renders the procedural gameplay-authority root instead of loading a
    // second, permanently hidden tower merely to satisfy stale telemetry.
    status: 'idle',
    assetVersion: null,
    overlayRetired: true,
    overlayVisible: false,
  });
  await page.waitForFunction(() => {
    const banner = document.querySelector<HTMLElement>('#arena-banner');
    const countdown = document.querySelector<HTMLElement>('#countdown');
    return (!banner || banner.hidden) && (!countdown || countdown.hidden);
  }, undefined, { timeout: 10_000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `test-results/rustworks-symmetric-container-ring-${renderer}.png`, animations: 'disabled' });

  await page.evaluate(() => {
    (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: {
        setCaptureCameraPose: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
      };
    }).__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(34, -16.8, 0, -Math.PI / 2, -0.12);
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `test-results/rustworks-lowered-dynamic-ocean-${renderer}-t0.png`, animations: 'disabled' });
  await page.waitForTimeout(2_500);
  await page.screenshot({ path: `test-results/rustworks-lowered-dynamic-ocean-${renderer}-t1.png`, animations: 'disabled' });
});
