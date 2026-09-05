#!/usr/bin/env node
// PASS 95 time-of-day / weather lighting cost probe.
//
// Measures, on the served build over installed-Chrome headless native WebGPU:
//   1. the cost of one FORCED full lighting-condition apply (sun re-aim, every
//      tint/intensity write, fog, exposure, backdrop intensity) - the worst
//      case a `cycle` step or a weather rung change pays, in ms per apply;
//   2. that a FIXED hour writes NOTHING per frame: `uniformWrites`, `resolves`
//      and `sunReaims` telemetry counters must not move across a 3 s window
//      (shadow-map refreshes happen only when the sun moves);
//   3. mean rAF frame time at the authored preset versus the night preset
//      versus night + light rain, so the presentation delta is a number.
//
// Usage: node scripts/qa/probe-pass95-lighting-cost.mjs --url http://127.0.0.1:4266
//        [--arena nuketown2] [--out <json path>]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:4266');
const ARENA = arg('--arena', 'nuketown2');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/qa/pass95-lighting-cost.json'));
const started = Date.now();
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--window-position=2560,0'],
});
const result = { arena: ARENA, url: BASE, ok: false };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=viewpoint&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
  result.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 150_000 });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
  await page.waitForTimeout(4_000);

  const sampleFrames = async (label, ms) => page.evaluate(async ({ label, ms }) => {
    const times = [];
    let last = performance.now();
    await new Promise((done) => {
      const until = performance.now() + ms;
      const loop = () => {
        const now = performance.now();
        times.push(now - last);
        last = now;
        if (now < until && times.length < 10_000) requestAnimationFrame(loop); else done();
      };
      requestAnimationFrame(loop);
    });
    const sorted = [...times].sort((a, b) => a - b);
    const mean = times.reduce((sum, value) => sum + value, 0) / Math.max(1, times.length);
    return { label, frames: times.length, meanMs: Number(mean.toFixed(3)), p50Ms: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(3)), p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(3)) };
  }, { label, ms });

  // 1. Forced apply cost, alternating dawn and night so every term changes and the sun re-aims each time.
  result.forcedApply = await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setLightingFixedHour(6.5);
    const iterations = 200;
    const t0 = performance.now();
    for (let index = 0; index < iterations; index += 1) debug.setLightingFixedHour(index % 2 === 0 ? 20.5 : 6.5);
    const elapsed = performance.now() - t0;
    return { iterations, totalMs: Number(elapsed.toFixed(3)), msPerApply: Number((elapsed / iterations).toFixed(4)) };
  });

  // 2. Fixed hour: nothing may be written per frame.
  result.steadyState = await page.evaluate(async () => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setLightingFixedHour(20.5);
    await new Promise((done) => setTimeout(done, 500));
    const before = debug.sampleLightingConditions();
    await new Promise((done) => setTimeout(done, 3_000));
    const after = debug.sampleLightingConditions();
    return {
      windowMs: 3_000,
      uniformWritesDelta: after.uniformWrites - before.uniformWrites,
      resolvesDelta: after.resolves - before.resolves,
      sunReaimsDelta: after.sunReaims - before.sunReaims,
      telemetry: after,
    };
  });

  // 3. Frame time at authored / night / night + light rain.
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setLightingFixedHour(null); window.__ATOMIC_ACRES_DEBUG__.setWeatherOverride('clear'); });
  await page.waitForTimeout(1_000);
  result.frameAuthoredClear = await sampleFrames('authored/clear', 3_000);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setLightingFixedHour(20.5); });
  await page.waitForTimeout(1_000);
  result.frameNightClear = await sampleFrames('night/clear', 3_000);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setWeatherOverride('light-rain'); });
  await page.waitForTimeout(2_500);
  result.frameNightLightRain = await sampleFrames('night/light-rain', 3_000);
  result.rain = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleWeather());
  result.lighting = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleLightingConditions());
  result.errors = errors;
  result.ok = errors.length === 0;
} catch (error) {
  result.error = String(error).slice(0, 400);
} finally {
  await browser.close().catch(() => {});
}
result.ms = Date.now() - started;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
