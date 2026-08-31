#!/usr/bin/env node
// Boots arenas on the REAL WebGPU route in installed Chrome, driven over CDP.
//
// Replaces verify-webgpu-arena-boot.mjs for day-to-day use. That script had the
// page drive itself and relied on periodic PowerShell AppActivate for the
// foreground ownership the renderer demands; on this machine an occluded or
// unfocused window is timer-throttled and reads EXACTLY like an arena that will
// not boot. It also had no per-arena timeout, so one wedged arena killed the
// whole sweep and reported every arena as "never reported" - which is what it
// did, before and after a real fix, while the arenas demonstrably booted.
//
// Two changes make this one trustworthy:
//   - Emulation.setFocusEmulationEnabled, so focus is guaranteed rather than
//     asked for, plus the anti-throttling flags.
//   - A per-arena timeout: a wedged arena reports ok:false and the sweep moves
//     on, so one failure never masks five successes.
//
// Usage: node scripts/qa/verify-arena-boot-cdp.mjs [--url ...] [--arenas a,b]
//        [--renderer webgpu] [--extra "&fcSkip=water"]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const RENDERER = arg('--renderer', 'webgpu');
const EXTRA = arg('--extra', '');
const PER_ARENA_MS = Number(arg('--per-arena', '120000'));
const ARENAS = arg('--arenas', 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range,farcrysis,high-seas')
  .split(',').map((entry) => entry.trim()).filter(Boolean);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    // Without these an occluded window is throttled and every arena looks wedged.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
// Guarantee foreground ownership instead of hoping a window manager grants it.
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=bootcdp&previewTime=0${EXTRA}`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

// A shared dist-gauntlet outDir means another agent's `vite build` can empty
// and repopulate the served tree MID-SWEEP. Requests during that window get the
// SPA-fallback HTML instead of assets, THREE's GLTFLoader then parses
// "<!doctype" as JSON, and map selection fails with exactly the signature of a
// real arena-commit regression ("Selected arena X did not commit before match
// start", phase failed). Pin the served bundle identity so those runs are
// reported as invalidated measurements instead of arena failures.
const servedBundle = () => page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-'));
  return entry ? entry.slice(entry.lastIndexOf('/')) : null;
}).catch(() => null);
const BUNDLE_AT_START = await servedBundle();

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[boot-cdp] backend=${backend} renderer=${RENDERER}`);

const results = [];

for (const [index, arena] of ARENAS.entries()) {
  errors.length = 0;
  const startedAt = Date.now();
  const record = { arena, ok: false, ms: 0 };
  if (index > 0) {
    // Strict reload gate for every arena after the first: the previous
    // iteration navigated back to the menu. A swallowed wait here used to let
    // the next arena fail in 5 ms with "Cannot read properties of undefined
    // (reading 'selectArena')" - a harness race, reported as a wedged arena.
    const debugReady = await page.waitForFunction(
      () => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 },
    ).then(() => true).catch(() => false);
    const bundleNow = await servedBundle();
    if (!debugReady || bundleNow !== BUNDLE_AT_START) {
      record.environmentInvalid = !debugReady
        ? 'page never re-exposed __ATOMIC_ACRES_DEBUG__ after reload'
        : `served bundle changed mid-sweep (${BUNDLE_AT_START} -> ${bundleNow}); dist was rebuilt while measuring`;
      record.ms = Date.now() - startedAt;
      results.push(record);
      console.error(`[boot-cdp] ${arena.padEnd(18)} INVALID ${record.ms} ms — ${record.environmentInvalid}`);
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
  console.error(`[boot-cdp] ${arena.padEnd(18)} ${record.ok ? 'OK' : 'FAIL'} ${record.ms} ms`
    + (record.ok ? '' : ` — ${record.diagnostics?.bootstrapStage ?? record.error}`));
  for (const line of record.errors) console.error(`             ${line}`);
  // Back to the menu so the next arena starts from a clean surface.
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
}

await browser.close();

const failed = results.filter((entry) => !entry.ok && !entry.environmentInvalid).map((entry) => entry.arena);
const invalidated = results.filter((entry) => entry.environmentInvalid).map((entry) => entry.arena);
// An invalidated sweep is NOT a pass: the measurement is void and must be
// rerun on a stable dist. Exit 2 so automation distinguishes "arena broken"
// (1) from "measurement environment broke" (2). Never silently green.
const verdict = failed.length > 0 ? 'FAIL' : invalidated.length > 0 ? 'INVALID' : 'PASS';
mkdirSync(resolve('artifacts/qa'), { recursive: true });
writeFileSync(resolve('artifacts/qa/arena-boot-cdp.json'), `${JSON.stringify({ verdict, backend, renderer: RENDERER, bundleAtStart: BUNDLE_AT_START, failed, invalidated, results }, null, 2)}\n`);
console.log(JSON.stringify({ verdict, backend, failed, invalidated }, null, 2));
process.exit(verdict === 'PASS' ? 0 : verdict === 'INVALID' ? 2 : 1);
