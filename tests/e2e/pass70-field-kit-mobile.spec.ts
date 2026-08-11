import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
});

test('keeps Pass 70 Field Kit values, bars and selection semantics readable on touch mobile', async ({ page }, testInfo) => {
  await page.goto('/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass70-field-kit-mobile&previewTime=0');
  await page.waitForFunction(() => {
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await page.locator('#menu-tab-kit').tap();

  const cardDecks = page.locator('#menu-panel-kit .kit-card [data-weapon-stat-deck]');
  await expect(cardDecks).toHaveCount(7);
  expect(await cardDecks.evaluateAll((decks) => decks.every((deck) => {
    const dps = deck.querySelector<HTMLElement>('[data-weapon-dps]');
    const dpsValue = deck.querySelector<HTMLElement>('[data-weapon-dps-value]');
    const metrics = [...deck.querySelectorAll<HTMLElement>('[data-weapon-metric]')];
    const metricValues = [...deck.querySelectorAll<HTMLElement>('[data-weapon-metric-value]')];
    return dps !== null
      && dpsValue !== null
      && Number.parseFloat(getComputedStyle(dpsValue).fontSize) >= 30
      && dps.querySelector('[data-weapon-metric-fill]') === null
      && metrics.map((row) => row.dataset.weaponMetric).join(',') === 'damage,fire-rate,effective-range,control,piercing'
      && metrics.every((row) => Number.parseFloat(getComputedStyle(row.querySelector('b')!).fontSize) >= 10)
      && metricValues.every((value) => value.textContent?.trim() && value.scrollWidth <= value.clientWidth + 1)
      && deck.scrollWidth <= deck.clientWidth + 1;
  }))).toBe(true);

  expect(await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('#menu-panel-kit')!;
    return {
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelOverflowX: panel.scrollWidth - panel.clientWidth,
    };
  })).toEqual({ pageOverflowX: 0, panelOverflowX: 0 });

  const customThree = page.locator('[data-custom-preset-id="custom-3"]');
  await customThree.tap();
  await expect(customThree).toHaveAttribute('aria-current', 'true');
  await expect(customThree.locator('em')).toBeVisible();
  await expect(page.locator('#menu-panel-kit .kit-card[aria-current="true"]')).toHaveCount(1);

  await page.locator('[data-custom-modify="custom-3"]').tap();
  await expect(page.locator('#loadout-manager')).toBeVisible();
  await expect(page.locator('#loadout-inspector [data-weapon-dps]')).toBeVisible();
  await expect(page.locator('#loadout-inspector [data-weapon-metric]')).toHaveCount(5);
  expect(await page.locator('#loadout-manager').evaluate((manager) => ({
    bounded: manager.scrollWidth <= manager.clientWidth + 1,
    columns: getComputedStyle(manager.querySelector<HTMLElement>('.loadout-manager-grid')!).gridTemplateColumns.split(' ').length,
  }))).toEqual({ bounded: true, columns: 1 });

  const output = resolve(process.cwd(), 'artifacts/pass70/field-kit-ui');
  mkdirSync(output, { recursive: true });
  const screenshot = resolve(output, 'field-kit-mobile-390x844.png');
  await page.screenshot({ path: screenshot, animations: 'disabled', fullPage: true });
  await testInfo.attach('field-kit-mobile-390x844', { path: screenshot, contentType: 'image/png' });
});
