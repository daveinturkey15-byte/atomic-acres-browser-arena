// ---------------------------------------------------------------------------
// PRESENTED FRAMES. Not requestAnimationFrame ticks.
//
// WHY THIS FILE EXISTS
// --------------------
// Every FPS number this project produced before 2026-08-31 counted rAF
// callbacks. rAF keeps firing at the display cadence whether or not a frame was
// admitted: submitFrame() returns FALSE when the in-flight cap is reached, the
// rAF loop happily schedules the next callback, and an rAF sampler reports a
// healthy 108 "fps" while the GPU is presenting 54. The owner said "the fps
// feels low"; he was right and the instrument was lying.
//
// WHAT THIS MEASURES
// ------------------
//   presented  - frames the GPU CONFIRMED complete (completedSequence advances,
//                stamped with the runtime's own lastCompletedAt clock). This is
//                the number that corresponds to what the owner sees.
//   submitted  - frames admitted for encode (submissionSequence advances).
//   refused    - submitFrame() calls rejected by admission (skippedSubmissions).
//   rAF        - callbacks. Reported ONLY so the divergence is visible; never
//                as "fps".
//
// The presented series is reconstructed from exact runtime clock stamps, not
// from the sampler's own polling times, so its interval statistics (1% and 0.1%
// lows) are real frame intervals rather than polling quantisation.
//
// USAGE
//   node scripts/qa/run-with-preview-server.mjs \
//     node scripts/qa/measure-presented-frames.mjs --label after --seconds 30
//
//   --url <base>        default http://127.0.0.1:4180
//   --arena <id>        default atomic-acres
//   --label <name>      output file stem, default "run"
//   --seconds <n>       sampling window, default 30
//   --width/--height    viewport, default 2560x1440 (owner's panel)
//   --no-vsync          add --disable-gpu-vsync --disable-frame-rate-limit
//   --idle              skip the combat driver (stand still)
//   --soak              longer window intended to reproduce the latency collapse
//   --out <path>        JSON destination
//
// CHROME: installed Chrome only (channel:'chrome') and always --mute-audio.
// Playwright's bundled Chromium cannot obtain a WebGPU device on this machine
// (dxil.dll, Windows Error 87) and measuring it answers the wrong question.
// ---------------------------------------------------------------------------
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { createServer } from 'node:http';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

let BASE = arg('--url', 'http://127.0.0.1:4180');
const ARENA = arg('--arena', 'atomic-acres');
const LABEL = arg('--label', 'run');
const SECONDS = Number(arg('--seconds', flag('--soak') ? 60 : 30));
const WIDTH = Number(arg('--width', 2560));
const HEIGHT = Number(arg('--height', 1440));
const NO_VSYNC = flag('--no-vsync');
const IDLE = flag('--idle');
const OUT = resolve(arg('--out', `artifacts/presented-frames/${LABEL}.json`));

// ACCEPTANCE NEEDS TWO ENGINES, NOT ONE. The owner's report names Edge as well
// as Firefox, and the published pass81 measurement had Edge 16.2% frozen beside
// Chrome's 17.7%. Playwright drives INSTALLED Edge through channel:'msedge' the
// same way it drives installed Chrome through channel:'chrome' - both are the
// real browser off this machine, and both are headless here. The bundled
// Chromium is never an option: it cannot get a WebGPU device on this machine
// (dxil.dll Windows Error 87).
const CHANNEL = arg('--channel', 'chrome');

// Serve a LOCAL BUILD directly, so a fix can be measured before it is
// published. Without this the instrument can only point at an already-published
// origin, which makes a before/after impossible to run on an unpublished tree.
const DIST = argv.includes('--dist') ? resolve(arg('--dist', '')) : null;
const DIST_PORT = Number(arg('--dist-port', '4188'));

// ---------------------------------------------------------------------------
// GPU sampler. The central evidence that this is not a rendering-cost problem
// is that the GPU sits idle while presentation is pinned, so utilisation,
// clocks and power are part of every measurement, not an afterthought.
// ---------------------------------------------------------------------------
function startGpuSampler(intervalMs = 500) {
  const samples = [];
  const child = spawn('nvidia-smi', [
    '--query-gpu=utilization.gpu,clocks.sm,power.draw,memory.used',
    '--format=csv,noheader,nounits',
    `--loop-ms=${intervalMs}`,
  ], { windowsHide: true });
  child.stdout.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      const parts = line.trim().split(',').map((value) => Number(value.trim()));
      if (parts.length < 4 || parts.some((value) => !Number.isFinite(value))) continue;
      samples.push({ utilisationPercent: parts[0], smClockMhz: parts[1], powerWatts: parts[2], memoryMib: parts[3] });
    }
  });
  child.on('error', () => { /* nvidia-smi absent: report nulls rather than fail the run */ });
  return {
    stop() {
      child.kill();
      if (samples.length === 0) return null;
      const mean = (key) => samples.reduce((total, sample) => total + sample[key], 0) / samples.length;
      const max = (key) => samples.reduce((best, sample) => Math.max(best, sample[key]), 0);
      const min = (key) => samples.reduce((best, sample) => Math.min(best, sample[key]), Number.POSITIVE_INFINITY);
      return {
        samples: samples.length,
        utilisationMeanPercent: round(mean('utilisationPercent')),
        utilisationMaxPercent: max('utilisationPercent'),
        smClockMeanMhz: Math.round(mean('smClockMhz')),
        smClockMinMhz: min('smClockMhz'),
        smClockMaxMhz: max('smClockMhz'),
        powerMeanWatts: round(mean('powerWatts')),
        powerMaxWatts: round(max('powerWatts')),
      };
    },
  };
}

const round = (value, places = 1) => {
  const scale = 10 ** places;
  return Number.isFinite(value) ? Math.round(value * scale) / scale : null;
};

// ---------------------------------------------------------------------------
// Frame-interval statistics. `lows` follow the benchmarking convention: the 1%
// low is the frame rate implied by the 99th-percentile frame INTERVAL, i.e. the
// rate during the worst one percent of frames - not an average of the worst 1%.
// ---------------------------------------------------------------------------
function intervalStatistics(intervalsMs) {
  if (intervalsMs.length === 0) {
    return { frames: 0, medianFps: null, meanFps: null, low1PercentFps: null, low01PercentFps: null, p99IntervalMs: null, maxIntervalMs: null };
  }
  const ordered = [...intervalsMs].sort((a, b) => a - b);
  const at = (fraction) => ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))];
  const total = ordered.reduce((sum, value) => sum + value, 0);
  return {
    frames: ordered.length,
    // The true throughput over the window: frames divided by elapsed time.
    meanFps: round(1_000 / (total / ordered.length)),
    medianFps: round(1_000 / at(0.5)),
    low1PercentFps: round(1_000 / at(0.99)),
    low01PercentFps: round(1_000 / at(0.999)),
    p99IntervalMs: round(at(0.99), 2),
    maxIntervalMs: round(ordered[ordered.length - 1], 2),
  };
}

// ---------------------------------------------------------------------------
// The in-page probe. Installed as a string so it can be re-used by any harness.
// It samples the SORT-FREE counter surface (samplePresentationCounters) both on
// rAF and on a fast timer, so a presented frame that lands between two rAF
// callbacks is still seen. Every recorded presented frame carries the runtime's
// own completion clock stamp, so the interval series is exact.
// ---------------------------------------------------------------------------
const INSTALL_PROBE = () => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  if (!debug?.samplePresentationCounters) throw new Error('samplePresentationCounters is unavailable - build is older than the presented-frame instrument');
  const presented = [];
  const submitted = [];
  const rafTimestamps = [];
  const latencyMs = [];
  const inFlightHistogram = new Map();
  const seconds = [];
  let lastCompletedSequence = -1;
  let lastSubmittedSequence = -1;
  let firstCounters = null;
  let lastCounters = null;
  let running = true;

  // A run is only measuring the renderer while the game is actually playing.
  // The pause menu stops presentation by design, so every recorded frame
  // carries the menu state and paused spans are excluded from the statistics
  // rather than being reported as a renderer that stopped presenting.
  const menuRoot = document.querySelector('#menu');
  const isPlayable = () => menuRoot === null || menuRoot.classList.contains('hidden');
  let unplayableSamples = 0;

  const sample = () => {
    const counters = debug.samplePresentationCounters();
    const playable = isPlayable();
    if (!playable) unplayableSamples += 1;
    firstCounters ??= { ...counters, at: performance.now() };
    lastCounters = { ...counters, at: performance.now() };
    if (counters.completedSequence !== lastCompletedSequence) {
      if (lastCompletedSequence >= 0 && counters.lastCompletedAt !== null) {
        presented.push({
          at: counters.lastCompletedAt,
          advanced: counters.completedSequence - lastCompletedSequence,
          playable,
        });
        if (playable && counters.lastCompletionLatencyMs !== null) latencyMs.push(counters.lastCompletionLatencyMs);
      }
      lastCompletedSequence = counters.completedSequence;
    }
    if (counters.submissionSequence !== lastSubmittedSequence) {
      if (lastSubmittedSequence >= 0 && counters.lastSubmittedAt !== null) submitted.push({ at: counters.lastSubmittedAt, playable });
      lastSubmittedSequence = counters.submissionSequence;
    }
    if (playable) inFlightHistogram.set(counters.inFlightSubmissions, (inFlightHistogram.get(counters.inFlightSubmissions) ?? 0) + 1);
  };

  // One row per wall-clock second. The collapse is a time-series phenomenon:
  // a window average hides that latency walks from 5 ms to 48 ms in three
  // seconds and never comes back.
  let secondStartedAt = performance.now();
  let secondBaseline = null;
  const closeSecond = (now) => {
    const counters = lastCounters;
    if (!counters) return;
    secondBaseline ??= counters;
    if (now - secondStartedAt < 1_000) return;
    const elapsedSeconds = (now - secondStartedAt) / 1_000;
    seconds.push({
      second: seconds.length,
      presentedHz: (counters.completedSequence - secondBaseline.completedSequence) / elapsedSeconds,
      submittedHz: (counters.submissionSequence - secondBaseline.submissionSequence) / elapsedSeconds,
      refusedHz: (counters.skippedSubmissions - secondBaseline.skippedSubmissions) / elapsedSeconds,
      completionLatencyMs: counters.lastCompletionLatencyMs,
      inFlight: counters.inFlightSubmissions,
      starvationRecoveries: counters.starvationRecoveries,
      calls: counters.calls,
      triangles: counters.triangles,
      playable: isPlayable(),
      refreshWarningVisible: document.querySelector('#refresh-warning')?.hidden === false,
      // What the player is reading, beside what was actually presented. The
      // whole point of this instrument is that those two used to disagree.
      hudFps: Number(document.querySelector('#fps-counter b')?.textContent ?? Number.NaN),
    });
    secondStartedAt = now;
    secondBaseline = counters;
  };

  const tick = (now) => {
    if (!running) return;
    rafTimestamps.push({ at: now, playable: isPlayable() });
    sample();
    closeSecond(performance.now());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // 4 ms is well under any presentation interval this game can produce and the
  // counter read is a handful of property loads, so it does not perturb what it
  // is measuring the way a telemetry() poll would.
  const timer = setInterval(sample, 4);

  window.__PRESENTED_FRAME_PROBE__ = {
    stop() {
      running = false;
      clearInterval(timer);
      return {
        presented,
        submitted,
        rafTimestamps,
        latencyMs,
        seconds,
        inFlightHistogram: [...inFlightHistogram.entries()].sort((a, b) => a[0] - b[0]),
        unplayableSamples,
        first: firstCounters,
        last: lastCounters,
      };
    },
  };
};

// ---------------------------------------------------------------------------
// A real combat driver: move, look, and fire. A standing-still camera does not
// reproduce the collapse.
// ---------------------------------------------------------------------------
// Chrome drops pointer lock on its own during long automated runs, and the game
// correctly treats that as "the player opened the pause menu" and stops
// presenting. A measurement that does not notice reports a renderer collapse
// that never happened, so the match is resumed whenever the menu reappears.
// Camera look needs pointer lock (the game reads movementX) and Chrome grants
// it only when the window really is the OS foreground window, so look is
// best-effort; WASD translation moves the camera through the arena either way.
async function ensurePlaying(page) {
  const paused = await page.evaluate(() => {
    const menu = document.querySelector('#menu');
    return menu !== null && !menu.classList.contains('hidden');
  }).catch(() => false);
  if (!paused) return 0;
  const resume = page.locator('#resume');
  if (await resume.isVisible().catch(() => false)) await resume.click().catch(() => {});
  else await page.mouse.click(WIDTH / 2, HEIGHT / 2).catch(() => {});
  await page.waitForTimeout(250);
  return 1;
}

async function driveCombat(page, deadline) {
  const movementKeys = ['KeyW', 'KeyA', 'KeyW', 'KeyD'];
  let index = 0;
  let firing = false;
  let pauseMenuRecoveries = 0;
  while (Date.now() < deadline) {
    pauseMenuRecoveries += await ensurePlaying(page);
    const key = movementKeys[index % movementKeys.length];
    index += 1;
    await page.keyboard.down(key).catch(() => {});
    for (let step = 0; step < 12 && Date.now() < deadline; step += 1) {
      // Pointer-lock look. movementX is what the game reads; a fixed sweep kept
      // near the centre of the surface keeps the run comparable between builds
      // and keeps Chrome from dropping the lock.
      await page.mouse.move(
        WIDTH / 2 + Math.sin(step / 2) * 120,
        HEIGHT / 2 + Math.cos(step / 3) * 40,
      ).catch(() => {});
      if (step % 6 === 0) {
        firing = !firing;
        await page.evaluate((held) => window.__ATOMIC_ACRES_DEBUG__?.setTriggerHeld?.(held), firing).catch(() => {});
      }
      await page.waitForTimeout(60);
    }
    await page.keyboard.up(key).catch(() => {});
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.setTriggerHeld?.(false)).catch(() => {});
  return pauseMenuRecoveries;
}

// ---------------------------------------------------------------------------

// FRAME-PACING LANE, RUN HEADLESS ON PURPOSE - do not "hide" this by parking
// it off-screen instead.
//
// Owner 2026-08-31: QA browsers may not appear on his screen while he works.
// For a lane that measures pacing there are two ways to honour that and only
// one of them is honest:
//
//   HEADED, parked at -32000,-32000  - the window can stop being composited,
//     and an uncomposited window free-runs requestAnimationFrame instead of
//     tracking vsync. The number stays plausible and becomes meaningless.
//   HEADLESS (this)                  - measured on this machine 2026-08-31:
//     installed Chrome via channel:'chrome' gets a real hardware WebGPU
//     device (nvidia / blackwell), renders real frames, and paces rAF at
//     60.4 Hz over a 2 s window - vsync-correct, not free-running.
//
// So headless is both the invisible option AND the trustworthy one here. If
// this lane ever has to go headed again, it must NOT be parked off-screen:
// mark it DECLARED VISIBLE LANE and say why, the way the installed-browser
// lanes do. See scripts/qa/browser-visibility-contract.test.mjs.
// ---------------------------------------------------------------------------
// Optional local-build server. Mirrors the dist directory on loopback so a
// candidate fix is measurable before it is published.
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
let distServer = null;
if (DIST !== null) {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}`);
  distServer = createServer((request, response) => {
    const requested = new URL(request.url, `http://127.0.0.1:${DIST_PORT}`);
    const relative = decodeURIComponent(requested.pathname === '/' ? '/index.html' : requested.pathname).replace(/^\/+/, '');
    const file = join(DIST, relative);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404).end('nope'); return; }
    const body = readFileSync(file);
    response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
    response.end(body);
  });
  await new Promise((ready) => distServer.listen(DIST_PORT, '127.0.0.1', ready));
  BASE = `http://127.0.0.1:${DIST_PORT}`;
}

// ---------------------------------------------------------------------------
// STALL STATISTICS over the PRESENTED series.
//
// The owner's complaint is not a low average, it is a freeze: "it just freezes
// every few seconds ... unplayable". A mean frame rate cannot see that - a run
// that presents perfectly for three seconds and then blocks for 900 ms has a
// respectable mean and is unplayable. These are the numbers that decide whether
// the defect is fixed:
//
//   frozenFractionPercent - share of the playable window inside a stall. This
//                           is the number the player actually experiences.
//   stallsPerMinute       - how often the freeze interrupts play.
//   medianStallMs / max   - how long each interruption lasts.
//
// The floor adapts to the lane: whichever is larger of 100 ms and 5x the lane's
// own median presented interval, so a 60 Hz lane and a 165 Hz lane are judged
// on the same terms rather than the faster one being flattered.
// ---------------------------------------------------------------------------
function stallStatistics(intervalsMs, spanMs) {
  if (intervalsMs.length === 0) return { floorMs: null, count: 0, perMinute: null, medianMs: null, maxMs: null, frozenFractionPercent: null };
  const ordered = [...intervalsMs].sort((a, b) => a - b);
  const median = ordered[Math.floor((ordered.length - 1) * 0.5)];
  const floorMs = Math.max(100, round(median * 5, 2));
  const stalls = intervalsMs.filter((interval) => interval >= floorMs);
  const orderedStalls = [...stalls].sort((a, b) => a - b);
  const frozenMs = stalls.reduce((total, interval) => total + interval, 0);
  return {
    floorMs: round(floorMs, 2),
    count: stalls.length,
    perMinute: round(stalls.length / (spanMs / 60_000)),
    medianMs: orderedStalls.length === 0 ? null : round(orderedStalls[Math.floor((orderedStalls.length - 1) * 0.5)]),
    maxMs: orderedStalls.length === 0 ? null : round(orderedStalls[orderedStalls.length - 1]),
    frozenFractionPercent: round(100 * frozenMs / spanMs, 2),
  };
}

const browser = await chromium.launch({
  headless: true,
  channel: CHANNEL,
  args: [
    ...SILENT_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    ...(NO_VSYNC ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

let result;
const gpu = startGpuSampler();
try {
  await page.goto(`${BASE}/?release=latest&renderer=webgpu`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#solo:not([disabled])', { timeout: 180_000 });
  await page.locator(`.map-card[data-arena-id="${ARENA}"]`).click();
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
    return Boolean(snapshot && snapshot.matchPhase === 'active' && snapshot.gameStarted === true);
  }, undefined, { timeout: 300_000 });

  // Settle: cold pipeline creation and arena streaming are not the steady state
  // the owner plays in, and they would dominate the first seconds of any window.
  await page.waitForTimeout(Number(arg('--warmup', 8)) * 1_000);
  if (!IDLE) await page.mouse.click(WIDTH / 2, HEIGHT / 2).catch(() => {});
  await page.waitForTimeout(1_000);

  const context = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      backend: document.documentElement.dataset.renderBackend ?? null,
      pointerLocked: document.pointerLockElement !== null,
      devicePixelRatio: window.devicePixelRatio,
      drawingBuffer: snapshot.render?.drawingBuffer ?? null,
      pixelRatio: snapshot.render?.pixelRatio ?? null,
      calls: snapshot.render?.calls ?? null,
      triangles: snapshot.render?.triangles ?? null,
      frameRateLimit: snapshot.settings?.graphics?.frameRateLimit ?? null,
      bundle: [...document.querySelectorAll('script[src]')].map((node) => new URL(node.src).pathname).find((path) => path.includes('legacy-main')) ?? null,
    };
  });

  await page.evaluate(INSTALL_PROBE);
  const deadline = Date.now() + SECONDS * 1_000;
  let pauseMenuRecoveries = 0;
  if (IDLE) await page.waitForTimeout(SECONDS * 1_000);
  else pauseMenuRecoveries = await driveCombat(page, deadline);
  const raw = await page.evaluate(() => window.__PRESENTED_FRAME_PROBE__.stop());
  // A window that stopped presenting has to say WHY. Without this, a run that
  // lost pointer lock, opened the pause menu or lost focus reads exactly like a
  // renderer that collapsed.
  const endState = await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug.snapshot();
    return {
      matchPhase: snapshot.matchPhase ?? null,
      gameStarted: snapshot.gameStarted ?? null,
      alive: snapshot.player?.alive ?? null,
      hasFocus: document.hasFocus(),
      visibility: document.visibilityState,
      pointerLocked: document.pointerLockElement !== null,
      menuHidden: document.querySelector('#menu')?.classList.contains('hidden') ?? null,
      simulationGate: debug.sampleSimulationGate?.() ?? null,
      presentation: debug.samplePresentationTelemetry(),
      hudFps: snapshot.render?.fpsCounter ?? null,
      // What the HUD believes, so a run can prove the readout agrees with the
      // presented frames measured beside it instead of asserting that it does.
      framePacing: snapshot.render?.framePacing ?? null,
      refreshWarning: (() => {
        const banner = document.querySelector('#refresh-warning');
        return banner === null ? null : {
          hidden: banner.hidden,
          headline: banner.querySelector('strong')?.textContent ?? null,
          detail: banner.querySelector('span')?.textContent ?? null,
        };
      })(),
    };
  });

  // Only playable spans count. An interval whose either end fell in a paused or
  // pointer-lock-lost span says nothing about presentation.
  const playableIntervals = (entries, expand = () => 1) => {
    const intervals = [];
    for (let index = 1; index < entries.length; index += 1) {
      const current = entries[index];
      const previous = entries[index - 1];
      if (!current.playable || !previous.playable) continue;
      const gapMs = current.at - previous.at;
      const shares = Math.max(1, expand(current));
      // A probe that retires several sequences at once presented several frames
      // in that gap; charge each an equal share rather than inventing one very
      // long frame.
      for (let share = 0; share < shares; share += 1) intervals.push(gapMs / shares);
    }
    return intervals;
  };
  const playableSpanMs = (entries) => {
    let total = 0;
    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index].playable && entries[index - 1].playable) total += entries[index].at - entries[index - 1].at;
    }
    return total;
  };

  const elapsedMs = raw.last.at - raw.first.at;
  const presentedIntervals = playableIntervals(raw.presented, (entry) => entry.advanced);
  const submittedIntervals = playableIntervals(raw.submitted);
  const rafIntervals = playableIntervals(raw.rafTimestamps);
  const presentedSpanMs = playableSpanMs(raw.presented);
  const submittedSpanMs = playableSpanMs(raw.submitted);
  const rafSpanMs = playableSpanMs(raw.rafTimestamps);
  const orderedLatency = [...raw.latencyMs].sort((a, b) => a - b);
  const latencyAt = (fraction) => orderedLatency.length === 0
    ? null
    : orderedLatency[Math.min(orderedLatency.length - 1, Math.floor((orderedLatency.length - 1) * fraction))];

  const presentedFrames = raw.last.completedSequence - raw.first.completedSequence;
  const submittedFrames = raw.last.submissionSequence - raw.first.submissionSequence;
  const refusedFrames = raw.last.skippedSubmissions - raw.first.skippedSubmissions;

  result = {
    label: LABEL,
    arena: ARENA,
    seconds: SECONDS,
    channel: CHANNEL,
    source: DIST ?? BASE,
    vsync: NO_VSYNC ? 'disabled' : 'browser-default',
    driver: IDLE ? 'idle' : 'combat',
    viewport: { width: WIDTH, height: HEIGHT },
    context,
    endState,
    pauseMenuRecoveries,
    unplayableSamples: raw.unplayableSamples,
    elapsedMs: round(elapsedMs),
    // THE HEADLINE. Frames the GPU confirmed, per second of wall clock.
    playableSeconds: round(presentedSpanMs / 1_000),
    presented: {
      ...intervalStatistics(presentedIntervals),
      framesPerSecondOverWindow: round(presentedIntervals.length / (presentedSpanMs / 1_000)),
      framesOverWholeWindow: presentedFrames,
    },
    // The freeze, in the terms the owner reported it.
    presentedStalls: stallStatistics(presentedIntervals, presentedSpanMs),
    submitted: {
      ...intervalStatistics(submittedIntervals),
      framesPerSecondOverWindow: round(submittedIntervals.length / (submittedSpanMs / 1_000)),
      framesOverWholeWindow: submittedFrames,
    },
    // Reported to expose the divergence, never as a frame rate.
    animationFrameCallbacks: {
      ...intervalStatistics(rafIntervals),
      callbacksPerSecondOverWindow: round(rafIntervals.length / (rafSpanMs / 1_000)),
    },
    refused: {
      total: refusedFrames,
      perSecond: round(refusedFrames / (presentedSpanMs / 1_000)),
      // Of every admission attempt the frame loop made, this share was refused.
      sharePercent: round(100 * refusedFrames / Math.max(1, refusedFrames + submittedFrames)),
    },
    completionLatencyMs: {
      samples: orderedLatency.length,
      median: round(latencyAt(0.5), 2),
      p95: round(latencyAt(0.95), 2),
      p99: round(latencyAt(0.99), 2),
      max: round(orderedLatency[orderedLatency.length - 1], 2),
    },
    inFlightHistogram: raw.inFlightHistogram,
    starvationRecoveries: raw.last.starvationRecoveries - raw.first.starvationRecoveries,
    maximumInFlightSubmissions: raw.last.maximumInFlightSubmissions,
    gpu: null,
    perSecond: raw.seconds.map((row) => ({
      second: row.second,
      presentedHz: round(row.presentedHz),
      submittedHz: round(row.submittedHz),
      refusedHz: round(row.refusedHz),
      completionLatencyMs: round(row.completionLatencyMs, 2),
      inFlight: row.inFlight,
      refreshWarningVisible: row.refreshWarningVisible,
      hudFps: row.hudFps,
      starvationRecoveries: row.starvationRecoveries,
      calls: row.calls,
      triangles: row.triangles,
    })),
  };
} finally {
  result = result ?? { label: LABEL, failed: true };
  result.gpu = gpu.stop();
  await browser.close();
  if (distServer !== null) await new Promise((done) => distServer.close(done));
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  label: result.label,
  presentedMedianFps: result.presented?.medianFps ?? null,
  presentedMeanFps: result.presented?.meanFps ?? null,
  presented1PercentLowFps: result.presented?.low1PercentFps ?? null,
  presented01PercentLowFps: result.presented?.low01PercentFps ?? null,
  channel: result.channel ?? null,
  frozenFractionPercent: result.presentedStalls?.frozenFractionPercent ?? null,
  stallsPerMinute: result.presentedStalls?.perMinute ?? null,
  medianStallMs: result.presentedStalls?.medianMs ?? null,
  maxStallMs: result.presentedStalls?.maxMs ?? null,
  submittedFps: result.submitted?.framesPerSecondOverWindow ?? null,
  rafPerSecond: result.animationFrameCallbacks?.callbacksPerSecondOverWindow ?? null,
  refusedPerSecond: result.refused?.perSecond ?? null,
  refusedSharePercent: result.refused?.sharePercent ?? null,
  completionLatencyMedianMs: result.completionLatencyMs?.median ?? null,
  completionLatencyP99Ms: result.completionLatencyMs?.p99 ?? null,
  gpuUtilisationMeanPercent: result.gpu?.utilisationMeanPercent ?? null,
  gpuUtilisationMaxPercent: result.gpu?.utilisationMaxPercent ?? null,
  starvationRecoveries: result.starvationRecoveries ?? null,
  playableSeconds: result.playableSeconds ?? null,
  pauseMenuRecoveries: result.pauseMenuRecoveries ?? null,
  out: OUT,
}, null, 2));
