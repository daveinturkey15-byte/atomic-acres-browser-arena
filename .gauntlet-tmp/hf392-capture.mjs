#!/usr/bin/env node
// HF-392 diagnosis capture: boots high-seas on real WebGPU (installed Chrome,
// headless — GAUNTLET-SPEC 2026-08-25 correction: installed chrome headless gets
// a real hardware device) and captures deterministic frames of the upper-cabin
// windows from inside the deckhouse looking out AND outside looking in.
//
// Usage: node .gauntlet-tmp/hf392-capture.mjs [--out .gauntlet-tmp/hf392-frames]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const OUT = arg('--out', '.gauntlet-tmp/hf392-frames');
const BASE = arg('--url', 'http://127.0.0.1:41913');

const browser = await chromium.launch({
  // Installed Chrome (not bundled chromium): only this channel gets a WebGPU
  // device in headless on this machine. Headless needs no governor slot.
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
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf392&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
const adapterInfo = await page.evaluate(async () => {
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter ? { vendor: adapter.info?.vendor ?? null, architecture: adapter.info?.architecture ?? null } : null;
  } catch { return 'probe-failed'; }
});
console.error(`[hf392] backend=${backend} adapter=${JSON.stringify(adapterInfo)}`);
if (!adapterInfo || typeof adapterInfo === 'string' || adapterInfo.vendor === 'microsoft') {
  console.error('[hf392] FATAL: no hardware WebGPU device; refusing to record frames as evidence');
  await browser.close();
  process.exit(3);
}
const shots = [
  // forward = (-sin yaw, ., -cos yaw): facing -x from starboard needs POSITIVE yaw.
  { id: 'outside-starboard-stern', pose: [15.5, 7.5, 21, 1.42, 0] },   // outside looking in at stern starboard panes
  { id: 'outside-starboard-closeup', pose: [12.5, 7.4, 21, 1.53, 0] }, // 5 m from the glazing, near-perpendicular
  { id: 'inside-stern-looking-out', pose: [0, 7.05, 21, 1.5708, 0] },  // inside deckhouse facing a glazed side
  { id: 'inside-bow-end-window', pose: [0, 7.05, -20.5, 0, 0] },       // inside bow cabin facing the inner END window
  { id: 'outside-port-bow', pose: [-15.5, 7.5, -21, -1.42, 0] },       // outside port looking in
  { id: 'overview-upper-ship', pose: [30, 14, 44, -2.55, -0.35] },     // whole superstructure
];

mkdirSync(resolve(OUT), { recursive: true });

for (const shot of shots) {
  // The arena presentation watchdog can bounce a deploy back to the menu under
  // machine load (GAUNTLET-SPEC P0: "Arenas may not commit"). Verify the match
  // is STILL active before every shot; a menu frame is not evidence.
  const live = await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 60_000 }).then(() => true).catch(() => false);
  if (!live) {
    console.error(`[hf392] ARENA NOT LIVE before ${shot.id}; redeploying once`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, 'high-seas');
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: 180_000 });
  }
  await page.evaluate((p) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setCaptureViewmodelHidden(true);
    if (debug.setCaptureCameraPose) {
      debug.setCaptureCameraPose(p[0], p[1], p[2], p[3], p[4]);
    } else {
      debug.teleportPlayer(p[0], p[1], p[2], p[3], p[4]);
    }
  }, shot.pose);
  await page.waitForTimeout(900); // let presentation settle on the posed camera
  const buffer = await page.screenshot({ type: 'png' });
  writeFileSync(resolve(OUT, `${shot.id}.png`), buffer);
  console.error(`[hf392] captured ${shot.id} (${buffer.length} bytes)`);
}

writeFileSync(resolve(OUT, 'capture-meta.json'), `${JSON.stringify({
  backend, adapterInfo, errors: [...new Set(errors)].slice(0, 10),
}, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, backend, adapterInfo, errors }, null, 2));
await browser.close();
