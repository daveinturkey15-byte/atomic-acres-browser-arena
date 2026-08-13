import { expect, test, type Page } from '@playwright/test';

const PROFILES = [
  { label: 'quality', query: 'quality' },
  { label: 'performance', query: 'performance' },
] as const;
const PANE_COUNT = 6;

async function deploy(page: Page, render: string): Promise<void> {
  await page.goto(
    `/?release=latest&map=atomic-acres&renderer=webgl2&render=${render}`
      + '&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off'
      + `&seed=pass71-glass-${render}`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 },
  );
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.admissionState().matchPhase === 'active'
      && debug.admissionState().presentedGameplayFrame > 2;
  }, undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
}

async function assertPaneBreached(page: Page, index: number, label: string): Promise<void> {
  const pane = await page.evaluate((paneIndex) => {
    const pane = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).breakableWindows[paneIndex];
    return { broken: pane?.broken, visible: pane?.visible, apertureOpen: pane?.authority?.apertureOpen };
  }, index);
  expect(pane, `${label}: pane ${index}`).toEqual({
    broken: true,
    visible: false,
    apertureOpen: true,
  });
}

async function assertDebrisRetired(page: Page, label: string): Promise<any> {
  await page.waitForTimeout(4_750);
  const snapshot = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
  expect(snapshot.breakableWindows.every((pane: any) => pane.broken && pane.authority?.apertureOpen), label)
    .toBe(true);
  expect(snapshot.windowGlassDebrisPool, label).toMatchObject({
    retained: PANE_COUNT,
    currentArenaRetained: PANE_COUNT,
    active: 0,
    activePhysics: 0,
    prewarmedPhysicsBodies: PANE_COUNT,
    lifecycle: {
      maxPhysicsMs: 1_800,
      maxLifetimeMs: 4_500,
      missingPrewarm: 0,
    },
  });
  expect(snapshot.persistentWindowDebris, `${label}: no fragment or collider remains`).toEqual([]);
  return {
    panes: snapshot.breakableWindows.map((pane: any) => ({
      id: pane.id,
      broken: pane.broken,
      apertureOpen: pane.authority.apertureOpen,
    })),
    pool: snapshot.windowGlassDebrisPool,
  };
}

for (const profile of PROFILES) {
  test(`${profile.label}: all six authored panes breach by bullet, knife and grenade and retire debris by 5s`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);
    const receipts: Record<string, unknown> = {};

    await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.resetBreakableWindows();
      debug.equipWeapon('carbine');
    });
    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      await page.evaluate((paneIndex) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.stageWindow(paneIndex, 4);
        debug.fireOnce();
      }, pane);
      await assertPaneBreached(page, pane, `${profile.label}/bullet`);
      await page.waitForTimeout(130);
    }
    receipts.bullet = await assertDebrisRetired(page, `${profile.label}/bullet`);

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.resetBreakableWindows());
    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      const accepted = await page.evaluate((paneIndex) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.stageWindow(paneIndex, 1.25);
        return debug.melee().accepted;
      }, pane);
      expect(accepted, `${profile.label}/knife pane ${pane} admitted`).toBe(true);
      await assertPaneBreached(page, pane, `${profile.label}/knife`);
      await page.waitForTimeout(670);
    }
    receipts.knife = await assertDebrisRetired(page, `${profile.label}/knife`);

    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      const broken = await page.evaluate((paneIndex) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.resetBreakableWindows();
        return debug.detonateGrenadeAtWindow(paneIndex);
      }, pane);
      expect(broken, `${profile.label}/grenade pane ${pane} admitted`).toBeGreaterThanOrEqual(1);
      await assertPaneBreached(page, pane, `${profile.label}/grenade`);
    }
    // Finish with all six concurrently breached so the four presentation-only
    // fallbacks beyond the two-body Rapier partition are exercised together.
    await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.resetBreakableWindows();
      for (let pane = 0; pane < 6; pane += 1) debug.detonateGrenadeAtWindow(pane);
    });
    receipts.grenade = await assertDebrisRetired(page, `${profile.label}/grenade`);

    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    await testInfo.attach(`pass71-glass-${profile.label}-matrix`, {
      body: Buffer.from(JSON.stringify({ profile: profile.label, paneCount: PANE_COUNT, receipts, faults }, null, 2)),
      contentType: 'application/json',
    });
  });
}
