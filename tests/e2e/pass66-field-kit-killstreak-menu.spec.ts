import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page): Promise<void> {
  await page.goto('/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass66-menu-correction&previewTime=0');
  await page.waitForFunction(() => {
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
}

test.describe('Pass 66 Field Kit and killstreak menu correction', () => {
  test('shows asset-backed stills, exact metric parity and live custom-primary projection', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await ready(page);
    await page.locator('#menu-tab-kit').click();

    const presentations = page.locator('#menu-panel-kit [data-weapon-presentation]');
    await expect(presentations).toHaveCount(7);
    await expect(page.locator('#menu-panel-kit [data-weapon-metric]')).toHaveCount(63);
    expect(await presentations.evaluateAll((roots) => roots.every((root) => (
      root.querySelectorAll('[data-weapon-metric]').length === 9
    )))).toBe(true);
    await expect.poll(async () => page.locator('#menu-panel-kit [data-weapon-still]').evaluateAll((images) => (
      images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)
    ))).toBe(true);

    await page.locator('#loadout-manage').click();
    await page.locator('#loadout-manage-preset').selectOption('custom-1');
    await page.locator('#loadout-primary').selectOption('ak-47');
    await page.locator('#loadout-save').click();
    await expect(page.locator('[data-custom-preset-id="custom-1"] [data-weapon-presentation]'))
      .toHaveAttribute('data-weapon-id', 'ak-47');
    await expect(page.locator('[data-custom-preset-id="custom-1"] [data-weapon-stat-name]')).toHaveText('AK-47');
    await expect(page.locator('[data-custom-preset-id="custom-1"] [data-weapon-metric="fire-rate"] [data-weapon-metric-value]'))
      .toHaveText('600 RPM');

    const output = resolve(process.cwd(), 'artifacts/pass66/ui-correction');
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: resolve(output, 'field-kit-1600x900.png'), animations: 'disabled' });
    await testInfo.attach('field-kit-1600x900', { path: resolve(output, 'field-kit-1600x900.png'), contentType: 'image/png' });
  });

  test('previews the equipped streak on hover/focus without gameplay render ownership', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await ready(page);
    await page.locator('#menu-tab-streaks').click();

    const rail = page.locator('#killstreak-demo-rail');
    await expect(rail).toBeVisible();
    await page.locator('[data-killstreak-slot-card="4"]').hover();
    await expect(rail).toHaveAttribute('data-demo-id', 'chopper');
    await page.locator('[data-killstreak-slot="5"]').focus();
    await expect(rail).toHaveAttribute('data-demo-id', 'nuke');
    await page.locator('[data-killstreak-slot="1"]').selectOption('adrenaline');
    await expect(rail).toHaveAttribute('data-demo-id', 'adrenaline');
    await expect(page.locator('#killstreak-demo-title')).toHaveText('ADRENALINE BOOST');
    await expect(rail.locator('canvas')).toHaveCount(0);
    await expect(rail.locator('video')).toHaveCount(0);

    const layout = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('#menu-panel-streaks')!;
      const railElement = document.querySelector<HTMLElement>('#killstreak-demo-rail')!;
      return {
        pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panelOverflowX: panel.scrollWidth - panel.clientWidth,
        railRight: railElement.getBoundingClientRect().right,
        viewportWidth: innerWidth,
      };
    });
    expect(layout.pageOverflowX).toBe(0);
    expect(layout.panelOverflowX).toBe(0);
    expect(layout.railRight).toBeLessThanOrEqual(layout.viewportWidth + 1);

    const output = resolve(process.cwd(), 'artifacts/pass66/ui-correction');
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: resolve(output, 'killstreak-demo-1600x900.png'), animations: 'disabled' });
    await testInfo.attach('killstreak-demo-1600x900', { path: resolve(output, 'killstreak-demo-1600x900.png'), contentType: 'image/png' });
  });

  test('uses poster-only demo mode for reduced motion and stacks cleanly at narrow width', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    await page.locator('#menu-tab-streaks').click();
    const rail = page.locator('#killstreak-demo-rail');
    await expect(rail).toHaveAttribute('data-motion', 'poster');
    await expect(rail.locator('[data-demo-mode]')).toHaveText('REDUCED MOTION · POSTER ONLY');
    await expect(rail.locator('video')).toHaveCount(0);
    expect(await page.evaluate(() => ({
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelOverflowX: document.querySelector<HTMLElement>('#menu-panel-streaks')!.scrollWidth
        - document.querySelector<HTMLElement>('#menu-panel-streaks')!.clientWidth,
      columnCount: getComputedStyle(document.querySelector<HTMLElement>('.killstreak-loadout-layout')!)
        .gridTemplateColumns.split(' ').length,
    }))).toEqual({ pageOverflowX: 0, panelOverflowX: 0, columnCount: 1 });
  });

  test('keeps both corrected menu surfaces bounded across the retained desktop matrix', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await ready(page);
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
      { width: 3440, height: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      for (const tab of ['#menu-tab-kit', '#menu-tab-streaks']) {
        await page.locator(tab).click();
        expect(await page.evaluate(() => {
          const active = document.querySelector<HTMLElement>('.menu-panel.active')!;
          const bounds = active.getBoundingClientRect();
          return {
            pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            panelOverflowX: active.scrollWidth - active.clientWidth,
            withinViewport: bounds.left >= -1 && bounds.right <= innerWidth + 1,
          };
        })).toEqual({ pageOverflowX: 0, panelOverflowX: 0, withinViewport: true });
      }
    }
  });
});
