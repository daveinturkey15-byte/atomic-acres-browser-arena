#!/usr/bin/env node
// farcrysis-relief lane copy of scripts/qa/verify-arena-boot-cdp.mjs.
// Two changes vs the original:
//   1. HEADLESS installed Chrome (channel:'chrome', headless:true) — gets a real
//      hardware WebGPU device on this machine and needs NO headed browser slot.
//   2. Single-arena mode + optional screenshot capture for frame reading.
// Usage: node scripts/qa/verify-farcrysis-boot-headless.mjs [--url ...]
//        [--arenas farcrysis] [--per-arena 150000] [--shots dir] [--shot-ms 4000]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41915');
const RENDERER = arg('--renderer', 'webgpu');
const EXTRA = arg('--extra', '');
const PER_ARENA_MS = Number(arg('--per-arena', '150000'));
const ARENAS = arg('--arenas', 'farcrysis').split(',').map((e) => e.trim()).filter(Boolean);
const SHOTS = arg('--shots', '');
const SHOT_AT_MS = Number(arg('--shot-ms', '5000'));

const browser = await chromium.launch({
  headless: true,
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
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=bootcdp&previewTime=0${EXTRA}`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const servedBundle = () => page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-'));
  return entry ? entry.slice(entry.lastIndexOf('/')) : null;
}).catch(() => null);
const BUNDLE_AT_START = await servedBundle();

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
// Prove a real device, not just an adapter (GAUNTLET-SPEC failure mode 2).
const gpuProof = await page.evaluate(async () => {
  if (!navigator.gpu) return { adapter: null };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { adapter: null };
  let device = null;
  try { device = await adapter.requestDevice(); } catch { device = null; }
  return { adapter: adapter.info?.vendor ?? 'unknown', device: Boolean(device) };
}).catch((e) => ({ error: String(e).slice(0, 120) }));
console.error(`[boot-cdp-hl] backend=${backend} renderer=${RENDERER} gpu=${JSON.stringify(gpuProof)}`);

const results = [];
for (const [index, arena] of ARENAS.entries()) {
  errors.length = 0;
  const startedAt = Date.now();
  const record = { arena, ok: false, ms: 0 };
  if (index > 0) {
    const debugReady = await page.waitForFunction(
      () => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 },
    ).then(() => true).catch(() => false);
    const bundleNow = await servedBundle();
    if (!debugReady || bundleNow !== BUNDLE_AT_START) {
      record.environmentInvalid = !debugReady
        ? 'page never re-exposed __ATOMIC_ACRES_DEBUG__ after reload'
        : `served bundle changed mid-sweep (${BUNDLE_AT_START} -> ${bundleNow})`;
      record.ms = Date.now() - startedAt;
      results.push(record);
      console.error(`[boot-cdp-hl] ${arena.padEnd(18)} INVALID ${record.ms} ms — ${record.environmentInvalid}`);
      continue;
    }
  }
  try {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: PER_ARENA_MS });
    record.ok = true;
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.waitForTimeout(SHOT_AT_MS);
      await page.screenshot({ path: resolve(SHOTS, `${arena}-${Date.now()}.png`) });
      // A second angle after a strafe so relief silhouettes differ between frames.
      await page.keyboard.press('KeyW').catch(() => {});
      await page.waitForTimeout(2500);
      await page.keyboard.up('KeyW').catch(() => {});
      await page.screenshot({ path: resolve(SHOTS, `${arena}-moved-${Date.now()}.png`) });
    }
  } catch (error) {
    record.error = String(error).slice(0, 160);
    record.diagnostics = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        bootstrapStage: snapshot.bootstrap?.stage ?? null,
        matchPhase: snapshot.matchPhase ?? null,
        arenaId: document.documentElement.dataset.arenaId ?? null,
        status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 140),
      };
    }).catch(() => null);
  }
  record.ms = Date.now() - startedAt;
  record.errors = [...new Set(errors)].slice(0, 4);
  results.push(record);
  console.error(`[boot-cdp-hl] ${arena.padEnd(18)} ${record.ok ? 'OK' : 'FAIL'} ${record.ms} ms`
    + (record.ok ? '' : ` — ${record.diagnostics?.bootstrapStage ?? record.error}`));
  for (const line of record.errors) console.error(`             ${line}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
}

await browser.close();

const failed = results.filter((entry) => !entry.ok && !entry.environmentInvalid).map((entry) => entry.arena);
const invalidated = results.filter((entry) => entry.environmentInvalid).map((entry) => entry.arena);
const verdict = failed.length > 0 ? 'FAIL' : invalidated.length > 0 ? 'INVALID' : 'PASS';
mkdirSync(resolve('artifacts/qa'), { recursive: true });
writeFileSync(resolve('artifacts/qa/farcrysis-boot-headless.json'), `${JSON.stringify({ verdict, backend, gpuProof, renderer: RENDERER, bundleAtStart: BUNDLE_AT_START, failed, invalidated, results }, null, 2)}\n`);
console.log(JSON.stringify({ verdict, backend, gpuProof, failed, invalidated }, null, 2));
process.exit(verdict === 'PASS' ? 0 : verdict === 'INVALID' ? 2 : 1);
