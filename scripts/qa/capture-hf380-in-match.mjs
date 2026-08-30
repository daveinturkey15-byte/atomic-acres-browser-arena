#!/usr/bin/env node
// HF-380 in-match evidence: boots a solo match on real WebGPU with a chosen
// local operator skin, captures the first-person arms, and grabs a clipped
// close-up of any live third-person operator (bots cycle the four catalog
// skins). Reuses the verify-arena-boot-cdp.mjs launch discipline.
//
// Usage: node scripts/qa/capture-hf380-in-match.mjs [--url http://127.0.0.1:41945] [--skin symbiote]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41945');
const SKIN = arg('--skin', 'symbiote');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/hf380-after'));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--mute-audio', 
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

// Select the skin BEFORE first load so the arms build with it.
await page.addInitScript((skin) => {
  localStorage.setItem('atomic-acres-operator-skin', skin);
}, SKIN);

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf380match&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(6_000); // arms + bot skin GLBs settle

const arms = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const found = [];
  api.sampleSceneGraph().traverse((node) => {
    if (node.userData?.firstPersonArmSkinId) found.push(node.userData.firstPersonArmSkinId);
  });
  const bots = (api.snapshot().bots ?? []).map((bot) => bot.skinId ?? bot.operatorSkinId ?? null);
  return { armsSkins: [...new Set(found)], botSkins: bots };
});

await page.screenshot({ path: resolve(OUT, `in-match-arms-${SKIN}.png`) });
await writeFileSync(resolve(OUT, `in-match-${SKIN}.json`), `${JSON.stringify({ backend, skin: SKIN, arms, errors }, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ backend, skin: SKIN, arms, errors: errors.slice(0, 4) }, null, 2));
