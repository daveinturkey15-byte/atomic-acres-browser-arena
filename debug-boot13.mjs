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
await page.waitForTimeout(2000);
const s = await page.evaluate(() => {
  const d = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return {
    cores: navigator.hardwareConcurrency,
    memoryGb: navigator.deviceMemory,
    profile: d.render?.profile,
    materials: d.render?.materialCompatibility,
    spawnSafety: d.spawnSafety,
    textureSamples: d.render?.atomicSignal?.textureSamples,
    graphicsProfile: document.querySelector('#graphics-profile')?.value,
  };
});
console.log('MENU:', JSON.stringify(s, null, 1));
await browser.close();
