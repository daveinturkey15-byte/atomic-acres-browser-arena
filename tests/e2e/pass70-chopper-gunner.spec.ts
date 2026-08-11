import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const renderer = process.env.PASS70_CHOPPER_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

test('renders the complete possessed Chopper cockpit and cleans up on exit', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((storedLoadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
  }, loadout);
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&map=gun-range&renderer=${renderer}${requireWebGpu}&render=blender&grass=off&mist=off&rays=off&externalServices=off&seed=pass70-chopper`);
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(false);
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return snapshot.gameStarted
      && snapshot.matchPhase === 'active'
      && snapshot.supportVehiclePresentation?.state === 'ready'
      && snapshot.killstreakPresentation?.prewarmedAuthoredSupportFamilies?.includes('chopper');
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper'))).toBe(true);
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting'), undefined, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await page.waitForFunction(() => Boolean(
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation.firstPersonSightline?.alignment,
  ));

  const presentation = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).killstreakPresentation.firstPersonSightline);
  expect(presentation).toMatchObject({
    presentationSource: 'project-original-blender-glb',
    visibleOutsideCockpit: [],
    dashboardVisible: true,
    displaysVisible: true,
    hudVisible: true,
    weaponVisible: true,
    overlayLayerExclusive: true,
    alignment: { pivotErrorM: expect.any(Number) },
  });
  expect(presentation.alignment.pivotErrorM).toBeLessThan(0.001);
  await expect(page.locator('#gunner-cockpit-hud')).toBeVisible();
  await expect(page.locator('#gunner-cockpit-hud')).toHaveAttribute('data-support-kind', 'chopper-gunner');
  await expect(page.locator('#gunner-altitude')).not.toHaveText(/NaN/u);
  await page.waitForTimeout(4_200);

  const evidence = resolve(process.cwd(), `artifacts/pass70/chopper-gunner/${renderer}`);
  mkdirSync(evidence, { recursive: true });
  await page.setViewportSize({ width: 1_280, height: 720 });
  await page.screenshot({ path: resolve(evidence, 'possessed-desktop.png'), animations: 'disabled' });
  await testInfo.attach(`pass70-chopper-${renderer}-desktop`, {
    path: resolve(evidence, 'possessed-desktop.png'), contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const centre = { x: innerWidth / 2, y: innerHeight / 2 };
    const reticle = document.querySelector<HTMLElement>('.gunner-reticle')!;
    const centreClear = [...reticle.children].every((child) => {
      const bounds = (child as HTMLElement).getBoundingClientRect();
      return !(centre.x >= bounds.left && centre.x <= bounds.right
        && centre.y >= bounds.top && centre.y <= bounds.bottom);
    });
    const readouts = [...document.querySelectorAll<HTMLElement>('.gunner-readout')].map((readout) => {
      const bounds = readout.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && bounds.left >= -1 && bounds.top >= -1
        && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1;
    });
    return { centreClear, readouts };
  });
  expect(mobile).toEqual({ centreClear: true, readouts: [true, true, true, true, true, true] });
  await page.screenshot({ path: resolve(evidence, 'possessed-mobile.png'), animations: 'disabled' });

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await expect(page.locator('#gunner-cockpit-hud')).toBeHidden();
  await expect(page.locator('#gunner-cockpit-hud')).toHaveAttribute('data-support-kind', 'none');
  await expect(page.locator('#gunner-target-confirm')).toBeHidden();
  await expect(page.locator('#chopper-thermal')).toBeHidden();

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await expect(page.locator('#gunner-cockpit-hud')).toBeVisible();
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.damage(1_000));
  await expect(page.locator('#gunner-cockpit-hud')).toBeHidden();
  await expect(page.locator('#gunner-cockpit-hud')).toHaveAttribute('data-support-kind', 'none');
  await expect(page.locator('#gunner-target-confirm')).toBeHidden();
  await expect(page.locator('#chopper-thermal')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-killstreak-possession', 'none');
  expect(errors).toEqual([]);
});
