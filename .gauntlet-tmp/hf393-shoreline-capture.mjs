#!/usr/bin/env node
// HF-393/HF-394 shoreline verification capture.
// Boots farcrysis on the real WebGPU route in INSTALLED Chrome (headless gets a
// hardware device on this machine - GAUNTLET-SPEC failure-mode 2 correction),
// walks the +Z beach seaward through dry sand -> waterline -> wade -> swim,
// and screenshots each stage plus two beauty angles of the shoreline blend.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41912';
const OUT = resolve('.gauntlet-tmp/hf393-frames');
mkdirSync(OUT, { recursive: true });

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
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf393&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf393] backend=${backend}`);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 150_000 });
console.error('[hf393] match active');

const settle = async (ms) => await page.waitForTimeout(ms);

// Walk stages: [name, z, note]. x=0, facing +z seaward (yaw = PI).
// Terrain envelope at x=0: shelf starts z=54 (joinHeight 0.2), crosses the
// water level (-0.25) near z~55.2, swim entry near the boundary wall.
const stages = [
  ['01-dry-sand-z50', 50],
  ['02-waterline-z55', 55],
  ['03-wade-mid-z57', 57],
  ['04-wade-deep-z59', 59],
  ['05-swim-entry-z61', 61],
];
for (const [name, z] of stages) {
  await page.evaluate(([zz]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, zz, Math.PI, 0);
  }, [z]);
  await settle(1400);
  const pose = await page.evaluate(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const p = s.player ?? {};
    return { x: p.x, y: p.y, z: p.z, phase: s.matchPhase };
  }).catch(() => null);
  console.error(`[hf393] ${name} player=${JSON.stringify(pose)}`);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
}

// Beauty shots of the shore blend from above the water looking along it.
await page.evaluate(() => {
  window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraOrbit(null);
  window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(24, 5.5, 44, 2.4, -0.28, 70);
});
await settle(1200);
await page.screenshot({ path: resolve(OUT, '06-shore-beauty-high.png') });

await page.evaluate(() => {
  window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(-18, 1.1, 52, 0.6, -0.12, 75);
});
await settle(1200);
await page.screenshot({ path: resolve(OUT, '07-shore-grazing.png') });

await page.evaluate(() => {
  window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(0, 26, 30, Math.PI / 2, -1.15, 60);
});
await settle(1200);
await page.screenshot({ path: resolve(OUT, '08-shore-overhead.png') });

console.log(JSON.stringify({ backend, errors: [...new Set(errors)].slice(0, 8) }, null, 2));
await browser.close();
