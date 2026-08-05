import { expect, test } from '@playwright/test';

test('capture viewmodel visibility changes synchronously without a gameplay-frame race', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto('/?release=latest&renderer=webgl2&render=performance&map=gun-range&seed=650065');
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 45_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: 30_000 });
  const visibility = await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setCaptureViewmodelHidden(false);
    const shown = debug.snapshot().sniperScope.viewmodelVisible;
    debug.setCaptureViewmodelHidden(true);
    const hiddenImmediately = debug.snapshot().sniperScope.viewmodelVisible;
    debug.setCaptureViewmodelHidden(false);
    const restoredImmediately = debug.snapshot().sniperScope.viewmodelVisible;
    return { shown, hiddenImmediately, restoredImmediately };
  });
  expect(visibility).toEqual({ shown: true, hiddenImmediately: false, restoredImmediately: true });
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const [x, y, z] = debug.snapshot().player.position;
    debug.setCaptureCameraPose(x, y, z, 0.4, -0.2, 47, 6_500, 65);
  });
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().sniperScope.cameraFov)).toBe(47);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null));
  expect(runtimeErrors).toEqual([]);
});
