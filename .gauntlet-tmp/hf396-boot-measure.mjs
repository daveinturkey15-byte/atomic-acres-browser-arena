#!/usr/bin/env node
// HF-396/HF-395 arena-fidelity lane: boot-time + backend proof for farcrysis on
// the REAL WebGPU route. Copy of scripts/qa/verify-arena-boot-cdp.mjs with two
// changes only:
//   1. headless: true — per GAUNTLET-SPEC correction 2026-08-25, INSTALLED
//      chrome (channel:'chrome') headless DOES get a real hardware WebGPU
//      device, and headless does not consume one of the two machine-wide
//      headed browser slots. Backend identity is asserted below, so if this
//      ever silently fell back to WebGL2 the measurement would say so.
//   2. Output JSON goes to .gauntlet-tmp/ (lane-local) instead of the shared
//      artifacts/qa path, so concurrent agents cannot clobber each other.
// Everything else — focus emulation, anti-throttling flags, strict reload gate,
// bundle-pinning invalidation — is kept byte-for-byte in behaviour.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910');
const RENDERER = arg('--renderer', 'webgpu');
const EXTRA = arg('--extra', '');
const PER_ARENA_MS = Number(arg('--per-arena', '150000'));
const ARENAS = arg('--arenas', 'farcrysis').split(',').map((e) => e.trim()).filter(Boolean);
const OUT = arg('--out', '.gauntlet-tmp/hf396-arena-fidelity/boot-webgpu.json');

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

const gpuProbe = await page.evaluate(async () => {
  if (!navigator.gpu) return { webgpu: false };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { webgpu: false, adapter: false };
    const device = await adapter.requestDevice();
    return { webgpu: Boolean(device), vendor: adapter.info?.vendor ?? null, architecture: adapter.info?.architecture ?? null };
  } catch (error) {
    return { webgpu: false, error: String(error).slice(0, 120) };
  }
});
console.error(`[hf396-boot] gpu probe: ${JSON.stringify(gpuProbe)}`);

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf396-boot] backend=${backend} renderer=${RENDERER}`);

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
      console.error(`[hf396-boot] ${arena.padEnd(18)} INVALID ${record.ms} ms — ${record.environmentInvalid}`);
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
  console.error(`[hf396-boot] ${arena.padEnd(18)} ${record.ok ? 'OK' : 'FAIL'} ${record.ms} ms`
    + (record.ok ? '' : ` — ${record.diagnostics?.bootstrapStage ?? record.error}`));
  for (const line of record.errors) console.error(`             ${line}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
}

await browser.close();

const failed = results.filter((entry) => !entry.ok && !entry.environmentInvalid).map((entry) => entry.arena);
const invalidated = results.filter((entry) => entry.environmentInvalid).map((entry) => entry.arena);
const verdict = failed.length > 0 ? 'FAIL' : invalidated.length > 0 ? 'INVALID' : 'PASS';
mkdirSync(resolve('.gauntlet-tmp/hf396-arena-fidelity'), { recursive: true });
writeFileSync(resolve(OUT), `${JSON.stringify({ verdict, backend, gpuProbe, renderer: RENDERER, bundleAtStart: BUNDLE_AT_START, failed, invalidated, results }, null, 2)}\n`);
console.log(JSON.stringify({ verdict, backend, gpuProbe, failed, invalidated }, null, 2));
process.exit(verdict === 'PASS' ? 0 : verdict === 'INVALID' ? 2 : 1);
