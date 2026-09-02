import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHANGELOG } from '../../src/changelog';
import { PASS66_RELEASE_IDENTITY } from '../../src/release-identity';

const releaseChannels = JSON.parse(readFileSync(resolve(process.cwd(), 'release-channels.json'), 'utf8')) as {
  latest: { label: string };
  experimental: { label: string; pass: string };
  previous: { label: string; pass: string };
  retained: { label: string; pass: string };
  historical: { label: string; pass: string };
};

test('offers the stamped current pass, exact previous Pass 72, retained Pass 70 and Pass 69 without Pass 63', async ({ page }, testInfo) => {
  await page.goto('/?release=choose&renderer=webgl2');

  await expect(page.locator('#release-channel-gate')).toBeVisible();
  await expect(page.locator('#menu')).toHaveCount(0);
  await expect(page.locator('.release-channel-option')).toHaveCount(4);
  // HF-406: these were hardcoded to 'PASS 73' and went stale the moment the stamp moved,
  // so they were red before this change and told nobody why. They now pin the config
  // against `src/release-identity.ts`, which is the single source the badge, the features
  // panel and the project map all derive from - a strictly stronger check than a literal,
  // because it fails when the config and the stamp disagree at ANY pass, not just at 73.
  expect(releaseChannels.latest.label).toBe(PASS66_RELEASE_IDENTITY.pass);
  expect(releaseChannels.experimental.label).toBe(PASS66_RELEASE_IDENTITY.pass);
  expect(releaseChannels.experimental.pass).toBe(PASS66_RELEASE_IDENTITY.pass);
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
  await expect(page.locator('[data-release-choice="stable"]')).toHaveCount(0);
  await expect(page.locator('[data-release-choice="rollback"]')).toHaveCount(0);
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 65');
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 59');
  await expect(page.getByText('Ctrl+Shift+R')).toBeVisible();
  await expect(page.locator('[id$="hard-refresh"]')).toHaveText('HARD RESET / REFRESH');

  const artifactRoot = resolve(process.cwd(), 'artifacts/pass73/release-shell');
  mkdirSync(artifactRoot, { recursive: true });
  const screenshot = resolve(artifactRoot, 'pass73-pass72-pass70-pass69-chooser.png');
  await page.screenshot({ path: screenshot, animations: 'disabled', fullPage: true });
  await testInfo.attach('pass73-pass72-pass70-pass69-chooser', { path: screenshot, contentType: 'image/png' });

  await page.locator('[data-release-choice="experimental"]').click();
  await expect(page).toHaveURL(new RegExp(`/${releaseChannels.experimental.path}/.*release=latest`, 'u'));
  await expect(page.locator('#release-channel-gate')).toHaveCount(0);
  await expect(page.locator('#menu')).toBeVisible();
  // HF-406: the badge was pinned to the literal `HITL CANDIDATE · NOT LIVE` and the entry
  // time to `AWAITING OWNER HITL`. Neither string named a pass, which is exactly how the
  // owner read the live site as "pass 73 HITL". Both are now pinned to the stamped pass
  // and to the current changelog entry's own id, so a stale changelog head or a stale
  // stamp fails here instead of shipping.
  const currentEntry = CHANGELOG[0]!;
  expect(currentEntry.pass).toBe(PASS66_RELEASE_IDENTITY.pass);
  await expect(page.locator('#last-updated-btn > b')).toHaveText(`${currentEntry.pass} · RELEASE CANDIDATE`);
  await expect(page.locator('#last-updated-btn')).not.toContainText('HITL');
  await page.locator('#last-updated-btn').click();
  const current = page.locator('#changelog-list > li').first();
  await expect(current).toHaveAttribute('data-changelog-id', currentEntry.id);
  await expect(current.locator('.changelog-entry-pass span')).toHaveText(currentEntry.pass);
  await expect(current.locator('.changelog-entry-pass b')).toHaveText('LOCAL CANDIDATE');
  await expect(current.locator('time')).not.toHaveAttribute('datetime', /.+/u);
  await expect(current.locator('time')).toContainText('NOT PUBLISHED');
  await expect(current.locator('time')).toContainText('RELEASE CANDIDATE');
  await expect(page.locator('#changelog-panel')).not.toContainText('HITL');
});

test('front-page hard reset clears CacheStorage and reloads the chooser', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.evaluate(async () => { await caches.open('pass73-stale-test'); });
  await page.locator('[id$="hard-refresh"]').click();
  await page.waitForURL(/cachebust=\d+/u);
  await expect(page.locator('#release-channel-gate')).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).includes('pass73-stale-test'))).toBe(false);
});

test('routes removed stable and rollback aliases to exact Pass 72', async ({ page }) => {
  for (const alias of ['stable', 'rollback']) {
    await page.goto(`/?release=${alias}`);
    await expect(page).toHaveURL(/\/channels\/pass72-retained\/\?release=latest/);
    await expect(page.locator('.command-brand span')).toContainText('PASS 72');
  }
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

test('keeps legacy latest, normal and room entries on the stamped current pass', async ({ page }) => {
  for (const query of ['?release=latest', '?release=normal', '?room=qa-room&autojoin=1']) {
    await page.goto(`/${query}&renderer=webgl2`);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('.command-brand span')).toContainText(releaseChannels.experimental.pass);
    await expect(page.locator('.command-brand span')).not.toContainText('THE BIG ONE');
    await expect(page.locator('.command-brand span')).not.toContainText('HITL');
  }
});
