import { expect, test } from '@playwright/test';

test('renders the lowered dynamic ocean and symmetric authored Rustworks layout', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=72254&map=rustworks-1v1');
  await page.waitForFunction(() => {
    const api = (window as unknown as {
      __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any };
    }).__ATOMIC_ACRES_DEBUG__;
    const state = api?.snapshot();
    return state?.weaponReady === true
      && state?.render?.rustworksBlender?.status === 'ready';
  }, undefined, { timeout: 30_000 });

  await page.evaluate(() => {
    (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: { startSolo: () => void };
    }).__ATOMIC_ACRES_DEBUG__.startSolo();
  });
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 15_000 });

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
  });
  expect(telemetry.water.waveAmp).toBeCloseTo(1.55);
  expect(telemetry.rustworksBlender).toMatchObject({
    status: 'ready',
    assetVersion: 'pass54-v2',
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/rustworks-symmetric-container-ring.png', animations: 'disabled' });

  await page.evaluate(() => {
    (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: {
        setCaptureCameraPose: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
      };
    }).__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(24.5, 4.2, 0, -Math.PI / 2, -0.24);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/rustworks-lowered-dynamic-ocean.png', animations: 'disabled' });
});
