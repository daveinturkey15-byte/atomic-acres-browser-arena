import { expect, test } from '@playwright/test';

const REQUIRED_ASSETS = [
  'pass65-care-aircraft-lod0.glb',
  'pass65-care-aircraft-lod1.glb',
  'pass65-care-aircraft-lod2.glb',
  'pass65-care-crate-lod0.glb',
  'pass65-care-crate-lod1.glb',
  'pass65-carpet-aircraft-lod0.glb',
  'pass65-carpet-aircraft-lod1.glb',
  'pass65-carpet-aircraft-lod2.glb',
  'pass65-chopper-gunner-lod0.glb',
  'pass65-chopper-gunner-lod1.glb',
  'pass65-chopper-gunner-lod2.glb',
].sort();

test('loads and prewarms the exact authored support-vehicle family before deployment', async ({ page }) => {
  const browserErrors: string[] = [];
  const assetResponses = new Map<string, number>();
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('response', (response) => {
    const match = response.url().match(/\/(pass65-(?:care|carpet|chopper)[^/]+\.glb)$/);
    if (match) assetResponses.set(match[1], response.status());
  });

  await page.goto('/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=pass65-support-vehicle-assets');
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__));
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as {
      gameStarted: boolean;
      supportVehiclePresentation?: { state: string; readyFamilies: string[] };
      killstreakPresentation?: { prewarmedAuthoredSupportFamilies: string[] };
    };
    return snapshot.gameStarted
      && snapshot.supportVehiclePresentation?.state === 'ready'
      && snapshot.supportVehiclePresentation.readyFamilies.length === 4
      && snapshot.killstreakPresentation?.prewarmedAuthoredSupportFamilies.length === 4;
  }, undefined, { timeout: 45_000 });

  const telemetry = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as {
      supportVehiclePresentation: {
        state: string;
        requiredAssets: string[];
        loadedAssets: string[];
        readyFamilies: string[];
        maxConcurrentDecodes: number;
        failures: Record<string, string>;
      };
      killstreakPresentation: {
        prewarmed: number;
        prewarmedAuthoredSupportFamilies: string[];
      };
    };
    return {
      ...snapshot.supportVehiclePresentation,
      prewarmed: snapshot.killstreakPresentation.prewarmed,
      prewarmedAuthoredSupportFamilies: snapshot.killstreakPresentation.prewarmedAuthoredSupportFamilies,
    };
  });
  expect(telemetry).toMatchObject({
    state: 'ready',
    readyFamilies: ['care', 'carpet', 'chopper', 'crate'],
    failures: {},
    maxConcurrentDecodes: 2,
    prewarmed: 6,
    prewarmedAuthoredSupportFamilies: ['care', 'carpet', 'chopper', 'crate'],
  });
  expect(telemetry.requiredAssets.map((asset) => asset.split('/').at(-1)).sort()).toEqual(REQUIRED_ASSETS);
  expect(telemetry.loadedAssets.map((asset) => asset.split('/').at(-1)).sort()).toEqual(REQUIRED_ASSETS);
  expect([...assetResponses.keys()].sort()).toEqual(REQUIRED_ASSETS);
  expect([...assetResponses.values()].every((status) => status === 200)).toBe(true);
  expect(browserErrors).toEqual([]);
});
