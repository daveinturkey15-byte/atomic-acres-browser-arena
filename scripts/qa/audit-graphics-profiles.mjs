#!/usr/bin/env node
// Audits one graphics profile on one arena in a headless WebGPU browser: cold admission time, in-combat pipeline compiles, presented-frame pacing, and VRAM delta, written as one JSON row.
// Usage: node scripts/qa/audit-graphics-profiles.mjs --url http://localhost:41977 --preset high --arena atomic-acres --out artifacts/graphics-audit
//   --url <url>             app base URL (default: http://localhost:41977)
//   --preset <name>         graphics profile to audit (default: high)
//   --arena <id>            arena id (default: atomic-acres)
//   --out <dir>             output directory (default: artifacts/graphics-audit)
//   --width <px>            viewport width (default: 2560)
//   --height <px>           viewport height (default: 1440)
//   --sample-ms <ms>        steady-state sample window (default: 14000)
//   --warmup-ms <ms>        warmup before the sample window (default: 4000)
//   --boot-timeout-ms <ms>  boot/admission timeout (default: 180000)
//   env GFX_AUDIT_ALLOW_BUSY_GPU  allow the run with ComfyUI work queued on the GPU (default: unset; set to '1' to allow)
// Writes: <out>/<preset>-<arena>.json (directory created if missing); JSON summary also printed to stdout
// Exits: 0 = success; 2 = refused to start because ComfyUI has work queued and GFX_AUDIT_ALLOW_BUSY_GPU is not '1'
// ===========================================================================
// HF-414 / HF-418 — the graphics-profile cost audit.
//
// WHAT THIS ANSWERS, AND WHY IT HAD TO BE A NEW SCRIPT.
// The owner asked (2026-09-02 17:50) what each graphics profile actually is,
// what it delivers and what it costs, and specifically where the ray-traced
// rung sits relative to MAX. Nothing in the repo measured that: the frame-
// pacing matrix (run-pass66-profile-frame-pacing-matrix.mjs) knows only
// performance/high/max and gates on thresholds rather than reporting a cost
// table, and measure-preset-admission.mjs times admission but samples no
// steady state. This script measures ONE profile on ONE arena per launch and
// writes a flat JSON row, so the doc table is derived from measurement rather
// than from reading the preset literals.
//
// COLD BY CONSTRUCTION. Playwright launches a fresh browser (fresh user data
// dir, therefore a cold shader cache) per invocation, so the admission figure
// is a COLD pipeline-compile figure, which is the one the admission fence
// judges. Warm numbers would be evidence about the second run.
//
// WHAT IS COUNTED
//   admissionMs        wall time from startSolo() to matchPhase === 'active'
//   pipelinesBeforeAdmission / pipelinesInCombat
//                      GPUDevice.createRenderPipeline(+Async) calls, wrapped
//                      before any page script runs. The in-combat count is the
//                      TRIPWIRE: a profile that compiles pipelines while the
//                      player is fighting is the freeze the owner reported.
//   completion pacing  rateHz / medianMs / p95Ms / p99Ms from the renderer's
//                      own presented-frame sampler (a median gap is not a
//                      frame rate - see src/frame-pacing.ts).
//   calls / triangles  the last ADMITTED frame's draw info.
//   deviceFeatures     the optional WebGPU features the device was granted -
//                      the measured answer to "does this need an NVIDIA card".
//   vramMiB            nvidia-smi used-memory delta across the run. Whole-GPU,
//                      so it is an upper bound with everything else on this
//                      shared machine included; reported as such.
//
// HEADLESS ONLY. Owner instruction 2026-09-02 12:40: no QA browser may take
// the screen. `channel: 'chrome'` headless acquires a real WebGPU adapter on
// this machine (scripts/qa/lib/browser-launch-flags.mjs).
//
// Usage:
//   node scripts/qa/audit-graphics-profiles.mjs --url http://localhost:41977 \
//     --preset high --arena atomic-acres --out artifacts/graphics-audit
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://localhost:41977');
const PRESET = arg('--preset', 'high');
const ARENA = arg('--arena', 'atomic-acres');
const OUT_DIR = arg('--out', 'artifacts/graphics-audit');
const WIDTH = Number(arg('--width', '2560'));
const HEIGHT = Number(arg('--height', '1440'));
const SAMPLE_MS = Number(arg('--sample-ms', '14000'));
const WARMUP_MS = Number(arg('--warmup-ms', '4000'));
const BOOT_TIMEOUT_MS = Number(arg('--boot-timeout-ms', '180000'));

const gpuUsedMiB = () => {
  try {
    const raw = execFileSync('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits'], { encoding: 'utf8' });
    return Number(raw.trim().split('\n')[0]);
  } catch { return null; }
};

/**
 * IS THE OWNER'S ComfyUI GENERATING?
 *
 * This is his workstation and his ComfyUI (port 8188) shares this GPU. A frame
 * time sampled while a diffusion job is running is a measurement of the queue,
 * not of the profile, and the lane rules void it. Sampled at the start and the
 * end of every run and written into the row, so a reader can tell a quiet
 * measurement from a contended one WITHOUT having to trust that the wrapper
 * checked. Returns null when ComfyUI is not running at all, which is the
 * common case and is not a busy state.
 */
const comfyBusy = async () => {
  try {
    const response = await fetch('http://127.0.0.1:8188/queue', { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return null;
    const queue = await response.json();
    return (queue.queue_running?.length ?? 0) + (queue.queue_pending?.length ?? 0) > 0;
  } catch { return null; }
};

const vramBeforeMiB = gpuUsedMiB();
const comfyBusyBefore = await comfyBusy();
const errors = [];
const startedAtIso = new Date().toISOString();
if (comfyBusyBefore === true && process.env.GFX_AUDIT_ALLOW_BUSY_GPU !== '1') {
  // Refuse rather than produce a number that has to be thrown away later.
  console.error('[gfx-audit] ComfyUI has work queued on this GPU; a frame-time measurement taken now is void. Waiting is the fix, not a flag.');
  process.exit(2);
}

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

let row = null;
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 300)); });

  // Count every pipeline the app ever creates, starting at boot. A build that
  // compiles everything up front and one that compiles nothing up front are
  // indistinguishable from a probe that only watches the sample window.
  await page.addInitScript(() => {
    const state = { pipelines: 0, shaderModules: 0, hooked: false };
    window.__PROFILE_AUDIT__ = state;
    const install = () => {
      if (state.hooked) return;
      const device = window.GPUDevice;
      if (!device?.prototype) return;
      state.hooked = true;
      for (const methodName of ['createRenderPipeline', 'createRenderPipelineAsync']) {
        const original = device.prototype[methodName];
        if (typeof original !== 'function') continue;
        device.prototype[methodName] = function patched(...args) {
          state.pipelines += 1;
          return original.apply(this, args);
        };
      }
      const originalModule = device.prototype.createShaderModule;
      if (typeof originalModule === 'function') {
        device.prototype.createShaderModule = function patched(...args) {
          state.shaderModules += 1;
          return originalModule.apply(this, args);
        };
      }
    };
    install();
    if (!state.hooked) {
      const timer = setInterval(() => { install(); if (state.hooked) clearInterval(timer); }, 10);
      setTimeout(() => clearInterval(timer), 30_000);
    }
  });

  const url = `${BASE}/?release=latest&renderer=webgpu&externalServices=off&seed=gfxaudit-${PRESET}-${ARENA}&previewTime=0`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });

  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

  // Drive the REAL Options surface, exactly as the owner does: select, then
  // press SAVE GRAPHICS so the batched apply flushes.
  await page.evaluate((preset) => {
    const select = document.querySelector('#graphics-profile');
    if (!select) throw new Error('#graphics-profile not found');
    select.value = preset;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#graphics-save')?.click();
  }, PRESET);
  // SAVING A PRESET CAN RELOAD THE PAGE. `flushPendingGraphics` calls
  // `reloadForGraphicsRuntime()` whenever the new preset stages a renderer
  // reconstruction and no match is running - which is exactly what RAY TRACED
  // and MAX do. The first version of this script read `selectArena` off a
  // window that had just been torn down and died with "Cannot read properties
  // of undefined". Wait for the reloaded document's debug hook instead, then
  // assert the preset actually survived the round trip through storage.
  await page.waitForTimeout(1_500);
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  const appliedPreset = await page.evaluate(() => {
    try { return window.__ATOMIC_ACRES_DEBUG__.snapshot().settings?.displayedGraphicsPreset ?? null; } catch { return null; }
  });
  if (appliedPreset !== PRESET) {
    throw new Error(`preset did not apply: asked for ${PRESET}, the app reports ${String(appliedPreset)}`);
  }

  const pipelinesAtMenu = await page.evaluate(() => window.__PROFILE_AUDIT__?.pipelines ?? null);

  const admissionStartedAt = Date.now();
  await page.evaluate(async (arenaId) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(arenaId); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  let admissionMs = null;
  let admissionOutcome = 'timeout';
  while (Date.now() - admissionStartedAt < BOOT_TIMEOUT_MS) {
    const sample = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const state = api.admissionState();
      return {
        gameStarted: state.gameStarted,
        matchPhase: state.matchPhase ?? null,
        status: document.getElementById('network-status')?.textContent ?? '',
      };
    }).catch(() => null);
    if (sample?.gameStarted && sample.matchPhase === 'active') {
      admissionMs = Date.now() - admissionStartedAt;
      admissionOutcome = 'admitted';
      break;
    }
    if (sample && /Deployment preparation failed/i.test(sample.status)) {
      admissionMs = Date.now() - admissionStartedAt;
      admissionOutcome = 'admission-failed';
      break;
    }
    await new Promise((tick) => setTimeout(tick, 100));
  }

  const pipelinesAtAdmission = await page.evaluate(() => window.__PROFILE_AUDIT__?.pipelines ?? null);

  await page.waitForTimeout(WARMUP_MS);
  // Take the in-combat pipeline baseline after the warm-up so the tripwire
  // counts only pipelines built while a settled match is being played.
  const combatBaseline = await page.evaluate(() => window.__PROFILE_AUDIT__?.pipelines ?? null);
  await page.waitForTimeout(SAMPLE_MS);

  const sampled = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    let presentation = null;
    let counters = null;
    let snapshot = null;
    try { presentation = api.samplePresentationTelemetry(); } catch { /* backend may not expose it */ }
    try { counters = api.samplePresentationCounters(); } catch { /* ignore */ }
    try { snapshot = api.snapshot?.() ?? null; } catch { /* ignore */ }
    return {
      pipelines: window.__PROFILE_AUDIT__?.pipelines ?? null,
      shaderModules: window.__PROFILE_AUDIT__?.shaderModules ?? null,
      completionPacing: presentation?.progress?.completionPacing ?? null,
      submissionPacing: presentation?.progress?.submissionPacing ?? null,
      maximumCompletionLatencyMs: presentation?.progress?.maximumCompletionLatencyMs ?? null,
      status: presentation?.status ?? null,
      skippedSubmissions: presentation?.skippedSubmissions ?? null,
      calls: counters?.calls ?? null,
      triangles: counters?.triangles ?? null,
      graphics: snapshot?.graphics ?? null,
      settings: snapshot?.settings ?? null,
      renderer: snapshot?.renderer ?? null,
      devicePixelRatio: window.devicePixelRatio,
      canvas: (() => {
        const canvas = document.querySelector('canvas');
        return canvas ? { width: canvas.width, height: canvas.height } : null;
      })(),
    };
  });

  row = {
    schema: 'hf414-graphics-profile-audit/1',
    startedAtIso,
    completedAtIso: new Date().toISOString(),
    preset: PRESET,
    arena: ARENA,
    viewport: { width: WIDTH, height: HEIGHT },
    backend,
    admissionOutcome,
    admissionMs,
    pipelinesAtMenu,
    pipelinesBeforeAdmission: pipelinesAtAdmission,
    pipelinesDuringAdmission: pipelinesAtAdmission === null || pipelinesAtMenu === null
      ? null : pipelinesAtAdmission - pipelinesAtMenu,
    // THE TRIPWIRE. Anything above zero is a pipeline built while the player
    // was already in a settled match.
    pipelinesInCombat: sampled.pipelines === null || combatBaseline === null
      ? null : sampled.pipelines - combatBaseline,
    shaderModulesTotal: sampled.shaderModules,
    completionPacing: sampled.completionPacing,
    submissionPacing: sampled.submissionPacing,
    maximumCompletionLatencyMs: sampled.maximumCompletionLatencyMs,
    presentationStatus: sampled.status,
    skippedSubmissions: sampled.skippedSubmissions,
    drawCallsLastAdmittedFrame: sampled.calls,
    trianglesLastAdmittedFrame: sampled.triangles,
    canvas: sampled.canvas,
    devicePixelRatio: sampled.devicePixelRatio,
    graphics: sampled.graphics,
    settings: sampled.settings,
    renderer: sampled.renderer,
    vramBeforeMiB,
    vramAfterMiB: gpuUsedMiB(),
    // Quiet-machine evidence, carried by the row itself.
    comfyBusyBefore,
    comfyBusyAfter: await comfyBusy(),
    errors: errors.slice(0, 12),
  };
  row.vramDeltaMiB = row.vramAfterMiB !== null && row.vramBeforeMiB !== null
    ? row.vramAfterMiB - row.vramBeforeMiB : null;
} finally {
  await browser.close();
}

mkdirSync(resolve(process.cwd(), OUT_DIR), { recursive: true });
const outPath = resolve(process.cwd(), OUT_DIR, `${PRESET}-${ARENA}.json`);
writeFileSync(outPath, `${JSON.stringify(row, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  preset: PRESET,
  arena: ARENA,
  backend: row?.backend ?? null,
  admissionOutcome: row?.admissionOutcome ?? null,
  admissionMs: row?.admissionMs ?? null,
  rateHz: row?.completionPacing?.rateHz ?? null,
  medianMs: row?.completionPacing?.medianMs ?? null,
  p95Ms: row?.completionPacing?.p95Ms ?? null,
  calls: row?.drawCallsLastAdmittedFrame ?? null,
  pipelinesInCombat: row?.pipelinesInCombat ?? null,
  errors: row?.errors?.length ?? 0,
  comfyBusy: [row?.comfyBusyBefore ?? null, row?.comfyBusyAfter ?? null],
  outPath,
}, null, 2));
