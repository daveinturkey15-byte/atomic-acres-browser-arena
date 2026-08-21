import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const releaseChannels = JSON.parse(readFileSync(resolve(process.cwd(), 'release-channels.json'), 'utf8')) as {
  latest: { label: string };
  experimental: { label: string; pass: string };
  previous: { label: string; pass: string };
  retained: { label: string; pass: string };
  historical: { label: string; pass: string };
};

test('offers Pass 73, exact previous Pass 72, retained Pass 70 and Pass 69, and stable Pass 63 WebGL', async ({ page }, testInfo) => {
  await page.goto('/?release=choose&renderer=webgl2');

  await expect(page.locator('#release-channel-gate')).toBeVisible();
  await expect(page.locator('#menu')).toHaveCount(0);
  await expect(page.locator('.release-channel-option')).toHaveCount(5);
  expect(releaseChannels.latest.label).toBe('PASS 73');
  expect(releaseChannels.experimental.label).toBe('PASS 73');
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText(releaseChannels.experimental.pass);
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText(releaseChannels.experimental.label);
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText('RELEASE CANDIDATE');
  await expect(page.locator('[data-release-choice="experimental"]')).not.toContainText(/\bLIVE\b/u);
  await expect(page.locator('[data-release-choice="previous"]')).toContainText(releaseChannels.previous.pass);
  await expect(page.locator('[data-release-choice="previous"]')).toContainText('PREVIOUS LIVE');
  await expect(page.locator('[data-release-choice="retained"]')).toContainText(releaseChannels.retained.pass);
  await expect(page.locator('[data-release-choice="retained"]')).toContainText('RETAINED LIVE');
  await expect(page.locator('[data-release-choice="historical"]')).toContainText(releaseChannels.historical.pass);
  await expect(page.locator('[data-release-choice="historical"]')).toContainText('RETAINED STABLE');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('PASS 63');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('STABLE WEBGL');
  await expect(page.locator('[data-release-choice="rollback"]')).toHaveCount(0);
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 65');
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 59');
  await expect(page.getByText('Ctrl+Shift+R')).toBeVisible();
  await expect(page.locator('[id$="hard-refresh"]')).toHaveText('HARD RESET / REFRESH');

  const artifactRoot = resolve(process.cwd(), 'artifacts/pass73/release-shell');
  mkdirSync(artifactRoot, { recursive: true });
  const screenshot = resolve(artifactRoot, 'pass73-pass72-pass70-pass69-pass63-chooser.png');
  await page.screenshot({ path: screenshot, animations: 'disabled', fullPage: true });
  await testInfo.attach('pass73-pass72-pass70-pass69-pass63-chooser', { path: screenshot, contentType: 'image/png' });

  await page.locator('[data-release-choice="experimental"]').click();
  await expect(page).toHaveURL(/\/channels\/the-big-one\/.*release=latest/);
  await expect(page.locator('#release-channel-gate')).toHaveCount(0);
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#last-updated-btn')).toHaveText('CURRENT CANDIDATE · PUBLIC HITL AFTER RELEASE');
  await page.locator('#last-updated-btn').click();
  const current = page.locator('#changelog-list > li').first();
  await expect(current).toHaveAttribute('data-changelog-id', 'pass73');
  await expect(current.locator('.changelog-entry-pass b')).toHaveText('LOCAL CANDIDATE');
  await expect(current.locator('time')).not.toHaveAttribute('datetime', /.+/u);
  await expect(current.locator('time')).toContainText('NOT PUBLISHED');
  await expect(current.locator('time')).toContainText('AWAITING OWNER HITL');
});

test('front-page hard reset clears CacheStorage and reloads the chooser', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.evaluate(async () => { await caches.open('pass73-stale-test'); });
  await page.locator('[id$="hard-refresh"]').click();
  await page.waitForURL(/cachebust=\d+/u);
  await expect(page.locator('#release-channel-gate')).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).includes('pass73-stale-test'))).toBe(false);
});

test('routes the stable choice to retained Pass 63 WebGL', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.locator('[data-release-choice="stable"]').click();
  await expect(page).toHaveURL(/\/channels\/pass63-rollback\/\?release=latest/);
});

test('routes the previous-live choice to exact Pass 72', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.locator('[data-release-choice="previous"]').click();
  await expect(page).toHaveURL(/\/channels\/pass72-retained\/\?release=latest/);
  await expect(page.locator('.command-brand span')).toContainText('PASS 72');
});

test('routes the retained choice to exact Pass 70', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.locator('[data-release-choice="retained"]').click();
  await expect(page).toHaveURL(/\/channels\/pass70-retained\/\?release=latest/);
  await expect(page.locator('.command-brand span')).toContainText('PASS 70');
});

test('routes the historical choice to exact Pass 69', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.locator('[data-release-choice="historical"]').click();
  await expect(page).toHaveURL(/\/channels\/pass69-retained\/\?release=latest/);
  await expect(page.locator('.command-brand span')).toContainText('PASS 69');
});

test('keeps legacy latest, normal and room entries on Pass 73', async ({ page }) => {
  for (const query of ['?release=latest', '?release=normal', '?room=qa-room&autojoin=1']) {
    await page.goto(`/${query}&renderer=webgl2`);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('.command-brand span')).toContainText(releaseChannels.experimental.pass);
    await expect(page.locator('.command-brand span')).not.toContainText('THE BIG ONE');
    await expect(page.locator('.command-brand span')).not.toContainText('HITL CANDIDATE');
  }
});
