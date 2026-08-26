#!/usr/bin/env node
// Hijacked (high-seas) refinement: capture the viewpoints a PLAYER actually
// occupies, on real hardware WebGPU in INSTALLED headless Chrome, and read the
// frames. Stations cover spawn views, mid-deck, both cabin ends, upper deck,
// and the below-deck service corridor.
//
// Usage: node scripts/qa/capture-hijacked-viewpoints.mjs --out artifacts/pass79/hijacked-before
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41912');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/pass79/hijacked-viewpoints'));

// yaw: 0 faces -z (bow), PI faces +z (stern) — same convention as capture-below-deck.mjs.
// teleportPlayer y is EYE height (feet + 1.7). Main deck surface 3.2 -> eye
// 4.9; upper deck 6.2 -> eye 7.9; service corridor floor 0 -> eye 1.7.
// Passing feet coordinates embeds the player in the deck slab and physics
// ejects them downward - an earlier sweep "measured" the whole bow half
// missing because of exactly this.
const STATIONS = [
  // Spawn approaches — what a player sees the moment they spawn.
  { id: 'spawn-bow', pos: [0, 4.9, -36], yaw: Math.PI, note: 'bow centre spawn looking down the ship' },
  { id: 'spawn-bow-port', pos: [-8.8, 4.9, -34], yaw: Math.PI + 0.35, note: 'bow port spawn, angled at deckhouse' },
  { id: 'spawn-stern', pos: [0, 4.9, 34], yaw: 0, note: 'stern centre spawn looking forward' },
  // Main deck mid-ship.
  { id: 'mid-deck-tub', pos: [0, 4.9, -6], yaw: Math.PI, note: 'mid-deck at hot tub, toward stern superstructure' },
  { id: 'mid-deck-forward', pos: [0, 4.9, 4], yaw: 0, note: 'mid-deck toward bow cabin' },
  { id: 'deck-starboard-side', pos: [9.5, 4.9, -12], yaw: Math.PI / 2 - 0.5, note: 'starboard rail run looking aft along the hull' },
  // Both ends, close up on the cabin faces.
  { id: 'bow-cabin-face', pos: [0, 4.9, -20], yaw: Math.PI, note: 'at bow cabin face' },
  { id: 'stern-cabin-face', pos: [0, 4.9, 22], yaw: 0, note: 'at stern cabin face' },
  // Upper exterior deck walkway beside the deckhouse windows.
  { id: 'upper-deck-walkway', pos: [10.5, 7.9, 0], yaw: Math.PI / 2, note: 'upper walkway amidships, port side of hull' },
  { id: 'upper-deck-window-line', pos: [5.5, 7.9, -14], yaw: Math.PI, note: 'upper deck along the bow window line' },
  // Below deck.
  { id: 'below-corridor-bow', pos: [0, 1.7, -18.5], yaw: Math.PI, note: 'service corridor from bow ramp' },
  { id: 'below-engine-room', pos: [0, 1.7, 0], yaw: Math.PI, note: 'engine room bulge' },
];
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hijacked-audit&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
const gpuInfo = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().renderBackend ?? null).catch(() => null);
console.error(`[hijacked-audit] dataset.renderBackend=${backend} snapshot=${JSON.stringify(gpuInfo)}`);
if (backend !== 'webgpu') {
  console.error('[hijacked-audit] NOT WEBGPU — aborting rather than reporting WebGL2 evidence.');
  await browser.close();
  process.exit(2);
}

// Boot-and-commit loop: arenas intermittently fail to commit on this tree
// ("Selected arena X did not commit before match start"). Asserting the
// input (selectArena resolved) instead of the output (committed arena id)
// once produced a full 12-station sweep of frames from the WRONG MAP.
const MAX_BOOT_ATTEMPTS = 4;
let booted = false;
for (let attempt = 1; attempt <= MAX_BOOT_ATTEMPTS && !booted; attempt++) {
  await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  // Output assertion: the committed arena, not the request.
  const committed = await page.evaluate(() => document.documentElement.dataset.arenaId ?? null);
  const status = await page.evaluate(() => (document.getElementById('network-status')?.textContent ?? '').slice(0, 160));
  console.error(`[hijacked-audit] attempt ${attempt}: committed=${committed} status="${status}"`);
  if (committed === 'high-seas') {
    booted = true;
  } else if (attempt < MAX_BOOT_ATTEMPTS) {
    await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  }
}
if (!booted) {
  console.error('[hijacked-audit] high-seas never committed after retries — aborting.');
  await browser.close();
  process.exit(3);
}
await page.waitForTimeout(3000);
const report = [];
for (const station of STATIONS) {
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, [...station.pos, station.yaw, station.pitch ?? 0]);
  await page.waitForTimeout(900);
  const state = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      position: snapshot.player.position.map((value) => Number(value.toFixed(2))),
      alive: snapshot.player.alive,
      frameCount: snapshot.frameCount,
    };
  });
  await page.waitForTimeout(500);
  const laterFrames = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  const rendering = laterFrames > state.frameCount;
  const file = resolve(OUT, `hs-${station.id}.png`);
  await page.screenshot({ path: file });
  report.push({ ...station, landed: state, rendering, file });
  console.error(`[hijacked-audit] ${station.id}: y=${state.position[1]} frames ${state.frameCount}->${laterFrames}${rendering ? '' : '  *** NOT RENDERING ***'}`);
}

await browser.close();
console.log(JSON.stringify({
  backend,
  stations: report.map(({ id, rendering, landed }) => ({ id, rendering, landed })),
  pageErrors: [...new Set(errors)].slice(0, 6),
}, null, 2));
