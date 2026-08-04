import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:4180/?signal=on&release=latest', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const status = document.querySelector('#network-status');
  const solo = document.querySelector('#solo');
  const debugApi = window.__ATOMIC_ACRES_DEBUG__;
  return status?.dataset.kind === 'ok' && solo?.disabled === false && !!debugApi?.snapshot();
}, undefined, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
const menu = await page.evaluate(() => {
  const d = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return { materials: d.render?.materialCompatibility?.materials, targetValidated: d.render?.atomicSignal?.targetValidated, outputValidated: d.render?.atomicSignal?.outputValidated, profile: d.render?.profile };
});
console.log('MENU:', JSON.stringify(menu));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
await page.waitForTimeout(15000);
const post = await page.evaluate(() => {
  const d = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return { materials: d.render?.materialCompatibility?.materials, targetValidated: d.render?.atomicSignal?.targetValidated, outputValidated: d.render?.atomicSignal?.outputValidated, story: d.arenaStoryReady, spawnSafety: d.spawnSafety };
});
console.log('AFTER DEPLOY:', JSON.stringify(post, null, 1));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 4), null, 1));
await browser.close();
