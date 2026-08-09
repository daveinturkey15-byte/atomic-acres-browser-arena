import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const releaseChannels = JSON.parse(readFileSync(resolve(process.cwd(), 'release-channels.json'), 'utf8')) as {
  latest: { label: string };
  experimental: { label: string; pass: string };
};

test('offers the Pass 69.3 candidate without claiming it is live, plus stable Pass 67.1 and rollback Pass 63', async ({ page }, testInfo) => {
  await page.goto('/?release=choose&renderer=webgl2');

  await expect(page.locator('#release-channel-gate')).toBeVisible();
  await expect(page.locator('#menu')).toHaveCount(0);
  const hasRollback = await page.evaluate(() => Boolean(window.__ATOMIC_ACRES_RELEASE_CHANNELS__?.rollback));
  await expect(page.locator('.release-channel-option')).toHaveCount(hasRollback ? 3 : 2);
  expect(releaseChannels.latest.label).toBe('THE BIG ONE v69.3');
  expect(releaseChannels.experimental.label).toBe('THE BIG ONE v69.3');
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText(releaseChannels.experimental.pass);
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText(releaseChannels.experimental.label);
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText('RELEASE CANDIDATE');
  await expect(page.locator('[data-release-choice="experimental"]')).not.toContainText(/\bLIVE\b/u);
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('PASS 67.1');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('STABLE');
  if (hasRollback) {
    await expect(page.locator('[data-release-choice="rollback"]')).toContainText('PASS 63');
    await expect(page.locator('[data-release-choice="rollback"]')).toContainText('ROLLBACK');
  }
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 65');
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 59');
  await expect(page.getByText('Ctrl+Shift+R')).toBeVisible();
  await expect(page.locator('[id$="hard-refresh"]')).toHaveText('HARD RESET / REFRESH');

  const artifactRoot = resolve(process.cwd(), 'artifacts/pass69/release-shell');
  mkdirSync(artifactRoot, { recursive: true });
  const screenshot = resolve(artifactRoot, 'the-big-one-candidate-pass671-stable.png');
  await page.screenshot({ path: screenshot, animations: 'disabled', fullPage: true });
  await testInfo.attach('the-big-one-candidate-pass671-stable', { path: screenshot, contentType: 'image/png' });

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

test('routes the stable choice to byte-exact Pass 67.1', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.locator('[data-release-choice="stable"]').click();
  await expect(page).toHaveURL(/\/channels\/recent-stable\/\?release=latest/);
});

test('keeps legacy latest, normal and room entries on the live experimental The Big One', async ({ page }) => {
  for (const query of ['?release=latest', '?release=normal', '?room=qa-room&autojoin=1']) {
    await page.goto(`/${query}&renderer=webgl2`);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('.command-brand span')).toContainText(`${releaseChannels.experimental.pass} · THE BIG ONE`);
    await expect(page.locator('.command-brand span')).not.toContainText('HITL CANDIDATE');
  }
});
