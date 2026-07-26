import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

type PointerLockMode = 'resolve' | 'reject' | 'transient';

async function ready(page: Page, reducedMotion = false): Promise<void> {
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=pass65-menu-lifecycle&previewTime=0');
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return debug?.snapshot().weaponReady === true && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
}

async function installPointerLockHarness(page: Page, mode: PointerLockMode): Promise<void> {
  await page.evaluate((initialMode) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing game canvas');
    const harness = {
      mode: initialMode,
      locked: false,
      focused: true,
      requests: 0,
      losses: 0,
    };
    Object.defineProperty(window, '__PASS65_POINTER_LOCK__', { configurable: true, value: harness });
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => harness.locked ? canvas : null,
    });
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => harness.focused,
    });
    Object.defineProperty(canvas, 'requestPointerLock', {
      configurable: true,
      value: () => {
        harness.requests += 1;
        if (harness.mode === 'reject') return Promise.reject(new DOMException('QA rejection', 'NotAllowedError'));
        if (harness.mode === 'transient') {
          document.dispatchEvent(new Event('pointerlockchange'));
          queueMicrotask(() => {
            harness.locked = true;
            document.dispatchEvent(new Event('pointerlockchange'));
          });
          return Promise.resolve();
        }
        harness.locked = true;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: () => {
        if (!harness.locked) return;
        harness.locked = false;
        harness.losses += 1;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
  }, mode);
}

async function lifecycle(page: Page): Promise<Record<string, any>> {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().menuLifecycle as Record<string, any>);
}

async function startFromMenu(page: Page): Promise<void> {
  await page.locator('#player-name').fill('PASS65 QA');
  await page.locator('#solo').click();
  await expect(page.locator('#menu')).toBeHidden();
  await expect.poll(async () => (await lifecycle(page)).visibilityChangeCount).toBe(1);
}

async function setHarness(page: Page, patch: Partial<{ mode: PointerLockMode; locked: boolean; focused: boolean }>): Promise<void> {
  await page.evaluate((next) => {
    const harness = (window as unknown as {
      __PASS65_POINTER_LOCK__: { mode: PointerLockMode; locked: boolean; focused: boolean };
    }).__PASS65_POINTER_LOCK__;
    Object.assign(harness, next);
  }, patch);
}

test.describe('Pass 65 active-match menu lifecycle', () => {
  test('persists exactly three custom loadouts with primary, secondary, and one grenade', async ({ page }) => {
    await ready(page);
    await page.locator('[data-menu-tab="kit"]').click();
    await expect(page.locator('[data-kit-id]')).toHaveCount(4);
    await expect(page.locator('[data-custom-preset-id]')).toHaveCount(3);
    await expect(page.locator('#loadout-manage')).toHaveCount(1);

    await page.locator('#loadout-manage').click();
    await expect(page.locator('#loadout-manager')).toBeVisible();
    await page.locator('#loadout-manage-preset').selectOption('custom-2');
    await page.locator('#loadout-preset-name').fill('Night Ops');
    await page.locator('#loadout-primary').selectOption('minigun');
    await page.locator('#loadout-secondary').selectOption('explosive-crossbow');
    await page.locator('#loadout-grenade').selectOption('smoke');
    await page.locator('#loadout-save').click();
    await page.locator('[data-custom-preset-id="custom-2"]').click();

    const selected = page.locator('[data-custom-preset-id="custom-2"]');
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(selected.locator('[data-custom-name]')).toHaveText('Night Ops');
    await expect(selected.locator('[data-custom-equipment]')).toContainText('M134 Minigun');
    await expect(selected.locator('[data-custom-equipment]')).toContainText('TAC-15 Explosive Crossbow');
    await expect(selected.locator('[data-custom-equipment]')).toContainText('SMOKE');
    expect(await page.evaluate(() => {
      const player = window.__ATOMIC_ACRES_DEBUG__.snapshot().player as Record<string, unknown>;
      return {
        primary: player.primaryWeapon,
        secondary: player.secondaryWeapon,
        grenade: player.selectedGrenade,
        grenades: player.grenades,
      };
    })).toEqual({ primary: 'minigun', secondary: 'explosive-crossbow', grenade: 'smoke', grenades: 1 });

    await page.reload();
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
    await page.locator('[data-menu-tab="kit"]').click();
    await expect(page.locator('[data-custom-preset-id="custom-2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-custom-preset-id="custom-2"] [data-custom-name]')).toHaveText('Night Ops');
  });

  test('keeps pre-match helo/cat preview ownership and reduced-motion accessibility', async ({ page }) => {
    await ready(page, true);
    await expect(page.locator('#menu')).toHaveAttribute('data-lifecycle-surface', 'pre-match');
    await expect(page.locator('#menu')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#menu-preview-frame')).toBeVisible();
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-motion', 'static');
    await expect(page.locator('#menu-showcase > #game')).toHaveCount(0);
    await expect(page.locator('#menu-preview-poster')).toBeVisible();
    await expect(page.locator('#menu-preview-video source')).toHaveCount(0);
    await expect(page.locator('#match-pause-backdrop')).toBeHidden();
    await expect(page.locator('img[src*="atomic-acres-menu-squad-joke"]')).toHaveCount(0);
  });

  test('hides once through rejected/transient-null requests and Resume never bounces', async ({ page }, testInfo) => {
    await ready(page);
    await installPointerLockHarness(page, 'reject');
    await startFromMenu(page);

    await expect.poll(async () => (await lifecycle(page)).pointerLock).toBe('denied');
    expect(await lifecycle(page)).toMatchObject({
      surface: 'hidden',
      visibilityChangeCount: 1,
      pauseOpenCount: 0,
      pointerRequestCount: 1,
      pointerRejectCount: 1,
    });
    await page.evaluate(() => document.dispatchEvent(new Event('pointerlockchange')));
    expect(await lifecycle(page)).toMatchObject({ surface: 'hidden', visibilityChangeCount: 1, pauseOpenCount: 0 });

    await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount)).toBeGreaterThan(5);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#resume')).toBeFocused();
    await expect(page.locator('#resume')).toHaveText('RETURN TO MATCH');
    await page.locator('#resume').hover();
    expect(await page.locator('#resume').evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
    }))).toEqual({ background: 'rgb(0, 87, 93)', color: 'rgb(255, 255, 255)' });
    await expect(page.locator('#menu-preview-frame')).toBeHidden();
    await expect(page.locator('#match-pause-backdrop')).toBeVisible();
    const backdrop = await lifecycle(page).then((state) => state.backdrop as Record<string, any>);
    expect(backdrop).toMatchObject({
      visible: true,
      provenance: 'renderer-canvas',
      captureStatus: 'captured',
      captureReason: 'debug-pause',
      sourceCanvas: 'game',
      sourceArena: 'atomic-acres',
    });
    expect(backdrop.sourceFrame).toBeGreaterThan(0);
    expect(backdrop.sourceAgeMs).toBeLessThan(250);
    expect(backdrop.pixelHash).toMatch(/^[0-9a-f]{8}$/);
    expect(backdrop.pixelSignal).toBe('varied');
    expect(await page.locator('#match-pause-backdrop').evaluate((element) => getComputedStyle(element).filter)).toContain('blur(8px)');

    const directory = resolve(process.cwd(), 'artifacts/pass65/menu-lifecycle');
    mkdirSync(directory, { recursive: true });
    const screenshot = resolve(directory, 'held-match-pause-rejected-lock.png');
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach('held-match-pause-rejected-lock', { path: screenshot, contentType: 'image/png' });

    await page.locator('#resume').click();
    await expect(page.locator('#menu')).toBeHidden();
    await expect.poll(async () => (await lifecycle(page)).pointerLock).toBe('denied');
    await page.waitForTimeout(150);
    expect(await lifecycle(page)).toMatchObject({
      surface: 'hidden',
      visibilityChangeCount: 3,
      pauseOpenCount: 1,
      pointerRequestCount: 2,
      pointerRejectCount: 2,
    });
    await expect(page.locator('#menu')).toHaveAttribute('aria-hidden', 'true');
  });

  test('distinguishes focus suspension from a real Escape lock loss', async ({ page }) => {
    await ready(page);
    await installPointerLockHarness(page, 'transient');
    await startFromMenu(page);
    await expect.poll(async () => (await lifecycle(page)).pointerLock).toBe('locked');
    expect(await lifecycle(page)).toMatchObject({ surface: 'hidden', visibilityChangeCount: 1, pauseOpenCount: 0 });

    await setHarness(page, { focused: false });
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      const harness = (window as unknown as { __PASS65_POINTER_LOCK__: { locked: boolean } }).__PASS65_POINTER_LOCK__;
      harness.locked = false;
      document.dispatchEvent(new Event('pointerlockchange'));
    });
    expect(await lifecycle(page)).toMatchObject({ surface: 'hidden', pointerLock: 'focus-suspended', pauseOpenCount: 0 });
    await setHarness(page, { focused: true });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    expect(await lifecycle(page)).toMatchObject({ surface: 'hidden', pointerLock: 'unlocked', reason: 'focus-return' });

    await setHarness(page, { mode: 'resolve' });
    await page.evaluate(() => document.querySelector<HTMLCanvasElement>('#game')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    await expect.poll(async () => (await lifecycle(page)).pointerLock).toBe('locked');
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      const harness = (window as unknown as { __PASS65_POINTER_LOCK__: { locked: boolean } }).__PASS65_POINTER_LOCK__;
      harness.locked = false;
      document.dispatchEvent(new Event('pointerlockchange'));
    });

    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#resume')).toBeFocused();
    await expect(page.locator('#match-pause-backdrop')).toBeVisible();
    await expect(page.locator('#menu-preview-frame')).toBeHidden();
    expect(await lifecycle(page)).toMatchObject({
      surface: 'paused-match',
      pointerLock: 'unlocked',
      reason: 'escape',
      visibilityChangeCount: 2,
      pauseOpenCount: 1,
    });
  });
});
