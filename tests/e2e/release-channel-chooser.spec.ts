import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const releaseChannels = JSON.parse(readFileSync(resolve(process.cwd(), 'release-channels.json'), 'utf8')) as {
  latest: { label: string };
  experimental: { label: string; pass: string };
};

test('offers only Pass 69 and the retained stable Pass 63 WebGL build', async ({ page }, testInfo) => {
  await page.goto('/?release=choose&renderer=webgl2');

  await expect(page.locator('#release-channel-gate')).toBeVisible();
  await expect(page.locator('#menu')).toHaveCount(0);
  await expect(page.locator('.release-channel-option')).toHaveCount(2);
  expect(releaseChannels.latest.label).toBe('PASS 69');
  expect(releaseChannels.experimental.label).toBe('PASS 69');
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText(releaseChannels.experimental.pass);
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText(releaseChannels.experimental.label);
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText('RELEASE CANDIDATE');
  await expect(page.locator('[data-release-choice="experimental"]')).not.toContainText(/\bLIVE\b/u);
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('PASS 63');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('STABLE WEBGL');
  await expect(page.locator('[data-release-choice="rollback"]')).toHaveCount(0);
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 65');
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 59');
  await expect(page.getByText('Ctrl+Shift+R')).toBeVisible();
  await expect(page.locator('[id$="hard-refresh"]')).toHaveText('HARD RESET / REFRESH');

  const artifactRoot = resolve(process.cwd(), 'artifacts/pass69/release-shell');
  mkdirSync(artifactRoot, { recursive: true });
  const screenshot = resolve(artifactRoot, 'pass69-pass63-stable-webgl.png');
  await page.screenshot({ path: screenshot, animations: 'disabled', fullPage: true });
  await testInfo.attach('pass69-pass63-stable-webgl', { path: screenshot, contentType: 'image/png' });

  await page.locator('[data-release-choice="experimental"]').click();
  await expect(page).toHaveURL(/\/channels\/the-big-one\/.*release=latest/);
  await expect(page.locator('#release-channel-gate')).toHaveCount(0);
  await expect(page.locator('#menu')).toBeVisible();
});

test('front-page hard reset clears CacheStorage and reloads the chooser', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.evaluate(async () => { await caches.open('pass69-1-stale-test'); });
  await page.locator('[id$="hard-refresh"]').click();
  await page.waitForURL(/cachebust=\d+/u);
  await expect(page.locator('#release-channel-gate')).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).includes('pass69-1-stale-test'))).toBe(false);
});

test('routes the stable choice to retained Pass 63 WebGL', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.locator('[data-release-choice="stable"]').click();
  await expect(page).toHaveURL(/\/channels\/pass63-rollback\/\?release=latest/);
});

test('keeps legacy latest, normal and room entries on Pass 69', async ({ page }) => {
  for (const query of ['?release=latest', '?release=normal', '?room=qa-room&autojoin=1']) {
    await page.goto(`/${query}&renderer=webgl2`);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('.command-brand span')).toContainText(releaseChannels.experimental.pass);
    await expect(page.locator('.command-brand span')).not.toContainText('THE BIG ONE');
    await expect(page.locator('.command-brand span')).not.toContainText('HITL CANDIDATE');
  }
});
