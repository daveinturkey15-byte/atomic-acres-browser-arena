import { expect, test, type Page } from '@playwright/test';

type PresentationSnapshot = {
  matchPhase: string;
  player: { ammo: number };
  weaponPresentation: {
    passiveKnifeVisible: boolean;
    passiveKnifeModel: boolean;
    minigunSpool: { fraction: number; phase: string; angleRadians: number };
  };
  dmrThermal: {
    active: boolean;
    contacts: number;
    hostiles: number;
    friendlies: number;
    worldDrawCalls: number;
    targetPolicy: string;
    occlusionPolicy: string;
    smokeVolumes: number;
    smokePresentation: { capacity: number; active: number; liveDisposals: number };
  };
  audio: {
    minigunDrive: { active: boolean; starts: number; stops: number; fraction: number; phase: string };
  };
};

type PresentationDebug = {
  snapshot(): PresentationSnapshot;
  setBotsFrozen(frozen: boolean): void;
  placeBotAhead(distance?: number): void;
  aimAtBot(zone?: 'head' | 'body' | 'limb'): void;
  equipWeapon(weapon: 'm14-ebr' | 'minigun'): void;
  setAds(held: boolean): void;
  setTriggerHeld(held: boolean): void;
  stageSmokeVolume(distance?: number): string;
};

async function readyAndDeploy(page: Page): Promise<void> {
  await page.goto('/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=pass65-presentation-audio');
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return debug?.snapshot().weaponReady === true && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
  await page.locator('#player-name').fill('PASS65 PRESENTATION QA');
  await page.locator('#solo').click();
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase
  ))).toBe('active');
}

test('bounds M14 smoke thermal, pre-shot minigun spool/audio, and passive knife presence', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await readyAndDeploy(page);

  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as PresentationDebug;
    debug.setBotsFrozen(true);
    debug.placeBotAhead(6);
    debug.aimAtBot('body');
    debug.equipWeapon('m14-ebr');
    debug.setAds(true);
  });
  await expect.poll(async () => page.evaluate(() => (
    (window.__ATOMIC_ACRES_DEBUG__ as unknown as PresentationDebug).snapshot().dmrThermal
  ))).toMatchObject({
    active: true,
    contacts: 1,
    hostiles: 1,
    friendlies: 0,
    worldDrawCalls: 2,
    targetPolicy: 'living-friendly-and-hostile',
    occlusionPolicy: 'smoke-bypass-solid-block',
  });
  await expect(page.locator('#dmr-thermal')).toBeVisible();

  await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as PresentationDebug
  ).stageSmokeVolume(3));
  await expect.poll(async () => page.evaluate(() => (
    (window.__ATOMIC_ACRES_DEBUG__ as unknown as PresentationDebug).snapshot().dmrThermal
  ))).toMatchObject({
    contacts: 1,
    smokeVolumes: 1,
    smokePresentation: { capacity: 12, active: 1, liveDisposals: 0 },
  });

  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__ as unknown as PresentationDebug;
    debug.setAds(false);
    debug.equipWeapon('minigun');
    debug.setTriggerHeld(true);
  });
  await page.waitForTimeout(260);
  const preShot = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as PresentationDebug
  ).snapshot());
  expect(preShot.player.ammo).toBe(240);
  expect(preShot.weaponPresentation.minigunSpool).toMatchObject({ phase: 'spooling-up' });
  expect(preShot.weaponPresentation.minigunSpool.fraction).toBeGreaterThan(0.1);
  expect(preShot.weaponPresentation.minigunSpool.angleRadians).toBeGreaterThan(0);
  expect(preShot.audio.minigunDrive).toMatchObject({ active: true, starts: 1, phase: 'spooling-up' });

  await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as PresentationDebug
  ).setTriggerHeld(false));
  await expect.poll(async () => page.evaluate(() => (
    (window.__ATOMIC_ACRES_DEBUG__ as unknown as PresentationDebug).snapshot().weaponPresentation.minigunSpool.phase
  ))).toBe('idle');
  const settled = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__ as unknown as PresentationDebug
  ).snapshot());
  expect(settled.audio.minigunDrive).toMatchObject({ active: false, starts: 1, stops: 1, phase: 'idle' });
  expect(settled.weaponPresentation).toMatchObject({ passiveKnifeVisible: false, passiveKnifeModel: true });
  expect(pageErrors).toEqual([]);
});
