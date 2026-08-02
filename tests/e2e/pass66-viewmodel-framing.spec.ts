import { expect, test, type Page, type TestInfo } from '@playwright/test';

type Viewport = Readonly<{ name: string; width: number; height: number }>;

const VIEWPORTS: readonly Viewport[] = Object.freeze([
  { name: '1440p', width: 2560, height: 1440 },
  { name: '4k', width: 3840, height: 2160 },
  { name: 'ultrawide-1440p', width: 3440, height: 1440 },
]);

async function snapshot(page: Page): Promise<any> {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot());
}

async function capture(page: Page, testInfo: TestInfo, viewport: Viewport, pose: string): Promise<void> {
  const path = testInfo.outputPath(`${viewport.name}-${pose}.png`);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  try {
    await page.screenshot({ path, animations: 'disabled', timeout: 60_000 });
  } finally {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  }
  await testInfo.attach(`${viewport.name}-${pose}`, { path, contentType: 'image/png' });
}

test('keeps authored arms and knife readable at 1440p, 4K and ultrawide', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto('/?release=latest&renderer=webgl2&render=blender&map=gun-range&grass=off&mist=off&seed=660214');
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true;
  }, undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
    api.setMovement(false);
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state?.matchPhase === 'active';
  }, undefined, { timeout: 45_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('m4a1'));
  await page.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
    return presentation?.weapon === 'm4a1' && presentation?.importedModel?.weapon === 'm4a1';
  }, undefined, { timeout: 30_000 });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.setReloadCaptureProgress(null);
      api.setMeleeCaptureProgress(null);
    });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.adsProgress < 0.02);
    await page.waitForTimeout(180);
    const hip = (await snapshot(page)).weaponPresentation;
    expect(hip.armsSource, `${viewport.name}: authored arms`).toBe('authored-two-chain');
    expect(hip.authoredFingerBoneCount, `${viewport.name}: articulated fingers`).toBe(30);
    expect(hip.armMaterials, `${viewport.name}: opaque arm materials`).toMatchObject({
      contract: 'opaque-depth-writing', transparent: 0, nonOpaque: 0, depthWriteDisabled: 0,
    });
    expect(hip.firstPersonRearStockTrim, `${viewport.name}: M4A1 rear-stock occlusion trim`).toMatchObject({ applied: true });
    expect(
      hip.firstPersonRearStockTrim.batches.reduce(
        (total: number, batch: { suppressedElements: number }) => total + batch.suppressedElements,
        0,
      ),
      `${viewport.name}: M4A1 suppressed rear-stock elements`,
    ).toBeGreaterThan(0);
    expect(hip.importedModel, `${viewport.name}: immutable M4A1 topology`).toMatchObject({
      triangles: 32_112, renderPrimitives: 8,
    });
    expect(hip.armFraming, `${viewport.name}: finite hip framing`).toMatchObject({
      finite: true, nearPlaneClear: true, intersectsViewport: true,
    });
    await capture(page, testInfo, viewport, 'hip');

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.adsProgress > 0.98);
    await page.waitForTimeout(120);
    const ads = (await snapshot(page)).weaponPresentation;
    expect(Math.hypot(...ads.sightOffset), `${viewport.name}: physical ADS centre`).toBeLessThanOrEqual(0.03);
    expect(ads.armFraming, `${viewport.name}: ADS arm framing`).toMatchObject({
      finite: true, nearPlaneClear: true, intersectsViewport: true,
    });
    for (const side of ['right', 'left'] as const) {
      const arm = ads.riggedArms.find((candidate: { side: string }) => candidate.side === side);
      expect(arm, `${viewport.name}: ${side} authored ADS arm`).toMatchObject({
        finite: true, withinStableReach: true,
      });
      expect(arm.contactError, `${viewport.name}: ${side} hand contact`).toBeLessThanOrEqual(0.015);
      expect(arm.wristContactError, `${viewport.name}: ${side} wrist contact`).toBeLessThanOrEqual(0.015);
    }
    expect(
      ads.armFraming.nearestDepth - ads.weaponFraming.nearestDepth,
      `${viewport.name}: ADS receiver depth clearance`,
    ).toBeGreaterThan(0.08);
    await capture(page, testInfo, viewport, 'ads');

    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.melee();
      api.setMeleeCaptureProgress(0.42);
    });
    await page.waitForFunction(() => {
      const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
      return presentation?.adsProgress < 0.02
        && presentation?.meleeArmSource === 'authored-rigged-arms'
        && presentation?.knifeVisible === true;
    });
    await page.waitForTimeout(120);
    const melee = (await snapshot(page)).weaponPresentation;
    expect(melee).toMatchObject({
      armsSource: 'authored-two-chain', meleeArmSource: 'authored-rigged-arms',
      knifeVisible: true, passiveKnifeVisible: false,
      authoredMeleeKnifeParent: 'right-wrist-knife-socket',
    });
    expect(melee.authoredMeleeGripError, `${viewport.name}: grip-to-socket contact`).toBeLessThanOrEqual(0.001);
    await capture(page, testInfo, viewport, 'melee-0_42');

    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setMeleeCaptureProgress(null);
      // Face the authored west wall at prone eye height so both the forward
      // obstruction probes and the real floor collider contribute.
      api.teleportPlayer(-19.65, 1.7, -14.5, Math.PI / 2, 0);
      api.setStance('prone');
    });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.player?.stance === 'prone'
        && state?.weaponPresentation?.surfaceRetreat > 0.25
        && state?.weaponPresentation?.surfaceLift > 0.1;
    });
    await page.waitForTimeout(420);
    const prone = (await snapshot(page)).weaponPresentation;
    expect(prone.surfaceRetreat, `${viewport.name}: wall retreat`).toBeGreaterThan(0.25);
    expect(prone.surfaceLift, `${viewport.name}: floor lift`).toBeGreaterThanOrEqual(0.13);
    expect(prone.armFraming, `${viewport.name}: prone near-plane clearance`).toMatchObject({
      finite: true, nearPlaneClear: true, intersectsViewport: true,
    });
    expect(
      prone.viewmodelViewport.rootPosition[1],
      `${viewport.name}: applied prone floor clearance`,
    ).toBeGreaterThan(hip.viewmodelViewport.rootPosition[1]);
    await capture(page, testInfo, viewport, 'prone-wall-floor-clearance');
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.teleportPlayer(0, 1.7, 8, 0, 0);
      api.setStance('stand');
    });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.player?.stance === 'stand');
  }

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMeleeCaptureProgress(null));
  expect(runtimeErrors).toEqual([]);
});
