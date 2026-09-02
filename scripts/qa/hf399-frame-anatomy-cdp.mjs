#!/usr/bin/env node
// ===========================================================================
// HF-399 FRAME ANATOMY. What are the ~23 render passes in one Quality frame,
// how big are their targets, how many draws land in each, and is the main
// thread or the GPU the bottleneck?
//
// Companion to hf399-fps-phase-probe-cdp.mjs, which gives the per-phase
// percentiles. This one captures ONE frame's render-pass sequence (labels,
// attachment sizes/formats/sample counts, draws, instances, triangles per
// pass) at a fixed pose, then a CDP CPU profile over a window at the same
// pose so JS self-time per frame can be set beside the frame time. If JS
// time per frame is far below the frame time, the frame is GPU-bound and the
// fix is in what the passes draw, not in JavaScript.
//
// USAGE
//   node scripts/qa/hf399-frame-anatomy-cdp.mjs --dist dist --label local
//     [--arena atomic-acres] [--port 41941] [--width 2560 --height 1440]
//     [--pose lawn-idle|open-ground] [--profile-seconds 6]
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
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '41941'));
const WIDTH = Number(arg('--width', '2560'));
const HEIGHT = Number(arg('--height', '1440'));
const OUT_DIR = resolve(arg('--out-dir', 'artifacts/qa/hf399'));
const POSE = arg('--pose', 'lawn-idle');
const PROFILE_SECONDS = Number(arg('--profile-seconds', '6'));
const WARMUP_SECONDS = Number(arg('--warmup', '8'));
const BOOT_TIMEOUT_MS = 300_000;
const EXTRA_QUERY = arg('--query', '');

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

const report = { contract: 'hf399-frame-anatomy-v1', measuredAt: new Date().toISOString(), label: LABEL, arena: ARENA, base, pose: POSE, viewport: { width: WIDTH, height: HEIGHT } };

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  await page.addInitScript(() => {
    const state = { hooked: false, capturing: false, frame: [], current: null, textures: new WeakMap(), views: new WeakMap(), running: false, frames: [] };
    window.__HF399A__ = state;
    const describeView = (view) => {
      if (!view) return null;
      const texture = state.views.get(view);
      if (!texture) return { unknown: true };
      const info = state.textures.get(texture);
      return info ?? { canvas: true };
    };
    const install = () => {
      if (state.hooked) return;
      const device = window.GPUDevice;
      const pass = window.GPURenderPassEncoder;
      const encoder = window.GPUCommandEncoder;
      const texture = window.GPUTexture;
      const canvasContext = window.GPUCanvasContext;
      if (!device?.prototype || !pass?.prototype || !encoder?.prototype || !texture?.prototype) return;
      state.hooked = true;
      const wrap = (proto, name, before, after) => {
        const original = proto[name];
        if (typeof original !== 'function') return;
        proto[name] = function patched(...args) {
          if (before) before(this, args);
          const result = original.apply(this, args);
          if (after) after(this, args, result);
          return result;
        };
      };
      wrap(device.prototype, 'createTexture', null, (_device, [descriptor], created) => {
        const size = Array.isArray(descriptor.size) ? descriptor.size : [descriptor.size?.width, descriptor.size?.height, descriptor.size?.depthOrArrayLayers];
        state.textures.set(created, { label: descriptor.label ?? null, size, format: descriptor.format, samples: descriptor.sampleCount ?? 1, mips: descriptor.mipLevelCount ?? 1 });
      });
      wrap(texture.prototype, 'createView', null, (owner, _args, view) => { state.views.set(view, owner); });
      if (canvasContext?.prototype) {
        wrap(canvasContext.prototype, 'getCurrentTexture', null, (_context, _args, created) => {
          if (!state.textures.has(created)) state.textures.set(created, { canvas: true, label: 'canvas', size: [created.width, created.height, 1], format: created.format, samples: 1, mips: 1 });
        });
      }
      wrap(encoder.prototype, 'beginRenderPass', null, (_encoder, [descriptor], created) => {
        if (!state.capturing) return;
        const entry = {
          label: descriptor.label ?? null,
          color: (descriptor.colorAttachments ?? []).map((attachment) => ({ ...describeView(attachment?.view), loadOp: attachment?.loadOp, resolve: Boolean(attachment?.resolveTarget) })),
          depth: descriptor.depthStencilAttachment ? { ...describeView(descriptor.depthStencilAttachment.view), depthLoadOp: descriptor.depthStencilAttachment.depthLoadOp } : null,
          draws: 0, instances: 0, triangles: 0, pipelines: new Set(),
        };
        state.frame.push(entry);
        state.passByEncoder = state.passByEncoder ?? new WeakMap();
        state.passByEncoder.set(created, entry);
      });
      const onDraw = (passEncoder, count, instanceCount) => {
        if (!state.capturing) return;
        const entry = state.passByEncoder?.get(passEncoder);
        if (!entry) return;
        entry.draws += 1; entry.instances += instanceCount; entry.triangles += (count / 3) * instanceCount;
      };
      wrap(pass.prototype, 'setPipeline', (passEncoder, [pipeline]) => {
        if (!state.capturing) return;
        const entry = state.passByEncoder?.get(passEncoder);
        if (entry) entry.pipelines.add(pipeline);
      });
      wrap(pass.prototype, 'draw', (passEncoder, [vertexCount, instanceCount = 1]) => onDraw(passEncoder, vertexCount, instanceCount));
      wrap(pass.prototype, 'drawIndexed', (passEncoder, [indexCount, instanceCount = 1]) => onDraw(passEncoder, indexCount, instanceCount));
      wrap(encoder.prototype, 'beginComputePass', null, (_encoder, [descriptor]) => {
        if (state.capturing) state.frame.push({ compute: true, label: descriptor?.label ?? null });
      });
    };
    install();
    if (!state.hooked) {
      const timer = setInterval(() => { install(); if (state.hooked) clearInterval(timer); }, 10);
      setTimeout(() => clearInterval(timer), 30_000);
    }
  });

  const url = new URL(base);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  if (EXTRA_QUERY) for (const [key, value] of new URLSearchParams(EXTRA_QUERY)) url.searchParams.set(key, value);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });
  report.profileState = await page.evaluate(() => ({
    graphicsPreset: document.documentElement.dataset.graphicsPreset ?? null,
    renderBackend: document.documentElement.dataset.renderBackend ?? null,
    effective: document.querySelector('#graphics-effective')?.textContent ?? null,
  }));
  await page.evaluate((arena) => {
    document.querySelector(`.map-card[data-arena-id="${arena}"]`)?.click();
    const name = document.querySelector('#player-name');
    if (name) name.value = 'HF399A';
  }, ARENA);
  await page.waitForTimeout(1_000);
  await page.evaluate(() => document.querySelector('#solo').click());
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return Boolean(s && s.matchPhase === 'active' && s.gameStarted === true);
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.evaluate(() => { try { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true); } catch { /* absent */ } });
  await page.waitForTimeout(WARMUP_SECONDS * 1000);

  const poses = {
    'lawn-idle': [-4, 1.7, -20, -Math.PI / 2, 0.05],
    'open-ground': [-30, 1.7, 0, -Math.PI / 2, 0],
    'near-wall': [-19, 1.7, -7.6, 0, 0],
  };
  if (ARENA === 'atomic-acres' && poses[POSE]) {
    await page.evaluate((pose) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(...pose), poses[POSE]);
    await page.waitForTimeout(1_000);
  }

  // ONE frame: capture between two consecutive sampler rAF callbacks.
  report.frame = await page.evaluate(() => new Promise((done) => {
    const state = window.__HF399A__;
    requestAnimationFrame(() => {
      state.frame = [];
      state.capturing = true;
      requestAnimationFrame(() => {
        // Make sure the app's own rAF for this interval has run: wait one more.
        requestAnimationFrame(() => {
          state.capturing = false;
          done(state.frame.map((entry) => (entry.compute ? entry : {
            label: entry.label,
            color: entry.color,
            depth: entry.depth,
            draws: entry.draws,
            instances: entry.instances,
            triangles: Math.round(entry.triangles),
            pipelines: entry.pipelines.size,
          })));
        });
      });
    });
  }));
  // The capture spans two sampler intervals, so it may hold two app frames;
  // report the count so the reader divides correctly.
  report.frameCaptureIntervals = 2;

  // CALL CENSUS. Who walks the graph per frame, and how big is the graph?
  // Wraps Object3D.prototype for two seconds (counts + sampled caller stacks),
  // then restores it. Frozen = nodes carrying the static-matrix-freeze
  // own-property override (their subtree is skipped by the walk).
  report.census = await page.evaluate(() => new Promise((done) => {
    // Older channels (pass72) expose no scene handle; the CPU profile below
    // still runs, so the comparison is JS ms/frame rather than the walk census.
    if (typeof window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph !== 'function') { done(null); return; }
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    let proto = Object.getPrototypeOf(scene);
    while (proto && !Object.prototype.hasOwnProperty.call(proto, 'updateWorldMatrix')) proto = Object.getPrototypeOf(proto);
    let nodes = 0; let auto = 0; let visible = 0; let meshes = 0; let frozen = 0; let instanced = 0;
    const byTop = new Map();
    scene.traverse((node) => {
      nodes += 1;
      if (node.matrixAutoUpdate) auto += 1;
      if (node.visible) visible += 1;
      if (node.isMesh) meshes += 1;
      if (node.isInstancedMesh) instanced += 1;
      if (Object.prototype.hasOwnProperty.call(node, 'updateMatrixWorld')) frozen += 1;
    });
    for (const child of scene.children) {
      let count = 0; let autoCount = 0;
      child.traverse((node) => { count += 1; if (node.matrixAutoUpdate) autoCount += 1; });
      byTop.set(`${child.name || child.type}${child.visible ? '' : ' (hidden)'}`, { nodes: count, auto: autoCount });
    }
    const counters = {}; const callers = {};
    // Recursive walks are deeper than V8's default 10-frame trace, which is
    // what hid every application caller behind three's own frames.
    const previousStackLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 80;
    const wrap = (name) => {
      const original = proto[name];
      counters[name] = 0;
      proto[name] = function patched(...args) {
        counters[name] += 1;
        if (counters[name] % 13 === 1) {
          // First two frames that are NOT three itself and NOT this wrapper:
          // the application call site that started the walk.
          const stack = (new Error().stack ?? '').split('\n').slice(1)
            .map((line) => line.trim().replace(/^at /, '').replace(/\(?https?:[^)]*\/([^/)]+)\)?/, '$1'))
            .filter((line) => !line.includes('vendor-three') && !line.includes('patched') && !line.includes('evaluate'))
            .slice(0, 2).join(' <- ');
          const key = `${name}: ${stack}`;
          callers[key] = (callers[key] ?? 0) + 1;
        }
        return original.apply(this, args);
      };
      return () => { proto[name] = original; };
    };
    const restores = ['updateWorldMatrix', 'updateMatrixWorld', 'getObjectByProperty', 'traverse', 'updateMatrix'].map(wrap);
    let frames = 0;
    const startedAt = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - startedAt < 2000) { requestAnimationFrame(tick); return; }
      restores.forEach((restore) => restore());
      Error.stackTraceLimit = previousStackLimit;
      done({
        nodes, auto, visible, meshes, instanced, frozen, frames,
        perFrame: Object.fromEntries(Object.entries(counters).map(([key, value]) => [key, Number((value / frames).toFixed(1))])),
        // Every 13th call is sampled, so calls/frame ~= sampled * 13 / frames.
        topCallers: Object.entries(callers).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([key, value]) => ({ sampled: value, perFrame: Number(((value * 13) / frames).toFixed(1)), key })),
        byTop: [...byTop.entries()].sort((a, b) => b[1].nodes - a[1].nodes).slice(0, 30).map(([name, value]) => ({ name, ...value })),
      });
    };
    requestAnimationFrame(tick);
  }));
  if (report.census) console.error(`[census] nodes ${report.census.nodes} auto ${report.census.auto} visible ${report.census.visible} meshes ${report.census.meshes} frozen ${report.census.frozen}; per frame ${JSON.stringify(report.census.perFrame)}`);
  for (const entry of (report.census?.byTop ?? []).slice(0, 12)) console.error(`  ${String(entry.nodes).padStart(6)} nodes (${entry.auto} auto)  ${entry.name}`);
  for (const entry of (report.census?.topCallers ?? []).slice(0, 14)) console.error(`  ~${entry.perFrame}/frame  ${entry.key.slice(0, 200)}`);

  // CPU profile at the same pose.
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  const framesBefore = await page.evaluate(() => new Promise((done) => {
    const state = window.__HF399A__;
    state.frames = [];
    state.running = true;
    let last = performance.now();
    const tick = (now) => { if (!state.running) return; state.frames.push(now - last); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    done(performance.now());
  }));
  await cdp.send('Profiler.start');
  await page.waitForTimeout(PROFILE_SECONDS * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const frameStats = await page.evaluate(() => {
    const state = window.__HF399A__;
    state.running = false;
    const frames = state.frames.slice(1);
    const sorted = [...frames].sort((a, b) => a - b);
    return { frames: frames.length, p50: sorted[Math.floor(sorted.length * 0.5)] ?? null, mean: frames.reduce((s, v) => s + v, 0) / Math.max(1, frames.length) };
  });
  void framesBefore;

  // Raw profile kept beside the report so inclusive (caller-attributed) time
  // can be computed offline: scripts/qa/hf399-cpuprofile-inclusive.mjs.
  writeFileSync(join(OUT_DIR, `${LABEL}-${ARENA}-${POSE}.cpuprofile`), JSON.stringify(profile));

  // Self time per node from the sample stream.
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfMicros = new Map();
  const deltas = profile.timeDeltas ?? [];
  for (let index = 0; index < profile.samples.length; index += 1) {
    const id = profile.samples[index];
    const delta = deltas[index] ?? 0;
    selfMicros.set(id, (selfMicros.get(id) ?? 0) + delta);
  }
  const totalMicros = [...selfMicros.values()].reduce((sum, value) => sum + value, 0);
  const byFunction = new Map();
  let idleMicros = 0;
  let programMicros = 0;
  let gcMicros = 0;
  for (const [id, micros] of selfMicros) {
    const node = nodesById.get(id);
    const frame = node?.callFrame ?? {};
    const name = frame.functionName || '(anonymous)';
    if (name === '(idle)') { idleMicros += micros; continue; }
    if (name === '(program)') { programMicros += micros; continue; }
    if (name === '(garbage collector)') { gcMicros += micros; continue; }
    const key = `${name} ${(frame.url ?? '').split('/').pop()}:${frame.lineNumber ?? ''}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + micros);
  }
  const top = [...byFunction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([name, micros]) => ({ name, ms: Number((micros / 1000).toFixed(1)), sharePercent: Number(((micros / totalMicros) * 100).toFixed(2)) }));
  const busyMicros = totalMicros - idleMicros;
  report.cpu = {
    profileSeconds: PROFILE_SECONDS,
    frames: frameStats.frames,
    frameMsP50: Number((frameStats.p50 ?? 0).toFixed(2)),
    frameMsMean: Number(frameStats.mean.toFixed(2)),
    idlePercent: Number(((idleMicros / totalMicros) * 100).toFixed(2)),
    programPercent: Number(((programMicros / totalMicros) * 100).toFixed(2)),
    gcPercent: Number(((gcMicros / totalMicros) * 100).toFixed(2)),
    busyMsPerFrame: Number(((busyMicros / 1000) / Math.max(1, frameStats.frames)).toFixed(2)),
    jsMsPerFrame: Number((((busyMicros - programMicros - gcMicros) / 1000) / Math.max(1, frameStats.frames)).toFixed(2)),
    topSelf: top,
  };
  const passes = report.frame.filter((entry) => !entry.compute);
  console.error(`[anatomy] ${LABEL} ${POSE}: ${passes.length} render passes in ${report.frameCaptureIntervals} intervals, ${passes.reduce((s, p) => s + p.draws, 0)} draws, ${passes.reduce((s, p) => s + p.triangles, 0)} tris`);
  for (const entry of passes) {
    const target = entry.color[0] ?? entry.depth ?? {};
    console.error(`  ${String(entry.label ?? target.label ?? '?').slice(0, 40).padEnd(40)} ${String(target.size?.[0] ?? '?')}x${String(target.size?.[1] ?? '?')} ${target.format ?? ''} s${target.samples ?? ''} draws ${entry.draws} inst ${entry.instances} tris ${entry.triangles}`);
  }
  console.error(`[anatomy] cpu: frame p50 ${report.cpu.frameMsP50} ms, busy ${report.cpu.busyMsPerFrame} ms/frame (js ${report.cpu.jsMsPerFrame}), idle ${report.cpu.idlePercent}%`);
  for (const entry of top.slice(0, 15)) console.error(`  ${entry.sharePercent.toFixed(1).padStart(5)}%  ${entry.name}`);
} finally {
  await browser.close();
  if (server) server.close();
}

const out = join(OUT_DIR, `${LABEL}-${ARENA}-anatomy-${POSE}.json`);
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.error(`Wrote ${out}`);
