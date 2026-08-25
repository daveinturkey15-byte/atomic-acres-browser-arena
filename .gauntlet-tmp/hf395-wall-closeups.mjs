#!/usr/bin/env node
// HF-395 close-up evidence: stand at each mid-map landmark centre and face
// OUTWARD at the ruin wall + crate cache (wall sits 5.2 m outward of centre).
// Yaw convention verified from tour 1: yaw = 0.25*pi faces (-1,-1).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41914';
const OUT = '.gauntlet-tmp/hf396-arena-fidelity/frames';

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
page.on('pageerror', (e) => console.error(`[hf395cu] pageerror: ${String(e).slice(0, 200)}`));

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf395cu&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
if (backend !== 'webgpu') throw new Error(`backend is ${backend}`);
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240_000 });
await page.waitForTimeout(2000);

const C = 26; // LANDMARK_RADIUS is PER-AXIS: centres sit at (±26, ±26)
const stops = [
  ['wall-nw', -C, -C, Math.PI * 0.25],
  ['wall-ne', C, -C, -Math.PI * 0.25],
  ['wall-sw', -C, C, Math.PI * 0.75],
  ['wall-se', C, C, Math.PI * 1.25],
];
mkdirSync(OUT, { recursive: true });
const shots = [];
for (const [name, x, z, yaw] of stops) {
  await page.evaluate(([tx, tz, tyaw]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(tx, 6, tz, tyaw, 0);
  }, [x, z, yaw]);
  await page.waitForTimeout(1800);
  const path = resolve(`${OUT}/close-${name}.png`);
  await page.screenshot({ path });
  shots.push({ name, path });
  console.error(`[hf395cu] captured close-${name}.png`);
}
writeFileSync(resolve(`${OUT}/close-meta.json`), `${JSON.stringify({ backend, shots }, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ ok: true, backend, count: shots.length }, null, 2));
