import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ADS_WEAPONS = ['carbine', 'mini-uzi'] as const;
const artifactRoot = resolve(process.cwd(), 'artifacts/pass69-3/ads-physical-clearance');

async function deploy(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await page.goto('/?release=latest&map=atomic-acres&renderer=webgl2&render=blender&grass=off&mist=off&rays=off&externalServices=off&seed=pass69-3-ads-physical-clearance');
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state.weaponReady === true;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
  });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
}

function clearanceFor(state: any, weapon: typeof ADS_WEAPONS[number]) {
  return state.weaponPresentation.adsMaterialClearance.catalog
    .find((entry: { weapon: string }) => entry.weapon === weapon);
}

test('carbine and Mini Uzi expose a physical ADS corridor and restore every material on exit and switch', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  mkdirSync(artifactRoot, { recursive: true });
  await deploy(page);
  const evidence: Array<Record<string, unknown>> = [];

  for (const [index, weapon] of ADS_WEAPONS.entries()) {
    await page.evaluate((weaponId) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setAds(false);
      api.equipWeapon(weaponId);
    }, weapon);
    await page.waitForFunction((weaponId) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const clearance = (state.weaponPresentation as any).adsMaterialClearance.catalog
        .find((entry: { weapon: string }) => entry.weapon === weaponId);
      return state.player.weapon === weaponId
        && state.weaponPresentation.weapon === weaponId
        && state.weaponPresentation.adsProgress < 0.02
        && clearance?.materialCount > 0;
    }, weapon, { timeout: 8_000 });

    const hip = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
    const hipMaterials = clearanceFor(hip, weapon);
    expect(hip.weaponPresentation.adsMaterialClearance.contract).toBe('static-silhouette-ads-translucency-v2');
    expect(hipMaterials.materialCount, `${weapon}: collected complete static silhouette material set`).toBeGreaterThanOrEqual(5);
    expect(hipMaterials.surfaces, `${weapon}: authored static material families`).toEqual(expect.arrayContaining([
      'gunmetal', 'polymer', 'primary', 'rubber',
    ]));
    expect(hipMaterials.restoredCount, `${weapon}: hip materials start at authored state`).toBe(hipMaterials.materialCount);
    const hipScreenshot = await page.screenshot({
      path: resolve(artifactRoot, `${index + 1}-${weapon}-hip-retention.png`),
      animations: 'disabled',
      clip: { x: 640, y: 290, width: 320, height: 320 },
    });
    await testInfo.attach(`${index + 1}-${weapon}-hip-retention`, { body: hipScreenshot, contentType: 'image/png' });

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
    await page.waitForFunction((weaponId) => {
      const presentation = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).weaponPresentation;
      return presentation.weapon === weaponId
        && presentation.adsProgress > 0.98
        && presentation.adsMaterialClearance.blend > 0.98;
    }, weapon, { timeout: 8_000 });
    const ads = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
    const adsMaterials = clearanceFor(ads, weapon);
    expect(ads.weaponPresentation.firstPersonRearOccluderTrim, `${weapon}: actual served rear geometry trim`).toMatchObject({
      applied: true,
      contract: 'rear-sight-axis-spatial-degenerate-v1',
    });
    expect(ads.weaponPresentation.firstPersonRearOccluderTrim.suppressedElements).toBeGreaterThan(0);
    expect(ads.weaponPresentation.firstPersonRearOccluderTrim.suppressionRatio, `${weapon}: hip geometry retention`).toBeLessThan(0.08);
    expect(ads.weaponPresentation.firstPersonAdsSightBore, `${weapon}: actual served physical aperture`).toMatchObject({
      applied: true,
      contract: 'physical-aperture-spatial-degenerate-v1',
      rayCount: 9,
    });
    expect(ads.weaponPresentation.firstPersonAdsSightBore.suppressedElements).toBeGreaterThan(0);
    expect(adsMaterials.transparentCount).toBe(adsMaterials.materialCount);
    expect(adsMaterials.nonOpaqueCount).toBe(adsMaterials.materialCount);
    expect(adsMaterials.depthWriteDisabledCount).toBe(adsMaterials.materialCount);
    expect(adsMaterials.maximumTargetOpacity, `${weapon}: bounded ADS ghost target`).toBeLessThanOrEqual(0.14);
    expect(adsMaterials.maximumOpacity, `${weapon}: settled static silhouette opacity`).toBeLessThanOrEqual(0.14);
    expect(ads.weaponPresentation.adsMaterialClearance.sightPictureRetreat, `${weapon}: ADS-only physical viewmodel retreat`).toBeGreaterThanOrEqual(0.25);
    expect(ads.weaponPresentation.adsOpaqueSightWindow, `${weapon}: nine-ray camera sight window`).toMatchObject({
      contract: 'camera-ndc-sight-window-opaque-weapon-rays-v1',
      rayCount: 9,
      blockedRays: 0,
      maximumHits: 0,
      meshes: [],
    });

    const screenshot = await page.screenshot({
      path: resolve(artifactRoot, `${index + 1}-${weapon}-physical-ads-corridor.png`),
      animations: 'disabled',
      clip: { x: 640, y: 290, width: 320, height: 320 },
    });
    await testInfo.attach(`${index + 1}-${weapon}-physical-ads-corridor`, { body: screenshot, contentType: 'image/png' });

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(false));
    await page.waitForFunction((weaponId) => {
      const presentation = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).weaponPresentation;
      return presentation.weapon === weaponId
        && presentation.adsProgress < 0.02
        && presentation.adsMaterialClearance.blend < 0.02;
    }, weapon, { timeout: 8_000 });
    const restored = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
    const restoredMaterials = clearanceFor(restored, weapon);
    expect(restoredMaterials.restoredCount, `${weapon}: exact opacity/transparent/depthWrite restoration`).toBe(restoredMaterials.materialCount);
    evidence.push({
      weapon,
      hip: {
        materials: hipMaterials,
        visibleMeshes: hip.weaponPresentation.modelVisibleMeshCount,
      },
      ads: {
        materials: adsMaterials,
        sightPictureRetreat: ads.weaponPresentation.adsMaterialClearance.sightPictureRetreat,
        sightOffset: ads.weaponPresentation.sightOffset,
        rearOccluderTrim: ads.weaponPresentation.firstPersonRearOccluderTrim,
        sightBore: ads.weaponPresentation.firstPersonAdsSightBore,
        opaqueSightWindow: ads.weaponPresentation.adsOpaqueSightWindow,
      },
      restored: restoredMaterials,
    });
  }

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('pistol'));
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.player.weapon === 'pistol' && state.weaponPresentation.weapon === 'pistol';
  });
  const afterSwitch = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
  for (const weapon of ADS_WEAPONS) {
    const restored = clearanceFor(afterSwitch, weapon);
    expect(restored.restoredCount, `${weapon}: remains restored after switching away`).toBe(restored.materialCount);
  }
  expect(browserErrors).toEqual([]);
  writeFileSync(resolve(artifactRoot, 'ads-physical-clearance-telemetry.json'), `${JSON.stringify({
    contract: 'pass69-3-ads-physical-clearance-v2',
    renderer: 'webgl2',
    renderProfile: 'blender',
    viewport: [1_600, 900],
    weapons: evidence,
    browserErrors,
  }, null, 2)}\n`, 'utf8');
});
