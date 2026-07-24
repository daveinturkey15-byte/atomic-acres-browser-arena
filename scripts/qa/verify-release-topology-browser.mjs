import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
page.on('response', (response) => {
  if (response.status() >= 400) failures.push(`HTTP ${response.status()} ${response.url()}`);
});

try {
  await page.goto(baseUrl);
  await page.waitForSelector('#release-channel-options [data-release-choice="normal"]');
  const labels = await page.locator('#release-channel-options button').allTextContents();
  if (labels.length !== 3 || !labels.some((text) => text.includes('PASS 60') && text.includes('NEW NETCODE'))
    || !labels.some((text) => text.includes('PASS 59'))
    || !labels.some((text) => text.includes('PASS 61') && text.includes('EXPERIMENTAL NETCODE PASS'))) {
    throw new Error(`Unexpected chooser labels: ${JSON.stringify(labels)}`);
  }
  if (await page.locator('#menu').count()) throw new Error('Root chooser loaded a game runtime');

  await page.click('[data-release-choice="normal"]');
  await page.waitForSelector('#menu', { timeout: 60_000 });
  if (!page.url().includes('/channels/new-netcode/') || !page.url().includes('release=latest')) throw new Error(`Normal route mismatch: ${page.url()}`);
  const normalRelease = await page.locator('.eyebrow').textContent();

  await page.goto(baseUrl);
  await page.click('[data-release-choice="experimental"]');
  await page.waitForSelector('#menu', { timeout: 60_000 });
  if (!page.url().includes('/channels/experimental-netcode-pass/') || !page.url().includes('release=latest')) throw new Error(`Experimental route mismatch: ${page.url()}`);
  const experimentalRelease = await page.locator('.eyebrow').textContent();
  if (!experimentalRelease?.includes('PASS 61')) throw new Error(`Experimental runtime mismatch: ${experimentalRelease}`);

  await page.goto(new URL('?room=qa-room&autojoin=1', baseUrl).toString());
  await page.waitForURL(/\/channels\/new-netcode\/.*room=qa-room.*release=latest|\/channels\/new-netcode\/.*release=latest.*room=qa-room/, { timeout: 30_000 });

  const result = { chooserLabels: labels, normalRelease, experimentalRelease, roomRoute: page.url(), failures };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0 || !normalRelease?.includes('PASS 60')) process.exitCode = 1;
} finally {
  await browser.close();
}
