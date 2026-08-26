#!/usr/bin/env node
// HF-392: capture the upper-deckhouse windows of high-seas (Hijacked) from the
// viewpoints where defects actually show - inside both deckhouses looking at
// the end glazing, out through the side bays, and from the main deck looking
// up at the bridge band. Installed Chrome headless, real hardware WebGPU.
//
// Usage:
//   node scripts/qa/capture-hf392-windows.mjs --url http://127.0.0.1:41947 --out artifacts/hf392/after --tag after
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41947');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/hf392/after'));
const TAG = arg('--tag', 'after');

const EYE_UPPER = 7.9; // upperDeck 6.2 + 1.7
const EYE_DECK = 4.9; // mainDeck 3.2 + 1.7

// Yaw convention (capture-below-deck.mjs): yaw 0 faces -z (bow), PI faces +z.
const STATIONS = [
  // Interior: end windows (the aperture the owner called out) and side bays.
  { id: 'bow-upper-end-window', pos: [0, EYE_UPPER, -18], yaw: 0, pitch: 0, note: 'inside bow deckhouse facing the glazed end wall' },
  { id: 'bow-upper-port-bays', pos: [0, EYE_UPPER, -21], yaw: Math.PI / 2, pitch: 0, note: 'inside bow deckhouse facing port window bays' },
  { id: 'bow-upper-starboard-bays', pos: [0, EYE_UPPER, -21], yaw: -Math.PI / 2, pitch: 0, note: 'inside bow deckhouse facing starboard window bays' },
  { id: 'stern-upper-end-window', pos: [0, EYE_UPPER, 18], yaw: Math.PI, pitch: 0, note: 'inside stern deckhouse facing the glazed end wall' },
  { id: 'stern-upper-port-bays', pos: [0, EYE_UPPER, 21], yaw: Math.PI / 2, pitch: 0, note: 'inside stern deckhouse facing port window bays' },
  { id: 'stern-upper-starboard-bays', pos: [0, EYE_UPPER, 21], yaw: -Math.PI / 2, pitch: 0, note: 'inside stern deckhouse facing starboard window bays' },
  // Exterior: main deck looking up at the bridge band from each approach.
  { id: 'exterior-bow-approach', pos: [0, EYE_DECK, -34], yaw: Math.PI, pitch: 0.42, note: 'from bow deck looking up/aft at the bow deckhouse face' },
  { id: 'exterior-stern-approach', pos: [0, EYE_DECK, 37], yaw: 0, pitch: 0.42, note: 'from stern deck looking up/aft at the stern deckhouse face' },
  { id: 'exterior-port-flank', pos: [-9.8, EYE_DECK, -21], yaw: Math.PI / 2, pitch: 0.25, note: 'from port deck edge looking at the cabin flank glazing' },
  { id: 'exterior-starboard-flank', pos: [9.8, EYE_DECK, 21], yaw: -Math.PI / 2, pitch: 0.25, note: 'from starboard deck edge looking at the cabin flank glazing' },
];

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
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf392&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const gpu = await page.evaluate(() => ({ backend: document.documentElement.dataset.renderBackend ?? null }));
console.error(`[hf392] backend=${gpu.backend}`);
if (gpu.backend !== 'webgpu') {
  console.error('[hf392] NOT WEBGPU - aborting rather than verifying the wrong renderer');
  await browser.close();
  process.exit(2);
}

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(3_000);

mkdirSync(OUT, { recursive: true });
const report = [];
for (const station of STATIONS) {
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, [...station.pos, station.yaw, station.pitch]);
  await page.waitForTimeout(900);
  const landed = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      position: snapshot.player.position.map((value) => Number(value.toFixed(2))),
      frameCount: snapshot.frameCount,
      backend: document.documentElement.dataset.renderBackend ?? null,
    };
  });
  await page.waitForTimeout(500);
  const laterFrames = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  const rendering = laterFrames > landed.frameCount;
  const file = resolve(OUT, `${TAG}-${station.id}.png`);
  await page.screenshot({ path: file });
  report.push({ ...station, landed, rendering, file, note: station.note });
  console.error(`[hf392] ${station.id}: landed=${JSON.stringify(landed.position)} ${rendering ? '' : '*** NOT RENDERING ***'}`);
}

await browser.close();
writeFileSync(resolve(OUT, `${TAG}-manifest.json`), `${JSON.stringify({
  tag: TAG,
  backend: gpu.backend,
  url: BASE,
  pageErrors: [...new Set(errors)].slice(0, 8),
  allRendering: report.every((entry) => entry.rendering),
  stations: report,
}, null, 2)}\n`);
console.log(JSON.stringify({ tag: TAG, backend: gpu.backend, stations: report.length, allRendering: report.every((entry) => entry.rendering), errors: errors.length }, null, 2));
