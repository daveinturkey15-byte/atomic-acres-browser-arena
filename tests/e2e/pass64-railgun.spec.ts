import { expect, test } from '@playwright/test';

test('railgun exits ADS, enforces the 1.5 second rechamber, and permits a released second ADS shot', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?renderer=webgl2&render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=6402&map=atomic-acres');
  await page.waitForFunction(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any } }).__ATOMIC_ACRES_DEBUG__;
    return api?.snapshot().weaponReady === true;
  }, undefined, { timeout: 45_000 });

  await page.evaluate(async () => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    await api.selectArena('atomic-acres');
    api.startSolo();
    api.setBotsFrozen(true);
  });
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active'
    && (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }).__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.id === 'atomic-acres', undefined, { timeout: 15_000 });

  const acquired = await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    const staged = api.stageRailgunSpawn(0);
    api.teleportPlayer(...staged.pickupPosition);
    return { interacted: api.interactRailgun(), state: api.snapshot() };
  });
  expect(acquired.interacted).toBe(true);
  expect(acquired.state.railgun).toMatchObject({ status: 'held', roundsRemaining: 8, localHolder: true });
  expect(acquired.state.player.weapon).toBe('railgun');
  await page.waitForTimeout(500);

  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: any }
  ).__ATOMIC_ACRES_DEBUG__.setAds(true));
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.thermalVisible === true);
  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: any }
  ).__ATOMIC_ACRES_DEBUG__.fireOnce());

  const first = await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot());
  expect(first.railgun).toMatchObject({ roundsRemaining: 7, adsResetRequired: true, rechamberPresentationActive: true });
  expect(first.railgun.presentation).toMatchObject({ beamPresentations: 1, thermalActive: false });
  expect(first.audio.railgun).toMatchObject({ local: 1, layerCount: 8, pressureDuration: 0.62 });
  expect(first.textChat.adsHeld).toBe(false);
  expect(first.railgun.thermalVisible).toBe(false);

  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: any }
  ).__ATOMIC_ACRES_DEBUG__.fireOnce());
  expect(await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.roundsRemaining)).toBe(7);

  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: any }
  ).__ATOMIC_ACRES_DEBUG__.setAds(false));
  await page.waitForFunction(() => {
    const railgun = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }).__ATOMIC_ACRES_DEBUG__.snapshot().railgun;
    return railgun.adsResetRequired === false && railgun.chamberReadyAtHostTimeMs === 0;
  }, undefined, { timeout: 5_000 });
  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: any }
  ).__ATOMIC_ACRES_DEBUG__.setAds(true));
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.thermalVisible === true);
  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: any }
  ).__ATOMIC_ACRES_DEBUG__.fireOnce());

  const second = await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    const beforeReload = api.snapshot().railgun.roundsRemaining;
    api.reload();
    return { beforeReload, afterReload: api.snapshot().railgun.roundsRemaining, state: api.snapshot() };
  });
  expect(second.beforeReload).toBe(6);
  expect(second.afterReload).toBe(6);
  expect(second.state.player.reserve).toBe(0);
});
