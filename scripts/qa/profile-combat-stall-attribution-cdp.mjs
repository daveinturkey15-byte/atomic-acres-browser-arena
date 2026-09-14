#!/usr/bin/env node
// ===========================================================================
// COMBAT STALL ATTRIBUTION. Names the function that blocks the main thread.
//
// WHAT THE PREVIOUS PASS ALREADY PROVED (do not re-derive it here)
// ---------------------------------------------------------------
// scripts/qa/measure-cross-engine-stalls.mjs measured published pass81 on all
// three installed engines and established: the freeze is a MAIN-THREAD BLOCK
// upstream of renderer admission (submission and completion counters stop
// together, rAF freezes with them, refusals collapse to zero), it is
// combat-driven (idle Chrome 4.3% frozen / 4 long tasks, combat Chrome 21.9% /
// 23), and the adaptive-quality controller, the in-flight cap, the starvation
// recovery path and the driver's on-disk pipeline cache are each individually
// exonerated by measurement.
//
// That instrument counts long tasks. It cannot say WHAT they are, because the
// Long Tasks API reports only a duration and Gecko does not implement it at
// all. Guessing at this point is how a pass "fixes" the wrong thing, so this
// instrument closes the last gap: it drives the same combat protocol under the
// CDP sampling profiler and reports, by function name and source line:
//
//   overall   - self time over the whole combat window
//   in-stall  - self time restricted to the spans where rAF was BLOCKED
//   delta     - in-stall share minus overall share. THIS is the finding. A
//               function that costs 20% of every frame is expensive; a
//               function that costs 3% of the window but 60% of the frozen
//               milliseconds is the freeze.
//
// WHY CHROME ONLY, AND WHY THAT IS ENOUGH
// ---------------------------------------
// Chrome is the owner's primary browser and measured WORST (17.7% of the
// window frozen against Firefox's 3.9%), and it is the only one of the three
// with a sampling profiler reachable from a harness. The FIX is then verified
// on all three by the cross-engine meter, which is the instrument that owns
// the acceptance numbers. This one owns the diagnosis.
//
// HEADLESS IS DELIBERATE. The hard rule allows headless OR the owner's second
// monitor; attribution does not need a composited swap chain, and a headed
// lane on a shared machine loses the foreground to other agents and reports
// their theft as a stall. The cross-engine meter takes the headed measurements.
// Installed Chrome (channel 'chrome'), never bundled Chromium - bundled
// Chromium dies on dxil.dll (Windows error 87) on this machine.
//
// Diagnostic only. No gate, no thresholds. JSON to --out, progress on stderr.
// ===========================================================================
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const DIST = resolve(arg('--dist', 'dist'));
const PORT = Number(arg('--port', '4191'));
const ARENA = arg('--arena', 'atomic-acres');
const SECONDS = Number(arg('--seconds', '75'));
const WARMUP_SECONDS = Number(arg('--warmup', '12'));
const IDLE = flag('--idle');
const LABEL = arg('--label', 'combat');
const OUT = resolve(arg('--out', `artifacts/qa/stall-attribution/${LABEL}.json`));
// Microseconds. 250 us gives ~300k samples over 75 s - enough to resolve a
// 900 ms stall into tens of samples per contributing function.
const SAMPLE_INTERVAL_US = Number(arg('--sample-us', '250'));
// A gap between consecutive rAF callbacks this long is a main-thread block.
// The display cadence here is 8-30 ms; 100 ms is six missed frames.
const STALL_GAP_MS = Number(arg('--stall-gap-ms', '100'));
const BOOT_TIMEOUT_MS = 300_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ktx2': 'image/ktx2',
  '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream',
};

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}: run vite build first`);

// Static server over the LOCAL build. Same bytes the acceptance sweep will
// measure, so the diagnosis and the verification describe one artifact.
const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  const file = join(DIST, relative);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  const body = readFileSync(file);
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));
const BASE = `http://127.0.0.1:${PORT}/`;
console.error(`[attribution] serving ${DIST} on ${BASE}`);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio',
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});

const report = { contract: 'combat-stall-attribution-v1', measuredAt: new Date().toISOString(), label: LABEL, arena: ARENA, idle: IDLE, dist: DIST, seconds: SECONDS };

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 200)));
  const cdp = await page.context().newCDPSession(page);
  // The renderer refuses to author a frame unless the document owns the
  // foreground. Headless has no window manager to grant that, so focus is
  // emulated - the same switch every other headless lane in this repo uses.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => {
    const solo = document.querySelector('#solo');
    return solo !== null && !solo.disabled;
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  report.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  console.error(`[attribution] backend ${report.backend}`);

  await page.evaluate((arena) => {
    const card = document.querySelector(`.map-card[data-arena-id="${arena}"]`);
    if (card) card.click();
    const name = document.querySelector('#player-name');
    if (name) name.value = 'Attribution';
  }, ARENA);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#solo').click());
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return Boolean(snapshot && snapshot.matchPhase === 'active' && snapshot.gameStarted === true);
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  console.error('[attribution] match active; warming up');
  await page.waitForTimeout(WARMUP_SECONDS * 1000);

  // In-page recorder. rAF gaps are the engine-agnostic main-thread-block
  // signal the cross-engine meter already validated; long tasks and heap are
  // recorded alongside so a GC-shaped stall is distinguishable from a
  // compile-shaped one.
  await page.evaluate(() => {
    const state = { raf: [], longTasks: [], heap: [], counters: [] };
    window.__STALL_RECORDER__ = state;
    state.startedAt = performance.now();
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const tick = (now) => {
      if (!state.running) return;
      state.raf.push(Math.round(now * 100) / 100);
      requestAnimationFrame(tick);
    };
    state.running = true;
    requestAnimationFrame(tick);
    try {
      state.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({ atMs: Math.round(entry.startTime * 100) / 100, durationMs: Math.round(entry.duration * 100) / 100 });
        }
      });
      state.observer.observe({ entryTypes: ['longtask'] });
    } catch { state.observer = null; }
    state.heapTimer = setInterval(() => {
      const counters = api.samplePresentationCounters();
      state.heap.push({
        atMs: Math.round(performance.now()),
        heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        completed: counters.completedSequence,
        submitted: counters.submissionSequence,
        calls: counters.calls,
        triangles: counters.triangles,
      });
    }, 250);
  });

  // Combat driver. Same protocol as the cross-engine agent: forward with
  // sprint bursts, strafe pulses, aim at bots, fire in bursts, reload, melee.
  // Never polls snapshot() faster than twice a second - measured 2026-08-31, a
  // 50 ms snapshot() poll drags the animation callback to 20 Hz and invents an
  // instrument-shaped stall in Chrome and Edge at once.
  if (!IDLE) {
    await page.evaluate(() => {
      let step = 0;
      let aliveCache = null;
      let deadSince = null;
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const key = (type, code) => {
        try { window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true })); } catch { /* refused */ }
      };
      window.__COMBAT_TIMER__ = setInterval(() => {
        step += 1;
        try {
          const menu = document.querySelector('#menu');
          if (menu !== null && !menu.classList.contains('hidden')) {
            document.querySelector('#resume')?.click();
            return;
          }
          if (step % 40 === 0) {
            try { aliveCache = api.snapshot().player.alive; } catch { aliveCache = null; }
          }
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
          if (step % 60 === 30) { key('keydown', 'Space'); key('keyup', 'Space'); }
          if (step % 25 === 0) { try { api.aimAtBot?.(); } catch { /* no bot staged */ } }
          if (step % 16 === 0) api.setTriggerHeld?.(true);
          if (step % 16 === 9) api.setTriggerHeld?.(false);
          if (step % 200 === 150) { try { api.reload?.(); } catch { /* refused */ } }
          if (step % 300 === 250) { try { api.melee?.(); } catch { /* refused */ } }
        } catch { /* one bad step must not kill the driver */ }
      }, 50);
    });
  }

  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: SAMPLE_INTERVAL_US });
  // Clock calibration. The CDP profile is stamped in TimeTicks microseconds
  // and the rAF series in performance.now() milliseconds. Reading the page
  // clock either side of Profiler.start brackets the offset, and the bracket
  // WIDTH is reported so a reader can see how tight the correlation is rather
  // than trusting it.
  const beforeStart = await page.evaluate(() => performance.now());
  await cdp.send('Profiler.start');
  const afterStart = await page.evaluate(() => performance.now());

  console.error(`[attribution] profiling ${SECONDS}s of ${IDLE ? 'idle' : 'combat'}`);
  await page.waitForTimeout(SECONDS * 1000);

  const { profile } = await cdp.send('Profiler.stop');
  const recorder = await page.evaluate(() => {
    const state = window.__STALL_RECORDER__;
    state.running = false;
    clearInterval(state.heapTimer);
    if (window.__COMBAT_TIMER__) clearInterval(window.__COMBAT_TIMER__);
    try { state.observer?.disconnect(); } catch { /* gone */ }
    try { window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld?.(false); } catch { /* gone */ }
    try { window.__ATOMIC_ACRES_DEBUG__.setMovement?.(false, false); } catch { /* gone */ }
    return { raf: state.raf, longTasks: state.longTasks, heap: state.heap };
  });

  // -------------------------------------------------------------------------
  // Correlation
  // -------------------------------------------------------------------------
  const pageClockAtProfileStart = (beforeStart + afterStart) / 2;
  const calibrationBracketMs = afterStart - beforeStart;
  // profile timestamps (us) -> page clock (ms)
  const toPageMs = (us) => pageClockAtProfileStart + (us - profile.startTime) / 1000;

  const stalls = [];
  for (let index = 1; index < recorder.raf.length; index += 1) {
    const gapMs = recorder.raf[index] - recorder.raf[index - 1];
    if (gapMs >= STALL_GAP_MS) stalls.push({ startMs: recorder.raf[index - 1], endMs: recorder.raf[index], durationMs: Math.round(gapMs * 100) / 100 });
  }
  const stalledMs = stalls.reduce((sum, stall) => sum + stall.durationMs, 0);
  const windowMs = recorder.raf.length > 1 ? recorder.raf[recorder.raf.length - 1] - recorder.raf[0] : 0;

  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id);
  const labelOf = (node) => {
    const frame = node.callFrame;
    const file = (frame.url || '').split('/').pop() || '(no url)';
    return `${frame.functionName || '(anonymous)'} @ ${file}:${frame.lineNumber + 1}`;
  };
  // The ancestor chain, so a hit inside three.js can be attributed to the
  // application function that called into it.
  const chainOf = (id) => {
    const chain = [];
    let cursor = id;
    for (let depth = 0; depth < 64 && cursor !== undefined; depth += 1) {
      const node = nodesById.get(cursor);
      if (!node) break;
      chain.push(labelOf(node));
      cursor = parentOf.get(cursor);
    }
    return chain;
  };

  let cursorUs = profile.startTime;
  const overall = new Map();
  const inStall = new Map();
  const stallChains = new Map();
  const stallEdges = stalls.map((stall) => ({ start: stall.startMs, end: stall.endMs }));
  const inAnyStall = (pageMs) => stallEdges.some((edge) => pageMs >= edge.start && pageMs <= edge.end);
  let overallSamples = 0;
  let stallSamples = 0;
  const bump = (map, key, weight) => map.set(key, (map.get(key) ?? 0) + weight);

  for (let index = 0; index < profile.samples.length; index += 1) {
    cursorUs += profile.timeDeltas[index] ?? 0;
    const node = nodesById.get(profile.samples[index]);
    if (!node) continue;
    const label = labelOf(node);
    bump(overall, label, 1);
    overallSamples += 1;
    if (!inAnyStall(toPageMs(cursorUs))) continue;
    bump(inStall, label, 1);
    stallSamples += 1;
    const chain = chainOf(profile.samples[index]);
    const key = chain.slice(0, 12).join(' <- ');
    bump(stallChains, key, 1);
  }

  const rank = (map, total) => [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([label, hits]) => ({ label, hits, pct: total === 0 ? 0 : Number(((hits / total) * 100).toFixed(2)) }));

  const overallPct = new Map(rank(overall, overallSamples).map((row) => [row.label, row.pct]));
  const stallRanked = rank(inStall, stallSamples);

  report.pageErrors = pageErrors;
  report.window = {
    windowS: Math.round(windowMs) / 1000,
    rafCallbacks: recorder.raf.length,
    stallCount: stalls.length,
    stallsPerMinute: windowMs > 0 ? Number(((stalls.length / windowMs) * 60000).toFixed(2)) : null,
    frozenFractionPercent: windowMs > 0 ? Number(((stalledMs / windowMs) * 100).toFixed(2)) : null,
    medianStallMs: stalls.length === 0 ? null : [...stalls].sort((a, b) => a.durationMs - b.durationMs)[Math.floor(stalls.length / 2)].durationMs,
    maxStallMs: stalls.length === 0 ? null : Math.max(...stalls.map((stall) => stall.durationMs)),
    longTaskCount: recorder.longTasks.length,
    longTaskMaxMs: recorder.longTasks.length === 0 ? null : Math.max(...recorder.longTasks.map((task) => task.durationMs)),
  };
  const heapValues = recorder.heap.map((row) => row.heapMb).filter((value) => Number.isFinite(value));
  report.heap = heapValues.length === 0 ? null : { minMb: Math.min(...heapValues), maxMb: Math.max(...heapValues), swingMb: Math.max(...heapValues) - Math.min(...heapValues) };
  report.calibration = { pageClockAtProfileStartMs: Math.round(pageClockAtProfileStart), bracketMs: Number(calibrationBracketMs.toFixed(2)), profileSamples: profile.samples.length, sampleIntervalUs: SAMPLE_INTERVAL_US };
  report.attribution = {
    overallSamples,
    stallSamples,
    overall: rank(overall, overallSamples),
    inStall: stallRanked,
    // The finding. Positive delta = this function is over-represented in the
    // frozen milliseconds relative to the window as a whole.
    delta: stallRanked.map((row) => ({ label: row.label, stallPct: row.pct, overallPct: overallPct.get(row.label) ?? 0, deltaPct: Number((row.pct - (overallPct.get(row.label) ?? 0)).toFixed(2)) }))
      .sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 20),
    topStallStacks: [...stallChains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([chain, hits]) => ({ hits, pct: stallSamples === 0 ? 0 : Number(((hits / stallSamples) * 100).toFixed(2)), chain: chain.split(' <- ') })),
  };
  report.stalls = stalls.slice(0, 120);
  report.longTasks = recorder.longTasks.slice(0, 200);
  report.heapSeries = recorder.heap;

  console.error(`[attribution] ${report.window.stallCount} stalls, ${report.window.frozenFractionPercent}% frozen, ${stallSamples}/${overallSamples} samples inside stalls`);
  for (const row of report.attribution.inStall.slice(0, 12)) console.error(`  in-stall ${String(row.pct).padStart(6)}%  ${row.label}`);
} finally {
  await browser.close();
  server.close();
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.error(`\nWrote ${OUT}`);
