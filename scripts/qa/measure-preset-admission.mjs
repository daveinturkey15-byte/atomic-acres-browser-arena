#!/usr/bin/env node
// Measures cold match admission on the REAL WebGPU route in installed Chrome,
// driving the same surface the owner uses: Options -> preset -> Save ->
// selectArena -> Solo. Captures per-stage timings plus presentation telemetry
// so an admission-bound timeout can be attributed to the exact bootstrap stage
// that was in flight when queue completion exceeded MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS.
//
// Usage:
//   node scripts/qa/measure-preset-admission.mjs --url http://127.0.0.1:41910 \
//        [--preset max|quality|high|performance] [--arena atomic-acres] [--timeout-ms 180000]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910');
const PRESET = arg('--preset', 'max');
const ARENA = arg('--arena', 'atomic-acres');
const TIMEOUT_MS = Number(arg('--timeout-ms', '180000'));

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
page.on('pageerror', (error) => errors.push(String(error).slice(0, 400)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 400));
});

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=maxadm-${PRESET}&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

// Drive the real Options surface exactly like the owner does.
await page.evaluate((preset) => {
  const select = document.querySelector('#graphics-profile');
  if (!select) throw new Error('#graphics-profile not found');
  select.value = preset;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  const save = document.querySelector('#graphics-save');
  if (!save) throw new Error('#graphics-save not found');
}, PRESET);
await page.waitForFunction((preset) => (
  window.__ATOMIC_ACRES_DEBUG__.snapshot().settings?.displayedGraphicsPreset === preset
), PRESET, { timeout: 30_000 }).catch(() => {});
const series = [];

const stages = [];
let lastStage = null;
const startedAt = Date.now();
await page.evaluate(async (arenaId) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(arenaId); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });

let outcome = 'unknown';
while (Date.now() - startedAt < TIMEOUT_MS) {
  const sample = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const state = api.admissionState();
    const status = document.getElementById('network-status')?.textContent ?? '';
    let presentation = null;
    try { presentation = api.samplePresentationTelemetry(); } catch { /* backend may not expose it */ }
    return {
      stage: state.bootstrapStage ?? null,
      gameStarted: state.gameStarted,
      matchPhase: state.matchPhase ?? null,
      status,
      lastCompletionLatencyMs: presentation?.lastCompletionLatencyMs ?? null,
      maximumCompletionLatencyMs: presentation?.progress?.maximumCompletionLatencyMs ?? null,
      submissionSequence: presentation?.submissionSequence ?? null,
      completedSequence: presentation?.completedSequence ?? null,
    };
  }).catch(() => null);
  if (sample) {
    series.push({ tMs: Date.now() - startedAt, ...sample });
    if (sample.stage !== lastStage) {
      lastStage = sample.stage;
      stages.push({ tMs: Date.now() - startedAt, ...sample });
    }
    if (/Deployment preparation failed/i.test(sample.status)) { outcome = 'admission-failed'; break; }
    if (sample.gameStarted && sample.matchPhase) { outcome = 'admitted'; break; }
  }
  await new Promise((resolveTick) => setTimeout(resolveTick, 200));
}

if (outcome === 'unknown') outcome = 'timeout';
const finalSample = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  let presentation = null;
  try { presentation = api.samplePresentationTelemetry(); } catch { /* ignore */ }
  return {
    state: api.admissionState(),
    presentation,
    status: document.getElementById('network-status')?.textContent ?? '',
    graphics: api.snapshot().graphics ?? null,
  };
}).catch(() => null);

const totalMs = Date.now() - startedAt;
await browser.close();

const result = {
  preset: PRESET, arena: ARENA, backend, outcome, totalMs, stages, series, finalSample,
  errors: [...new Set(errors)].slice(0, 12),
};
mkdirSync(resolve('artifacts/qa'), { recursive: true });
writeFileSync(resolve(`artifacts/qa/preset-admission-${PRESET}.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  preset: PRESET, outcome, totalMs,
  lastStage: stages.at(-1)?.stage ?? null,
  maxCompletionLatencyMs: finalSample?.presentation?.progress?.maximumCompletionLatencyMs ?? null,
  status: finalSample?.status?.slice(0, 160) ?? null,
  errors: result.errors.slice(0, 3),
}, null, 2));
process.exit(outcome === 'admitted' ? 0 : 1);
