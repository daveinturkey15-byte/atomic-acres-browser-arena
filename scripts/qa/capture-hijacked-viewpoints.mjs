#!/usr/bin/env node
// Captures the viewpoints a player actually occupies on high-seas (Hijacked):
// spawn, mid-deck, below deck (engine), both ends, upper deck.
// Installed Chrome, headless, real WebGPU. Usage:
//   node scripts/qa/capture-hijacked-viewpoints.mjs --url http://127.0.0.1:41960 --out artifacts/hijacked-before
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41960');
const OUT = resolve(arg('--out', 'artifacts/hijacked-captures'));
mkdirSync(OUT, { recursive: true });

const EYE_DECK = 4.9;   // mainDeck 3.2 + 1.7
const EYE_UPPER = 7.9;  // upperDeck 6.2 + 1.7
const EYE_ENGINE = 1.7; // engine 0 + 1.7
const VIEWPOINTS = [
  { id: 'spawn-stern', pos: [9, EYE_DECK, 40], yaw: 0, pitch: 0 },
  { id: 'mid-deck-along-bow', pos: [0, EYE_DECK, -6], yaw: 0, pitch: 0 },
  { id: 'mid-deck-along-stern', pos: [0, EYE_DECK, 6], yaw: Math.PI, pitch: 0 },
  { id: 'mid-deck-across', pos: [-6, EYE_DECK, 0], yaw: -Math.PI / 2, pitch: 0 },
  { id: 'bow-end', pos: [-9, EYE_DECK, -38], yaw: Math.PI, pitch: 0 },
  { id: 'stern-end', pos: [0, EYE_DECK, 36], yaw: 0, pitch: 0 },
  { id: 'upper-deck', pos: [8, EYE_UPPER, 5], yaw: Math.PI, pitch: 0 },
  { id: 'below-deck-engine', pos: [0, EYE_ENGINE, 0], yaw: 0, pitch: 0 },
  { id: 'below-deck-corridor', pos: [0, EYE_ENGINE, 12], yaw: Math.PI, pitch: 0 },
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 200)));

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hijacked&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.log('backend:', backend);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 180_000 });
console.log('match active');
await page.waitForTimeout(3000);

for (const vp of VIEWPOINTS) {
  await page.evaluate(([p, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(p[0], p[1], p[2], yaw, pitch);
  }, [vp.pos, vp.yaw, vp.pitch]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(OUT, `${vp.id}.png`) });
  console.log('captured', vp.id);
}

await browser.close();
console.log('done ->', OUT);
