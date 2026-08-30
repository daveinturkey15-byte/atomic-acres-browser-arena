#!/usr/bin/env node
// HF-391 measurement harness: drives installed Chrome on REAL WebGPU over CDP,
// boots two arenas, applies IDENTICAL scripted input to each, and samples the
// HUD sway/impact custom properties every presented frame.
//
// Output: artifacts/hf391/traces/<arena>.json  — one row per frame:
//   [t, swayX, swayY, breathe, gait, impactX, impactY, marker?]
// plus per-segment summaries (mean |value|, peak, zero-crossing rate) computed
// offline by analyse-hf391-trace.mjs.
//
// Usage: node scripts/qa/hf391-hud-sway-trace.mjs --url http://127.0.0.1:41917 --out artifacts/hf391/traces
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41917');
const OUT = arg('--out', 'artifacts/hf391/traces');
const ARENAS = arg('--arenas', 'atomic-acres,high-seas').split(',').map((a) => a.trim()).filter(Boolean);

// Scripted segments. Identical for every arena; timings in ms. The slow sweep
// targets ~90 deg/s: radiansPerPixel is 0.00215 * sensitivity at the hip, so
// px/s for 90 deg/s = ((PI/2)/0.00215)/2 ≈ 365 px/s at default sensitivity 2
// is NOT assumed — instead we calibrate nothing and simply drive a fixed
// px/s sweep; the comparison between arenas is what matters because both get
// the same pixel stream.
const SEGMENTS = [
  { name: 'idle', ms: 3000 },
  { name: 'walk', ms: 2500, key: 'w' },
  { name: 'slow-sweep', ms: 2000, sweepPxPerSec: 360 },
  { name: 'flick-settle', ms: 1800, flickPx: 600 },
];

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

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf391&previewTime=0`;
mkdirSync(resolve(OUT), { recursive: true });

for (const arena of ARENAS) {
  const errors = [];
  page.removeAllListeners('pageerror');
  page.removeAllListeners('console');
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  if (backend !== 'webgpu') throw new Error(`backend=${backend}; HF-391 must be measured on WebGPU`);

  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: 120_000 });
  // Freeze bots so no gameplay damage events contaminate the sway trace.
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); }).catch(() => {});
  await page.waitForTimeout(500);

  // The centre #banner overlay covers the canvas at the viewport centre and
  // swallows the trusted click, but the click still grants transient
  // activation, which makes the direct canvas.requestPointerLock() below
  // succeed reliably. Without it the request intermittently resolves
  // unlocked.
  await page.mouse.click(640, 360);
  await page.waitForTimeout(200);
  // swallows trusted clicks, so the game's own mousedown lock request never
  // fires. Request pointer lock directly on the canvas instead; verified
  // working on this machine (probe: locked=CANVAS).
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const request = canvas?.requestPointerLock?.();
    if (request && typeof request.catch === 'function') request.catch(() => {});
  });
  await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5_000 })
    .catch(() => {});

  const locked = await page.evaluate(() => document.pointerLockElement !== null).catch(() => false);
  console.error(`[hf391] ${arena} backend=${backend} pointerLock=${locked}`);

  await page.evaluate(`(() => {
    window.__hf391 = { rows: [], active: true };
    const hud = document.getElementById('hud');
    const props = ['--hud-sway-x','--hud-sway-y','--hud-breathe','--hud-gait','--hud-impact-x','--hud-impact-y'];
    function pump() {
      if (!window.__hf391.active) return;
      const s = getComputedStyle(hud);
      window.__hf391.rows.push([performance.now(), ...props.map((p) => Number(s.getPropertyValue(p)))]);
      requestAnimationFrame(pump);
    }
    requestAnimationFrame(pump);
  })()`);

  const cx = 640;
  const cy = 360;
  let x = cx;
  const mark = async (name) => {
    await page.evaluate((n) => { window.__hf391.rows.push([performance.now(), 0, 0, 0, 0, 0, 0, n]); }, name);
  };

  for (const seg of SEGMENTS) {
    await mark(`${seg.name}:start`);
    const startedAt = Date.now();
    while (Date.now() - startedAt < seg.ms) {
      const elapsed = Date.now() - startedAt;
      if (seg.key) {
        await page.keyboard.down(seg.key);
        await page.waitForTimeout(Math.max(10, seg.ms - elapsed));
        await page.keyboard.up(seg.key);
        break;
      }
      if (seg.sweepPxPerSec) {
        x += seg.sweepPxPerSec / 60;
        await page.mouse.move(x, cy);
        await page.waitForTimeout(16);
        continue;
      }
      if (seg.flickPx) {
        x += seg.flickPx;
        await page.mouse.move(x, cy);
        await page.waitForTimeout(seg.ms);
        break;
      }
      await page.waitForTimeout(16);
    }
    if (seg.key) { /* key already released above */ }
    await mark(`${seg.name}:end`);
  }

  const rows = await page.evaluate(() => {
    window.__hf391.active = false;
    return window.__hf391.rows;
  });
  const fpsRows = rows.filter((r) => r.length === 7);
  let dtsSum = 0; let dtsMax = 0;
  for (let i = 1; i < fpsRows.length; i += 1) {
    const dt = fpsRows[i][0] - fpsRows[i - 1][0];
    dtsSum += dt; dtsMax = Math.max(dtsMax, dt);
  }
  const record = {
    arena,
    backend,
    pointerLock: locked,
    rows,
    frameCount: fpsRows.length,
    meanFrameMs: fpsRows.length > 1 ? dtsSum / (fpsRows.length - 1) : null,
    maxFrameMs: dtsMax,
    errors: [...new Set(errors)].slice(0, 6),
  };
  writeFileSync(join(resolve(OUT), `${arena}.json`), `${JSON.stringify(record)}\n`);
  console.error(`[hf391] ${arena} frames=${record.frameCount} meanFrameMs=${record.meanFrameMs?.toFixed(2)} maxFrameMs=${record.maxFrameMs?.toFixed(1)}`);
}

await browser.close();
console.log(JSON.stringify({ ok: true, out: OUT }));
