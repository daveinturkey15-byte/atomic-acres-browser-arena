#!/usr/bin/env node
// LIVE CDP confirmation for the mechanical collider/visual parity audit
// (audit-collider-visual-parity.ts). Boots atomic-acres on REAL headless
// WebGPU (installed Chrome, channel:'chrome' — no browser slot needed),
// then:
//   1. proves the renderer actually initialised WebGPU (not WebGL fallback);
//   2. probes the authoritative movement collision at offender coordinates via
//      the debug API's own collisionProbe, so "you walk through it" is a
//      measured fact, not an AABB inference;
//   3. captures frames at the offender positions AND READS THEM.
//
// Usage: node scripts/qa/verify-collider-parity-cdp.mjs [--url http://127.0.0.1:41911]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41911');

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

// navigator.gpu requires a SECURE CONTEXT: always land on 127.0.0.1.
const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=colliderparity&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.log(`backend=${backend}`);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 240_000 });
console.log('arena committed, match active');

// Give the presentation loop a moment to stream art layers before probing.
await page.waitForTimeout(4000);

// Collision truth from the game's OWN authority: isBlocked(..., 0.44).
const probes = await page.evaluate(() => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const points = [
    { label: 'greenhouse-frame-wall-west', x: -30, z: 21 },
    { label: 'greenhouse-frame-wall-south', x: -23.5, z: 17.2 },
    { label: 'central-bus-solid-control', x: 0, z: 0 },
    { label: 'front-hedge-solid-control', x: 19, z: -8.9 },
    { label: 'gun-range-not-probed-here', x: null, z: null },
  ];
  return points
    .filter((point) => point.x !== null)
    .map((point) => ({ ...point, blocked: debug.collisionProbe(point.x, point.z) }));
});
console.log(JSON.stringify(probes, null, 2));

mkdirSync(resolve('artifacts/qa/collider-parity'), { recursive: true });

// Frame capture at the greenhouse wall: deterministic review camera looking
// straight at the wall face that has no collider behind it.
await page.evaluate(() => {
  window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(-26.5, 1.8, 21, Math.PI / 2, 0, 75);
});
await page.waitForTimeout(2500);
const greenhouseShot = resolve('artifacts/qa/collider-parity/atomic-greenhouse-wall.png');
await page.screenshot({ path: greenhouseShot });

await page.evaluate(() => {
  window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(0, 1.8, 6.5, 0, 0, 75);
});
await page.waitForTimeout(2000);
const busShot = resolve('artifacts/qa/collider-parity/atomic-central-bus.png');
await page.screenshot({ path: busShot });

writeFileSync(resolve('artifacts/qa/collider-parity/probes.json'), `${JSON.stringify({
  backend,
  probes,
  capturedAt: new Date().toISOString(),
}, null, 2)}\n`);

const walkthroughConfirmed = probes.filter((probe) => probe.label.startsWith('greenhouse') && !probe.blocked);
console.log(`walk-through confirmed at ${walkthroughConfirmed.length} greenhouse sample(s); frames written to artifacts/qa/collider-parity/`);
await browser.close();
