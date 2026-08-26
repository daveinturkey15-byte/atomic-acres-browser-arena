#!/usr/bin/env node
// HF-380 evidence harness: drives installed Chrome on real WebGPU over CDP,
// opens the OPERATOR menu panel, selects each catalog skin, and captures the
// live turntable plus the card list. Copied from scripts/qa/verify-arena-boot-cdp.mjs
// launch discipline (focus emulation + anti-throttle flags).
//
// Usage: node scripts/qa/capture-hf380-operator-panel.mjs [--url http://127.0.0.1:41910] [--out artifacts/hf380]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/hf380'));
mkdirSync(OUT, { recursive: true });

const SKINS = ['default', 'explorer', 'symbiote', 'navalops'];

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf380&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf380] backend=${backend}`);

// Open the OPERATOR panel.
await page.click('#menu-tab-operator');
await page.waitForSelector('#menu-panel-operator.active, #menu-panel-operator:not([hidden])', { timeout: 30_000 });

// Let the turntable load its GLB and settle.
await page.waitForTimeout(6_000);

const results = [];
for (const skin of SKINS) {
  const card = page.locator(`[data-operator-skin="${skin}"]`).first();
  await card.click();
  // turnRadians resets to 0 on selection: capture the FRONT immediately, then
  // a second frame half a turn later for the back read.
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: resolve(OUT, `turntable-${skin}-front.png`) });
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: resolve(OUT, `turntable-${skin}-back.png`) });
  const status = await page.locator('#operator-preview-status').textContent().catch(() => null);
  results.push({ skin, status });
}
// Card-list close-up for the 2D art.
const cards = page.locator('.operator-skin-card').first();
if (await cards.count()) {
  const box = await page.locator('[data-menu-panel="operator"]').boundingBox();
  if (box) await page.screenshot({ path: resolve(OUT, 'cards-panel.png'), clip: box });
}

await writeFileSync(resolve(OUT, 'hf380-capture.json'), `${JSON.stringify({ backend, errors, results }, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ backend, errors: errors.slice(0, 5), results }, null, 2));
