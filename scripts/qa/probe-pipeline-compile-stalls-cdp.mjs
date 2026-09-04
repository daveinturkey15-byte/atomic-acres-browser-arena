#!/usr/bin/env node
// ===========================================================================
// PIPELINE-COMPILE STALL PROBE. Does the freeze coincide with the browser
// building NEW WebGPU RENDER PIPELINES?
//
// WHY THIS PROBE EXISTS
// ---------------------
// Owner, 2026-08-31: "it just freezes every few seconds in firefox, mega
// unstable! same issue with edge, unplayable."
//
// The light-graph fix (presentWeaponViewmodelWithoutLightChurn) removed the
// biggest single trigger of node-material rebuilds and measurably helped -
// Chrome 44.74% -> 35.67% of the window frozen, max stall 3004 ms -> 1562 ms.
// It did not come close to fixing the defect, and the CPU profile of the FIXED
// build says why the remainder cannot be chased in JS:
//
//     in-stall  63.00%  (idle)
//     in-stall   8.77%  (program)
//     in-stall   1.56%  build   (the TSL node builder, down from 4.97%)
//
// 63% idle means the renderer main thread is NOT executing JavaScript for most
// of the freeze. It is not blocked on our code; it is waiting, and rAF is not
// being delivered to it. A V8 CPU profile therefore CANNOT name the residual
// cause - the work is not in the sampled isolate at all.
//
// The hypothesis this probe tests: the work is in the GPU PROCESS. Creating a
// WebGPU render pipeline makes Dawn compile WGSL and build a D3D12 PSO, which
// is hundreds of milliseconds of off-thread work, and while it runs the
// compositor produces no frames and the page thread sits idle with nothing to
// do. That would explain every measurement at once: a main thread that looks
// idle, a GPU that looks busy, and a freeze that lands whenever combat
// introduces geometry or a material the renderer has not drawn before.
//
// HOW IT MEASURES
// ---------------
// GPUDevice.prototype.createRenderPipeline and createRenderPipelineAsync are
// wrapped BEFORE the page script runs (addInitScript), so every pipeline the
// application creates is stamped with the time it was requested. A rAF series
// runs beside it. The report then asks the only question that matters:
//
//   what share of pipeline creations land inside a stall, versus the share of
//   the window that is stalled?
//
// If pipelines were unrelated to the freeze those two numbers would match. An
// enrichment - most creations inside a small fraction of the window - is the
// causal signature, and is what would justify prewarming the vocabulary.
//
// createShaderModule is counted the same way: a shader module is the WGSL
// compile specifically, so the two counters separate "new program text" from
// "new pipeline state object".
//
// HEADLESS, installed Chrome (channel:'chrome'), muted. The bundled Chromium
// cannot get a WebGPU device on this machine (dxil.dll Windows Error 87).
//
// USAGE
//   node scripts/qa/probe-pipeline-compile-stalls-cdp.mjs \
//     --dist .qa-dist/after --seconds 75 --label stashonly
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
const flag = (name) => argv.includes(name);

const DIST = resolve(arg('--dist', 'dist'));
const ARENA = arg('--arena', 'atomic-acres');
const SECONDS = Number(arg('--seconds', '75'));
const WARMUP_SECONDS = Number(arg('--warmup', '12'));
const IDLE = flag('--idle');
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '4193'));
const STALL_GAP_MS = Number(arg('--stall-gap-ms', '100'));
// Lane AB (PASS 87): optional time-of-day mode for the run. Absent leaves the
// URL exactly as every earlier invocation built it, so no existing baseline
// moves; `--tod cycle` is the only mode that re-aims the sun during a match and
// is therefore the worst case this tripwire needs to see.
const TOD = arg('--tod', null);
const OUT = resolve(arg('--out', `artifacts/qa/pipeline-compile/${LABEL}.json`));
// Viewport must match whatever instrument the result is being compared against:
// render-target size changes the GPU cost per frame and therefore the stall
// profile, so a probe at 1600x900 cannot be set beside an acceptance run at
// 2560x1440 without saying so.
const WIDTH = Number(arg('--width', '1600'));
const HEIGHT = Number(arg('--height', '900'));
const BOOT_TIMEOUT_MS = 300_000;

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

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});

const report = { contract: 'pipeline-compile-stall-probe-v1', measuredAt: new Date().toISOString(), label: LABEL, arena: ARENA, idle: IDLE, dist: DIST, seconds: SECONDS, tod: TOD };

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  // Wrap the device factories before ANY application code runs. Counting has to
  // start at boot so the prewarm total is visible beside the in-combat total -
  // a build that compiles everything up front and a build that compiles nothing
  // up front are indistinguishable if the probe only watches the sample window.
  await page.addInitScript(() => {
    const state = { pipelines: [], shaderModules: [], hooked: false, stacks: [] };
    window.__PIPELINE_PROBE__ = state;
    const install = () => {
      if (state.hooked) return;
      const device = window.GPUDevice;
      if (!device?.prototype) return;
      state.hooked = true;
      const wrap = (methodName, sink) => {
        const original = device.prototype[methodName];
        if (typeof original !== 'function') return;
        device.prototype[methodName] = function patched(descriptor, ...rest) {
          const startedAt = performance.now();
          let result;
          try {
            result = original.call(this, descriptor, ...rest);
          } finally {
            sink.push({
              atMs: Math.round(startedAt),
              // The synchronous cost only. Dawn does most of the work off this
              // thread, so a small number here is expected and is not evidence
              // that the creation was cheap overall.
              syncMs: Math.round((performance.now() - startedAt) * 100) / 100,
              label: typeof descriptor?.label === 'string' ? descriptor.label.slice(0, 120) : null,
              // The CALL PATH. Lights, material version and material side are
              // all measurably flat while these pipelines are rebuilt over and
              // over, so the cache key is not what moved - the stack is the
              // only thing left that can name which renderer path asks for a
              // new pipeline instead of reusing the cached one.
              stack: sink === state.pipelines ? (new Error().stack ?? '').split('\n').slice(1, 14).map((line) => line.trim()).join(' <- ') : null,
            });
          }
          return result;
        };
      };
      wrap('createRenderPipeline', state.pipelines);
      wrap('createRenderPipelineAsync', state.pipelines);
      wrap('createShaderModule', state.shaderModules);
    };
    install();
    // GPUDevice may not be defined at document-start on every channel.
    if (!state.hooked) {
      const timer = setInterval(() => { install(); if (state.hooked) clearInterval(timer); }, 10);
      setTimeout(() => clearInterval(timer), 30_000);
    }
  });

  const url = new URL(`http://127.0.0.1:${PORT}/`);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  if (TOD) url.searchParams.set('tod', TOD);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.evaluate(async (arena) => {
    const card = document.querySelector(`.map-card[data-arena-id="${arena}"]`);
    if (card) card.click();
    // FARCRYSIS-LOAD (pass 84): a hidden arena (selectable: false, e.g.
    // farcrysis) has no map card. Reach it the way the eight-arena boot smoke
    // does - the debug API's selectArena is the same activateArenaSelection
    // path the deploy button takes - instead of silently probing the default.
    else await window.__ATOMIC_ACRES_DEBUG__.selectArena(arena);
    const name = document.querySelector('#player-name');
    if (name) name.value = 'PipeProbe';
  }, ARENA);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#solo').click());
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return Boolean(s && s.matchPhase === 'active' && s.gameStarted === true);
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  console.error('[pipeline] match active; warming up');
  await page.waitForTimeout(WARMUP_SECONDS * 1000);

  // Mark the sample window and start a rAF series. Deliberately lightweight -
  // no scene traversal - so the probe does not manufacture the stalls it is
  // trying to attribute.
  await page.evaluate(() => {
    const probe = window.__PIPELINE_PROBE__;
    probe.windowStartedAt = performance.now();
    probe.pipelinesAtWindowStart = probe.pipelines.length;
    probe.shaderModulesAtWindowStart = probe.shaderModules.length;
    probe.raf = [];
    // Player-state track, so a pipeline burst can be attributed to a GAMEPLAY
    // EVENT rather than left as an unexplained timestamp. The combat driver
    // never switches weapons, so if the viewmodel compiles mid-match the
    // trigger has to be something else - death, respawn, or a weapon model
    // being retired and reloaded underneath a live match.
    probe.states = [];
    // CACHE-KEY TRACK. The viewmodel materials recompile repeatedly while the
    // player never changes weapon and never dies, so the pipeline cache key
    // must be changing underneath an unchanging object. In three r185 the
    // dynamic half of that key folds in LightsNode.customCacheKey(), which
    // hashes each render-list light's id AND its castShadow flag - so a light
    // that toggles castShadow invalidates every render object exactly the way
    // a light leaving the list does, while membership stays flat and a
    // membership-only probe sees nothing. Track both, plus material version.
    // DETERMINANT TRACK. WebGPUBackend.needsRenderUpdate() rebuilds a render
    // object's pipeline whenever `frontFaceCW` changes, and frontFaceCW is
    // `object.matrixWorld.determinantAffine() < 0`. A viewmodel suppressed by
    // scaling to 0.0001 has a world-matrix determinant around 1e-12, sitting on
    // the floating-point sign boundary - if that sign is unstable frame to
    // frame, three rebuilds the pipeline every flip, which is exactly the
    // repeated recompilation of unchanging carbine/Arms materials measured
    // here. This track records the sign per mesh so a flip is visible.
    try {
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
      probe.detTrack = [];
      let previousDet = null;
      const det3 = (e) => e[0] * (e[5] * e[10] - e[6] * e[9])
        - e[4] * (e[1] * e[10] - e[2] * e[9])
        + e[8] * (e[1] * e[6] - e[2] * e[5]);
      probe.detTimer = setInterval(() => {
        const signs = [];
        scene.traverse((node) => {
          if (!node.isMesh) return;
          const name = node.material && !Array.isArray(node.material) ? (node.material.name || '') : '';
          if (!/Pass65_(carbine|Arms)/.test(name)) return;
          const d = det3(node.matrixWorld.elements);
          signs.push(`${name}:${d < 0 ? 'neg' : d > 0 ? 'pos' : 'zero'}:${d.toExponential(2)}`);
        });
        signs.sort();
        const key = signs.map((entry) => entry.split(':').slice(0, 2).join(':')).join(',');
        if (key !== previousDet) {
          probe.detTrack.push({ atMs: Math.round(performance.now()), signs: signs.slice(0, 12) });
          previousDet = key;
        }
      }, 50);
    } catch { /* debug surface unavailable */ }
    try {
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
      probe.keyTrack = [];
      let previousKey = null;
      probe.keyTimer = setInterval(() => {
        const lights = [];
        const materials = [];
        scene.traverseVisible((node) => {
          if (node.isLight) lights.push(`${node.name || node.type}:${node.id}:${node.castShadow ? 1 : 0}`);
          const list = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
          for (const m of list) if (/Pass65_(carbine|Arms)/.test(m.name || '')) materials.push(`${m.name}:${m.version}:${m.side}`);
        });
        lights.sort(); materials.sort();
        const key = `${lights.join(',')}||${materials.join(',')}`;
        if (key !== previousKey) {
          probe.keyTrack.push({ atMs: Math.round(performance.now()), lights, materials });
          previousKey = key;
        }
      }, 50);
    } catch { /* debug surface unavailable */ }
    probe.stateTimer = setInterval(() => {
      try {
        const snap = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        probe.states.push({
          atMs: Math.round(performance.now()),
          alive: snap?.player?.alive ?? null,
          weapon: snap?.player?.weapon ?? null,
        });
      } catch { /* between phases */ }
    }, 250);
    probe.running = true;
    let last = performance.now();
    const tick = (now) => {
      if (!probe.running) return;
      probe.raf.push({ atMs: Math.round(now), gapMs: Math.round((now - last) * 100) / 100 });
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  if (!IDLE) {
    await page.evaluate(() => {
      let step = 0;
      let aliveCache = null;
      let deadSince = null;
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const key = (type, code) => { try { window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true })); } catch { /* refused */ } };
      window.__COMBAT_TIMER__ = setInterval(() => {
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
    });
  }

  await page.waitForTimeout(SECONDS * 1000);

  const raw = await page.evaluate(() => {
    const probe = window.__PIPELINE_PROBE__;
    probe.running = false;
    if (window.__COMBAT_TIMER__) clearInterval(window.__COMBAT_TIMER__);
    if (probe.stateTimer) clearInterval(probe.stateTimer);
    if (probe.keyTimer) clearInterval(probe.keyTimer);
    if (probe.detTimer) clearInterval(probe.detTimer);
    try { window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld?.(false); } catch { /* gone */ }
    try { window.__ATOMIC_ACRES_DEBUG__.setMovement?.(false, false); } catch { /* gone */ }
    return {
      hooked: probe.hooked,
      pipelines: probe.pipelines,
      shaderModules: probe.shaderModules,
      pipelinesAtWindowStart: probe.pipelinesAtWindowStart,
      shaderModulesAtWindowStart: probe.shaderModulesAtWindowStart,
      windowStartedAt: probe.windowStartedAt,
      raf: probe.raf,
      states: probe.states,
      keyTrack: probe.keyTrack ?? [],
      detTrack: probe.detTrack ?? [],
    };
  });

  // Reconstruct the stall intervals from the rAF series. A stall is a gap at or
  // above the floor; its interval spans [previous frame, this frame].
  const stalls = [];
  for (const entry of raw.raf) {
    if (entry.gapMs >= STALL_GAP_MS) stalls.push({ startMs: entry.atMs - entry.gapMs, endMs: entry.atMs, durationMs: entry.gapMs });
  }
  const windowStart = raw.windowStartedAt;
  const windowEnd = raw.raf.length === 0 ? windowStart : raw.raf[raw.raf.length - 1].atMs;
  const windowMs = Math.max(1, windowEnd - windowStart);
  const frozenMs = stalls.reduce((total, stall) => total + stall.durationMs, 0);
  const insideStall = (atMs) => stalls.some((stall) => atMs >= stall.startMs - 16 && atMs <= stall.endMs + 16);

  const inWindow = (list, from) => list.slice(from).filter((entry) => entry.atMs >= windowStart);
  const windowPipelines = inWindow(raw.pipelines, raw.pipelinesAtWindowStart);
  const windowShaders = inWindow(raw.shaderModules, raw.shaderModulesAtWindowStart);
  const pipelinesInStall = windowPipelines.filter((entry) => insideStall(entry.atMs));
  const shadersInStall = windowShaders.filter((entry) => insideStall(entry.atMs));

  const frozenFraction = frozenMs / windowMs;
  const share = (part, whole) => (whole === 0 ? null : Number(((part / whole) * 100).toFixed(2)));

  report.hooked = raw.hooked;
  report.viewport = { width: WIDTH, height: HEIGHT };
  report.window = {
    windowS: Number((windowMs / 1000).toFixed(3)),
    rafCallbacks: raw.raf.length,
    stallCount: stalls.length,
    stallsPerMinute: Number(((stalls.length / windowMs) * 60_000).toFixed(2)),
    frozenFractionPercent: Number((frozenFraction * 100).toFixed(2)),
    medianStallMs: stalls.length === 0 ? null : [...stalls].sort((a, b) => a.durationMs - b.durationMs)[Math.floor((stalls.length - 1) / 2)].durationMs,
    maxStallMs: stalls.length === 0 ? null : Math.max(...stalls.map((stall) => stall.durationMs)),
  };
  // THE CAUSAL TEST. `expectedIfUnrelated` is the share of creations that would
  // land inside a stall by chance alone - it is just the frozen fraction of the
  // window. `enrichment` above 1 means creation and freeze coincide.
  report.pipelines = {
    beforeWindow: raw.pipelinesAtWindowStart,
    inWindow: windowPipelines.length,
    perMinuteInWindow: Number(((windowPipelines.length / windowMs) * 60_000).toFixed(2)),
    inStall: pipelinesInStall.length,
    inStallSharePercent: share(pipelinesInStall.length, windowPipelines.length),
    expectedIfUnrelatedPercent: Number((frozenFraction * 100).toFixed(2)),
    enrichment: windowPipelines.length === 0 || frozenFraction === 0 ? null
      : Number(((pipelinesInStall.length / windowPipelines.length) / frozenFraction).toFixed(2)),
  };
  report.shaderModules = {
    beforeWindow: raw.shaderModulesAtWindowStart,
    inWindow: windowShaders.length,
    perMinuteInWindow: Number(((windowShaders.length / windowMs) * 60_000).toFixed(2)),
    inStall: shadersInStall.length,
    inStallSharePercent: share(shadersInStall.length, windowShaders.length),
    expectedIfUnrelatedPercent: Number((frozenFraction * 100).toFixed(2)),
    enrichment: windowShaders.length === 0 || frozenFraction === 0 ? null
      : Number(((shadersInStall.length / windowShaders.length) / frozenFraction).toFixed(2)),
  };
  // Collapse the state track to transitions only - that is what a burst can be
  // lined up against.
  const stateTransitions = [];
  let previousState = null;
  for (const entry of raw.states ?? []) {
    const key = `${entry.alive}|${entry.weapon}`;
    if (key !== previousState) { stateTransitions.push(entry); previousState = key; }
  }
  report.stateTransitions = stateTransitions;
  // Diff consecutive cache-key samples so the report names the FIELD that moved.
  const keyDiffs = [];
  const track = raw.keyTrack ?? [];
  for (let index = 1; index < track.length; index += 1) {
    const before = new Set(track[index - 1].lights);
    const after = new Set(track[index].lights);
    const mBefore = new Set(track[index - 1].materials);
    const mAfter = new Set(track[index].materials);
    keyDiffs.push({
      atMs: track[index].atMs,
      lightsGained: track[index].lights.filter((entry) => !before.has(entry)),
      lightsLost: track[index - 1].lights.filter((entry) => !after.has(entry)),
      materialsGained: track[index].materials.filter((entry) => !mBefore.has(entry)),
      materialsLost: track[index - 1].materials.filter((entry) => !mAfter.has(entry)),
    });
  }
  report.cacheKeyDiffs = keyDiffs.slice(0, 80);
  report.cacheKeyDiffCount = keyDiffs.length;
  report.determinantFlips = (raw.detTrack ?? []).slice(0, 60);
  report.determinantFlipCount = (raw.detTrack ?? []).length;
  report.samplePipelineLabels = windowPipelines.slice(0, 60);
  // Admission census. The six-pipeline TAA miss was previously only a number;
  // retain the descriptor label and first call path for every pipeline created
  // before the combat window so a new reach item is named from evidence.
  const admissionByLabel = new Map();
  for (const entry of raw.pipelines.slice(0, raw.pipelinesAtWindowStart)) {
    const key = `${entry.label ?? '<unlabelled>'}|${entry.stack ?? '<no-stack>'}`;
    const existing = admissionByLabel.get(key);
    if (existing) existing.count += 1;
    else admissionByLabel.set(key, { label: entry.label, stack: entry.stack, count: 1 });
  }
  report.admissionPipelineCensus = {
    total: raw.pipelinesAtWindowStart,
    unique: admissionByLabel.size,
    entries: [...admissionByLabel.values()].sort((a, b) => (
      b.count - a.count || String(a.label).localeCompare(String(b.label))
    )),
  };
  report.stalls = stalls.slice(0, 120);

  console.error(`[pipeline] hooked=${raw.hooked} ${report.window.stallCount} stalls, ${report.window.frozenFractionPercent}% frozen over ${report.window.windowS}s`);
  console.error(`[pipeline] render pipelines: ${report.pipelines.beforeWindow} before window, ${report.pipelines.inWindow} during (${report.pipelines.perMinuteInWindow}/min)`);
  console.error(`[pipeline]   ${report.pipelines.inStall} of them inside a stall = ${report.pipelines.inStallSharePercent}% (chance alone would give ${report.pipelines.expectedIfUnrelatedPercent}%) -> enrichment ${report.pipelines.enrichment}x`);
  console.error(`[pipeline] shader modules: ${report.shaderModules.beforeWindow} before window, ${report.shaderModules.inWindow} during; ${report.shaderModules.inStall} inside a stall -> enrichment ${report.shaderModules.enrichment}x`);
} finally {
  await browser.close();
  server.close();
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.error(`Wrote ${OUT}`);
