import { expect, test } from '@playwright/test';

const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

test('shows Chopper gun and missile controls and cleans them up on exit and death', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((storedLoadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
  }, loadout);
  await page.goto('/?release=latest&map=gun-range&renderer=webgl2&render=performance&grass=off&mist=off&rays=off&externalServices=off&seed=pass74-chopper-hud');
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 45_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return snapshot.gameStarted && snapshot.matchPhase === 'active'
      && snapshot.supportVehiclePresentation?.state === 'ready';
  }, undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.earnSupport(15);
    if (!window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper')) throw new Error('Chopper activation rejected');
  });
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting'), undefined, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);

  await expect(page.locator('#gunner-control-strip')).toBeVisible();
  await expect(page.locator('#gunner-control-strip')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#gunner-gun-control')).toContainText('LMB');
  await expect(page.locator('#gunner-gun-control')).toContainText('GUN');
  await expect(page.locator('#gunner-missile-status')).toContainText('RMB');
  await expect(page.locator('#gunner-missile-status')).toContainText('MISSILES');
  const ammo = await page.evaluate(() => {
    const entity = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
      .find((candidate: any) => candidate.kind === 'chopper' && candidate.phase === 'orbiting');
    return { entity: entity?.missileAmmo, hud: document.querySelector('#gunner-missile-ammo')?.textContent };
  });
  expect(ammo.hud).toBe(`×${ammo.entity} / 6`);
  await expect(page.locator('#gunner-missile-cooldown')).not.toHaveText('OFFLINE');

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await expect(page.locator('#gunner-control-strip')).toBeHidden();
  await expect(page.locator('#gunner-control-strip')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.damage(1_000));
  await expect(page.locator('#gunner-control-strip')).toBeHidden();
  await expect(page.locator('#gunner-control-strip')).toHaveAttribute('aria-hidden', 'true');
  expect(errors).toEqual([]);
});
