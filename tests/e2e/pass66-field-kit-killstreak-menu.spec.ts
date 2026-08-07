import { mkdirSync, readFileSync } from 'node:fs';
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
    expect(await presentations.evaluateAll((roots) => roots.every((root) => {
      const deck = root.querySelector<HTMLElement>('.weapon-menu-stat-deck');
      const card = root.closest<HTMLElement>('.kit-card');
      if (!deck || !card) return false;
      const presentationStyle = getComputedStyle(root);
      const deckStyle = getComputedStyle(deck);
      const presentationBounds = root.getBoundingClientRect();
      const deckBounds = deck.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      return presentationStyle.display === 'grid'
        && deckStyle.display === 'grid'
        && deckBounds.height > 0
        && presentationBounds.left >= cardBounds.left
        && presentationBounds.right <= cardBounds.right + 1
        && deckBounds.left >= presentationBounds.left
        && deckBounds.right <= presentationBounds.right + 1
        && root.scrollWidth <= root.clientWidth + 1;
    }))).toBe(true);
    await expect.poll(async () => page.locator('#menu-panel-kit [data-weapon-still]').evaluateAll((images) => (
      images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)
    ))).toBe(true);

    await page.locator('[data-custom-modify="custom-1"]').click();
    await page.locator('#loadout-manage-preset').selectOption('custom-1');
    await page.locator('#loadout-primary').selectOption('ak-47');
    await page.locator('#loadout-save').click();
    await expect(page.locator('[data-custom-preset-id="custom-1"] [data-weapon-presentation]'))
      .toHaveAttribute('data-weapon-id', 'ak-47');
    await expect(page.locator('[data-custom-preset-id="custom-1"] [data-weapon-stat-name]')).toHaveText('AK-47');
    await expect(page.locator('[data-custom-preset-id="custom-1"] [data-weapon-metric="fire-rate"] [data-weapon-metric-value]'))
      .toHaveText('600 RPM');

    const idleCustomCardStyle = await page.locator('[data-custom-preset-id="custom-2"]').evaluate((card) => {
      const title = card.querySelector('strong')!;
      const description = card.querySelector('p')!;
      const style = getComputedStyle(card);
      return {
        backgroundImage: style.backgroundImage,
        titleColor: getComputedStyle(title).color,
        descriptionColor: getComputedStyle(description).color,
      };
    });
    expect(idleCustomCardStyle.backgroundImage).toContain('linear-gradient');
    expect(idleCustomCardStyle.backgroundImage).not.toBe('none');
    expect(idleCustomCardStyle.titleColor).toBe('rgb(255, 255, 255)');
    expect(idleCustomCardStyle.descriptionColor).toBe('rgb(196, 216, 213)');

    const output = resolve(process.cwd(), 'artifacts/pass66/ui-correction');
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: resolve(output, 'field-kit-1600x900.png'), animations: 'disabled' });
    await testInfo.attach('field-kit-1600x900', { path: resolve(output, 'field-kit-1600x900.png'), contentType: 'image/png' });
  });

  test('previews the equipped streak on hover/focus without gameplay render ownership', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await ready(page);
    const arenaConstructionBefore = await page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.streaming.constructionHistory
    ));
    await page.locator('#menu-tab-streaks').click();

    const rail = page.locator('#killstreak-demo-rail');
    const decoder = rail.locator('video[data-demo-video]');
    await expect(rail).toBeVisible();
    await expect(decoder).toHaveCount(1);
    await page.locator('[data-killstreak-slot-card="4"]').hover();
    await expect(rail).toHaveAttribute('data-demo-id', 'chopper');
    await expect(decoder).toHaveAttribute('src', './assets/original/killstreak-demo/chopper.mp4');
    await page.locator('[data-killstreak-slot="5"]').focus();
    await expect(rail).toHaveAttribute('data-demo-id', 'nuke');
    await expect(decoder).toHaveAttribute('src', './assets/original/killstreak-demo/nuke.mp4');
    await page.locator('[data-killstreak-slot="1"]').selectOption('adrenaline');
    await expect(rail).toHaveAttribute('data-demo-id', 'adrenaline');
    await expect(page.locator('#killstreak-demo-title')).toHaveText('ADRENALINE BOOST');
    await expect(rail.locator('canvas')).toHaveCount(0);
    await expect(decoder).toHaveCount(1);
    await expect(decoder).toHaveAttribute('data-demo-id', 'adrenaline');
    await expect.poll(async () => decoder.evaluate((element) => ({
      ready: (element as HTMLVideoElement).readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      paused: (element as HTMLVideoElement).paused,
    }))).toEqual({ ready: true, paused: false });
    await expect(rail).toHaveAttribute('data-media', 'video');
    await expect(rail.locator('[data-demo-toggle]')).toBeVisible();
    await rail.locator('[data-demo-toggle]').click();
    await expect.poll(async () => decoder.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
    await expect(rail.locator('[data-demo-toggle]')).toHaveText('PLAY');
    await rail.locator('[data-demo-toggle]').click();
    await expect.poll(async () => decoder.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false);
    await page.locator('#menu-tab-kit').click();
    await expect(decoder).not.toHaveAttribute('src', /.+/u);
    await expect.poll(async () => decoder.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
    await page.locator('#menu-tab-streaks').click();
    await expect(decoder).toHaveAttribute('src', './assets/original/killstreak-demo/adrenaline.mp4');
    await expect.poll(async () => decoder.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false);
    expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.streaming.constructionHistory))
      .toEqual(arenaConstructionBefore);

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
    await expect(rail.locator('[data-demo-mode]')).toHaveText('REDUCED MOTION / REAL POSTER');
    await expect(rail.locator('video')).toHaveCount(1);
    await expect(rail.locator('video')).not.toHaveAttribute('src', /.+/u);
    await expect(rail.locator('[data-demo-toggle]')).toBeHidden();
    expect(await page.evaluate(() => ({
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelOverflowX: document.querySelector<HTMLElement>('#menu-panel-streaks')!.scrollWidth
        - document.querySelector<HTMLElement>('#menu-panel-streaks')!.clientWidth,
      columnCount: getComputedStyle(document.querySelector<HTMLElement>('.killstreak-loadout-layout')!)
        .gridTemplateColumns.split(' ').length,
    }))).toEqual({ pageOverflowX: 0, panelOverflowX: 0, columnCount: 1 });
  });

  test('reuses one decoder through rapid selection races and releases it off-surface', async ({ page }) => {
    const knownGoodVideo = readFileSync(resolve(process.cwd(), 'public/assets/original/menu-previews/gun-range.mp4'));
    await page.route('**/assets/original/killstreak-demo/*.mp4', (route) => route.fulfill({
      status: 200,
      contentType: 'video/mp4',
      body: knownGoodVideo,
    }));
    await page.setViewportSize({ width: 1280, height: 720 });
    await ready(page);
    const constructionBefore = await page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.streaming.constructionHistory
    ));
    await page.locator('#menu-tab-streaks').click();
    const rail = page.locator('#killstreak-demo-rail');
    const decoder = rail.locator('video[data-demo-video]');
    await expect.poll(async () => decoder.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false);
    for (const slot of [2, 4, 1, 3, 5]) {
      await page.locator(`[data-killstreak-slot="${slot}"]`).focus();
    }
    await expect(rail).toHaveAttribute('data-demo-id', 'nuke');
    await expect(decoder).toHaveCount(1);
    await expect(decoder).toHaveAttribute('data-demo-id', 'nuke');
    await expect(decoder).toHaveAttribute('src', './assets/original/killstreak-demo/nuke.mp4');
    await expect(rail).toHaveAttribute('data-media', 'video');

    await page.evaluate(() => { document.documentElement.dataset.reducedMotion = 'true'; });
    await expect(rail).toHaveAttribute('data-motion', 'poster');
    await expect(decoder).not.toHaveAttribute('src', /.+/u);
    await expect.poll(async () => decoder.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true);
    await page.evaluate(() => { delete document.documentElement.dataset.reducedMotion; });
    await expect(decoder).toHaveAttribute('src', './assets/original/killstreak-demo/nuke.mp4');
    await expect.poll(async () => decoder.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false);
    await page.locator('#menu-tab-kit').click();
    await expect(decoder).not.toHaveAttribute('src', /.+/u);
    expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.streaming.constructionHistory))
      .toEqual(constructionBefore);
  });

  test('falls back to the verified poster when local video decoding fails', async ({ page }) => {
    await page.route('**/assets/original/killstreak-demo/*.mp4', (route) => route.fulfill({ status: 415, body: '' }));
    await page.setViewportSize({ width: 1280, height: 720 });
    await ready(page);
    await page.locator('#menu-tab-streaks').click();
    const rail = page.locator('#killstreak-demo-rail');
    await expect(rail).toHaveAttribute('data-media', 'poster');
    await expect(rail.locator('[data-demo-mode]')).toHaveText('REAL POSTER / VIDEO UNAVAILABLE');
    await expect(rail.locator('[data-demo-poster]')).toBeVisible();
    await expect(rail.locator('video[data-demo-video]')).toHaveCount(1);
    await expect(rail.locator('canvas')).toHaveCount(0);
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
