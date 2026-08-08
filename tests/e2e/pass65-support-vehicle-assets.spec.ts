import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
const PASS65_LOADOUT = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

test('loads and prewarms the exact authored support-vehicle family before deployment', async ({ page }, testInfo) => {
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

  await page.addInitScript((loadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(loadout));
  }, PASS65_LOADOUT);
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
  expect(await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.earnSupport(15);
    return window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper');
  })).toBe(true);
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting'));
  // Exercise the same host control intent as the owned streak slot. Slot-key
  // input admission is covered separately; this asset gate remains focused on
  // first-person authored presentation and firing actions.
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await page.waitForFunction(() => Boolean(
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation.firstPersonSightline,
  ));
  expect(await page.evaluate(() => {
    const presentation = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation;
    return {
      active: presentation.activeChopperActionNames,
      pooled: presentation.pooledChopperActionNames,
    };
  })).toEqual({ active: [
    'Chopper_Gun_Fire',
    'Chopper_Gun_Recoil',
    'Chopper_Impact_Pulse',
    'Chopper_Muzzle_Flash',
    'Chopper_Tracer_Pulse',
  ], pooled: [
    'Chopper_Gun_Fire',
    'Chopper_Gun_Recoil',
    'Chopper_Impact_Pulse',
    'Chopper_Muzzle_Flash',
    'Chopper_Tracer_Pulse',
  ] });
  const canvasBounds = await page.locator('#game').boundingBox();
  if (!canvasBounds) throw new Error('Game canvas has no rendered bounds');
  const actionRegion = {
    x: canvasBounds.x + canvasBounds.width * 0.3,
    y: canvasBounds.y + canvasBounds.height * 0.3,
    width: canvasBounds.width * 0.4,
    height: canvasBounds.height * 0.55,
  };
  const beforeWeaponAction = await page.screenshot({ clip: actionRegion, animations: 'allow' });
  const beforeWeaponCanvas = await page.locator<HTMLCanvasElement>('#game').evaluate((canvas) => canvas.toDataURL('image/png'));
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld(true));
  const expectedWeaponActions = [
    'Chopper_Gun_Recoil',
    'Chopper_Gun_Fire',
    'Chopper_Muzzle_Flash',
    'Chopper_Tracer_Pulse',
  ];
  const actionEvidence = await page.evaluate(async (names) => new Promise<{
    playback: any[];
    canvasFrame: string;
  }>((resolveEvidence, rejectEvidence) => {
    const deadline = performance.now() + 5_000;
    const inspect = () => {
      const presentation = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation;
      const playback = presentation.chopperActionPlayback.filter((action: any) => (
        action.visible && action.running && action.timeSeconds > 0 && action.effectiveWeight > 0
      ));
      if (presentation.chopperWeaponActionsPresented > 0 && names.every((name) => (
        playback.some((action: any) => action.name === name)
      ))) {
        const canvas = document.querySelector<HTMLCanvasElement>('#game');
        if (!canvas) return rejectEvidence(new Error('Game canvas disappeared during Chopper action'));
        return resolveEvidence({ playback, canvasFrame: canvas.toDataURL('image/png') });
      }
      if (performance.now() >= deadline) return rejectEvidence(new Error('Visible authored Chopper actions did not enter playback'));
      requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  }), expectedWeaponActions);
  const actionPlayback = actionEvidence.playback;
  expect([...new Set(actionPlayback.map((action: any) => action.name))].sort()).toEqual([...expectedWeaponActions].sort());
  expect(actionPlayback.every((action: any) => action.clipDurationSeconds > action.timeSeconds)).toBe(true);
  expect(actionPlayback.every((action: any) => /authored-lod\d+$/u.test(action.lodRootName))).toBe(true);
  expect(actionEvidence.canvasFrame).not.toBe(beforeWeaponCanvas);
  const duringWeaponAction = await page.screenshot({ clip: actionRegion, animations: 'allow' });
  expect(Buffer.compare(beforeWeaponAction, duringWeaponAction)).not.toBe(0);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld(false));
  const weaponActions = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).killstreakPresentation.lastChopperWeaponActions);
  expect(weaponActions).toEqual([
    'Chopper_Gun_Recoil',
    'Chopper_Gun_Fire',
    'Chopper_Muzzle_Flash',
    'Chopper_Tracer_Pulse',
  ]);
  const evidenceDir = resolve(process.cwd(), 'artifacts/pass69/chopper-gunner');
  mkdirSync(evidenceDir, { recursive: true });
  const screenshot = resolve(evidenceDir, 'first-person-weapon-action.png');
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  await testInfo.attach('chopper-first-person-weapon-action', { path: screenshot, contentType: 'image/png' });
  const sightline = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).killstreakPresentation.firstPersonSightline);
  expect(sightline).toMatchObject({
    presentationSource: 'project-original-blender-glb',
    visibleOutsideSightline: [],
    hudVisible: true,
    weaponVisible: true,
  });
  expect(sightline.visibleMeshNames.length).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);
});
