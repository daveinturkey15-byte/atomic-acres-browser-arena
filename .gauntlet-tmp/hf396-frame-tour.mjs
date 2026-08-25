#!/usr/bin/env node
// HF-395/HF-396 visual evidence, arena-fidelity lane.
// Boots farcrysis on REAL WebGPU in installed Chrome (headless — per
// GAUNTLET-SPEC 2026-08-25 correction, installed chrome headless gets a real
// hardware WebGPU device and consumes none of the two headed browser slots),
// starts solo, teleports a review camera around the mid-map landmarks, and
// CAPTURES FRAMES for human/agent inspection. Launch hardening is copied from
// scripts/qa/verify-arena-boot-cdp.mjs; output goes to .gauntlet-tmp so the
// shared artifacts tree is untouched.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41914';
const OUT = '.gauntlet-tmp/hf396-arena-fidelity/frames';

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
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf396af&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf396af] backend=${backend}`);
if (backend !== 'webgpu') throw new Error(`backend is ${backend}, not webgpu — evidence invalid`);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 240_000 });
console.error('[hf396af] match active');
await page.waitForTimeout(2500);

mkdirSync(OUT, { recursive: true });

// Review tour: spawn view (NW), then the four mid-map landmark frames
// (radial ~26 m on the intercardinal diagonals — see farcrysis-midmap-landmarks),
// then centre core, then beach-to-water wade at the west shore. Eye height 1.7.
const stops = [
  ['landmark-ne', 18.4, -18.4, Math.PI * 1.25],
  ['spawn-nw', -52, -52, Math.PI * 0.25], // face SE toward mid-map
  ['landmark-se', 18.4, 18.4, Math.PI * 1.25],
  ['core-centre', 0, 1.7, Math.PI],
  ['shore-west', -58, 0, -Math.PI / 2],
];
const shots = [];
for (const [name, x, z, yaw] of stops) {
  await page.evaluate(([tx, tz, tyaw]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(tx, 1.7, tz, tyaw, 0);
  }, [x, z, yaw]);
  await page.waitForTimeout(1200);
  const path = resolve(`${OUT}/view-${name}.png`);
  await page.screenshot({ path });
  shots.push({ name, path });
  console.error(`[hf396af] captured view-${name}.png`);
}


const meta = { backend, errors: [...new Set(errors)].slice(0, 8), shots };
writeFileSync(resolve(`${OUT}/capture-meta.json`), `${JSON.stringify(meta, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ ok: true, backend, shots }, null, 2));
