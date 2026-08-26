#!/usr/bin/env node
// Measures the DEPLOYMENT-TIME arena commit path on real installed-Chrome WebGPU.
//
// verify-arena-boot-cdp.mjs calls selectArena() first, which commits the arena
// from the menu; startGame() then sees gameplayArenaPrepared===true and skips
// activation entirely. The reported failure ("Selected arena X did not commit
// before match start", arenaTransitionPhase: failed) is thrown from the OTHER
// path: startGame() -> activateArenaSelection(requestedArenaId, true, token)
// when the arena was never committed beforehand. This script drives exactly
// that path: fresh page load, startSolo() immediately, no prior selectArena().
//
// On success it records wall time and the final transition phase. On timeout it
// dumps the admission sampler + transition diagnostics instead of guessing.
//
// Usage: node scripts/qa/measure-arena-commit-cdp.mjs [--url ...] [--trials N]

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const TRIALS = Number(arg('--trials', '3'));
const TIMEOUT_MS = Number(arg('--timeout', '150000'));

const browser = await chromium.launch({
  headless: false,
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
const failedResponses = [];
page.on('response', (response) => {
  if (response.status() >= 400) {
    failedResponses.push({ status: response.status(), url: response.url().slice(0, 240) });
  }
});

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=commitprobe&previewTime=0`;

let bundleAtStart = null;
for (let trial = 1; trial <= TRIALS; trial += 1) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  const servedBundle = await page.evaluate(() => {
    const entry = performance.getEntriesByType('resource')
      .map((resource) => resource.name)
      .find((name) => name.includes('/legacy-main-'));
    return entry ? entry.slice(entry.lastIndexOf('/')) : null;
  });
  if (trial === 1) bundleAtStart = servedBundle;
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

  const startedAt = Date.now();
  const record = { trial, backend, ok: false, ms: 0 };
  try {
    // No selectArena() call: this is the deployment-time activation path.
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: TIMEOUT_MS });
    record.ok = true;
  } catch {
    record.diagnostics = await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const snapshot = debug.snapshot();
      return {
        bootstrapStage: snapshot.bootstrap?.stage ?? null,
        matchPhase: snapshot.matchPhase ?? null,
        arenaId: document.documentElement.dataset.arenaId ?? null,
        gameplayArena: document.documentElement.dataset.gameplayArena ?? null,
        status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 200),
        transition: snapshot.transition ?? null,
        admission: typeof debug.admissionState === 'function' ? debug.admissionState() : null,
      };
    }).catch((error) => ({ evaluateFailed: String(error).slice(0, 160) }));
  }
  record.ms = Date.now() - startedAt;
  if (servedBundle !== bundleAtStart) {
    // Another agent's `vite build` replaced dist-gauntlet mid-run: asset
    // requests during the rebuild window return SPA-fallback HTML, which
    // GLTFLoader chokes on and surfaces as a fake arena-commit failure.
    record.environmentInvalid =
      `served bundle changed mid-run (${bundleAtStart} -> ${servedBundle}); measurement void`;
  }
  record.errors = [...new Set(errors)].slice(0, 4);
  results.push(record);
  console.error(`[commit-probe] trial ${trial} ${record.ok ? 'OK' : 'FAIL'} ${record.ms} ms`
    + (record.ok ? '' : ` — ${JSON.stringify(record.diagnostics)}`));
  for (const line of record.errors) console.error(`               ${line}`);
  record.failedResponses = failedResponses.splice(0);
}

await browser.close();

const failed = results.filter((entry) => !entry.ok && !entry.environmentInvalid);
const invalidated = results.filter((entry) => entry.environmentInvalid);
// INVALID is not PASS: the measurement must be rerun on a stable dist.
mkdirSync(resolve('artifacts/qa'), { recursive: true });
writeFileSync(
  resolve('artifacts/qa/arena-commit-deploy-path.json'),
  `${JSON.stringify({ verdict: failed.length === 0 ? (invalidated.length === 0 ? 'PASS' : 'INVALID') : 'FAIL', bundleAtStart, invalidated: invalidated.map((entry) => entry.trial), trials: results }, null, 2)}\n`,
);
console.log(JSON.stringify({ verdict: failed.length === 0 ? (invalidated.length === 0 ? 'PASS' : 'INVALID') : 'FAIL', failedTrials: failed.length, invalidatedTrials: invalidated.length }, null, 2));
process.exit(failed.length === 0 ? (invalidated.length === 0 ? 0 : 2) : 1);
