import { expect, test } from '@playwright/test';

const renderer = process.env.PASS66_RAILGUN_RENDERER ?? 'webgl2';
const renderProfile = process.env.PASS66_RAILGUN_RENDER_PROFILE ?? (renderer === 'webgpu' ? 'blender' : 'performance');

test('railgun restores its through-wall thermal scope, exits ADS, and enforces rechamber', async ({ page }, testInfo) => {
  test.setTimeout(renderer === 'webgpu' ? 150_000 : 90_000);
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&renderer=${renderer}${requireWebGpu}&render=${renderProfile}&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=6402&map=atomic-acres`);
  expect(new URL(page.url()).pathname).toBe('/channels/the-big-one/');
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
  if (renderer === 'webgpu') {
    expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render.runtime)).toMatchObject({
      actualBackend: 'webgpu', deviceLost: false, uncapturedErrors: 0, presentation: { status: 'healthy' },
    });
  }

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

  const thermalStage = await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    // Aim through the solid centre section of the Aqua house front wall. The
    // first solo bot is hostile and is staged just inside that wall, so this is
    // a real through-geometry optic gate rather than an unobstructed marker.
    api.teleportPlayer(-9, 1.7, -12.5, 0, 0);
    api.placeBotRelative(0, 9);
    api.setBotsFrozen(true);
    return {
      wallBlocked: api.segmentBlocked(-9, -12.5, -9, -21.5),
      bot: api.snapshot().bots[0],
    };
  });
  expect(thermalStage.wallBlocked).toBe(true);
  expect(thermalStage.bot).toMatchObject({ alive: true });

  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: any }
  ).__ATOMIC_ACRES_DEBUG__.setAds(true));
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.thermalVisible === true);
  await page.waitForFunction(() => {
    const thermal = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } })
      .__ATOMIC_ACRES_DEBUG__.snapshot().railgun.presentation;
    return thermal.thermalActive === true && thermal.thermalContacts >= 1 && thermal.worldSilhouettes >= 1;
  });
  const thermal = await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.presentation);
  expect(thermal).toMatchObject({
    thermalActive: true,
    thermalThroughGeometry: true,
  });
  expect(thermal.thermalContacts).toBeGreaterThanOrEqual(1);
  expect(thermal.worldSilhouettes).toBeGreaterThanOrEqual(1);
  const settledScope = await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot());
  expect(settledScope.railgunScope).toMatchObject({
    contract: 'railgun-authored-clear-scope-v1',
    active: true,
    magnification: 2.5,
    fovSettled: true,
    adsSettled: true,
    lens: 'clear-open-aperture',
    reticle: 'camera-forward-centred',
    viewmodelSuppressed: true,
    viewmodelVisible: false,
  });
  expect(
    Math.tan(settledScope.railgunScope.baseFov * Math.PI / 360)
      / Math.tan(settledScope.railgunScope.targetFov * Math.PI / 360),
  ).toBeCloseTo(2.5, 8);
  expect(Math.abs(
    settledScope.railgunScope.cameraFov - settledScope.railgunScope.targetFov,
  )).toBeLessThan(0.35);
  expect(settledScope.weaponPresentation.fullscreenSuppression).toMatchObject({
    active: true,
    rootVisible: true,
    rootScale: 0.0001,
  });
  expect(settledScope.aimAlignment).toMatchObject({ reticle: 'railgun-camera-forward' });
  expect(settledScope.aimAlignment.errorCssPixels).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath(`railgun-through-wall-thermal-${renderer}.png`), animations: 'disabled' });
  const shotStates = await page.evaluate(() => {
    const api = (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: { fireOnce: () => void; snapshot: () => any } }
    ).__ATOMIC_ACRES_DEBUG__;
    api.fireOnce();
    const first = api.snapshot();
    // Keep this attempted follow-up in the same browser task as the accepted
    // shot. On a heavily loaded renderer, crossing the Playwright boundary and
    // inspecting the full presentation can legitimately consume the 1.5 s
    // rechamber window, turning this into a machine-speed test instead of an
    // authority test.
    api.fireOnce();
    return { first, blocked: api.snapshot() };
  });
  const first = shotStates.first;
  expect(first.railgun).toMatchObject({ roundsRemaining: 7, adsResetRequired: true, rechamberPresentationActive: true });
  expect(first.railgun.presentation).toMatchObject({
    beamPresentations: 1,
    activeBeams: 1,
    lastBeamLengthM: 180,
    visibleDurationMs: 1_000,
    coreRadiusM: 0.32,
    haloRadiusM: 1,
    shockRadiusM: 1.6,
    filamentCount: 3,
    poolCapacity: 6,
    throughGeometry: true,
  });
  const acceptedBeam = first.railgun.presentation.lastAcceptedBeam;
  expect(acceptedBeam).toMatchObject({ generation: first.railgun.generation, lengthM: 180 });
  expect(acceptedBeam.shotId).toMatch(/:rail:\d+$/);
  expect(Math.hypot(
    acceptedBeam.end[0] - acceptedBeam.start[0],
    acceptedBeam.end[1] - acceptedBeam.start[1],
    acceptedBeam.end[2] - acceptedBeam.start[2],
  )).toBeCloseTo(180, 5);
  expect(first.audio.railgun).toMatchObject({ local: 1, layerCount: 10, pressureDuration: 0.62 });
  expect(first.textChat.adsHeld).toBe(false);
  expect(first.railgunScope).toMatchObject({ active: false, viewmodelSuppressed: false, viewmodelVisible: true });
  expect(first.railgun).toMatchObject({ scopeActive: false, thermalVisible: false });
  expect(first.weaponPresentation.fullscreenSuppression.active).toBe(false);

  const presentationCountBeforeBlockedShot = first.railgun.presentation.beamPresentations;
  expect(shotStates.blocked.railgun.roundsRemaining).toBe(7);
  expect(shotStates.blocked.railgun.presentation.beamPresentations).toBe(presentationCountBeforeBlockedShot);
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.thermalVisible === false);

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
  await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: any }
  ).__ATOMIC_ACRES_DEBUG__.equipWeapon('pistol'));
  await page.waitForFunction(() => {
    const state = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } })
      .__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.player.weapon === 'pistol'
      && state.railgunScope.active === false
      && state.railgun.thermalVisible === false
      && state.weaponPresentation.fullscreenSuppression.active === false;
  });
  const swapped = await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot());
  expect(swapped.railgunScope).toMatchObject({ active: false, viewmodelVisible: true });
  expect(swapped.weaponPresentation.weapon).toBe('pistol');
  if (renderer === 'webgpu') {
    expect(second.state.render.runtime).toMatchObject({
      actualBackend: 'webgpu', deviceLost: false, uncapturedErrors: 0, presentation: { status: 'healthy' },
    });
  }
});
