#!/usr/bin/env node
// Repair-round frame capture: boot one arena on real WebGPU in headless
// installed Chrome and screenshot it for human/agent reading.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41933';
const ARENA = process.argv[3] ?? 'high-seas';
const OUT = process.argv[4] ?? `.gauntlet-tmp/hf392-frame-${ARENA}.png`;

const browser = await chromium.launch({
  headless: true,
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
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=bootcdp&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 150_000 });
// Let the arena settle a few seconds of frames before capturing.
await page.waitForTimeout(4000);
mkdirSync(resolve('.gauntlet-tmp'), { recursive: true });
await page.screenshot({ path: resolve(OUT) });
console.log(JSON.stringify({ arena: ARENA, backend, out: OUT, errors: [...new Set(errors)].slice(0, 4) }, null, 2));
await browser.close();
