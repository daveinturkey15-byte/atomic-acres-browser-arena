import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const MOBILE_STORAGE_KEY = 'atomic-acres-mobile-controls';
test.use({ hasTouch: true, isMobile: true });

async function ready(page: Page, width: number, height: number, arena = 'atomic-acres'): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.addInitScript((storageKey) => localStorage.setItem(storageKey, 'on'), MOBILE_STORAGE_KEY);
  await page.goto(`/?release=latest&map=${arena}&renderer=webgl2&render=performance&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass69-mobile-touch&previewTime=0`);
  await page.waitForFunction(() => {
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return solo?.disabled === false
      && debug?.snapshot().weaponReady === true
      && debug.snapshot().bootstrap.stage === 'ready';
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase === 'active',
    undefined,
    { timeout: 60_000 },
  );
  await expect(page.locator('body')).toHaveClass(/mtc-live/u);
  await expect(page.locator('#mobile-touch-controls')).toBeVisible();
}

type RectRecord = Readonly<{ label: string; left: number; top: number; right: number; bottom: number }>;

async function visibleGameplayRects(page: Page): Promise<RectRecord[]> {
  return page.evaluate(() => {
    const selectors = [
      '#mobile-touch-controls .mtc-stick',
      '#mobile-touch-controls .mtc-btn',
      '.hud-mission-console',
      '.hud-operator-console',
      '.hud-weapon-console',
    ];
    return selectors.flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.dataset.mtc ?? element.id ?? element.className,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      });
  });
}

function overlaps(a: RectRecord, b: RectRecord): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
}

function edgeGap(a: RectRecord, b: RectRecord): number {
  const horizontal = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const vertical = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  return Math.hypot(horizontal, vertical);
}

for (const viewport of [
  { name: 'narrow portrait', width: 320, height: 667 },
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
]) {
  test(`keeps touch controls and compact HUD usable in ${viewport.name}`, async ({ page }, testInfo) => {
    await ready(page, viewport.width, viewport.height);
    const rects = await visibleGameplayRects(page);
    const viewportBounds = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
    for (const rect of rects) {
      expect(rect.left, `${rect.label} left`).toBeGreaterThanOrEqual(viewportBounds.left - 1);
      expect(rect.top, `${rect.label} top`).toBeGreaterThanOrEqual(viewportBounds.top - 1);
      expect(rect.right, `${rect.label} right`).toBeLessThanOrEqual(viewportBounds.right + 1);
      expect(rect.bottom, `${rect.label} bottom`).toBeLessThanOrEqual(viewportBounds.bottom + 1);
    }
    const collisions: string[] = [];
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) {
        if (overlaps(rects[a], rects[b])) collisions.push(`${rects[a].label}↔${rects[b].label}`);
      }
    }
    expect(collisions).toEqual([]);
    const lookStick = rects.find(({ label }) => label === 'stick-look');
    const fire = rects.find(({ label }) => label === 'fire');
    expect(lookStick).toBeDefined();
    expect(fire).toBeDefined();
    expect(edgeGap(lookStick!, fire!), 'FIRE stays within one thumb gap of the aim stick').toBeLessThanOrEqual(24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const evidenceDir = resolve(process.cwd(), 'artifacts/pass69/mobile-touch-layout');
    mkdirSync(evidenceDir, { recursive: true });
    const screenshot = resolve(evidenceDir, `${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach(`${viewport.name}-layout`, { path: screenshot, contentType: 'image/png' });
  });
}

test('acquires each stick through its centre knob and emits gamepad-shaped axes', async ({ page }) => {
  await ready(page, 844, 390);
  const move = page.locator('[data-mtc="stick-move"]');
  const moveKnob = move.locator('.mtc-stick-knob');
  await expect(moveKnob).not.toHaveAttribute('data-mtc', /.+/u);
  const moveBounds = await move.boundingBox();
  if (!moveBounds) throw new Error('Move stick has no touch target');
  const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position as number[]);
  await page.mouse.move(moveBounds.x + moveBounds.width / 2, moveBounds.y + moveBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBounds.x + moveBounds.width * 0.78, moveBounds.y + moveBounds.height / 2);
  await expect.poll(async () => page.evaluate((start) => {
    const current = window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position as number[];
    return Math.hypot(current[0] - start[0], current[2] - start[2]);
  }, before)).toBeGreaterThan(0.2);
  await page.mouse.up();

  const look = page.locator('[data-mtc="stick-look"]');
  const lookBounds = await look.boundingBox();
  if (!lookBounds) throw new Error('Look stick has no touch target');
  const yawBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCameraYaw as number);
  await page.mouse.move(lookBounds.x + lookBounds.width / 2, lookBounds.y + lookBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(lookBounds.x + lookBounds.width * 0.78, lookBounds.y + lookBounds.height / 2);
  await expect.poll(async () => page.evaluate((start) => (
    Math.abs((window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCameraYaw as number) - start)
  ), yawBefore)).toBeGreaterThan(0.02);
  await page.mouse.up();
});

test('survives bidirectional mid-match rotation and clears held touch ownership', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await ready(page, 390, 844);

  const move = page.locator('[data-mtc="stick-move"]');
  const moveKnob = move.locator('.mtc-stick-knob');
  const moveBounds = await move.boundingBox();
  if (!moveBounds) throw new Error('MOVE control has no touch target');
  const portraitFrame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  await page.mouse.move(moveBounds.x + moveBounds.width / 2, moveBounds.y + moveBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBounds.x + moveBounds.width * 0.78, moveBounds.y + moveBounds.height / 2);
  await expect.poll(async () => moveKnob.evaluate((element) => (element as HTMLElement).style.transform))
    .not.toBe('translate(-50%, -50%)');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase)).toBe('active');
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount)).toBeGreaterThan(portraitFrame);
  await expect.poll(async () => moveKnob.evaluate((element) => (element as HTMLElement).style.transform))
    .toBe('translate(-50%, -50%)');
  await page.mouse.up();

  const look = page.locator('[data-mtc="stick-look"]');
  const lookKnob = look.locator('.mtc-stick-knob');
  const lookBounds = await look.boundingBox();
  if (!lookBounds) throw new Error('AIM control has no touch target');
  const landscapeFrame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  await page.mouse.move(lookBounds.x + lookBounds.width / 2, lookBounds.y + lookBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(lookBounds.x + lookBounds.width * 0.78, lookBounds.y + lookBounds.height / 2);
  await expect.poll(async () => lookKnob.evaluate((element) => (element as HTMLElement).style.transform))
    .not.toBe('translate(-50%, -50%)');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase)).toBe('active');
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount)).toBeGreaterThan(landscapeFrame);
  await expect.poll(async () => lookKnob.evaluate((element) => (element as HTMLElement).style.transform))
    .toBe('translate(-50%, -50%)');
  await page.mouse.up();

  const fire = page.locator('[data-mtc="fire"]');
  const fireBounds = await fire.boundingBox();
  if (!fireBounds) throw new Error('FIRE control has no touch target');
  await page.mouse.move(fireBounds.x + fireBounds.width / 2, fireBounds.y + fireBounds.height / 2);
  await page.mouse.down();
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld)).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => page.evaluate(() => ({
    phase: window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase,
    triggerHeld: window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld,
    frameCount: window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount,
  }))).toMatchObject({ phase: 'active', triggerHeld: false, frameCount: expect.any(Number) });
  await expect(page.locator('#mobile-touch-controls')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mtc-live/u);
  await page.mouse.up();
  expect(pageErrors).toEqual([]);
});

test('fires a semi-automatic weapon from touch without pointer lock', async ({ page }) => {
  await ready(page, 390, 844);
  const before = await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.equipWeapon('scattergun');
    return {
      ammo: window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo,
      pointerLocked: document.pointerLockElement !== null,
    };
  });
  expect(before.pointerLocked).toBe(false);
  const fire = page.locator('[data-mtc="fire"]');
  const fireBounds = await fire.boundingBox();
  if (!fireBounds) throw new Error('FIRE control has no touch target');
  await page.touchscreen.tap(fireBounds.x + fireBounds.width / 2, fireBounds.y + fireBounds.height / 2);
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo)).toBe(before.ammo - 1);
});

test('sustains and releases automatic fire from the mobile overlay without pointer lock', async ({ page }) => {
  await ready(page, 844, 390);
  const before = await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine');
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      ammo: snapshot.player.ammo,
      pointerLocked: document.pointerLockElement !== null,
    };
  });
  expect(before.pointerLocked).toBe(false);
  const fire = page.locator('[data-mtc="fire"]');
  const fireBounds = await fire.boundingBox();
  if (!fireBounds) throw new Error('FIRE control has no held-input target');
  await page.mouse.move(fireBounds.x + fireBounds.width / 2, fireBounds.y + fireBounds.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(async () => page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        ammo: snapshot.player.ammo,
        triggerHeld: snapshot.textChat.triggerHeld,
        pointerLocked: document.pointerLockElement !== null,
      };
    }), { timeout: 5_000 }).toMatchObject({
      ammo: expect.any(Number),
      triggerHeld: true,
      pointerLocked: false,
    });
    await expect.poll(async () => page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo
    )), { timeout: 5_000 }).toBeLessThanOrEqual(before.ammo - 3);
  } finally {
    await page.mouse.up();
  }
  const releasedAmmo = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => ({
    ammo: window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo,
    triggerHeld: window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld,
  }))).toEqual({ ammo: releasedAmmo, triggerHeld: false });
});

test('routes mobile USE and PAUSE through the live interaction and menu lifecycles', async ({ page }) => {
  await ready(page, 390, 844, 'gun-range');
  const staged = await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const station = debug.snapshot().rangePractice.stations.find((candidate: any) => candidate.visible);
    if (!station) throw new Error('Gun range has no visible mobile interaction station');
    debug.teleportPlayer(station.position[0], station.position[1] + 1.7, station.position[2]);
    return {
      targetId: `station:${station.weapon}`,
    };
  });
  await expect.poll(async () => page.evaluate((targetId) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.candidates
      .some((candidate: any) => candidate.targetId === targetId)
  ), staged.targetId)).toBe(true);

  const use = page.locator('[data-mtc="interact"]');
  await expect(use).toBeVisible();
  const useBounds = await use.boundingBox();
  if (!useBounds) throw new Error('USE control has no touch target');
  await page.touchscreen.tap(useBounds.x + useBounds.width / 2, useBounds.y + useBounds.height / 2);
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.lastCommit?.candidate.targetId ?? null
  ))).toBe(staged.targetId);

  const pause = page.locator('[data-mtc="pause"]');
  await expect(pause).toBeVisible();
  const pauseBounds = await pause.boundingBox();
  if (!pauseBounds) throw new Error('PAUSE control has no touch target');
  await page.touchscreen.tap(pauseBounds.x + pauseBounds.width / 2, pauseBounds.y + pauseBounds.height / 2);
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().menuLifecycle.surface
  ))).toBe('paused-match');
  await expect(page.locator('#mobile-touch-controls')).toBeHidden();
});
