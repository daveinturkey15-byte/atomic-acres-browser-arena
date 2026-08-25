#!/usr/bin/env node
// Hijacked (high-seas) owner-viewpoint capture for the hijacked-refinement lane.
//
// Captures the frames a PLAYER actually occupies - spawn, mid-deck, cabin
// interiors, upper deckhouse, below-deck service corridor - on the real
// hardware WebGPU route (installed Chrome headless, channel:'chrome'), then
// writes PNGs plus a JSON manifest recording liveness (frameCount advancing)
// and landed position for each station.
//
// Usage:
//   node scripts/qa/capture-hijacked-refinement.mjs --out artifacts/hijacked-refinement/before
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/hijacked-refinement/before'));
const TAG = arg('--tag', 'before');

// Eye height 1.7 above each playable level. Yaw convention matches
// capture-below-deck.mjs: yaw 0 faces -z (bow), PI faces +z (stern).
const STATIONS = [
  { id: 'spawn-stern', pos: [-3, 4.9, 39.5], yaw: 0, note: 'stern centre spawn looking down the ship' },
  { id: 'spawn-bow', pos: [3, 4.9, -39.5], yaw: Math.PI, note: 'bow centre spawn looking down the ship' },
  { id: 'mid-deck-center', pos: [0, 4.9, 10], yaw: 0, note: 'open main deck mid-ship toward bow' },
  { id: 'mid-deck-cabana', pos: [9.5, 4.9, -3], yaw: Math.PI / 2, note: 'starboard cabana lane looking port across shower' },
  { id: 'bow-cabin-ground', pos: [0, 4.9, -20], yaw: 0, note: 'bow cabin ground floor looking outboard door' },
  { id: 'bow-upper-deckhouse', pos: [0, 7.9, -19], yaw: 0, note: 'bow upper deckhouse interior' },
  { id: 'bow-upper-outward', pos: [-4, 7.9, -24], yaw: -Math.PI / 2, note: 'bow upper storey looking out the port windows' },
  { id: 'stern-upper-deckhouse', pos: [0, 7.9, 19], yaw: Math.PI, note: 'stern upper deckhouse interior' },
  { id: 'port-catwalk', pos: [-11, 4.9, 4], yaw: 0, note: 'port catwalk toward bow' },
  { id: 'stern-transom', pos: [0, 4.9, 41], yaw: Math.PI, note: 'stern transom behind the pool' },
  { id: 'below-corridor', pos: [0, 1.7, -12], yaw: Math.PI, note: 'service corridor amidships' },
  { id: 'below-engine-room', pos: [0, 1.7, -2], yaw: Math.PI, note: 'engine room bulge' },
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

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hijacked-refine&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const gpu = await page.evaluate(() => ({
  backend: document.documentElement.dataset.renderBackend ?? null,
}));
console.error(`[hijacked-refine] backend=${gpu.backend}`);

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
  await page.evaluate(([x, y, z, yaw]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, 0);
  }, [...station.pos, station.yaw]);
  await page.waitForTimeout(900);
  const landed = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      position: snapshot.player.position.map((value) => Number(value.toFixed(2))),
      frameCount: snapshot.frameCount,
    };
  });
  await page.waitForTimeout(500);
  const laterFrames = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  const rendering = laterFrames > landed.frameCount;
  const file = resolve(OUT, `${TAG}-${station.id}.png`);
  await page.screenshot({ path: file });
  report.push({ ...station, landed, rendering, file, note: station.note });
  console.error(`[hijacked-refine] ${station.id}: landed=${JSON.stringify(landed.position)} ${rendering ? '' : '*** NOT RENDERING ***'}`);
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
