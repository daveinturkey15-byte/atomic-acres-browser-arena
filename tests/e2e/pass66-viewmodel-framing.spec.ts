import { expect, test, type Page, type TestInfo } from '@playwright/test';

type Viewport = Readonly<{ name: string; width: number; height: number }>;

const VIEWPORTS: readonly Viewport[] = Object.freeze([
  { name: '1440p', width: 2560, height: 1440 },
  { name: '4k', width: 3840, height: 2160 },
  { name: 'ultrawide-1440p', width: 3440, height: 1440 },
  { name: 'iphone-15-landscape', width: 844, height: 390 },
]);

const SHOULDER_ENTRY_NDC = Object.freeze({ left: -1.12, right: -1.07 });
const AUTHORED_ARM_SEGMENT_LENGTH_SCALE = 1;
const ARM_BRANCH_CROP_NDC_Y = -1.05;
const PROXIMAL_SLEEVE_CONTRACT = 'shoulder-bound-authored-pbr-lower-crop-continuation-v1';

function assertIndependentArmBranchCrop(presentation: any, label: string): void {
  for (const [side, suffix] of [['left', 'L'], ['right', 'R']] as const) {
    const branch = presentation.armBranchFraming?.[side];
    expect(branch, `${label}: ${side} branch framing`).toMatchObject({
      finite: true, nearPlaneClear: true, intersectsViewport: true,
    });
    expect(branch.ndcMin[1], `${label}: ${side} sleeve independently exits bottom`)
      .toBeLessThanOrEqual(ARM_BRANCH_CROP_NDC_Y);
    expect(
      presentation.proximalSleeveContinuations?.find((entry: { side: string }) => entry.side === side),
      `${label}: ${side} shoulder-bound PBR continuation`,
    ).toMatchObject({
      contract: PROXIMAL_SLEEVE_CONTRACT,
      parent: `UpperArm${suffix}`,
      materialKind: 'MeshStandardMaterial',
      authoredSleeveMaterial: true,
      opaque: true,
    });
  }
}

function assertAuthoredArmCropAndGrip(presentation: any, label: string, maximumContactError: number): void {
  expect(presentation.armsSource, `${label}: authored two-chain source`).toBe('authored-two-chain');
  expect(presentation.armFraming, `${label}: authored arms continue below viewport`).toMatchObject({
    finite: true,
    nearPlaneClear: true,
    intersectsViewport: true,
  });
  expect(presentation.armFraming.ndcMin[1], `${label}: no detached lower sleeve edge`).toBeLessThanOrEqual(-1.2);
  assertIndependentArmBranchCrop(presentation, label);
  expect(presentation.riggedArms, `${label}: both authored arms diagnosed`).toHaveLength(2);
  for (const side of ['right', 'left'] as const) {
    const arm = presentation.riggedArms.find((candidate: { side: string }) => candidate.side === side);
    expect(arm, `${label}: ${side} authored arm`).toMatchObject({
      active: true,
      finite: true,
      withinStableReach: true,
      authoredSegmentDirectionsPreserved: true,
      poseChainContract: 'authored-palm-full-transform-to-socket-frame-v2',
      shoulderEntryPolicy: 'camera-space-below-frame-continuation-v1',
    });
    expect(arm.shoulderEntryNdc[1], `${label}: ${side} shoulder enters below frame`)
      .toBeLessThanOrEqual(SHOULDER_ENTRY_NDC[side] + 0.001);
    expect(arm.contactError, `${label}: ${side} palm/socket contact`).toBeLessThanOrEqual(maximumContactError);
    expect(arm.wristContactError, `${label}: ${side} wrist target contact`).toBeLessThanOrEqual(maximumContactError);
    expect(arm.palmOrientationError, `${label}: ${side} human palm orientation`).toBeLessThanOrEqual(0.2);
    expect(arm.segmentLengthScale, `${label}: ${side} authored anatomical length`)
      .toBe(AUTHORED_ARM_SEGMENT_LENGTH_SCALE);
    expect(arm.bindOffsetsPreserved, `${label}: ${side} bind offsets`).toBe(true);
  }
}

async function snapshot(page: Page): Promise<any> {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot());
}

async function restoreStandingAfterTeleport(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const state = api?.snapshot();
    if (!api || !state) return false;
    if (state.player?.stance !== 'stand') api.setStance('stand');
    return api.snapshot()?.player?.stance === 'stand';
  }, undefined, { timeout: 5_000, polling: 50 });
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
    await page.waitForTimeout(300);
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
    assertAuthoredArmCropAndGrip(hip, `${viewport.name}: hip`, 0.015);
    await capture(page, testInfo, viewport, 'hip');

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation?.adsProgress > 0.98);
    await page.waitForTimeout(300);
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
    assertAuthoredArmCropAndGrip(ads, `${viewport.name}: ADS`, 0.015);
    await capture(page, testInfo, viewport, 'ads');

    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.fireOnce();
    });
    await page.locator('#game').click({ position: { x: 640, y: 360 } });
    await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'));
    await page.keyboard.press('r');
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(0.46));
    await page.waitForFunction(() => {
      const presentation = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
      return presentation?.adsProgress < 0.02
        && presentation?.authoredArmAnimation?.activeAction === 'reload';
    });
    await page.waitForTimeout(300);
    const reload = (await snapshot(page)).weaponPresentation;
    expect(reload.authoredArmAnimation).toMatchObject({
      activeAction: 'reload',
      blendPolicy: 'finger-tracks-first-runtime-ik-last',
    });
    for (const side of ['right', 'left'] as const) {
      const arm = reload.riggedArms.find((candidate: { side: string }) => candidate.side === side);
      expect(arm, `${viewport.name}: ${side} reload arm`).toMatchObject({ finite: true, withinStableReach: true });
      expect(arm.contactError, `${viewport.name}: ${side} reload hand contact`).toBeLessThanOrEqual(0.02);
    }
    assertAuthoredArmCropAndGrip(reload, `${viewport.name}: reload`, 0.02);
    await capture(page, testInfo, viewport, 'reload-0_46');

    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setReloadCaptureProgress(null);
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
    expect(melee.authoredMeleeHandContactError, `${viewport.name}: knife remains in the posed firing hand`).toBeLessThanOrEqual(0.015);
    expect(melee.armFraming.ndcMin[1], `${viewport.name}: melee sleeves continue below viewport`).toBeLessThanOrEqual(-1.2);
    assertIndependentArmBranchCrop(melee, `${viewport.name}: melee`);
    await capture(page, testInfo, viewport, 'melee-0_42');

    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setMeleeCaptureProgress(null);
      // Face the authored west wall at prone eye height so both the forward
      // obstruction probes and the real floor collider contribute.
      api.setStance('prone');
      api.teleportPlayer(-19.65, 1.7, -14.5, Math.PI / 2, 0);
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
    assertAuthoredArmCropAndGrip(prone, `${viewport.name}: prone wall/floor contact`, 0.02);
    await capture(page, testInfo, viewport, 'prone-wall-floor-clearance');
    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setStance('stand');
      api.teleportPlayer(0, 1.7, 8, 0, 0);
    });
    // The teleport invalidates stale ground contact. Keep requesting stand
    // until the production grounded guard accepts it after the fall settles.
    await restoreStandingAfterTeleport(page);
  }

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMeleeCaptureProgress(null));
  expect(runtimeErrors).toEqual([]);
});
