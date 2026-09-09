#!/usr/bin/env node
// ===========================================================================
// HF-399 PHASE FPS PROBE. Where does the Quality-mode frame go on atomic-acres?
//
// Owner, 2026-09-02: "I used to get 150FPS on quality mode now im getting 40
// on atomic acres". This probe measures RENDER COST, not a vsync cap: headless
// installed Chrome (channel:'chrome', real WebGPU device on this machine)
// launched with --disable-frame-rate-limit --disable-gpu-vsync, so rAF runs
// as fast as the frame can be produced and the frame-time percentiles are the
// cost of the frame.
//
// Per phase it records, from a rAF sampler and WebGPU prototype hooks:
//   - frame-time p50/p95/p99/max ms and mean fps
//   - draw calls / frame and triangles / frame (GPURenderPassEncoder.draw*
//     wrapped before page script runs: independent of renderer.info, which is
//     not reachable from the debug surface and reads 0 draw calls headless)
//   - render passes, compute dispatches and queue submits / frame
//   - render pipelines + shader modules created during the phase
//   - viewmodel active clip-plane count (debug surface)
//   - long tasks (PerformanceObserver) and JS heap delta
// and saves a screenshot per phase.
//
// Quality is selected the way a player selects it: the #graphics-profile
// select set to QUALITY ('high') and #graphics-save clicked; the probe records
// the effective badge text and documentElement.dataset.graphicsPreset so the
// report can prove what profile actually rendered.
//
// USAGE
//   node scripts/qa/hf399-fps-phase-probe-cdp.mjs --dist dist --label local \
//     [--arena atomic-acres] [--seconds 8] [--port 41941] [--width 2560 --height 1440]
//   node scripts/qa/hf399-fps-phase-probe-cdp.mjs --url https://.../channels/pass83/ --label pass83
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

const DIST = arg('--dist', null) ? resolve(arg('--dist')) : null;
const URL_BASE = arg('--url', null);
const ARENA = arg('--arena', 'atomic-acres');
const SECONDS = Number(arg('--seconds', '8'));
const WARMUP_SECONDS = Number(arg('--warmup', '8'));
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '41941'));
const WIDTH = Number(arg('--width', '2560'));
const HEIGHT = Number(arg('--height', '1440'));
const OUT_DIR = resolve(arg('--out-dir', 'artifacts/qa/hf399'));
const PROFILE = arg('--profile', 'high');
const BOOT_TIMEOUT_MS = 300_000;
const EXTRA_QUERY = arg('--query', '');
// Attribution experiments: JSON of advanced-graphics keys applied as a CUSTOM
// preset through the same localStorage the Options panel writes, e.g.
// --graphics-override '{"screenSpaceReflections":"off"}'. Missing keys fall
// back to this machine's default preset (Quality on 8-core/8 GB).
const GRAPHICS_OVERRIDE = arg('--graphics-override', null);

if (!DIST && !URL_BASE) throw new Error('Pass --dist <build dir> or --url <base url>');
mkdirSync(OUT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

let server = null;
let base = URL_BASE;
if (DIST) {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}`);
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

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-precise-memory-info',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});

const report = {
  contract: 'hf399-fps-phase-probe-v1',
  measuredAt: new Date().toISOString(),
  label: LABEL,
  arena: ARENA,
  base,
  requestedProfile: PROFILE,
  viewport: { width: WIDTH, height: HEIGHT },
  secondsPerPhase: SECONDS,
  phases: [],
};

const percentile = (sorted, p) => (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  page.on('console', (message) => { if (message.type() === 'error') console.error(`[page] ${message.text().slice(0, 200)}`); });

  if (GRAPHICS_OVERRIDE) {
    const override = JSON.parse(GRAPHICS_OVERRIDE);
    report.graphicsOverride = override;
    await page.addInitScript((values) => {
      try {
        localStorage.setItem('atomic-acres-pass65-settings-v1', JSON.stringify({ version: 1, graphics: { schemaVersion: 1, preset: 'custom', ...values } }));
      } catch { /* storage unavailable */ }
    }, override);
  }
  await page.addInitScript(() => {
    const state = {
      hooked: false, draws: 0, triangles: 0, instances: 0, passes: 0, computePasses: 0, dispatches: 0, submits: 0,
      pipelines: 0, computePipelines: 0, shaderModules: 0, frames: [], longTasks: [], running: false,
    };
    window.__HF399__ = state;
    const install = () => {
      if (state.hooked) return;
      const device = window.GPUDevice;
      const pass = window.GPURenderPassEncoder;
      const encoder = window.GPUCommandEncoder;
      const queue = window.GPUQueue;
      const compute = window.GPUComputePassEncoder;
      if (!device?.prototype || !pass?.prototype || !encoder?.prototype || !queue?.prototype) return;
      state.hooked = true;
      const wrapCount = (proto, name, sink) => {
        const original = proto[name];
        if (typeof original !== 'function') return;
        proto[name] = function patched(...args) { sink(args); return original.apply(this, args); };
      };
      wrapCount(device.prototype, 'createRenderPipeline', () => { state.pipelines += 1; });
      wrapCount(device.prototype, 'createRenderPipelineAsync', () => { state.pipelines += 1; });
      wrapCount(device.prototype, 'createComputePipeline', () => { state.computePipelines += 1; });
      wrapCount(device.prototype, 'createComputePipelineAsync', () => { state.computePipelines += 1; });
      wrapCount(device.prototype, 'createShaderModule', () => { state.shaderModules += 1; });
      wrapCount(encoder.prototype, 'beginRenderPass', () => { state.passes += 1; });
      wrapCount(encoder.prototype, 'beginComputePass', () => { state.computePasses += 1; });
      wrapCount(queue.prototype, 'submit', () => { state.submits += 1; });
      wrapCount(pass.prototype, 'draw', ([vertexCount, instanceCount = 1]) => {
        state.draws += 1; state.instances += instanceCount; state.triangles += (vertexCount / 3) * instanceCount;
      });
      wrapCount(pass.prototype, 'drawIndexed', ([indexCount, instanceCount = 1]) => {
        state.draws += 1; state.instances += instanceCount; state.triangles += (indexCount / 3) * instanceCount;
      });
      wrapCount(pass.prototype, 'drawIndirect', () => { state.draws += 1; });
      wrapCount(pass.prototype, 'drawIndexedIndirect', () => { state.draws += 1; });
      if (compute?.prototype) wrapCount(compute.prototype, 'dispatchWorkgroups', () => { state.dispatches += 1; });
    };
    install();
    if (!state.hooked) {
      const timer = setInterval(() => { install(); if (state.hooked) clearInterval(timer); }, 10);
      setTimeout(() => clearInterval(timer), 30_000);
    }
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) state.longTasks.push({ atMs: Math.round(entry.startTime), durationMs: Math.round(entry.duration) });
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch { /* unsupported */ }
  });

  const url = new URL(base);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  if (EXTRA_QUERY) for (const [key, value] of new URLSearchParams(EXTRA_QUERY)) url.searchParams.set(key, value);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });

  // Select the profile the way a player does: the select, then the save button.
  const profileSelection = await page.evaluate((profile) => {
    const select = document.querySelector('#graphics-profile');
    const before = select?.value ?? null;
    if (profile !== 'custom' && select && [...select.options].some((option) => option.value === profile)) {
      select.value = profile;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#graphics-save')?.click();
    }
    return { before, after: select?.value ?? null, options: select ? [...select.options].map((option) => `${option.value}=${option.textContent}`) : null };
  }, GRAPHICS_OVERRIDE ? 'custom' : PROFILE);
  await page.waitForTimeout(1_000);
  // A save can stage a renderer reload; if the page navigated, wait for it again.
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });
  report.profileSelection = profileSelection;
  report.profileState = await page.evaluate(() => ({
    graphicsPreset: document.documentElement.dataset.graphicsPreset ?? null,
    renderBackend: document.documentElement.dataset.renderBackend ?? null,
    effective: document.querySelector('#graphics-effective')?.textContent ?? null,
    advanced: (() => { try { return JSON.parse(localStorage.getItem('atomic-acres-pass65-settings-v1') ?? 'null')?.graphics ?? null; } catch { return null; } })(),
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory ?? null,
  }));
  console.error(`[hf399] profile ${JSON.stringify(report.profileState)}`);

  await page.evaluate((arena) => {
    document.querySelector(`.map-card[data-arena-id="${arena}"]`)?.click();
    const name = document.querySelector('#player-name');
    if (name) name.value = 'HF399';
  }, ARENA);
  await page.waitForTimeout(1_500);

  const startSampler = () => page.evaluate(() => {
    const state = window.__HF399__;
    state.frames = [];
    state.longTasks = [];
    state.running = true;
    state.mark = {
      atMs: performance.now(), draws: state.draws, triangles: state.triangles, instances: state.instances, passes: state.passes,
      computePasses: state.computePasses, dispatches: state.dispatches, submits: state.submits, pipelines: state.pipelines,
      computePipelines: state.computePipelines, shaderModules: state.shaderModules,
      heap: performance.memory?.usedJSHeapSize ?? null,
    };
    let last = performance.now();
    const tick = (now) => {
      if (!state.running) return;
      state.frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const stopSampler = () => page.evaluate(() => {
    const state = window.__HF399__;
    state.running = false;
    const mark = state.mark;
    const elapsedMs = performance.now() - mark.atMs;
    const frames = state.frames.slice(1);
    const sorted = [...frames].sort((a, b) => a - b);
    const heapNow = performance.memory?.usedJSHeapSize ?? null;
    const n = Math.max(1, frames.length);
    let clipPlanes = null;
    try { clipPlanes = window.__ATOMIC_ACRES_DEBUG__.sampleViewmodelPenetration().activeClipPlanes ?? null; } catch { /* menu */ }
    let pose = null;
    try { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); pose = { position: s.player?.position ?? null, yaw: s.player?.yaw ?? null, alive: s.player?.alive ?? null, phase: s.matchPhase ?? null }; } catch { /* menu */ }
    return {
      elapsedMs: Math.round(elapsedMs),
      frames: frames.length,
      sorted,
      perFrame: {
        draws: (state.draws - mark.draws) / n,
        triangles: (state.triangles - mark.triangles) / n,
        instances: (state.instances - mark.instances) / n,
        renderPasses: (state.passes - mark.passes) / n,
        computePasses: (state.computePasses - mark.computePasses) / n,
        dispatches: (state.dispatches - mark.dispatches) / n,
        submits: (state.submits - mark.submits) / n,
      },
      created: {
        renderPipelines: state.pipelines - mark.pipelines,
        computePipelines: state.computePipelines - mark.computePipelines,
        shaderModules: state.shaderModules - mark.shaderModules,
        renderPipelinesTotal: state.pipelines,
        shaderModulesTotal: state.shaderModules,
      },
      longTasks: { count: state.longTasks.length, totalMs: state.longTasks.reduce((sum, task) => sum + task.durationMs, 0), maxMs: state.longTasks.reduce((max, task) => Math.max(max, task.durationMs), 0) },
      heap: { startBytes: mark.heap, endBytes: heapNow, deltaMbPerMinute: mark.heap !== null && heapNow !== null ? Number((((heapNow - mark.heap) / 1048576) / (elapsedMs / 60_000)).toFixed(2)) : null },
      activeClipPlanes: clipPlanes,
      pose,
      hooked: state.hooked,
    };
  });

  const runPhase = async (name, setup) => {
    if (setup) await setup();
    await startSampler();
    await page.waitForTimeout(SECONDS * 1000);
    const raw = await stopSampler();
    const sorted = raw.sorted;
    const row = {
      phase: name,
      frames: raw.frames,
      elapsedMs: raw.elapsedMs,
      fps: Number((raw.frames / (raw.elapsedMs / 1000)).toFixed(1)),
      frameMs: {
        p50: Number((percentile(sorted, 0.5) ?? 0).toFixed(2)),
        p95: Number((percentile(sorted, 0.95) ?? 0).toFixed(2)),
        p99: Number((percentile(sorted, 0.99) ?? 0).toFixed(2)),
        max: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
        mean: Number((sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length)).toFixed(2)),
      },
      perFrame: Object.fromEntries(Object.entries(raw.perFrame).map(([key, value]) => [key, Number(value.toFixed(1))])),
      created: raw.created,
      longTasks: raw.longTasks,
      heap: raw.heap,
      activeClipPlanes: raw.activeClipPlanes,
      pose: raw.pose,
      hooked: raw.hooked,
    };
    const shot = join(OUT_DIR, `${LABEL}-${ARENA}-${name}.png`);
    await page.screenshot({ path: shot });
    row.screenshot = shot;
    report.phases.push(row);
    console.error(`[hf399] ${LABEL} ${ARENA} ${name.padEnd(14)} fps ${String(row.fps).padStart(6)}  p50 ${row.frameMs.p50} p95 ${row.frameMs.p95} p99 ${row.frameMs.p99}  draws ${row.perFrame.draws} tris ${Math.round(row.perFrame.triangles)} pipes+${row.created.renderPipelines} clip ${row.activeClipPlanes}`);
  };

  await runPhase('menu');

  await page.evaluate(() => document.querySelector('#solo').click());
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return Boolean(s && s.matchPhase === 'active' && s.gameStarted === true);
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  console.error('[hf399] match active; warming up');
  await page.evaluate(() => { try { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true); } catch { /* absent on old builds */ } });
  await page.waitForTimeout(WARMUP_SECONDS * 1000);

  await runPhase('deployed-idle');

  const teleport = (x, y, z, yaw, pitch = 0) => page.evaluate(([px, py, pz, pyaw, ppitch]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    if (typeof api.teleportPlayer === 'function') { api.teleportPlayer(px, py, pz, pyaw, ppitch); return true; }
    return false;
  }, [x, y, z, yaw, pitch]);

  if (ARENA === 'atomic-acres') {
    // North lawn band: z in [-30, -8.8]; aqua house footprint x[-29,-9] z[-25.6,-9.2].
    // Walk +x (yaw -pi/2) from x=-4 through open lawn; re-teleport every 3 s so
    // the walk stays on grass instead of ending in the boundary fence.
    await runPhase('lawn-move', async () => {
      await teleport(-4, 1.7, -20, -Math.PI / 2, 0.05);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement?.(true, false));
      await page.evaluate(() => {
        window.__HF399_HOP__ = setInterval(() => { try { window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-4, 1.7, -20, -Math.PI / 2, 0.05); } catch { /* gone */ } }, 3000);
      });
      await page.waitForTimeout(500);
    });
    await page.evaluate(() => { clearInterval(window.__HF399_HOP__); window.__ATOMIC_ACRES_DEBUG__.setMovement?.(false, false); });
    // Aqua house front wall at z = -9.2; stand on the pavement facing it (yaw 0 = -z).
    await runPhase('near-wall', async () => { await teleport(-19, 1.7, -7.6, 0, 0); await page.waitForTimeout(800); });
    // West end of the street looking east down the whole road (yaw -pi/2 = +x).
    await runPhase('open-ground', async () => { await teleport(-30, 1.7, 0, -Math.PI / 2, 0); await page.waitForTimeout(800); });
    // Lawn view from a standstill: same spot as the walk, no movement.
    await runPhase('lawn-idle', async () => { await teleport(-4, 1.7, -20, -Math.PI / 2, 0.05); await page.waitForTimeout(800); });
  } else {
    await runPhase('move', async () => {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement?.(true, false));
      await page.waitForTimeout(500);
    });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement?.(false, false));
  }
} finally {
  await browser.close();
  if (server) server.close();
}

const out = join(OUT_DIR, `${LABEL}-${ARENA}.json`);
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.error(`Wrote ${out}`);
