import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { PASS66_RELEASE_IDENTITY } from '../../src/release-identity';

test('Project Map exposes one current-first tree and human/agent downloads', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });

  await page.goto('/?release=latest&renderer=webgl2&render=compat&seed=pass63-project-map', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));

  await expect(page.locator('#menu-meta-actions')).toBeVisible();
  // HF-406: the badge used to be pinned to the literal copy 'LAST RELEASE', which named
  // no version at all - it could not tell PASS 84 from PASS 73, and the label no longer
  // contains that phrase in any release state. It is now pinned to the stamped pass, and
  // to the shape `<PASS n> · <state or publication instant>`, which is the identity this
  // surface exists to carry. The internal review acronym must never appear here again.
  const releaseBadge = page.locator('#last-updated-btn');
  await expect(releaseBadge).toContainText(PASS66_RELEASE_IDENTITY.pass);
  await expect(releaseBadge).toContainText(/^PASS \d+ · \S/u);
  await expect(releaseBadge).not.toContainText('HITL');
  await expect(page.locator('#project-map-btn')).toHaveText('PROJECT MAP');
  const actionOrder = await page.locator('#menu-meta-actions > button').evaluateAll((buttons) => buttons.map((button) => button.id));
  expect(actionOrder).toEqual(['last-updated-btn', 'project-map-btn']);

  await page.click('#project-map-btn');
  await expect(page.locator('#project-map-panel')).toBeVisible();
  await expect(page.locator('#project-map-page-overview')).toBeVisible();
  await expect(page.locator('#project-map-page-overview')).toContainText('AUTHORITY BOUNDARIES');

  await page.click('[data-project-page="structure"]');
  await expect(page.locator('#project-map-page-structure')).toBeVisible();
  await expect(page.locator('[data-project-node="gameplay-authority"]')).toContainText('src/gameplay.ts');
  await expect(page.locator('[data-project-node="release-pipeline"]')).toContainText('release-production.yml');

  await page.click('[data-project-page="changes"]');
  await expect(page.locator('#project-map-page-changes')).toContainText('PASS 63');
  await page.click('[data-project-page="archive"]');
  await expect(page.locator('#project-map-page-archive')).toContainText('PASS 62');

  await page.click('[data-project-page="overview"]');
  const jsonDownloadPromise = page.waitForEvent('download');
  await page.click('#project-map-download-agent');
  const jsonDownload = await jsonDownloadPromise;
  expect(jsonDownload.suggestedFilename()).toBe('atomic-acres-project-map.json');
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).not.toBeNull();
  const json = JSON.parse(await readFile(jsonPath!, 'utf8'));
  expect(json.current.release.pass).toBe('PASS 63');
  expect(json.archive[0].pass).toBe('PASS 62');
  expect(json.architecture.length).toBeGreaterThanOrEqual(4);

  const markdownDownloadPromise = page.waitForEvent('download');
  await page.click('#project-map-download-human');
  const markdownDownload = await markdownDownloadPromise;
  expect(markdownDownload.suggestedFilename()).toBe('atomic-acres-project-map.md');
  const markdownPath = await markdownDownload.path();
  expect(markdownPath).not.toBeNull();
  const markdown = await readFile(markdownPath!, 'utf8');
  expect(markdown.indexOf('## Current release snapshot')).toBeLessThan(markdown.indexOf('## Release archive'));
  expect(markdown).toContain('### PASS 62:');

  await page.click('#project-map-close');
  await expect(page.locator('#project-map-panel')).toBeHidden();
  await page.click('#last-updated-btn');
  await expect(page.locator('#changelog-panel')).toBeVisible();
  await expect(page.locator('#changelog-list > li').first()).toHaveAttribute('data-changelog-id', 'pass63');
  await expect(page.locator('#changelog-list > li').first().locator('.changelog-entry-pass b')).toHaveText('CURRENT BUILD');
  await page.keyboard.press('Escape');
  await expect(page.locator('#changelog-panel')).toBeHidden();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  expect(browserErrors).toEqual([]);
});
