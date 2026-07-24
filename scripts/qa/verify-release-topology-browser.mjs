import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${response.url()}`);
});

async function expectRuntime(path, pass) {
  await page.waitForSelector('#menu', { timeout: 60_000 });
  if (!page.url().includes(path) || !page.url().includes('release=latest')) throw new Error(`Channel route mismatch: ${page.url()}`);
  const release = await page.locator('.eyebrow').textContent();
  if (!release?.includes(pass)) throw new Error(`Expected ${pass}, received ${release}`);
  return release;
}

try {
  await page.goto(baseUrl);
  await page.waitForSelector('#release-channel-options [data-release-choice="experimental"]');
  const labels = await page.locator('#release-channel-options button').allTextContents();
  if (labels.length !== 2
    || !labels.some((text) => text.includes('PASS 62') && text.includes('LIVE') && text.includes('EXPERIMENTAL NEW NETCODE'))
    || !labels.some((text) => text.includes('PASS 60') && text.includes('STABLE') && text.includes('NEW NETCODE'))
    || labels.some((text) => text.includes('PASS 59'))) {
    throw new Error(`Unexpected chooser labels: ${JSON.stringify(labels)}`);
  }
  if (await page.locator('[data-release-choice="normal"]').count()) throw new Error('Removed normal channel is still selectable');
  if (await page.locator('#menu').count()) throw new Error('Root chooser loaded a game runtime');

  await page.click('[data-release-choice="experimental"]');
  const experimentalRelease = await expectRuntime('/channels/experimental-netcode-pass/', 'PASS 62');

  await page.goto(baseUrl);
  await page.click('[data-release-choice="stable"]');
  const stableRelease = await expectRuntime('/channels/recent-stable/', 'PASS 60');

  const legacyRoutes = [];
  for (const query of ['?release=latest', '?release=normal', '?room=qa-room&autojoin=1']) {
    await page.goto(new URL(query, baseUrl).toString());
    await expectRuntime('/channels/experimental-netcode-pass/', 'PASS 62');
    legacyRoutes.push(page.url());
  }

  const result = { chooserLabels: labels, experimentalRelease, stableRelease, legacyRoutes, failures };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
