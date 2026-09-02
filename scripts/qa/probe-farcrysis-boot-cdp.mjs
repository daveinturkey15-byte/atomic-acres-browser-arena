#!/usr/bin/env node
// ===========================================================================
// FARCRYSIS COLD-BOOT PROBE (pass 84, lane C). How long does the hidden
// farcrysis arena take to reach match admission, and what is the browser
// doing while it waits?
//
// WHY THIS PROBE EXISTS
// ---------------------
// Farcrysis (`selectable: false`) cold-loaded in ~279 s and then the tab died.
// Every earlier measurement was a single number; nothing on disk said WHICH
// phase of the arena transition ate the time, how many WebGPU pipelines and
// shader modules the arena forced Dawn to build inside the 12 s admission
// fences, or whether the main thread was busy (geometry construction) or idle
// (waiting on the GPU process). This probe samples all of those in one run so
// a fix can be attributed in numbers before anything changes, and re-measured
// with the identical instrument afterwards.
//
// HOW IT SELECTS THE ARENA
// ------------------------
// The arena is hidden from the menu, so there is no `.map-card` to click. The
// eight-arena boot smoke (tests/e2e/pass74-arena-boot-smoke.spec.ts) reaches
// hidden arenas through `__ATOMIC_ACRES_DEBUG__.selectArena(id)` followed by
// `startSolo()`; that is the same `activateArenaSelection` path the menu's
// deploy button takes, so this probe uses it too - no new backdoor.
//
// WHAT IT SAMPLES
// ---------------
//   - elapsed: page load -> debug API -> selectArena resolved (= the arena
//     transition committed through every 12 s fence) -> match active.
//   - the arena-transition profiler's own phase table (from snapshot()).
//   - GPUDevice.createRenderPipeline / createRenderPipelineAsync /
//     createShaderModule counts, stamped by time, so they can be bucketed by
//     transition phase.
//   - PerformanceObserver('longtask') entries: main-thread geometry / texture
//     bake cost on the critical path.
//   - scene census after admission: unique materials (by object and by
//     shader-relevant signature), meshes, instanced meshes, geometries.
//   - JS heap via performance.memory and CDP Runtime.getHeapUsage.
//   - optionally a combat window after admission (--combat-seconds N) that
//     drives the same movement/fire loop as probe-pipeline-compile-stalls-cdp
//     and counts pipelines created after admission. Target is zero.
//
// HEADLESS installed Chrome (channel:'chrome'), muted, never a visible window.
//
// USAGE
//   node scripts/qa/probe-farcrysis-boot-cdp.mjs --dist dist --label before
//   node scripts/qa/probe-farcrysis-boot-cdp.mjs --dist dist --label after --combat-seconds 75
// ===========================================================================
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { presentationArgs } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};

const DIST = resolve(arg('--dist', 'dist'));
const ARENA = arg('--arena', 'farcrysis');
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '41943'));
const COMBAT_SECONDS = Number(arg('--combat-seconds', '0'));
const OUT = resolve(arg('--out', `artifacts/qa/farcrysis-load/${LABEL}.json`));
const WIDTH = Number(arg('--width', '1600'));
const HEIGHT = Number(arg('--height', '900'));
// The brief's ceiling. The defect being measured is a ~279 s load, so the
// probe must outlive it; it must also never hang the machine, so a hard exit
// sits a little past the ceiling.
const BOOT_TIMEOUT_MS = Number(arg('--timeout-ms', '400000'));
const HARD_EXIT_MS = BOOT_TIMEOUT_MS + 30_000;

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

const report = {
  contract: 'farcrysis-boot-probe-v1',
  measuredAt: new Date().toISOString(),
  label: LABEL,
  arena: ARENA,
  dist: DIST,
  viewport: { width: WIDTH, height: HEIGHT },
  outcome: 'incomplete',
  pageErrors: [],
  consoleErrors: [],
  crashed: false,
};

const hardExit = setTimeout(() => {
  console.error(`[farcrysis-boot] HARD EXIT after ${HARD_EXIT_MS} ms`);
  report.outcome = 'hard-exit';
  finish().finally(() => process.exit(2));
}, HARD_EXIT_MS);

let browser = null;
async function finish() {
  clearTimeout(hardExit);
  try { if (browser) await browser.close(); } catch { /* already gone */ }
  server.close();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`Wrote ${OUT}`);
}

browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: presentationArgs({
    headless: true,
    extra: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
  }),
});

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  page.on('pageerror', (error) => report.pageErrors.push(String(error).slice(0, 400)));
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 400)); });
  page.on('crash', () => { report.crashed = true; console.error('[farcrysis-boot] PAGE CRASHED'); });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  await page.addInitScript(() => {
    const state = { pipelines: [], shaderModules: [], longTasks: [], marks: {}, stageTrack: [], hooked: false };
    window.__FARCRYSIS_BOOT_PROBE__ = state;
    const install = () => {
      if (state.hooked) return;
      const device = window.GPUDevice;
      if (!device?.prototype) return;
      state.hooked = true;
      // Shader modules get a small id so a pipeline can name its programs;
      // pipelines record the descriptor facets that make three's pipeline
      // cache key distinct (programs, vertex layout, primitive state, depth
      // state, colour targets), so a count can be attributed offline.
      const moduleIds = new WeakMap();
      let nextModuleId = 0;
      const describePipeline = (descriptor, result) => {
        try {
          const vertex = descriptor?.vertex;
          const fragment = descriptor?.fragment;
          const buffers = (vertex?.buffers ?? []).map((buffer) => `${buffer.arrayStride}:${buffer.stepMode ?? 'v'}:${(buffer.attributes ?? []).map((a) => `${a.shaderLocation}${a.format}`).join('+')}`).join('|');
          const primitive = descriptor?.primitive ?? {};
          const depth = descriptor?.depthStencil ?? null;
          const targets = (fragment?.targets ?? []).map((t) => `${t.format}${t.blend ? `/b${t.blend.color?.operation ?? ''}${t.blend.color?.srcFactor ?? ''}${t.blend.color?.dstFactor ?? ''}` : ''}${t.writeMask !== undefined ? `/w${t.writeMask}` : ''}`).join(',');
          return {
            vm: vertex?.module ? (moduleIds.get(vertex.module) ?? -1) : -1,
            fm: fragment?.module ? (moduleIds.get(fragment.module) ?? -1) : -1,
            buffers,
            prim: `${primitive.topology ?? ''}/${primitive.cullMode ?? ''}/${primitive.frontFace ?? ''}`,
            depth: depth ? `${depth.format}/${depth.depthWriteEnabled ? 'w' : '-'}/${depth.depthCompare ?? ''}` : '',
            targets,
            samples: descriptor?.multisample?.count ?? 1,
            async: result instanceof Promise,
          };
        } catch { return null; }
      };
      const wrap = (methodName, sink, keepStack) => {
        const original = device.prototype[methodName];
        if (typeof original !== 'function') return;
        device.prototype[methodName] = function patched(descriptor, ...rest) {
          const startedAt = performance.now();
          let result;
          try {
            result = original.call(this, descriptor, ...rest);
            return result;
          } finally {
            if (sink === state.shaderModules && result && typeof result === 'object') moduleIds.set(result, nextModuleId++);
            // Async creations resolve when the GPU process has finished
            // compiling: the resolve time is the per-pipeline compile latency
            // three's serial compileAsync pays for each object.
            const record = {
              atMs: Math.round(startedAt),
              syncMs: Math.round((performance.now() - startedAt) * 100) / 100,
              label: typeof descriptor?.label === 'string' ? descriptor.label.slice(0, 120) : null,
              stack: keepStack ? (new Error().stack ?? '').split('\n').slice(2, 30).map((line) => line.trim().replace(/^at /, '').replace(/http:\/\/127\.0\.0\.1:\d+\/assets\//g, '')).join(' <- ') : null,
              facets: keepStack ? describePipeline(descriptor, result) : null,
              codeLength: sink === state.shaderModules && typeof descriptor?.code === 'string' ? descriptor.code.length : undefined,
              resolvedMs: null,
            };
            sink.push(record);
            if (result instanceof Promise) result.then(() => { record.resolvedMs = Math.round(performance.now() - startedAt); }, () => { record.resolvedMs = -1; });
          }
        };
      };
      wrap('createRenderPipeline', state.pipelines, true);
      wrap('createRenderPipelineAsync', state.pipelines, true);
      wrap('createShaderModule', state.shaderModules, false);
    };
    install();
    if (!state.hooked) {
      const timer = setInterval(() => { install(); if (state.hooked) clearInterval(timer); }, 10);
      setTimeout(() => clearInterval(timer), 30_000);
    }
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({
            atMs: Math.round(entry.startTime),
            durationMs: Math.round(entry.duration),
            attribution: (entry.attribution ?? []).map((a) => `${a.containerType ?? ''}:${a.containerName ?? ''}:${a.containerSrc ?? ''}`).join(',').slice(0, 120),
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch { /* unsupported */ }
    // Bootstrap-stage / transition-phase timeline at 250 ms, so a stuck phase
    // is visible even if the transition never finishes.
    let lastKey = null;
    setInterval(() => {
      try {
        const snap = window.__ATOMIC_ACRES_DEBUG__?.admissionState?.();
        if (!snap) return;
        const key = `${snap.bootstrapStage}|${snap.arenaTransitionPhase}|${snap.matchPhase}|${snap.arenaId}`;
        if (key !== lastKey) {
          state.stageTrack.push({ atMs: Math.round(performance.now()), bootstrapStage: snap.bootstrapStage, transitionPhase: snap.arenaTransitionPhase, matchPhase: snap.matchPhase, arenaId: snap.arenaId, pipelines: state.pipelines.length });
          lastKey = key;
        }
      } catch { /* between phases */ }
    }, 250);
  });

  const url = new URL(`http://127.0.0.1:${PORT}/`);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  const t0 = Date.now();
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });
  const menuReadyMs = Date.now() - t0;
  console.error(`[farcrysis-boot] menu ready at ${menuReadyMs} ms`);

  const menuCounts = await page.evaluate(() => {
    const p = window.__FARCRYSIS_BOOT_PROBE__;
    p.marks.selectStartedAt = performance.now();
    p.pipelinesAtSelect = p.pipelines.length;
    p.shaderModulesAtSelect = p.shaderModules.length;
    return { pipelines: p.pipelines.length, shaderModules: p.shaderModules.length, hooked: p.hooked };
  });
  report.menu = { readyMs: menuReadyMs, ...menuCounts };

  // The transition. selectArena resolves only after performArenaSelection has
  // committed the arena through every admission fence, so its resolution IS
  // "the arena admitted"; startSolo then spawns the match on the admitted
  // arena. Both are timed; the selection is the load-path number.
  const selectStart = Date.now();
  const selectOutcome = await page.evaluate(async (arena) => {
    try {
      await window.__ATOMIC_ACRES_DEBUG__.selectArena(arena);
      window.__FARCRYSIS_BOOT_PROBE__.marks.selectResolvedAt = performance.now();
      return 'ok';
    } catch (error) {
      window.__FARCRYSIS_BOOT_PROBE__.marks.selectFailedAt = performance.now();
      return `failed: ${String(error).slice(0, 400)}`;
    }
  }, ARENA).catch((error) => `evaluate-failed: ${String(error).slice(0, 400)}`);
  const selectMs = Date.now() - selectStart;
  report.selection = { outcome: selectOutcome, elapsedMs: selectMs };
  console.error(`[farcrysis-boot] selectArena(${ARENA}) -> ${selectOutcome} in ${selectMs} ms`);

  if (selectOutcome === 'ok') {
    const soloStart = Date.now();
    await page.evaluate(() => { window.__FARCRYSIS_BOOT_PROBE__.marks.soloStartedAt = performance.now(); window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    const active = await page.waitForFunction(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      if (s && s.matchPhase === 'active' && s.gameStarted === true) { window.__FARCRYSIS_BOOT_PROBE__.marks.activeAt = performance.now(); return 'active'; }
      const status = document.querySelector('#status')?.textContent ?? '';
      if (/deployment preparation failed|renderer blocked/i.test(status)) return `deploy-failed: ${status}`;
      return null;
    }, undefined, { timeout: BOOT_TIMEOUT_MS }).then((h) => h.jsonValue()).catch((error) => `timeout: ${String(error).slice(0, 200)}`);
    report.solo = { outcome: active, elapsedMs: Date.now() - soloStart };
    console.error(`[farcrysis-boot] startSolo -> ${active} in ${report.solo.elapsedMs} ms`);
    report.outcome = active === 'active' ? 'admitted' : 'solo-failed';
  } else {
    report.outcome = 'selection-failed';
  }
  report.totalToActiveMs = Date.now() - t0;

  // Let the first live frames land before the census, then sample.
  await page.waitForTimeout(1500);
  const census = await page.evaluate((ARENA_PREFIX) => {
    const p = window.__FARCRYSIS_BOOT_PROBE__;
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const snap = api.snapshot();
    const scene = api.sampleSceneGraph();
    const materials = new Set();
    const signatures = new Map();
    const geometries = new Set();
    let meshes = 0; let instanced = 0; let instances = 0; let lights = 0; let arenaMeshes = 0;
    let vertices = 0;
    // Arena-owned renderables are identified by the `farcrysis` name prefix
    // every module in src/farcrysis*.ts uses; the arena root itself may be
    // re-parented or renamed by presentation batching, so a root lookup is
    // not reliable after admission.
    const arenaMaterials = new Set();
    const uniqueSignatures = new Map();
    scene.traverse((node) => {
      if (node.isLight) lights += 1;
      if (!node.isMesh) return;
      meshes += 1;
      if (node.isInstancedMesh) { instanced += 1; instances += node.count; }
      if (node.geometry) {
        geometries.add(node.geometry);
      }
      const isArena = typeof node.name === 'string' && node.name.startsWith(ARENA_PREFIX);
      if (isArena) {
        arenaMeshes += 1;
        const pos = node.geometry?.attributes?.position;
        if (pos) vertices += pos.count;
      }
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of list) {
        if (!m) continue;
        const fresh = !materials.has(m);
        materials.add(m);
        if (isArena) arenaMaterials.add(m);
        const sig = [m.type, m.map ? 'map' : '', m.normalMap ? 'nrm' : '', m.roughnessMap ? 'rgh' : '', m.alphaMap ? 'alp' : '', m.emissiveMap ? 'emi' : '',
          m.transparent ? 'T' : '', m.side, m.vertexColors ? 'vc' : '', m.alphaTest > 0 ? 'at' : '', m.colorNode ? 'colorNode' : '', m.positionNode ? 'posNode' : '',
          node.isInstancedMesh ? 'inst' : '', node.isSkinnedMesh ? 'skin' : ''].join('|');
        signatures.set(sig, (signatures.get(sig) ?? 0) + 1);
        if (fresh) uniqueSignatures.set(sig, (uniqueSignatures.get(sig) ?? 0) + 1);
      }
    });
    const mem = performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit } : null;
    const transition = snap.arenaSelection?.streaming?.transition ?? null;
    return {
      marks: p.marks,
      hooked: p.hooked,
      pipelines: p.pipelines,
      shaderModules: p.shaderModules,
      pipelinesAtSelect: p.pipelinesAtSelect,
      shaderModulesAtSelect: p.shaderModulesAtSelect,
      longTasks: p.longTasks,
      stageTrack: p.stageTrack,
      transition,
      renderInfo: snap.render ?? null,
      scene: {
        meshes, instancedMeshes: instanced, instanceCount: instances, lights,
        uniqueMaterials: materials.size,
        uniqueGeometries: geometries.size,
        arenaMeshes,
        arenaUniqueMaterials: arenaMaterials.size,
        arenaVertexAttributeCount: vertices,
        // per mesh-slot (how many draws share a signature) and per unique
        // material object (how many distinct material objects share one).
        materialSignatures: [...signatures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
        uniqueMaterialSignatures: [...uniqueSignatures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
      },
      memory: mem,
    };
  }, ARENA).catch((error) => ({ censusError: String(error).slice(0, 400) }));

  const heap = await cdp.send('Runtime.getHeapUsage').catch(() => null);
  report.heap = heap ? { usedSize: heap.usedSize, totalSize: heap.totalSize } : null;

  if (census.censusError) {
    report.censusError = census.censusError;
  } else {
    const marks = census.marks;
    const t = (a, b) => (marks[a] != null && marks[b] != null ? Math.round(marks[b] - marks[a]) : null);
    report.timings = {
      selectToAdmittedMs: t('selectStartedAt', 'selectResolvedAt'),
      selectToFailedMs: t('selectStartedAt', 'selectFailedAt'),
      soloToActiveMs: t('soloStartedAt', 'activeAt'),
      selectToActiveMs: t('selectStartedAt', 'activeAt'),
    };
    report.transitionProfile = census.transition?.profile ?? null;
    report.transitionState = census.transition ? { phase: census.transition.phase, failure: census.transition.failure, generation: census.transition.generation } : null;
    const windowStart = marks.selectStartedAt ?? 0;
    const windowEnd = marks.activeAt ?? marks.selectResolvedAt ?? marks.selectFailedAt ?? Number.POSITIVE_INFINITY;
    const inWindow = (list) => list.filter((entry) => entry.atMs >= windowStart && entry.atMs <= windowEnd);
    const loadPipelines = inWindow(census.pipelines);
    const loadShaders = inWindow(census.shaderModules);
    // Bucket pipeline creations by transition phase using the profiler's own
    // phase intervals (performance.now() clock on both sides).
    const phases = census.transition?.profile?.phases ?? [];
    const byPhase = {};
    for (const entry of loadPipelines) {
      const phase = phases.find((ph) => entry.atMs >= ph.startedAt && entry.atMs <= ph.completedAt);
      const key = phase ? phase.phase : (entry.atMs > (phases.at(-1)?.completedAt ?? 0) ? 'after-transition(startSolo)' : 'unbucketed');
      byPhase[key] = (byPhase[key] ?? 0) + 1;
    }
    const shaderByPhase = {};
    for (const entry of loadShaders) {
      const phase = phases.find((ph) => entry.atMs >= ph.startedAt && entry.atMs <= ph.completedAt);
      const key = phase ? phase.phase : (entry.atMs > (phases.at(-1)?.completedAt ?? 0) ? 'after-transition(startSolo)' : 'unbucketed');
      shaderByPhase[key] = (shaderByPhase[key] ?? 0) + 1;
    }
    const stackCounts = {};
    for (const entry of loadPipelines) {
      const key = (entry.stack ?? '').split(' <- ').slice(0, 3).join(' <- ');
      stackCounts[key] = (stackCounts[key] ?? 0) + 1;
    }
    report.pipelines = {
      atMenu: census.pipelinesAtSelect,
      duringLoad: loadPipelines.length,
      total: census.pipelines.length,
      byPhase,
      syncMsTotal: Math.round(loadPipelines.reduce((sum, entry) => sum + entry.syncMs, 0)),
      topStacks: Object.entries(stackCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
      sampleLabels: loadPipelines.slice(0, 40).map((entry) => ({ atMs: entry.atMs, label: entry.label })),
      // Every label, so the material families behind the count can be read
      // back without re-running the probe (three labels each pipeline
      // `renderPipeline_<material.name || material.type>_<material.id>`).
      allLabels: loadPipelines.map((entry) => `${entry.atMs}:${entry.label ?? ''}`),
      // Full facet + call-path record for every pipeline created during the
      // load, for offline attribution (which app path asked, which facet
      // splits otherwise-identical draws).
      records: loadPipelines.map((entry) => ({ atMs: entry.atMs, label: entry.label, facets: entry.facets, stack: entry.stack, resolvedMs: entry.resolvedMs ?? null })),
    };
    report.shaderModules = {
      atMenu: census.shaderModulesAtSelect,
      duringLoad: loadShaders.length,
      total: census.shaderModules.length,
      byPhase: shaderByPhase,
      syncMsTotal: Math.round(loadShaders.reduce((sum, entry) => sum + entry.syncMs, 0)),
      // WGSL size per module: compile cost in the GPU process scales with it,
      // so a vocabulary of the same COUNT can still cost more to realise.
      codeLengthTotal: loadShaders.reduce((sum, entry) => sum + (entry.codeLength ?? 0), 0),
      records: loadShaders.map((entry) => ({ atMs: entry.atMs, label: entry.label, codeLength: entry.codeLength ?? null })),
    };
    const loadLongTasks = inWindow(census.longTasks);
    const longByPhase = {};
    for (const entry of loadLongTasks) {
      const phase = phases.find((ph) => entry.atMs >= ph.startedAt && entry.atMs <= ph.completedAt);
      const key = phase ? phase.phase : 'unbucketed';
      longByPhase[key] = (longByPhase[key] ?? 0) + entry.durationMs;
    }
    report.longTasks = {
      countDuringLoad: loadLongTasks.length,
      totalMsDuringLoad: loadLongTasks.reduce((sum, entry) => sum + entry.durationMs, 0),
      maxMs: loadLongTasks.length ? Math.max(...loadLongTasks.map((entry) => entry.durationMs)) : 0,
      msByPhase: longByPhase,
      top: [...loadLongTasks].sort((a, b) => b.durationMs - a.durationMs).slice(0, 15),
    };
    report.scene = census.scene;
    report.renderInfo = census.renderInfo;
    report.memory = census.memory;
    report.stageTrack = census.stageTrack;
  }

  // Optional in-combat window after admission: any pipeline created here is a
  // cold compile a player would feel as a stall. The target is zero.
  if (COMBAT_SECONDS > 0 && report.outcome === 'admitted') {
    const combat = await page.evaluate(async (seconds) => {
      const p = window.__FARCRYSIS_BOOT_PROBE__;
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const startedAt = performance.now();
      const pipelinesBefore = p.pipelines.length;
      const shadersBefore = p.shaderModules.length;
      const raf = [];
      let running = true;
      let last = performance.now();
      const tick = (now) => { if (!running) return; raf.push(now - last); last = now; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      let step = 0; let aliveCache = null; let deadSince = null;
      const key = (type, code) => { try { window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true })); } catch { /* refused */ } };
      const timer = setInterval(() => {
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
          api.setMovement?.(true, step % 40 < 12);
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
      await new Promise((done) => setTimeout(done, seconds * 1000));
      running = false;
      clearInterval(timer);
      try { api.setTriggerHeld?.(false); api.setMovement?.(false, false); } catch { /* gone */ }
      const stalls = raf.filter((gap) => gap >= 100);
      const created = p.pipelines.slice(pipelinesBefore);
      return {
        seconds,
        pipelinesCreated: created.length,
        shaderModulesCreated: p.shaderModules.length - shadersBefore,
        createdLabels: created.slice(0, 30).map((entry) => ({ atMs: Math.round(entry.atMs - startedAt), label: entry.label, stack: entry.stack })),
        rafCallbacks: raf.length,
        stallCount: stalls.length,
        maxStallMs: stalls.length ? Math.round(Math.max(...stalls)) : 0,
        frozenMs: Math.round(stalls.reduce((sum, gap) => sum + gap, 0)),
        meanFps: raf.length > 1 ? Number((1000 / (raf.reduce((sum, gap) => sum + gap, 0) / raf.length)).toFixed(1)) : null,
      };
    }, COMBAT_SECONDS).catch((error) => ({ combatError: String(error).slice(0, 400) }));
    report.combat = combat;
    console.error(`[farcrysis-boot] combat ${COMBAT_SECONDS}s: pipelines created ${combat.pipelinesCreated ?? '?'}, stalls ${combat.stallCount ?? '?'}, max stall ${combat.maxStallMs ?? '?'} ms`);
  }

  console.error(`[farcrysis-boot] outcome=${report.outcome} selectToAdmitted=${report.timings?.selectToAdmittedMs ?? report.selection?.elapsedMs} ms, selectToActive=${report.timings?.selectToActiveMs ?? null} ms`);
  if (report.pipelines) console.error(`[farcrysis-boot] pipelines: menu ${report.pipelines.atMenu}, during load ${report.pipelines.duringLoad}; shader modules during load ${report.shaderModules.duringLoad}; long tasks ${report.longTasks.countDuringLoad} = ${report.longTasks.totalMsDuringLoad} ms (max ${report.longTasks.maxMs})`);
  if (report.scene) console.error(`[farcrysis-boot] scene: ${report.scene.meshes} meshes (${report.scene.instancedMeshes} instanced, ${report.scene.instanceCount} instances), ${report.scene.uniqueMaterials} unique materials (${report.scene.arenaUniqueMaterials} in arena root), ${report.scene.uniqueGeometries} geometries`);
} catch (error) {
  report.error = String(error).slice(0, 800);
  console.error(`[farcrysis-boot] error: ${report.error}`);
} finally {
  await finish();
}
