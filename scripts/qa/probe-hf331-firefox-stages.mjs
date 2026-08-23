#!/usr/bin/env node
// =====================================================================
// SUPERSEDED 2026-08-23 (Lane Q). DO NOT REACH FOR THIS FOR HF-331.
//
// HF-331 is CLOSED and this instrument is one of the ones that could not
// close it. Root cause, bisected: Firefox launched with an explicit
// `-profile <dir>` never gives the content document focus - document
// .hasFocus() stays false forever and no focus/blur/focusin event ever
// fires, even with the window verified foreground, visible, and clicked
// into with synthesised input. The product pauses its frame loop on
// exactly that predicate (`ownsForeground()` in src/legacy-main.ts), so
// every harness that used a disposable -profile measured a game that was
// deliberately rendering nothing and reported it as "Firefox is slow".
//
// The measured answer: Firefox 154 runs atomic-acres at 38.5 fps median on
// WebGPU against its own 166.7 fps presentation ceiling - about 88% of
// Chrome, not a fifteenth of it.
//
// Working instrument:  scripts/qa/verify-cross-browser-matrix.mjs
// Standing gate:       npm run qa:cross-browser
// Lane discipline:     scripts/qa/installed-browser-lanes.mjs
// Write-up:            docs/LANE_Q_CROSS_BROWSER_AND_MOBILE_AUDIT_2026-08-23.md
// =====================================================================
// HF-331 — WHERE does Firefox stall? Times each boot stage separately with a hard
// deadline on every one, because the combined measurement hung indefinitely: an
// evaluate() that waits on requestAnimationFrame never returns if rAF is starved,
// and Playwright puts no timeout on evaluate. A run that hangs teaches nothing, so
// each stage here fails loudly instead.
import { firefox, chromium } from '@playwright/test';

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1] : 'http://127.0.0.1:41874';
const WHICH = process.argv.includes('--chromium') ? chromium : firefox;
const NAME = process.argv.includes('--chromium') ? 'chromium' : 'firefox';

const deadline = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`STAGE TIMEOUT: ${label} exceeded ${ms}ms`)), ms)),
]);

const browser = await WHICH.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`  [pageerror] ${String(e).slice(0, 160)}`));
page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console] ${m.text().slice(0, 160)}`); });

const stage = async (label, ms, fn) => {
  const t0 = Date.now();
  try {
    const value = await deadline(fn(), ms, label);
    console.log(`  ${label.padEnd(28)} ${String(Date.now() - t0).padStart(6)}ms  ${value ?? ''}`);
    return value;
  } catch (error) {
    console.log(`  ${label.padEnd(28)} ${String(Date.now() - t0).padStart(6)}ms  FAILED: ${String(error).slice(0, 140)}`);
    return null;
  }
};

console.log(`\n=== ${NAME} stage probe: ${BASE} ===`);
try {
  await stage('goto', 60_000, async () => {
    await page.goto(`${BASE}/?renderer=webgl2&render=quality&map=atomic-acres`, { waitUntil: 'domcontentloaded' });
    return 'ok';
  });
  await stage('debug hook present', 60_000, async () => {
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__));
    return 'ok';
  });
  await stage('renderBackend stamp', 10_000, () =>
    page.evaluate(() => document.documentElement.dataset.renderBackend ?? 'unstamped'));
  await stage('rAF fires at all', 15_000, () => page.evaluate(() => new Promise((resolve) => {
    let fired = 0;
    requestAnimationFrame(() => { fired = 1; resolve('yes'); });
    setTimeout(() => resolve(fired ? 'yes' : 'NO - rAF never fired in 5s'), 5000);
  })));
  await stage('rAF Hz (menu, pre-solo)', 20_000, () => page.evaluate(() => new Promise((resolve) => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames += 1; if (performance.now() - t0 < 5000) requestAnimationFrame(tick);
      else resolve(((frames * 1000) / (performance.now() - t0)).toFixed(1) + ' Hz'); };
    requestAnimationFrame(tick);
    setTimeout(() => resolve(`partial: ${frames} frames in 8s`), 8000);
  })));
  await stage('startSolo() returns', 30_000, async () => {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    return 'ok';
  });
  await stage('rAF Hz (in match)', 25_000, () => page.evaluate(() => new Promise((resolve) => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames += 1; if (performance.now() - t0 < 8000) requestAnimationFrame(tick);
      else resolve(((frames * 1000) / (performance.now() - t0)).toFixed(1) + ' Hz'); };
    requestAnimationFrame(tick);
    setTimeout(() => resolve(`partial: ${frames} frames in 12s`), 12_000);
  })));
  await stage('adapter', 10_000, () => page.evaluate(() => {
    try {
      const r = window.__ATOMIC_ACRES_DEBUG__.snapshot()?.render?.runtime;
      return `${r?.actualBackend} / ${r?.adapterLabel} / software=${r?.softwareAdapter}`;
    } catch { return 'unavailable'; }
  }));
} finally {
  await browser.close().catch(() => {});
}
