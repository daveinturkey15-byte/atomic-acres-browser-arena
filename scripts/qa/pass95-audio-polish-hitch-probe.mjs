#!/usr/bin/env node
// ===========================================================================
// PASS 95 AUDIO-POLISH HITCH + TRIPWIRE PROBE (HF-491 / HF-509).
//
// QUESTION
//   With every world sound now panned through the pooled panners, does combat
//   still allocate NOTHING on the audio side (no AudioBuffer, no PannerNode,
//   no decodeAudioData), does the pipeline tripwire stay at 0, and does the
//   frame loop show no audio-attributable hitch while bots fire, the player
//   fires, and the listener walks from the street into a house and back?
//
// HOW IT MEASURES
//   AudioContext factories are wrapped BEFORE the page script runs
//   (addInitScript), so the unlock-time pre-allocation is visible beside the
//   in-combat total. GPUDevice.createRenderPipeline(Async)/createShaderModule
//   are wrapped the same way (the in-combat pipeline tripwire). A rAF series
//   runs across the combat window; a 250 ms sampler records the audio telemetry
//   (world-panner pool, acoustic space, bus gains) and the player pose.
//   Half-way through the window the player is teleported into the Nuke Town
//   north house for a few seconds and back to the street, so the zone-keyed
//   reverb switch is observed live.
//
//   Headless installed Chrome, stock flags (the same list as
//   scripts/qa/hf491-audio-regression-probe.mjs), muted, parked off-screen,
//   one browser, hard-killed at 225 s.
//
// USAGE
//   PASS73_NATIVE_WEBGPU=1 node scripts/qa/pass95-audio-polish-hitch-probe.mjs \
//     --dist dist --port 4265 --seconds 45 --label candidate
// ===========================================================================
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const DIST = resolve(arg('--dist', 'dist'));
const PORT = Number(arg('--port', '4265'));
const SECONDS = Number(arg('--seconds', '45'));
const WARMUP_SECONDS = Number(arg('--warmup', '10'));
const LABEL = arg('--label', 'run');
const OUT = resolve(arg('--out', `docs/evidence/pass95/audio-polish/raw/${LABEL}.json`));
const HARD_KILL_MS = 225_000;
const BOOT_TIMEOUT_MS = 150_000;
// Nuke Town north house interior (src/audio-zone-map.ts: x -4.25..6.75, z -23..-10)
// and a street point that is in no interior volume.
const HOUSE_POINT = { x: 1.25, y: 1.7, z: -16.5 };
const STREET_POINT = { x: 0, y: 1.7, z: 0 };
const INTERIOR_HOLD_MS = 4_000;

const STOCK_CHROME_ARGS = [
  '--mute-audio',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--window-position=-32000,-32000',
  '--window-size=2640,1520',
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}`);

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  const file = join(DIST, relative);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404).end('nope'); return; }
  const body = readFileSync(file);
  response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

let browser = null;
const hardKill = setTimeout(async () => {
  console.error(`[pass95-audio] hard kill at ${HARD_KILL_MS} ms`);
  try { await browser?.close(); } catch { /* already gone */ }
  server.close();
  process.exit(2);
}, HARD_KILL_MS);

const report = {
  contract: 'pass95-audio-polish-hitch-probe-v1',
  measuredAt: new Date().toISOString(),
  label: LABEL,
  dist: DIST,
  port: PORT,
  seconds: SECONDS,
  warmupSeconds: WARMUP_SECONDS,
  browser: { channel: 'chrome', headless: true, args: STOCK_CHROME_ARGS, viewport: { width: 1280, height: 720 } },
};

function installProbes(page) {
  return page.addInitScript(() => {
    const state = {
      audio: { contexts: 0, panners: [], buffers: [], decodes: [], convolvers: 0, bufferSources: 0, oscillators: 0, starts: 0 },
      gpu: { hooked: false, pipelines: [], shaderModules: [] },
    };
    window.__PASS95_AUDIO_PROBE__ = state;
    const stackOf = () => (new Error().stack ?? '').split('\n').slice(2, 8).map((line) => line.trim()).join(' <- ');
    const observe = (context) => {
      state.audio.contexts += 1;
      const count = (name, onCall) => {
        const original = context[name];
        if (typeof original !== 'function') return;
        context[name] = function patched(...args) { onCall(); return original.apply(this, args); };
      };
      count('createPanner', () => state.audio.panners.push({ atMs: Math.round(performance.now()), stack: stackOf() }));
      count('createBuffer', () => state.audio.buffers.push({ atMs: Math.round(performance.now()), stack: stackOf() }));
      count('createConvolver', () => { state.audio.convolvers += 1; });
      count('createBufferSource', () => { state.audio.bufferSources += 1; });
      count('createOscillator', () => { state.audio.oscillators += 1; });
      const decode = context.decodeAudioData;
      if (typeof decode === 'function') {
        context.decodeAudioData = function patched(...args) {
          state.audio.decodes.push({ atMs: Math.round(performance.now()), stack: stackOf() });
          return decode.apply(this, args);
        };
      }
    };
    for (const name of ['AudioContext', 'webkitAudioContext']) {
      const native = globalThis[name];
      if (typeof native !== 'function') continue;
      globalThis[name] = class extends native {
        constructor(...args) { super(...args); observe(this); }
      };
    }
    const sourceStart = globalThis.AudioScheduledSourceNode?.prototype?.start;
    if (sourceStart) globalThis.AudioScheduledSourceNode.prototype.start = function patched(...args) { state.audio.starts += 1; return sourceStart.apply(this, args); };

    const installGpu = () => {
      if (state.gpu.hooked) return;
      const device = window.GPUDevice;
      if (!device?.prototype) return;
      state.gpu.hooked = true;
      const wrap = (methodName, sink) => {
        const original = device.prototype[methodName];
        if (typeof original !== 'function') return;
        device.prototype[methodName] = function patched(descriptor, ...rest) {
          sink.push({ atMs: Math.round(performance.now()), label: typeof descriptor?.label === 'string' ? descriptor.label.slice(0, 120) : null });
          return original.call(this, descriptor, ...rest);
        };
      };
      wrap('createRenderPipeline', state.gpu.pipelines);
      wrap('createRenderPipelineAsync', state.gpu.pipelines);
      wrap('createShaderModule', state.gpu.shaderModules);
    };
    installGpu();
    if (!state.gpu.hooked) {
      const timer = setInterval(() => { installGpu(); if (state.gpu.hooked) clearInterval(timer); }, 10);
      setTimeout(() => clearInterval(timer), 30_000);
    }
  });
}

const counters = () => ({
  panners: window.__PASS95_AUDIO_PROBE__.audio.panners.length,
  buffers: window.__PASS95_AUDIO_PROBE__.audio.buffers.length,
  decodes: window.__PASS95_AUDIO_PROBE__.audio.decodes.length,
  convolvers: window.__PASS95_AUDIO_PROBE__.audio.convolvers,
  bufferSources: window.__PASS95_AUDIO_PROBE__.audio.bufferSources,
  oscillators: window.__PASS95_AUDIO_PROBE__.audio.oscillators,
  starts: window.__PASS95_AUDIO_PROBE__.audio.starts,
  pipelines: window.__PASS95_AUDIO_PROBE__.gpu.pipelines.length,
  shaderModules: window.__PASS95_AUDIO_PROBE__.gpu.shaderModules.length,
  atMs: Math.round(performance.now()),
});

const audioTelemetry = () => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const telemetry = typeof api?.audioTelemetry === 'function' ? api.audioTelemetry() : null;
  if (!telemetry) return null;
  return {
    context: telemetry.context,
    immersion: telemetry.immersion,
    worldPanners: telemetry.worldPanners ?? null,
    runtime: telemetry.runtime,
    buses: telemetry.buses,
    combatPrewarm: telemetry.combatPrewarm,
    explosionMix: telemetry.explosionMix,
  };
};

try {
  browser = await chromium.launch({ headless: true, channel: 'chrome', args: STOCK_CHROME_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300)); });
  page.on('pageerror', (error) => pageErrors.push({ name: error.name, message: error.message }));
  await installProbes(page);

  const url = new URL(`http://127.0.0.1:${PORT}/`);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('seed', 'pass95-audio');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  for (const selector of ['#changelog-close', '#project-map-close', '#rtx-native-runtime-explainer-close']) {
    if (await page.locator(selector).isVisible().catch(() => false)) await page.locator(selector).click();
  }
  if (await page.locator('#release-channel-gate').isVisible().catch(() => false)) await page.locator('[data-release-choice="latest"]').click();
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForSelector('#menu', { state: 'visible', timeout: BOOT_TIMEOUT_MS });
  await page.locator('.map-card[data-arena-id="nuketown2"]:not([disabled])').click();
  await page.waitForFunction(() => document.querySelector('.map-card[aria-pressed="true"]')?.getAttribute('data-arena-id') === 'nuketown2', undefined, { timeout: 10_000 });
  report.beforeDeploy = await page.evaluate(counters);
  // A real Playwright click: the audio unlock is gesture-gated, so the deploy
  // button is pressed through input, never through element.click().
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const state = typeof api?.snapshot === 'function' ? api.snapshot() : null;
    return document.documentElement.dataset.gameplayArena === 'nuketown2'
      && document.querySelector('#menu')?.classList.contains('hidden') === true
      && state?.gameStarted === true && state?.matchPhase === 'active';
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  report.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  report.afterDeploy = await page.evaluate(counters);
  report.afterDeployAudio = await page.evaluate(audioTelemetry);
  console.error(`[pass95-audio] match active on ${report.backend}; warming up ${WARMUP_SECONDS} s`);
  await page.waitForTimeout(WARMUP_SECONDS * 1000);

  // Combat window.
  report.windowStart = await page.evaluate(counters);
  report.windowStartAudio = await page.evaluate(audioTelemetry);
  await page.evaluate(() => {
    const probe = window.__PASS95_AUDIO_PROBE__;
    probe.raf = [];
    probe.samples = [];
    probe.running = true;
    let last = performance.now();
    const tick = (now) => {
      if (!probe.running) return;
      probe.raf.push(Math.round((now - last) * 100) / 100);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    probe.sampler = setInterval(() => {
      try {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const t = api.audioTelemetry();
        const pose = api.samplePlayerPose();
        probe.samples.push({
          atMs: Math.round(performance.now()),
          space: t.immersion?.space ?? null,
          overridden: t.immersion?.overridden ?? null,
          pool: t.worldPanners ?? null,
          voices: t.runtime?.voices ?? null,
          spatialChains: t.runtime?.spatialChains ?? null,
          x: Math.round((pose?.position?.[0] ?? NaN) * 100) / 100,
          z: Math.round((pose?.position?.[2] ?? NaN) * 100) / 100,
        });
      } catch { /* between phases */ }
    }, 250);
    let step = 0;
    let aliveCache = null;
    let deadSince = null;
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const key = (type, code) => { try { window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true })); } catch { /* refused */ } };
    probe.driver = setInterval(() => {
      step += 1;
      try {
        const menu = document.querySelector('#menu');
        if (menu !== null && !menu.classList.contains('hidden')) { document.querySelector('#resume')?.click(); return; }
        if (step % 40 === 0) { try { aliveCache = api.snapshot().player.alive; } catch { aliveCache = null; } }
        if (aliveCache === false) {
          if (deadSince === null) deadSince = performance.now();
          if (performance.now() - deadSince > 3000) { try { api.respawn(); } catch { /* refused */ } deadSince = null; }
          return;
        }
        deadSince = null;
        if (!probe.hold) api.setMovement?.(true, step % 40 < 12);
        if (step % 20 === 0) key('keydown', 'KeyA');
        if (step % 20 === 6) key('keyup', 'KeyA');
        if (step % 20 === 10) key('keydown', 'KeyD');
        if (step % 20 === 16) key('keyup', 'KeyD');
        if (step % 25 === 0) { try { api.aimAtBot?.(); } catch { /* none */ } }
        if (step % 16 === 0) api.setTriggerHeld?.(true);
        if (step % 16 === 9) api.setTriggerHeld?.(false);
        if (step % 200 === 150) { try { api.reload?.(); } catch { /* refused */ } }
      } catch { /* keep driving */ }
    }, 50);
  });

  const halfMs = Math.max(2_000, (SECONDS * 1000 - INTERIOR_HOLD_MS) / 2);
  await page.waitForTimeout(halfMs);
  // Interior excursion: stand still inside the north house, then back on the street.
  report.interior = await page.evaluate(async ([house, street, holdMs]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const probe = window.__PASS95_AUDIO_PROBE__;
    const spaceNow = () => api.audioTelemetry().immersion;
    const before = spaceNow();
    probe.hold = true;
    api.setMovement?.(false, false);
    api.teleportPlayer(house.x, house.y, house.z);
    const seen = [];
    const startedAt = performance.now();
    await new Promise((done) => {
      const timer = setInterval(() => {
        seen.push({ atMs: Math.round(performance.now() - startedAt), ...spaceNow(), busReturn: null });
        if (performance.now() - startedAt >= holdMs) { clearInterval(timer); done(); }
      }, 200);
    });
    const inside = spaceNow();
    api.teleportPlayer(street.x, street.y, street.z);
    await new Promise((done) => setTimeout(done, 600));
    const after = spaceNow();
    probe.hold = false;
    return { house, street, before, inside, after, holdMs, seen };
  }, [HOUSE_POINT, STREET_POINT, INTERIOR_HOLD_MS]);
  await page.waitForTimeout(halfMs);

  const raw = await page.evaluate(() => {
    const probe = window.__PASS95_AUDIO_PROBE__;
    probe.running = false;
    clearInterval(probe.driver);
    clearInterval(probe.sampler);
    try { window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld?.(false); } catch { /* gone */ }
    try { window.__ATOMIC_ACRES_DEBUG__.setMovement?.(false, false); } catch { /* gone */ }
    return { raf: probe.raf, samples: probe.samples, panners: probe.audio.panners, buffers: probe.audio.buffers, decodes: probe.audio.decodes, pipelines: probe.gpu.pipelines, shaderModules: probe.gpu.shaderModules, gpuHooked: probe.gpu.hooked };
  });
  report.windowEnd = await page.evaluate(counters);
  report.windowEndAudio = await page.evaluate(audioTelemetry);

  const startAt = report.windowStart.atMs;
  const inWindow = (entries) => entries.filter((entry) => entry.atMs >= startAt);
  const gaps = raw.raf.slice(1);
  const sorted = [...gaps].sort((a, b) => a - b);
  const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null;
  const windowMs = report.windowEnd.atMs - startAt;
  const pool = report.windowEndAudio?.worldPanners ?? null;
  const poolStart = report.windowStartAudio?.worldPanners ?? null;
  report.result = {
    windowMs,
    frames: gaps.length,
    fps: gaps.length ? Math.round((gaps.length / (windowMs / 1000)) * 10) / 10 : null,
    frameGapMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: sorted.length ? sorted[sorted.length - 1] : null },
    hitches50: gaps.filter((gap) => gap >= 50).length,
    hitches100: gaps.filter((gap) => gap >= 100).length,
    stalledShare: gaps.length ? Math.round((gaps.filter((gap) => gap >= 100).reduce((sum, gap) => sum + gap, 0) / windowMs) * 10000) / 100 : null,
    audioInWindow: {
      panners: report.windowEnd.panners - report.windowStart.panners,
      buffers: report.windowEnd.buffers - report.windowStart.buffers,
      decodes: report.windowEnd.decodes - report.windowStart.decodes,
      convolvers: report.windowEnd.convolvers - report.windowStart.convolvers,
      sourcesStarted: report.windowEnd.starts - report.windowStart.starts,
      pannerStacks: inWindow(raw.panners).map((entry) => entry.stack).slice(0, 12),
      bufferStacks: inWindow(raw.buffers).map((entry) => entry.stack).slice(0, 12),
    },
    audioTotal: { panners: report.windowEnd.panners, buffers: report.windowEnd.buffers, decodes: report.windowEnd.decodes, convolvers: report.windowEnd.convolvers },
    pipelineTripwire: {
      hooked: raw.gpuHooked,
      pipelinesInWindow: report.windowEnd.pipelines - report.windowStart.pipelines,
      shaderModulesInWindow: report.windowEnd.shaderModules - report.windowStart.shaderModules,
      pipelinesTotal: report.windowEnd.pipelines,
      inWindowLabels: inWindow(raw.pipelines).map((entry) => entry.label).slice(0, 12),
    },
    worldPanners: pool && poolStart ? { pooled: pool.pooled, acquisitionsInWindow: pool.acquisitions - poolStart.acquisitions, starvedInWindow: pool.starved - poolStart.starved, busyAtEnd: pool.busy } : null,
    spacesSeen: [...new Set(raw.samples.map((sample) => sample.space))],
    interior: { before: report.interior.before.space, inside: report.interior.inside.space, insideOverridden: report.interior.inside.overridden, after: report.interior.after.space },
    maxVoices: Math.max(0, ...raw.samples.map((sample) => sample.voices ?? 0)),
    maxSpatialChains: Math.max(0, ...raw.samples.map((sample) => sample.spatialChains ?? 0)),
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    audioState: report.windowEndAudio?.context ?? null,
  };
  report.samples = raw.samples;
  report.rafGapsOver50 = gaps.map((gap, index) => ({ index, gap })).filter((entry) => entry.gap >= 50);
  report.consoleErrors = consoleErrors.slice(0, 40);
  report.pageErrors = pageErrors;
  await page.close();
} catch (error) {
  report.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
} finally {
  clearTimeout(hardKill);
  try { await browser?.close(); } catch { /* already gone */ }
  server.close();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({ label: LABEL, backend: report.backend ?? null, error: report.error ?? null, result: report.result ?? null }, null, 2));
if (report.error) process.exitCode = 1;
