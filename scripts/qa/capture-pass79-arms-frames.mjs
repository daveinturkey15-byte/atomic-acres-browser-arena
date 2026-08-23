#!/usr/bin/env node
// Gauntlet Pass 79 P1: capture first-person viewmodel frames on REAL WebGPU
// (installed Chrome, CDP focus emulation) so the trigger-hand framing fix is
// judged on what the owner actually sees, not on unit-test geometry.
//
// Usage: node scripts/qa/capture-pass79-arms-frames.mjs [--url http://127.0.0.1:41910]
// Writes PNGs to artifacts/pass79/arms/<name>.png and a summary JSON.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41910');
const OUT = 'artifacts/pass79/arms';
const ARENA = arg('--arena', 'gun-range');
const WEAPON = arg('--weapon', 'carbine');

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
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=pass79arms&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[pass79-arms] backend=${backend}`);
if (backend !== 'webgpu') console.error('[pass79-arms] WARNING: backend is NOT webgpu');

await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
console.error('[pass79-arms] match active');

// Give the weapon/viewmodel a beat to settle after match start.
await page.evaluate((weapon) => { window.__ATOMIC_ACRES_DEBUG__.equipWeapon(weapon); }, WEAPON);
await page.waitForTimeout(2500);

const shots = [];
async function snap(name) {
  const path = resolve(`${OUT}/${name}.png`);
  await page.screenshot({ path });
  shots.push(name);
  console.error(`[pass79-arms] captured ${name}`);
}

await snap('01-hip-idle');

// ADS hold.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setAds(true); });
await page.waitForTimeout(1200);
await snap('02-ads');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setAds(false); });
await page.waitForTimeout(800);

// Mid-reload pose.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(0.45); });
await page.waitForTimeout(600);
await snap('03-reload-mid');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(null); });
await page.waitForTimeout(400);

// Bot in frame, frozen, for per-skin animation/presentation checks.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots(); });
const placed = page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(6));
await page.waitForTimeout(1800);
await snap('04-bot-ahead');
const botInfo = await placed.then((value) => value).catch(() => null);

// Sprint pose for arm motion check.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setMovement(true, true); });
await page.waitForTimeout(1500);
await snap('05-sprint');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setMovement(false, false); });

// Skin/archetype telemetry straight from the live operator model.
const skinTelemetry = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const snapshot = api.snapshot?.() ?? {};
  return { botInfo, snapshotKeys: Object.keys(snapshot).slice(0, 40) };
}).catch((error) => ({ error: String(error).slice(0, 200) }));

writeFileSync(resolve(`${OUT}/capture-summary.json`), `${JSON.stringify({
  backend, arena: ARENA, weapon: WEAPON, shots, errors: [...new Set(errors)].slice(0, 8), skinTelemetry,
}, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ backend, arena: ARENA, shots, errorCount: errors.length }, null, 2));
