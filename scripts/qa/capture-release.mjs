import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

const releaseUrl = new URL(baseUrl);
releaseUrl.searchParams.set('releaseQa', '1');
await page.goto(releaseUrl.toString());
await page.waitForFunction(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const state = api?.snapshot();
  return state?.weaponReady && state?.originalArtLoaded;
}, undefined, { timeout: 30_000 });
await page.screenshot({ path: 'test-results/release-menu-full.png', fullPage: true });

await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 15_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
await page.waitForTimeout(1_000);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1_100);
await page.keyboard.up('KeyW');
await page.waitForTimeout(400);
await page.screenshot({ path: 'test-results/release-gameplay-full.png', fullPage: true });
const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
console.log(JSON.stringify({ baseUrl, consoleErrors, state }, null, 2));
if (consoleErrors.length) process.exitCode = 1;
await browser.close();
