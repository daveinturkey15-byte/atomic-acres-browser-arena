#!/usr/bin/env node
// HF-396 visual evidence: boot farcrysis on REAL WebGPU in installed Chrome,
// start solo, then CAPTURE FRAMES at intervals and save them for inspection.
// Copy of the launch hardening from scripts/qa/verify-arena-boot-cdp.mjs.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41910';
const OUT = 'artifacts/qa/hf396';

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

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf396&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf396] backend=${backend}`);
if (backend !== 'webgpu') console.error('[hf396] WARNING: backend is NOT webgpu — evidence invalid');

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
try {
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 240_000 });
} catch {
  const diag = await page.evaluate(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { matchPhase: s.matchPhase, gameStarted: s.gameStarted,
      status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 160),
      keys: Object.keys(s) };
  }).catch((e) => ({ evalError: String(e).slice(0, 200) }));
  console.error(`[hf396] NEVER ACTIVE: ${JSON.stringify(diag)}`);
  throw new Error('match never became active');
}
console.error('[hf396] match active');

mkdirSync(OUT, { recursive: true });
const shots = [];
for (const [i, delayMs] of [1500, 4000, 8000].entries()) {
  await page.waitForTimeout(i === 0 ? delayMs : delayMs - shots[i - 1].at);
  const path = resolve(`${OUT}/farcrysis-live-${i}.png`);
  await page.screenshot({ path });
  shots.push({ at: delayMs, path });
  console.error(`[hf396] captured ${path}`);
}

const snapshot = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return {
    arenaId: document.documentElement.dataset.arenaId ?? null,
    position: s.playerPosition ?? s.position ?? null,
    keys: Object.keys(s),
  };
}).catch((e) => ({ error: String(e).slice(0, 200) }));

writeFileSync(resolve(`${OUT}/capture-meta.json`), `${JSON.stringify({ backend, errors: [...new Set(errors)].slice(0, 8), snapshot }, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ ok: true, backend, shots, snapshot }, null, 2));
