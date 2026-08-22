#!/usr/bin/env node
// HF-331 — measure the Firefox-vs-Chrome frame-rate gap on the SAME renderer path.
//
// The owner reports ~10 FPS in Firefox against 150+ in Chrome. Firefox does not ship
// WebGPU in the configuration on this machine, so it takes the WebGL2 compat path
// while Chrome takes WebGPU. That alone makes the headline numbers incomparable: a
// backend difference and a Firefox-specific defect would look identical.
//
// So this measures three runs, not two:
//   chromium ?renderer=webgl2   — the control. Same code path Firefox runs.
//   firefox  ?renderer=webgl2   — the subject.
//   chromium (default)          — the baseline the owner actually sees.
//
// If firefox/webgl2 tracks chromium/webgl2, the gap is the BACKEND and the fix is to
// make WebGL2 cheaper (or get WebGPU into Firefox). If firefox/webgl2 is far below
// chromium/webgl2, there is a Firefox-specific defect and that is where to dig.
// Reporting one number without this control would not distinguish the two.
//
// Headed by default: headless Firefox falls back to software rasterisation, which
// would measure llvmpipe rather than the user's GPU and quietly invent a gap.
//
// Usage: node scripts/qa/measure-hf331-firefox-gap.mjs [--url http://127.0.0.1:41874] [--headless]

import { chromium, firefox } from '@playwright/test';

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const BASE = readArg('--url', 'http://127.0.0.1:41874');
const HEADLESS = args.includes('--headless');
const SAMPLE_MS = Number(readArg('--sample-ms', '12000'));
const SETTLE_MS = Number(readArg('--settle-ms', '6000'));

async function measure(name, launcher, query) {
  const url = `${BASE}/?${query}`;
  const browser = await launcher.launch({ headless: HEADLESS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

  const result = { name, url, ok: false };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), { timeout: 90_000 });
    result.renderBackend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    await page.waitForTimeout(SETTLE_MS);

    // rAF cadence measured independently of the game's own counters. The runbook
    // records that the in-match FPS readout reports SUBMISSION cadence on the WebGPU
    // route, so a completion-throttled run reads ~10 while rAF spins far higher.
    // Measuring both is the only way to tell "slow" from "throttled".
    const rafHz = await page.evaluate(async (ms) => {
      return await new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames += 1;
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else resolve((frames * 1000) / (performance.now() - t0));
        };
        requestAnimationFrame(tick);
      });
    }, SAMPLE_MS);

    const telemetry = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const snap = api.snapshot();
      const out = { runtime: null, framePacing: null, presentation: null };
      try { out.runtime = snap?.render?.runtime ?? null; } catch { /* shape drift */ }
      try { out.framePacing = snap?.render?.framePacing ?? null; } catch { /* shape drift */ }
      try { out.presentation = api.samplePresentationTelemetry?.() ?? null; } catch { /* absent */ }
      return JSON.parse(JSON.stringify(out));
    });

    result.ok = true;
    result.rafHz = Number(rafHz.toFixed(1));
    result.runtime = telemetry.runtime;
    result.framePacing = telemetry.framePacing;
    result.presentation = telemetry.presentation;
  } catch (error) {
    result.error = String(error).slice(0, 400);
  } finally {
    result.consoleErrors = consoleErrors.slice(0, 6);
    await browser.close().catch(() => {});
  }
  return result;
}

const QUALITY = 'render=quality&map=atomic-acres';
const runs = [
  ['chromium webgl2 (control)', chromium, `renderer=webgl2&${QUALITY}`],
  ['firefox  webgl2 (subject)', firefox, `renderer=webgl2&${QUALITY}`],
  ['chromium default (baseline)', chromium, QUALITY],
];

const results = [];
for (const [name, launcher, query] of runs) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const result = await measure(name, launcher, query);
  results.push(result);
  if (!result.ok) {
    process.stdout.write(`  FAILED: ${result.error}\n`);
    if (result.consoleErrors.length) process.stdout.write(`  console: ${result.consoleErrors.join(' | ')}\n`);
    continue;
  }
  const pacing = result.framePacing ?? {};
  process.stdout.write(`  backend        : ${result.renderBackend} / actual=${result.runtime?.actualBackend ?? '?'}\n`);
  process.stdout.write(`  adapter        : ${result.runtime?.adapterLabel ?? '?'} software=${result.runtime?.softwareAdapter ?? '?'}\n`);
  process.stdout.write(`  rAF Hz         : ${result.rafHz}\n`);
  process.stdout.write(`  cadence Hz     : ${pacing.cadenceHz ?? '?'} (callback ${pacing.callbackCadenceHz ?? '?'}, completed ${pacing.completedCadenceHz ?? '?'})\n`);
  process.stdout.write(`  frame ms       : median ${pacing.medianMs ?? '?'} p95 ${pacing.p95Ms ?? '?'}\n`);
  if (result.presentation) {
    process.stdout.write(`  presentation   : skipped=${result.presentation.skippedSubmissions ?? '?'} backpressure=${result.presentation.backpressureActive ?? '?'} lastCompletionMs=${result.presentation.lastCompletionLatencyMs ?? '?'}\n`);
  }
  if (result.consoleErrors.length) process.stdout.write(`  console errors : ${result.consoleErrors.join(' | ')}\n`);
}

const byName = (needle) => results.find((r) => r.name.startsWith(needle) && r.ok);
const cw = byName('chromium webgl2');
const fw = byName('firefox');
process.stdout.write('\n=== VERDICT ===\n');
if (!cw || !fw) {
  process.stdout.write('  Inconclusive: a control run did not complete. Do not read the surviving\n');
  process.stdout.write('  number as a result - without the same-path control it cannot separate a\n');
  process.stdout.write('  backend cost from a Firefox-specific defect.\n');
} else {
  const ratio = cw.rafHz > 0 ? fw.rafHz / cw.rafHz : 0;
  process.stdout.write(`  firefox/webgl2 ${fw.rafHz} Hz vs chromium/webgl2 ${cw.rafHz} Hz -> ratio ${ratio.toFixed(2)}\n`);
  if (ratio >= 0.75) {
    process.stdout.write('  Firefox tracks the control on the SAME path. The headline gap is therefore\n');
    process.stdout.write('  the BACKEND (Chrome on WebGPU vs Firefox on WebGL2), not a Firefox defect.\n');
  } else {
    process.stdout.write('  Firefox is materially slower than the control on the SAME path, so there IS\n');
    process.stdout.write('  a Firefox-specific cost beyond the backend choice. Dig there.\n');
  }
}
process.stdout.write(`\n${JSON.stringify(results, null, 2)}\n`);
