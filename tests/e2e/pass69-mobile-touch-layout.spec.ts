import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const MOBILE_STORAGE_KEY = 'atomic-acres-mobile-controls';
test.use({ hasTouch: true, isMobile: true });

async function ready(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.addInitScript((storageKey) => localStorage.setItem(storageKey, 'on'), MOBILE_STORAGE_KEY);
  await page.goto('/?release=latest&renderer=webgl2&render=performance&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass69-mobile-touch&previewTime=0');
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const evidenceDir = resolve(process.cwd(), 'artifacts/pass69/mobile-touch-layout');
    mkdirSync(evidenceDir, { recursive: true });
    const screenshot = resolve(evidenceDir, `${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach(`${viewport.name}-layout`, { path: screenshot, contentType: 'image/png' });
  });
}

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
