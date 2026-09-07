#!/usr/bin/env node
// Pass 79 graphics lane — boots all six arenas on the REAL WebGPU route in
// installed Chrome over CDP and CAPTURES A FRAME per arena for visual reading
// of the per-arena grade identity (warm bone/ink/burnt-orange direction;
// gun-range stays the deliberate neutral control).
//
// Copy of scripts/qa/verify-arena-boot-cdp.mjs boot discipline (focus emulation,
// anti-throttle flags, strict reload gate, bundle pin) plus screenshots.
//
// Usage: node scripts/qa/pass79-graphics-capture.mjs --url http://127.0.0.1:41977
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';
import { defaultBootRoster } from './arena-roster.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41977');
const RENDERER = arg('--renderer', 'webgpu');
const PER_ARENA_MS = Number(arg('--per-arena', '150000'));
const SETTLE_MS = Number(arg('--settle', '6000'));
const OUT_DIR = arg('--out', 'artifacts/qa/pass79-graphics');
// PASS 85 Lane N: this default was a hardcoded arena literal, so Test1, Test2
// and Map 3 were never swept by it and nothing said so. It is now derived from
// the registry (scripts/qa/arena-roster.mjs) and is a strict superset of what
// it covered before; `--arenas` still overrides it.
const ARENAS = arg('--arenas', defaultBootRoster())
  .split(',').map((entry) => entry.trim()).filter(Boolean);

mkdirSync(resolve(OUT_DIR), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
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

const url = `${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=pass79gfx&previewTime=0`;
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
console.error(`[pass79-gfx] backend=${backend} renderer=${RENDERER}`);

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
      record.environmentInvalid = !debugReady ? 'debug handle never returned' : `bundle changed mid-sweep (${BUNDLE_AT_START} -> ${bundleNow})`;
      record.ms = Date.now() - startedAt;
      results.push(record);
      console.error(`[pass79-gfx] ${arena.padEnd(18)} INVALID ${record.ms} ms`);
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
    // Let the deploy fade finish and the filmic grade/atmosphere settle before
    // capturing; a frame grabbed at match-active is still fading in.
    await page.waitForTimeout(SETTLE_MS);
    record.backendNow = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
    const shot = resolve(OUT_DIR, `${arena}.png`);
    await page.screenshot({ path: shot });
    record.shot = shot;
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
  console.error(`[pass79-gfx] ${arena.padEnd(18)} ${record.ok ? 'OK' : 'FAIL'} ${record.ms} ms`
    + (record.ok ? '' : ` — ${record.diagnostics?.bootstrapStage ?? record.error}`));
  for (const line of record.errors) console.error(`             ${line}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
}

await browser.close();

const failed = results.filter((entry) => !entry.ok && !entry.environmentInvalid).map((entry) => entry.arena);
const invalidated = results.filter((entry) => entry.environmentInvalid).map((entry) => entry.arena);
const verdict = failed.length > 0 ? 'FAIL' : invalidated.length > 0 ? 'INVALID' : 'PASS';
writeFileSync(resolve(OUT_DIR, 'capture-results.json'), `${JSON.stringify({ verdict, backend, renderer: RENDERER, bundleAtStart: BUNDLE_AT_START, failed, invalidated, results }, null, 2)}\n`);
console.log(JSON.stringify({ verdict, backend, failed, invalidated }, null, 2));
process.exit(verdict === 'PASS' ? 0 : verdict === 'INVALID' ? 2 : 1);
