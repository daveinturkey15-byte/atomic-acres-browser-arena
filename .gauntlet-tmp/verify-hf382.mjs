#!/usr/bin/env node
// HF-382 verification: the IDLE STANCE selector must visibly change BOTH the
// OPERATOR panel turntable and the in-match first-person arms, on real WebGPU
// in installed Chrome. Modeled on scripts/qa/verify-arena-boot-cdp.mjs.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.HF382_URL ?? 'http://127.0.0.1:41910';
const OUT = resolve('artifacts/hf382');
mkdirSync(OUT, { recursive: true });

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
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf382&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
// A shared worktree means another lane's server can serve a stale or mid-edit
// bundle on a colliding port. Pin the exact bundle this run measures against.
const EXPECTED_BUNDLE = 'legacy-main-DhgcBiLG.js';
const servedBundle = await page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-'));
  return entry ? entry.slice(entry.lastIndexOf('/') + 1) : null;
});
if (servedBundle !== EXPECTED_BUNDLE) {
  console.error(`[hf382] WRONG BUNDLE served: ${servedBundle} (expected ${EXPECTED_BUNDLE})`);
  await browser.close();
  process.exit(2);
}
console.error(`[hf382] bundle=${servedBundle}`);
console.error(`[hf382] backend=${backend}`);

const STANCES = ['ready', 'low', 'alert'];
const record = { backend, turntable: {}, match: {}, errors };

// --- Phase 1: menu turntable -------------------------------------------------
await page.evaluate(() => {
  const tab = document.querySelector('#menu-tab-operator');
  if (!tab) throw new Error('operator tab missing');
  tab.click();
});
await page.waitForFunction(() => {
  const status = document.querySelector('#operator-preview-status');
  return status !== null && /live preview/.test(status.textContent ?? '');
}, undefined, { timeout: 120_000 });
// Give the preview model time to build and its idle to settle.
await page.waitForTimeout(4000);

for (const stance of STANCES) {
  await page.evaluate((id) => {
    const card = document.querySelector(`[data-operator-stance="${id}"]`);
    if (!card) throw new Error(`stance card ${id} missing`);
    card.click();
  }, stance);
  // Longer than the 0.28 s cross-fade plus mixer settle.
  await page.waitForTimeout(2000);
  const statusText = await page.evaluate(() => ({
    preview: document.querySelector('#operator-preview-status')?.textContent ?? null,
    appearance: document.querySelector('#operator-appearance-status')?.textContent ?? null,
  }));
  const canvas = page.locator('#operator-preview-canvas');
  await canvas.screenshot({ path: resolve(OUT, `turntable-${stance}.png`) });
  record.turntable[stance] = statusText;
  console.error(`[hf382] turntable ${stance}: ${JSON.stringify(statusText)}`);
}

// --- Phase 2: first-person arms in a live solo match -------------------------
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('gun-range'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 150_000 });
await page.waitForTimeout(5000); // spawn settle

for (const stance of STANCES) {
  // The menu is hidden mid-match but the cards stay in the DOM; the
  // document-level handler and the preview's panel listener still receive the
  // click and publish the stance for the viewmodel to read next frame.
  await page.evaluate((id) => {
    const card = document.querySelector(`[data-operator-stance="${id}"]`);
    if (!card) throw new Error(`stance card ${id} missing`);
    card.click();
  }, stance);
  await page.waitForTimeout(1500);
  const shot = `match-${stance}.png`;
  await page.screenshot({ path: resolve(OUT, shot) });
  const snapshot = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { menuVisible: state.menuVisible, weaponReady: state.weaponReady };
  });
  record.match[stance] = { screenshot: shot, ...snapshot };
  console.error(`[hf382] match ${stance}: ${JSON.stringify(record.match[stance])}`);
}

writeFileSync(resolve(OUT, 'verify-hf382.json'), `${JSON.stringify(record, null, 2)}\n`);
await browser.close();

const ok = backend === 'webgpu'
  && STANCES.every((stance) => /live preview/i.test(record.turntable[stance]?.preview ?? ''));
console.log(JSON.stringify({ ok, backend }, null, 2));
process.exit(ok ? 0 : 1);
