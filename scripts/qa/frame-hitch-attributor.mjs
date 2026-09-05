#!/usr/bin/env node
// ===========================================================================
// PASS 95 - LONG-FRAME ATTRIBUTOR (HF-509)
//
// Owner, 2026-09-05, on candidate 7: "still had a few problems with freezing
// ... there's definitely still some sort of lagging and chopping" in Nuke Town
// with bots. Averages (fps, p50) had already improved lane over lane, so the
// complaint is about the TAIL: individual frames long enough to read as a
// chop. This script exists to answer one question with numbers instead of
// theory: WHEN a frame goes long, what ran inside it?
//
// It runs a scripted headless bot match on the real WebGPU device and, for
// every frame over a threshold (default 50 ms), records what happened in that
// frame from three independent instruments:
//
//   1. A rAF sampler installed BEFORE page script. Per frame it records the
//      frame interval, the time spent inside the frame's JS task (measured by
//      a MessageChannel continuation that runs after every rAF callback in the
//      same task), the JS heap, and the delta of every counter below.
//   2. Web API hooks installed on the prototypes before page script, each of
//      which measures the wall time spent INSIDE the call, so the cost is
//      attributed rather than inferred:
//        - GPUDevice.createRenderPipeline / createShaderModule / createBuffer /
//          createTexture      -> pipeline + shader compile, GPU allocation
//        - GPUQueue.writeBuffer / writeTexture / copyExternalImageToTexture
//                             -> geometry and texture upload (bytes + ms)
//        - GPURenderPassEncoder.draw*        -> draws / triangles per frame
//        - CanvasRenderingContext2D drawImage/putImageData/getImageData/fill*
//                             -> minimap and other 2D canvas redraws
//        - getComputedStyle / getBoundingClientRect / offset* reads
//                             -> forced synchronous style + layout (HUD)
//        - AudioContext.decodeAudioData / AudioBufferSourceNode.start
//                             -> audio decode and voice start
//        - PerformanceObserver('longtask')
//   3. A CDP trace (devtools.timeline + blink.user_timing) so the renderer's
//      OWN costs - style recalculation, layout, paint, GC, image decode, GPU
//      task - are attributed by the browser rather than guessed. Trace time is
//      aligned to performance.now() through a user-timing mark emitted by the
//      sampler, so a trace event can be charged to an exact frame.
//
// Output: `<label>.json` (every hitch frame with its attribution) and
// `<label>.md` (the cause / count / total ms / worst ms table plus hitch
// count, p99 and p99.9 frame time).
//
// USAGE
//   node scripts/qa/frame-hitch-attributor.mjs --dist dist --label before \
//     --port 4254 --arena nuketown2 --seconds 90 \
//     --out-dir docs/evidence/pass95/frame-hitches
//
// CONTRACT NOTES
//   - Headless installed Chrome (channel: 'chrome') under PASS73_NATIVE_WEBGPU=1,
//     stock flags per tests/e2e/pass93-stock-flags-boot.spec.ts (mute-audio,
//     backgrounding disables, off-screen) plus --enable-precise-memory-info for
//     the heap sampler. No --enable-unsafe-webgpu / --ignore-gpu-blocklist /
//     --use-angle (PASS 92 incident: the unsafe flag hid a real Chrome shader
//     bug, so measuring under it is dishonest).
//   - --disable-frame-rate-limit + --disable-gpu-vsync are DISCLOSED measurement
//     choices: the numbers are frame COST, not a vsync cap.
//   - This script never widens a budget, fence or threshold; it only reads.
//   - HITCH_MS is a REPORTING threshold for this instrument, not a gate.
// ===========================================================================
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const DIST = arg('--dist', 'dist') ? resolve(arg('--dist', 'dist')) : null;
const URL_BASE = arg('--url', null);
const ARENA = arg('--arena', 'nuketown2');
const SECONDS = Number(arg('--seconds', '90'));
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '4254'));
const WIDTH = Number(arg('--width', '2560'));
const HEIGHT = Number(arg('--height', '1440'));
const OUT_DIR = resolve(arg('--out-dir', 'docs/evidence/pass95/frame-hitches'));
const PROFILE = arg('--profile', 'high');
const HITCH_MS = Number(arg('--hitch-ms', '50'));
const NO_TRACE = flag('--no-trace');
const BOOT_TIMEOUT_MS = 240_000;
// Hard kill: no browser session in this repository may run past four minutes.
const HARD_KILL_MS = Number(arg('--hard-kill-ms', '235000'));

mkdirSync(OUT_DIR, { recursive: true });
// The run report claims PASS73_NATIVE_WEBGPU=1; enforce it so a bundled-Chromium
// launch (no native WebGPU adapter on this machine) fails loudly instead of
// producing adapter-less numbers. This matches pass74-arena-boot-smoke's rule.
if (process.env.PASS73_NATIVE_WEBGPU !== '1') {
  console.error('[hitch] REFUSAL: rerun with PASS73_NATIVE_WEBGPU=1 (installed Chrome with a real adapter).');
  process.exit(2);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

let server = null;
let base = URL_BASE;
if (!URL_BASE) {
  if (!DIST || !existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}. Run npm run build first.`);
  server = createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    const file = join(DIST, relative);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404).end('nope'); return; }
    const body = readFileSync(file);
    response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
    response.end(body);
  });
  await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));
  base = `http://127.0.0.1:${PORT}/`;
}

const percentile = (sorted, p) => (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);
const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

const report = {
  contract: 'pass95-frame-hitch-attributor-v1',
  measuredAt: new Date().toISOString(),
  label: LABEL,
  arena: ARENA,
  base,
  requestedProfile: PROFILE,
  viewport: { width: WIDTH, height: HEIGHT },
  sampleSeconds: SECONDS,
  hitchThresholdMs: HITCH_MS,
};

// --------------------------------------------------------------------------
// The in-page instrument. Everything here runs before page script.
// --------------------------------------------------------------------------
function installInstrument() {
  const S = {
    hooked: false,
    running: false,
    frames: [],
    longTasks: [],
    marks: [],
    // Cumulative counters. Every `*Ms` is wall time spent INSIDE that API.
    c: {
      pipelines: 0, pipelineMs: 0,
      shaderModules: 0, shaderMs: 0,
      gpuBuffers: 0, gpuBufferBytes: 0, gpuBufferMs: 0,
      gpuTextures: 0, gpuTextureBytes: 0, gpuTextureMs: 0,
      writeBuffer: 0, writeBufferBytes: 0, writeBufferMs: 0,
      writeTexture: 0, writeTextureBytes: 0, writeTextureMs: 0,
      externalImage: 0, externalImageMs: 0,
      draws: 0, triangles: 0, submits: 0, passes: 0,
      canvas2d: 0, canvas2dMs: 0,
      styleReads: 0, styleReadMs: 0,
      layoutReads: 0, layoutReadMs: 0,
      audioDecode: 0, audioDecodeMs: 0, audioStarts: 0,
      geometryBuilds: 0, geometryBuildMs: 0,
    },
  };
  globalThis.__AA_HITCH__ = S;

  const now = () => performance.now();
  const timed = (proto, name, key, msKey, bytesOf) => {
    if (!proto || typeof proto[name] !== 'function') return;
    const original = proto[name];
    proto[name] = function patched(...args) {
      const t0 = now();
      const result = original.apply(this, args);
      S.c[msKey] += now() - t0;
      S.c[key] += 1;
      if (bytesOf) { try { bytesOf(args, this); } catch { /* ignore */ } }
      return result;
    };
  };
  const counted = (proto, name, sink) => {
    if (!proto || typeof proto[name] !== 'function') return;
    const original = proto[name];
    proto[name] = function patched(...args) { sink(args); return original.apply(this, args); };
  };

  const install = () => {
    if (S.hooked) return;
    const device = globalThis.GPUDevice;
    const queue = globalThis.GPUQueue;
    const pass = globalThis.GPURenderPassEncoder;
    const encoder = globalThis.GPUCommandEncoder;
    if (!device?.prototype || !queue?.prototype || !pass?.prototype || !encoder?.prototype) return;
    S.hooked = true;

    timed(device.prototype, 'createRenderPipeline', 'pipelines', 'pipelineMs');
    timed(device.prototype, 'createRenderPipelineAsync', 'pipelines', 'pipelineMs');
    timed(device.prototype, 'createComputePipeline', 'pipelines', 'pipelineMs');
    timed(device.prototype, 'createShaderModule', 'shaderModules', 'shaderMs');
    timed(device.prototype, 'createBuffer', 'gpuBuffers', 'gpuBufferMs', (args) => { S.c.gpuBufferBytes += Number(args?.[0]?.size ?? 0); });
    timed(device.prototype, 'createTexture', 'gpuTextures', 'gpuTextureMs');
    timed(queue.prototype, 'writeBuffer', 'writeBuffer', 'writeBufferMs', (args) => {
      const data = args?.[2];
      S.c.writeBufferBytes += Number(args?.[4] ?? data?.byteLength ?? 0);
    });
    timed(queue.prototype, 'writeTexture', 'writeTexture', 'writeTextureMs', (args) => {
      S.c.writeTextureBytes += Number(args?.[1]?.byteLength ?? 0);
    });
    timed(queue.prototype, 'copyExternalImageToTexture', 'externalImage', 'externalImageMs');

    counted(queue.prototype, 'submit', () => { S.c.submits += 1; });
    counted(encoder.prototype, 'beginRenderPass', () => { S.c.passes += 1; });
    counted(pass.prototype, 'draw', ([vertexCount, instanceCount = 1]) => {
      S.c.draws += 1; S.c.triangles += (vertexCount / 3) * instanceCount;
    });
    counted(pass.prototype, 'drawIndexed', ([indexCount, instanceCount = 1]) => {
      S.c.draws += 1; S.c.triangles += (indexCount / 3) * instanceCount;
    });
    counted(pass.prototype, 'drawIndirect', () => { S.c.draws += 1; });
    counted(pass.prototype, 'drawIndexedIndirect', () => { S.c.draws += 1; });
  };
  install();
  if (!S.hooked) {
    const timer = setInterval(() => { install(); if (S.hooked) clearInterval(timer); }, 10);
    setTimeout(() => clearInterval(timer), 60_000);
  }

  // 2D canvas: the minimap and any other CPU-side raster redraw.
  const ctx2d = globalThis.CanvasRenderingContext2D?.prototype;
  for (const name of ['drawImage', 'putImageData', 'getImageData', 'fillRect', 'clearRect', 'fill', 'stroke', 'fillText', 'createPattern']) {
    timed(ctx2d, name, 'canvas2d', 'canvas2dMs');
  }

  // Forced synchronous style and layout out of the HUD/DOM.
  const win = globalThis;
  if (typeof win.getComputedStyle === 'function') {
    const original = win.getComputedStyle.bind(win);
    win.getComputedStyle = (...args) => {
      const t0 = now();
      const value = original(...args);
      S.c.styleReadMs += now() - t0;
      S.c.styleReads += 1;
      return value;
    };
  }
  timed(globalThis.Element?.prototype, 'getBoundingClientRect', 'layoutReads', 'layoutReadMs');
  timed(globalThis.Range?.prototype, 'getBoundingClientRect', 'layoutReads', 'layoutReadMs');
  for (const prop of ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'clientWidth', 'clientHeight']) {
    const proto = globalThis.HTMLElement?.prototype;
    const target = proto && Object.getOwnPropertyDescriptor(proto, prop) ? proto : globalThis.Element?.prototype;
    const descriptor = target && Object.getOwnPropertyDescriptor(target, prop);
    if (!descriptor?.get) continue;
    const getter = descriptor.get;
    Object.defineProperty(target, prop, {
      ...descriptor,
      get() { const t0 = now(); const value = getter.call(this); S.c.layoutReadMs += now() - t0; S.c.layoutReads += 1; return value; },
    });
  }

  // Audio decode and voice start.
  for (const name of ['AudioContext', 'webkitAudioContext', 'OfflineAudioContext']) {
    timed(globalThis[name]?.prototype, 'decodeAudioData', 'audioDecode', 'audioDecodeMs');
  }
  counted(globalThis.AudioBufferSourceNode?.prototype, 'start', () => { S.c.audioStarts += 1; });
  counted(globalThis.AudioScheduledSourceNode?.prototype, 'start', () => { S.c.audioStarts += 1; });

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (S.running) S.longTasks.push({ atMs: entry.startTime, durationMs: entry.duration });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch { /* unsupported */ }

  // The sampler. Registering our callback first each frame puts it at the head
  // of the rAF queue; the MessageChannel continuation runs after the whole task
  // (every rAF callback plus microtasks), so `jsMs` is the frame's JS task cost.
  const channel = new MessageChannel();
  let pendingFrame = null;
  channel.port1.onmessage = () => {
    if (pendingFrame) { pendingFrame.jsMs = now() - pendingFrame.startMs; pendingFrame = null; }
  };

  S.start = () => {
    S.frames = [];
    S.longTasks = [];
    S.running = true;
    S.t0 = now();
    try { performance.mark('AA_HITCH_T0'); } catch { /* ignore */ }
    S.markNowMs = now();
    let previous = { ...S.c };
    let previousStart = now();
    const tick = (rafNow) => {
      if (!S.running) return;
      requestAnimationFrame(tick);
      const startMs = now();
      const delta = {};
      for (const key of Object.keys(S.c)) {
        const d = S.c[key] - previous[key];
        if (d) delta[key] = d;
      }
      previous = { ...S.c };
      const heap = performance.memory?.usedJSHeapSize ?? null;
      const frame = {
        i: S.frames.length,
        atMs: startMs,
        startMs,
        rafMs: rafNow,
        frameMs: startMs - previousStart,
        jsMs: null,
        heapBytes: heap,
        d: delta,
      };
      previousStart = startMs;
      S.frames.push(frame);
      pendingFrame = frame;
      channel.port2.postMessage(0);
    };
    requestAnimationFrame(tick);
  };
  S.stop = () => { S.running = false; return { frames: S.frames, longTasks: S.longTasks, markNowMs: S.markNowMs, counters: S.c }; };
}

// --------------------------------------------------------------------------
// Cause naming. One frame can carry several causes; each cause carries its own
// measured milliseconds where the instrument measured them, and is otherwise
// reported by count only (and never invented).
// --------------------------------------------------------------------------
const CAUSES = [
  { id: 'pipeline-shader-compile', msKeys: ['pipelineMs', 'shaderMs'], countKeys: ['pipelines', 'shaderModules'] },
  { id: 'gpu-buffer-upload', msKeys: ['writeBufferMs'], countKeys: ['writeBuffer'], byteKeys: ['writeBufferBytes'] },
  { id: 'gpu-texture-upload', msKeys: ['writeTextureMs', 'externalImageMs'], countKeys: ['writeTexture', 'externalImage'], byteKeys: ['writeTextureBytes'] },
  { id: 'gpu-resource-alloc', msKeys: ['gpuBufferMs', 'gpuTextureMs'], countKeys: ['gpuBuffers', 'gpuTextures'], byteKeys: ['gpuBufferBytes'] },
  { id: 'canvas2d-redraw', msKeys: ['canvas2dMs'], countKeys: ['canvas2d'] },
  { id: 'forced-style-read', msKeys: ['styleReadMs'], countKeys: ['styleReads'] },
  { id: 'forced-layout-read', msKeys: ['layoutReadMs'], countKeys: ['layoutReads'] },
  { id: 'audio-decode-start', msKeys: ['audioDecodeMs'], countKeys: ['audioDecode', 'audioStarts'] },
];

const TRACE_CAUSE = new Map([
  ['UpdateLayoutTree', 'style-recalculation'],
  ['ScheduleStyleRecalculation', null],
  ['Layout', 'layout'],
  ['Paint', 'paint'],
  ['PrePaint', 'paint'],
  ['Layerize', 'paint'],
  ['Commit', 'paint'],
  ['MajorGC', 'gc-major'],
  ['MinorGC', 'gc-minor'],
  ['V8.GCFinalizeMC', 'gc-major'],
  ['BlinkGC.AtomicPhase', 'gc-major'],
  ['DecodeImage', 'image-decode'],
  ['ImageDecodeTask', 'image-decode'],
  ['GPUTask', 'gpu-task'],
  ['ParseHTML', 'parse-html'],
  ['EvaluateScript', 'script-evaluate'],
  ['v8.compile', 'script-compile'],
  ['V8.CompileCode', 'script-compile'],
]);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  // Stock flags per tests/e2e/pass93-stock-flags-boot.spec.ts: mute-audio,
  // backgrounding disables, off-screen. --enable-precise-memory-info feeds the
  // heap sampler. --disable-frame-rate-limit + --disable-gpu-vsync are disclosed
  // above: frame COST, not a vsync cap. Never --enable-unsafe-webgpu,
  // --ignore-gpu-blocklist, --use-angle (PASS 92 swizzle-view incident).
  args: ['--mute-audio', '--window-position=-4000,-4000',
    '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-precise-memory-info',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});

const hardKill = setTimeout(() => {
  console.error(`[hitch] HARD KILL at ${HARD_KILL_MS} ms`);
  browser.close().catch(() => {});
  if (server) server.close();
  process.exit(3);
}, HARD_KILL_MS);

const traceEvents = [];
let sampled = null;

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 240)); });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 240)}`));

  await page.addInitScript(installInstrument);

  const url = new URL(base);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });

  await page.evaluate((profile) => {
    const select = document.querySelector('#graphics-profile');
    if (select && [...select.options].some((option) => option.value === profile)) {
      select.value = profile;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#graphics-save')?.click();
    }
  }, PROFILE);
  await page.waitForTimeout(1_000);
  await page.waitForFunction(() => Boolean(globalThis.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });
  report.profileState = await page.evaluate(() => ({
    graphicsPreset: document.documentElement.dataset.graphicsPreset ?? null,
    renderBackend: document.documentElement.dataset.renderBackend ?? null,
    effective: document.querySelector('#graphics-effective')?.textContent ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency,
  }));

  const deployStart = Date.now();
  await page.evaluate(async (arena) => { await globalThis.__ATOMIC_ACRES_DEBUG__.selectArena(arena); }, ARENA);
  await page.evaluate(() => { globalThis.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const s = globalThis.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return Boolean(s && s.matchPhase === 'active' && s.gameStarted === true);
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  report.deployMs = Date.now() - deployStart;
  console.error(`[hitch] ${LABEL}: match active after ${report.deployMs} ms; sampling ${SECONDS}s`);

  if (!NO_TRACE) {
    cdp.on('Tracing.dataCollected', ({ value }) => {
      for (const event of value) {
        if (event.name === 'AA_HITCH_T0') { traceEvents.push(event); continue; }
        if (event.ph !== 'X' && event.ph !== 'complete') continue;
        const cause = TRACE_CAUSE.get(event.name);
        if (!cause) continue;
        if ((event.dur ?? 0) < 400) continue; // sub-0.4 ms events cannot make a 50 ms frame
        traceEvents.push(event);
      }
    });
    await cdp.send('Tracing.start', {
      transferMode: 'ReportEvents',
      traceConfig: {
        recordMode: 'recordAsMuchAsPossible',
        includedCategories: ['devtools.timeline', 'blink.user_timing', 'disabled-by-default-devtools.timeline',
          // GC attribution: MajorGC/MinorGC/V8.GCFinalizeMC mapped in TRACE_CAUSE
          // never appeared because no v8/blink GC stream was recorded.
          'v8', 'disabled-by-default-v8.gc', 'disabled-by-default-blink.gc'],
      },
    }).catch((error) => { console.error(`[hitch] tracing unavailable: ${error}`); });
  }

  // Scripted match: the player moves and looks around while the bots fight, so
  // the sample contains bot spawn, animation, ragdoll, weapon fire and HUD
  // churn rather than a static pose.
  await page.evaluate((arena) => {
    const api = globalThis.__ATOMIC_ACRES_DEBUG__;
    const route = arena === 'nuketown2'
      ? [[-9, 1.7, -12.5, 0], [-2, 1.7, 0, -Math.PI / 2], [6, 1.7, 4, Math.PI], [0, 1.7, 10, Math.PI / 2], [-8, 1.7, 2, 0]]
      : [[-4, 1.7, -20, -Math.PI / 2], [-30, 1.7, 0, -Math.PI / 2]];
    let index = 0;
    let yaw = 0;
    api.setMovement?.(true, false);
    globalThis.__AA_HITCH_ROUTE__ = setInterval(() => {
      try {
        const [x, y, z, baseYaw] = route[index % route.length];
        index += 1;
        api.teleportPlayer(x, y, z, baseYaw, 0);
      } catch { /* gone */ }
    }, 6_000);
    globalThis.__AA_HITCH_LOOK__ = setInterval(() => {
      try {
        yaw += 0.35;
        const snapshot = api.samplePlayerPose?.() ?? null;
        const position = snapshot?.position ?? null;
        if (position) api.teleportPlayer(position[0], position[1], position[2], yaw, Math.sin(yaw) * 0.15);
      } catch { /* gone */ }
    }, 700);
  }, ARENA);

  await page.evaluate(() => globalThis.__AA_HITCH__.start());
  await page.waitForTimeout(SECONDS * 1000);
  sampled = await page.evaluate(() => globalThis.__AA_HITCH__.stop());
  await page.evaluate(() => {
    clearInterval(globalThis.__AA_HITCH_ROUTE__);
    clearInterval(globalThis.__AA_HITCH_LOOK__);
    globalThis.__ATOMIC_ACRES_DEBUG__.setMovement?.(false, false);
  });

  if (!NO_TRACE) {
    const done = new Promise((resolve_) => cdp.once('Tracing.tracingComplete', resolve_));
    await cdp.send('Tracing.end').catch(() => {});
    await Promise.race([done, new Promise((r) => setTimeout(r, 20_000))]);
  }

  report.consoleErrors = consoleErrors.slice(0, 20);
  report.matchState = await page.evaluate(() => {
    const s = globalThis.__ATOMIC_ACRES_DEBUG__?.snapshot?.() ?? null;
    return { matchPhase: s?.matchPhase ?? null, bots: Array.isArray(s?.bots) ? s.bots.length : null, alive: s?.player?.alive ?? null };
  });
  await page.screenshot({ path: join(OUT_DIR, `${LABEL}-final.png`) }).catch(() => {});
} finally {
  clearTimeout(hardKill);
  await browser.close().catch(() => {});
  if (server) server.close();
}

if (!sampled) throw new Error('sampler produced no data');

// --------------------------------------------------------------------------
// Align the trace clock to performance.now() using the sampler's mark.
// --------------------------------------------------------------------------
let traceOffsetUs = null;
const markEvent = traceEvents.find((event) => event.name === 'AA_HITCH_T0');
if (markEvent && typeof sampled.markNowMs === 'number') traceOffsetUs = markEvent.ts - sampled.markNowMs * 1000;
report.traceAligned = traceOffsetUs !== null;
report.traceEventsKept = traceEvents.length;

const frames = sampled.frames.filter((frame) => frame.i > 0 && Number.isFinite(frame.frameMs));
const sortedFrameMs = frames.map((frame) => frame.frameMs).sort((a, b) => a - b);
const hitches = frames.filter((frame) => frame.frameMs >= HITCH_MS);

// Charge trace events to the frame whose [start, end) window contains them.
const frameForTraceEvent = (event) => {
  if (traceOffsetUs === null) return null;
  const startMs = (event.ts - traceOffsetUs) / 1000;
  let low = 0;
  let high = frames.length - 1;
  let found = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const frame = frames[mid];
    const frameStart = frame.atMs - frame.frameMs;
    if (startMs < frameStart) high = mid - 1;
    else if (startMs >= frame.atMs) low = mid + 1;
    else { found = frame; break; }
  }
  return found;
};

for (const frame of frames) frame.trace = {};
if (traceOffsetUs !== null) {
  for (const event of traceEvents) {
    const cause = TRACE_CAUSE.get(event.name);
    if (!cause) continue;
    const frame = frameForTraceEvent(event);
    if (!frame) continue;
    const ms = (event.dur ?? 0) / 1000;
    frame.trace[cause] = round((frame.trace[cause] ?? 0) + ms, 3);
  }
}

// Heap: a fall across a frame is a collection, a rise is the allocation rate.
for (let index = 1; index < frames.length; index += 1) {
  const previous = frames[index - 1];
  const frame = frames[index];
  if (previous.heapBytes !== null && frame.heapBytes !== null) {
    frame.heapDeltaMb = round((frame.heapBytes - previous.heapBytes) / 1048576, 3);
  }
}

const buckets = new Map();
const charge = (id, ms, frame) => {
  const bucket = buckets.get(id) ?? { cause: id, count: 0, totalMs: 0, worstMs: 0, worstFrame: null, measured: ms !== null };
  bucket.count += 1;
  if (ms !== null) {
    bucket.totalMs += ms;
    if (ms > bucket.worstMs) { bucket.worstMs = ms; bucket.worstFrame = frame.i; }
  }
  if (ms === null) bucket.measured = false;
  buckets.set(id, bucket);
};

for (const frame of hitches) {
  const causes = [];
  for (const cause of CAUSES) {
    const ms = cause.msKeys.reduce((sum, key) => sum + (frame.d[key] ?? 0), 0);
    const count = cause.countKeys.reduce((sum, key) => sum + (frame.d[key] ?? 0), 0);
    if (count === 0 && ms === 0) continue;
    // Only charge a cause when it is a real share of the frame, so a single
    // stray writeBuffer does not get the blame for a 200 ms compile.
    if (ms < 1 && cause.id !== 'pipeline-shader-compile') continue;
    charge(cause.id, ms, frame);
    causes.push({ id: cause.id, ms: round(ms, 2), count });
  }
  for (const [cause, ms] of Object.entries(frame.trace)) {
    if (ms < 1) continue;
    charge(cause, ms, frame);
    causes.push({ id: cause, ms: round(ms, 2), count: 1 });
  }
  const accounted = causes.reduce((sum, entry) => sum + entry.ms, 0);
  const jsMs = frame.jsMs ?? null;
  if (jsMs !== null && jsMs - accounted > HITCH_MS * 0.5) {
    charge('unattributed-js', jsMs - accounted, frame);
    causes.push({ id: 'unattributed-js', ms: round(jsMs - accounted, 2), count: 1 });
  }
  if (causes.length === 0) {
    charge('unattributed-present', jsMs !== null ? Math.max(0, frame.frameMs - jsMs) : frame.frameMs, frame);
    causes.push({ id: 'unattributed-present', ms: round(frame.frameMs - (jsMs ?? 0), 2), count: 1 });
  } else {
    // Residual bucket: previously a frame with one small charged cause left the
    // rest of its milliseconds out of the table (candidate-7 table summed to
    // 430.8 of 718.6 hitch ms). Charge the remainder so coverage is explicit.
    // Trace-side ms can overlap the JS task, so clamp at zero, never negative.
    const accountedAfter = causes.reduce((sum, entry) => sum + entry.ms, 0);
    const residual = frame.frameMs - accountedAfter;
    if (residual > HITCH_MS * 0.5) {
      charge('unattributed-residual', residual, frame);
      causes.push({ id: 'unattributed-residual', ms: round(residual, 2), count: 1 });
    }
  }
  frame.causes = causes;
}

const table = [...buckets.values()].sort((a, b) => b.totalMs - a.totalMs).map((bucket) => ({
  cause: bucket.cause,
  count: bucket.count,
  totalMs: round(bucket.totalMs, 1),
  worstMs: round(bucket.worstMs, 1),
  worstFrame: bucket.worstFrame,
}));

report.frameCount = frames.length;
report.sampledSeconds = round((frames[frames.length - 1].atMs - frames[0].atMs) / 1000, 1);
report.fps = round(frames.length / Math.max(0.001, (frames[frames.length - 1].atMs - frames[0].atMs) / 1000), 1);
report.frameMs = {
  p50: round(percentile(sortedFrameMs, 0.5)),
  p95: round(percentile(sortedFrameMs, 0.95)),
  p99: round(percentile(sortedFrameMs, 0.99)),
  p999: round(percentile(sortedFrameMs, 0.999)),
  max: round(sortedFrameMs[sortedFrameMs.length - 1]),
};
report.hitches = {
  thresholdMs: HITCH_MS,
  count: hitches.length,
  totalMs: round(hitches.reduce((sum, frame) => sum + frame.frameMs, 0), 1),
  worstMs: round(hitches.reduce((max, frame) => Math.max(max, frame.frameMs), 0)),
  over100: frames.filter((frame) => frame.frameMs >= 100).length,
  over33: frames.filter((frame) => frame.frameMs >= 33.4).length,
};
report.causeTable = table;
report.hitchFrames = hitches.map((frame) => ({
  i: frame.i,
  atMs: round(frame.atMs),
  frameMs: round(frame.frameMs),
  jsMs: frame.jsMs === null ? null : round(frame.jsMs),
  heapDeltaMb: frame.heapDeltaMb ?? null,
  causes: frame.causes ?? [],
  counters: Object.fromEntries(Object.entries(frame.d).map(([key, value]) => [key, round(value, 2)])),
}));
report.totals = sampled.counters;
report.longTasks = {
  count: sampled.longTasks.length,
  totalMs: round(sampled.longTasks.reduce((sum, task) => sum + task.durationMs, 0), 1),
  worstMs: round(sampled.longTasks.reduce((max, task) => Math.max(max, task.durationMs), 0), 1),
};

const attributedMs = table.reduce((sum, row) => sum + row.totalMs, 0);
report.attributionCoverage = { attributedMs: round(attributedMs, 1),
  hitchTotalMs: report.hitches.totalMs,
  pct: report.hitches.totalMs > 0 ? round((attributedMs / report.hitches.totalMs) * 100, 1) : 100 };
const jsonPath = join(OUT_DIR, `${LABEL}.json`);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const lines = [];
lines.push(`# Frame-hitch attribution - ${LABEL} (${ARENA})`);
lines.push('');
lines.push(`Measured ${report.measuredAt}. ${report.frameCount} frames over ${report.sampledSeconds}s at ${WIDTH}x${HEIGHT}, `
  + `profile ${report.profileState?.graphicsPreset ?? '?'} / ${report.profileState?.renderBackend ?? '?'}, deploy ${report.deployMs} ms, `
  + `bots ${report.matchState?.bots ?? '?'}.`);
lines.push('');
lines.push('| metric | value |');
lines.push('|---|---:|');
lines.push(`| mean fps | ${report.fps} |`);
lines.push(`| p50 frame ms | ${report.frameMs.p50} |`);
lines.push(`| p95 frame ms | ${report.frameMs.p95} |`);
lines.push(`| p99 frame ms | ${report.frameMs.p99} |`);
lines.push(`| p99.9 frame ms | ${report.frameMs.p999} |`);
lines.push(`| max frame ms | ${report.frameMs.max} |`);
lines.push(`| hitches >= ${HITCH_MS} ms | ${report.hitches.count} |`);
lines.push(`| frames >= 100 ms | ${report.hitches.over100} |`);
lines.push(`| frames >= 33.4 ms | ${report.hitches.over33} |`);
lines.push(`| hitch time total ms | ${report.hitches.totalMs} |`);
lines.push(`| attributed ms (% of hitch total) | ${report.attributionCoverage.attributedMs} (${report.attributionCoverage.pct}%) |`);
lines.push('');
lines.push(`## Attribution of the ${hitches.length} frames at or over ${HITCH_MS} ms`);
lines.push('');
lines.push('| cause | count | total ms | worst ms |');
lines.push('|---|---:|---:|---:|');
for (const row of table) lines.push(`| ${row.cause} | ${row.count} | ${row.totalMs} | ${row.worstMs} |`);
if (table.length === 0) lines.push('| (no frame reached the threshold) | 0 | 0 | 0 |');
lines.push('');
if (!report.traceAligned) lines.push('NOTE: the CDP trace could not be aligned, so renderer-side causes (style recalculation, layout, paint, GC) are absent from this table.');
writeFileSync(join(OUT_DIR, `${LABEL}.md`), `${lines.join('\n')}\n`);

console.error(lines.join('\n'));
console.error(`\nWrote ${jsonPath}`);
