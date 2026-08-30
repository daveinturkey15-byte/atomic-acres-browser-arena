#!/usr/bin/env node
// HF-386 verification: drive installed Chrome on REAL WebGPU over CDP and
// prove the zero-damage world-hit feedback is player-visible for
//   (a) an ordinary weapon fired into the floor, and
//   (b) the possessed chopper gunner firing into the floor.
// Based on scripts/qa/verify-arena-boot-cdp.mjs (focus emulation + anti-throttle)
// and the hf391 pointer-lock recipe (trusted click then direct canvas lock).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41933';
const OUT = resolve('artifacts/qa');
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
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf386&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf386] backend=${backend}`);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => {
  window.__ATOMIC_ACRES_DEBUG__.startSolo();
  window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
});
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 150_000 });
console.error('[hf386] match active');

// Pointer lock: trusted click grants activation, then direct canvas request.
await page.mouse.click(640, 360);
await page.waitForTimeout(200);
await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const request = canvas?.requestPointerLock?.();
  if (request && typeof request.catch === 'function') request.catch(() => {});
});
let locked = true;
await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5_000 })
  .catch(() => { locked = false; console.error('[hf386] pointer lock NOT acquired'); });

async function aimDown() {
  // Deterministic pose: pitch -1.2 rad looks hard at the floor.
  await page.evaluate(() => {
    const p = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(p.position[0], p.position[1], p.position[2], 0, -1.2);
  });
}

function rowState() {
  return page.evaluate(() => {
    const container = document.getElementById('zero-hit-feedback');
    return {
      exists: Boolean(container),
      rows: container ? container.childElementCount : 0,
      lastLabel: container?.lastElementChild?.textContent ?? null,
      hudPresent: Boolean(document.getElementById('hud')),
    };
  });
}

const report = { backend, locked, phaseA: { ok: false }, phaseB: { ok: false }, errors: [] };

// ---------- Phase A: ordinary weapon into the floor ----------
{
  await aimDown();
  await page.screenshot({ path: resolve(OUT, 'hf386-before-shot.png') });
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(400);
  report.phaseA.row = await rowState();
  await page.screenshot({ path: resolve(OUT, 'hf386-after-ground-shot.png') });
  report.phaseA.ok = report.phaseA.row.rows > 0 && /NO DAMAGE/.test(report.phaseA.row.lastLabel ?? '');
  console.error(`[hf386] phase A (ordinary weapon): ok=${report.phaseA.ok} ${JSON.stringify(report.phaseA.row)}`);
}

// ---------- Phase B: chopper gunner into the floor ----------
try {
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.earnSupport(8); });
  const activated = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    try { return api.activateKillstreak('chopper'); }
    catch (error) { return { error: String(error).slice(0, 160) }; }
  });
  report.phaseB.activation = activated ?? null;
  // Aim down BEFORE possessing: teleportPlayer during possession releases
  // the gun controller (observed). While possessed, pitch is trimmed with
  // real pointer-locked mouse deltas instead.
  await aimDown();
  // Possession is a single toggle in the runtime, but the replicated snapshot
  // lags, so blind re-toggling alternates in and out. Toggle once, then poll
  // in-page until BOTH the snapshot possession and the support panel's own
  // mode line ("PLAYER GUN · AI FLIGHT") agree. Retry the toggle only if the
  // panel never flips.
  report.phaseB.possessed = await page.evaluate(async () => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      api.toggleChopperGunnerControl();
      for (let poll = 0; poll < 8; poll += 1) {
        await sleep(350);
        const snap = api.snapshot();
        const possession = snap.killstreak?.actors?.[0]?.possession;
        const mode = document.getElementById('support-platform-mode')?.textContent ?? '';
        if (possession?.kind === 'chopper-gunner' && mode === 'PLAYER GUN · AI FLIGHT') return true;
      }
    }
    return false;
  });
  if (!report.phaseB.possessed) throw new Error('chopper-gunner cockpit never engaged');
  await page.waitForTimeout(700);
  // Trim the pitch further down with real pointer-locked mouse movement.
  await page.mouse.move(640, 360);
  await page.mouse.move(640, 660, { steps: 12 });
  await page.mouse.down();
  await page.waitForTimeout(1_200); // ~4 shells at the 280 ms autocannon cadence
  await page.mouse.up();
  await page.waitForTimeout(300);
  report.phaseB.row = await rowState();
  await page.screenshot({ path: resolve(OUT, 'hf386-chopper-ground-shots.png') });
  report.phaseB.ok = report.phaseB.row.rows > 0;
  console.error(`[hf386] phase B (chopper gunner): ok=${report.phaseB.ok} ${JSON.stringify(report.phaseB.row)}`);
} catch (error) {
  report.phaseB.error = String(error).slice(0, 240);
  console.error(`[hf386] phase B ERROR: ${report.phaseB.error}`);
}
await page.screenshot({ path: resolve(OUT, 'hf386-final.png') }).catch(() => {});

report.errors = [...new Set(errors)].slice(0, 8);
const verdict = report.phaseA.ok && report.phaseB.ok && backend === 'webgpu' && locked ? 'PASS' : 'FAIL';
writeFileSync(resolve(OUT, 'hf386-zero-hit-cdp.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ verdict, locked, phaseAok: report.phaseA.ok, phaseBok: report.phaseB.ok }, null, 2));
await browser.close();
process.exit(verdict === 'PASS' ? 0 : 1);
