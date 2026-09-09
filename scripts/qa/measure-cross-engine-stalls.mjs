#!/usr/bin/env node
// ===========================================================================
// CROSS-ENGINE STALL METER. One instrument, three engines, presented frames.
//
// THE REPORT IT EXISTS TO ANSWER
// ------------------------------
// Owner, 2026-08-31: "it just freezes every few seconds in firefox, mega
// unstable! same issue with edge, unplayable."
//
// "Freezes every few seconds" is a PERIODIC STALL, and a median frame time
// cannot see one: a run that presents perfectly for 2.8 seconds and then blocks
// for 400 ms has an excellent median and is unplayable. This instrument reports
// the period and the duration of the stalls, the 1% and 0.1% lows, and - the
// part that decides the fix - WHICH KIND of stall it is.
//
// WHY IT IS NOT THE EXISTING CHROME INSTRUMENT
// --------------------------------------------
// scripts/qa/measure-presented-frames.mjs drives installed Chrome through
// Playwright and is the right tool for Chrome. It cannot answer this question,
// because installed Firefox is not drivable on this machine at all (Playwright
// ships a patched Gecko of its own; stock Firefox needs geckodriver, and a
// disposable `-profile` costs the content document its focus - the exact state
// the game refuses to render in). Everything measured through it is therefore
// Chrome, and the in-flight cap and per-submission completion probes now
// shipping to every player were tuned against exactly that one engine.
//
// So this harness inverts the direction: it MIRRORS the shipped build from a
// local origin, injects one classic script into the document
// (scripts/qa/lib/cross-engine-stall-agent.js), and lets the page measure
// itself and POST the series home. Every engine that can open a URL is
// therefore measurable, and all three run byte-identical application code -
// the published bundle, not a rebuild of it.
//
// USAGE
//   node scripts/qa/measure-cross-engine-stalls.mjs \
//     --lanes chrome,edge,firefox --seconds 180 --label before
//
//   --url <base>     what to mirror. Default: the published pass81 channel.
//                    Point it at http://127.0.0.1:4180 (run-with-preview-server)
//                    to measure a local build before publishing.
//   --lanes          chrome,edge,firefox (comma separated, run in order)
//   --arena <id>     default atomic-acres
//   --seconds <n>    sampling window per lane, default 180
//   --warmup <n>     seconds discarded before sampling, default 12
//   --idle           no combat driver (stand still)
//   --stall-ms <n>   stall floor. Default: whichever is larger of 50 ms and
//                    5x the lane's own median presented interval, so a 165 Hz
//                    lane and a 60 Hz lane are judged on the same terms.
//   --label <name>   output stem, default "run"
//   --out <path>     JSON destination
//   --port <n>       mirror + receiver port, default 4187
//
// DECLARED VISIBLE LANE, muted, and off the owner's primary screen.
//
// Every browser opens at --window-position=2560,0, the owner's
// SECOND monitor, sized to fit it; Firefox has no position switch so it is
// moved there by scripts/qa/win-place-window.ps1 the moment it appears. All
// three are muted. They are deliberately NOT parked off-screen: an
// uncomposited window free-runs requestAnimationFrame instead of tracking
// vsync, so parking this lane would not hide the measurement, it would replace
// it with a better-looking fiction. See browser-visibility-contract.test.mjs.
// ===========================================================================
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  BROWSER_LANES,
  foregroundWindow,

  killByToken,
  closeGracefully,
  competingBrowserAutomation,
} from './installed-browser-lanes.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const AGENT_PATH = join(SCRIPT_DIR, 'lib/cross-engine-stall-agent.js');

const PUBLISHED_PASS81 = 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass81/';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const TARGET = arg('--url', PUBLISHED_PASS81).replace(/\/?$/, '/');
const LANES = arg('--lanes', 'chrome,edge,firefox').split(',').map((entry) => entry.trim()).filter(Boolean);
const ARENA = arg('--arena', 'atomic-acres');
const SECONDS = Number(arg('--seconds', '180'));
const WARMUP_SECONDS = Number(arg('--warmup', '12'));
const IDLE = flag('--idle');
const STALL_FLOOR_MS = argv.includes('--stall-ms') ? Number(arg('--stall-ms', '50')) : null;
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '4187'));
const OUT = resolve(arg('--out', `artifacts/qa/cross-engine-stalls/${LABEL}.json`));
// The owner's second monitor. Verified 2026-08-31: DISPLAY7 at 2560,0, 2048x1152.
const WINDOW_X = Number(arg('--window-x', '2560'));
const WINDOW_Y = Number(arg('--window-y', '0'));
const WINDOW_W = Number(arg('--window-w', '1920'));
const WINDOW_H = Number(arg('--window-h', '1080'));

// A NAMED, PERSISTENT browser profile instead of a fresh one per run.
//
// This is the cold-versus-warm control, and it is the difference between the
// owner's Chrome and the owner's Firefox. Chromium keeps a compiled-pipeline
// cache on disk inside the profile, so a browser somebody has played the game
// in before never pays first-use shader compilation again - while a QA lane on
// a throwaway --user-data-dir pays all of it, every run. Running the same lane
// twice against the same profile is what separates "this build stutters" from
// "this build stutters until the driver cache is warm".
const PROFILE_NAME = arg('--profile', null);

const CACHE_DIR = join(tmpdir(), 'atomic-acres-xengine-mirror', createHash('sha1').update(TARGET).digest('hex').slice(0, 12));
mkdirSync(CACHE_DIR, { recursive: true });

const round = (value, places = 2) => {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

// ---------------------------------------------------------------------------
// The mirror. Serves the target build from 127.0.0.1 with one script injected,
// and collects the agent's POSTs on the same origin - so there is no CORS
// surface, no mixed-content question, and no way for a measurement to leave
// this machine.
//
// Upstream bodies are cached on disk. That is not only for speed: it is what
// guarantees the three engines are handed the SAME BYTES, which is the whole
// premise of comparing them.
// ---------------------------------------------------------------------------
function startMirror({ port, onPayload }) {
  const agentSource = readFileSync(AGENT_PATH, 'utf8');
  const injection = `<script>\n${agentSource}\n</script>`;
  const inFlight = new Map();

  async function upstream(pathname, search) {
    const key = createHash('sha1').update(pathname + search).digest('hex');
    const bodyPath = join(CACHE_DIR, `${key}.body`);
    const metaPath = join(CACHE_DIR, `${key}.meta`);
    if (existsSync(bodyPath) && existsSync(metaPath)) {
      return { body: readFileSync(bodyPath), meta: JSON.parse(readFileSync(metaPath, 'utf8')) };
    }
    if (inFlight.has(key)) return inFlight.get(key);
    const task = (async () => {
      const response = await fetch(new URL(pathname.replace(/^\//, '') + search, TARGET));
      const body = Buffer.from(await response.arrayBuffer());
      const meta = {
        status: response.status,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      };
      if (response.ok) {
        writeFileSync(bodyPath, body);
        writeFileSync(metaPath, JSON.stringify(meta));
      }
      return { body, meta };
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (request.method === 'POST' && url.pathname === '/__xstall') {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('ok');
        try { onPayload(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) {
          onPayload({ error: `bad-json: ${String(error).slice(0, 120)}` });
        }
      });
      return;
    }
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    upstream(pathname, '').then(({ body, meta }) => {
      if (meta.contentType.includes('text/html')) {
        let html = body.toString('utf8');
        // Injected into <head> as a CLASSIC script: it must run before the
        // deferred module bundle so its error handlers are installed for the
        // application's own bootstrap.
        html = html.includes('<head>') ? html.replace('<head>', `<head>\n${injection}`) : `${injection}\n${html}`;
        const out = Buffer.from(html, 'utf8');
        response.writeHead(meta.status, { 'content-type': meta.contentType, 'cache-control': 'no-store', 'content-length': out.length });
        response.end(out);
        return;
      }
      response.writeHead(meta.status, { 'content-type': meta.contentType, 'content-length': body.length });
      response.end(body);
    }).catch((error) => {
      response.writeHead(502, { 'content-type': 'text/plain' });
      response.end(String(error).slice(0, 200));
    });
  });

  return new Promise((ready) => {
    server.listen(port, '127.0.0.1', () => ready(server));
  });
}

// ---------------------------------------------------------------------------
// Statistics.
//
// `lows` follow the benchmarking convention: the 1% low is the frame rate
// implied by the 99th-percentile frame INTERVAL - the rate during the worst one
// percent of frames - not an average over them.
// ---------------------------------------------------------------------------
function intervalStatistics(intervals) {
  if (intervals.length === 0) return { frames: 0 };
  const ordered = [...intervals].sort((a, b) => a - b);
  const at = (fraction) => ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))];
  const total = ordered.reduce((sum, value) => sum + value, 0);
  return {
    frames: ordered.length,
    elapsedS: round(total / 1000),
    meanFps: round(1000 / (total / ordered.length)),
    medianFps: round(1000 / at(0.5)),
    low1PercentFps: round(1000 / at(0.99)),
    low01PercentFps: round(1000 / at(0.999)),
    medianMs: round(at(0.5)),
    p99Ms: round(at(0.99)),
    maxMs: round(ordered[ordered.length - 1]),
  };
}

/**
 * Group long intervals into stall EVENTS and describe their rhythm.
 *
 * The owner's complaint is about rhythm, not magnitude: "every few seconds" is
 * a period, and a period is only visible once consecutive long intervals are
 * collapsed into one event and the gaps BETWEEN events are measured.
 */
function stallStatistics(stamps, intervals, thresholdMs) {
  const events = [];
  let current = null;
  for (let index = 0; index < intervals.length; index += 1) {
    if (intervals[index] >= thresholdMs) {
      if (current === null) current = { startAt: stamps[index], endAt: stamps[index + 1], durationMs: intervals[index], frames: 1 };
      else { current.endAt = stamps[index + 1]; current.durationMs += intervals[index]; current.frames += 1; }
    } else if (current !== null) { events.push(current); current = null; }
  }
  if (current !== null) events.push(current);

  const windowMs = stamps.length > 1 ? stamps[stamps.length - 1] - stamps[0] : 0;
  const durations = events.map((event) => event.durationMs).sort((a, b) => a - b);
  const periods = [];
  for (let index = 1; index < events.length; index += 1) periods.push(events[index].startAt - events[index - 1].startAt);
  periods.sort((a, b) => a - b);
  const at = (values, fraction) => (values.length === 0 ? null : values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))]);
  const frozenMs = durations.reduce((sum, value) => sum + value, 0);

  return {
    thresholdMs: round(thresholdMs),
    windowS: round(windowMs / 1000),
    count: events.length,
    perMinute: windowMs > 0 ? round((events.length / windowMs) * 60000) : null,
    medianPeriodS: round(at(periods, 0.5) / 1000),
    minPeriodS: round(periods[0] / 1000),
    maxPeriodS: round(periods[periods.length - 1] / 1000),
    medianDurationMs: round(at(durations, 0.5)),
    p90DurationMs: round(at(durations, 0.9)),
    maxDurationMs: round(durations[durations.length - 1]),
    frozenFractionPercent: windowMs > 0 ? round((frozenMs / windowMs) * 100) : null,
    events: events.slice(0, 200).map((event) => ({
      atS: round((event.startAt - stamps[0]) / 1000),
      durationMs: round(event.durationMs),
    })),
  };
}

/**
 * WHICH KIND of stall this is - the finding that decides the fix.
 *
 * A main-thread block (shader/pipeline compilation, GC, a texture upload)
 * freezes the requestAnimationFrame callback too. Queue backpressure does not:
 * rAF keeps ticking at the display cadence while admission refuses frames, and
 * presentation alone goes quiet. Those two have opposite remedies, so the
 * instrument classifies rather than assumes.
 */
function classifyStalls(events, rafStamps, originAt) {
  if (events.length === 0 || rafStamps.length < 2) return { classified: 0 };
  // The two series carry different clocks: presented frames are stamped with
  // the runtime's completion clock, rAF with its callback timestamp. Both are
  // performance.now() on the same document, so they are directly comparable.
  const rafGaps = [];
  for (let index = 1; index < rafStamps.length; index += 1) {
    rafGaps.push({ startAt: rafStamps[index - 1], endAt: rafStamps[index], gapMs: rafStamps[index] - rafStamps[index - 1] });
  }
  let mainThread = 0;
  let presentationOnly = 0;
  const matched = [];
  for (const event of events) {
    let worst = 0;
    for (const gap of rafGaps) {
      if (gap.endAt < event.startAt - 50 || gap.startAt > event.endAt + 50) continue;
      if (gap.gapMs > worst) worst = gap.gapMs;
    }
    const isMainThread = worst >= event.durationMs * 0.6;
    if (isMainThread) mainThread += 1; else presentationOnly += 1;
    matched.push({ atS: round((event.startAt - originAt) / 1000), stallMs: round(event.durationMs), worstRafGapMs: round(worst), kind: isMainThread ? 'main-thread' : 'presentation-only' });
  }
  return {
    classified: events.length,
    mainThread,
    presentationOnly,
    verdict: mainThread > presentationOnly ? 'main-thread-block' : 'presentation-backpressure',
    sample: matched.slice(0, 40),
  };
}

function analyse(payload) {
  const series = payload.series;
  const stamps = series.presentedAt;
  const playable = series.presentedPlayable;
  // Only spans whose BOTH ends were playable. The pause menu stops presentation
  // by design; counting that as a renderer stall is how an instrument invents a
  // collapse that never happened.
  const intervals = [];
  const intervalStamps = [];
  for (let index = 1; index < stamps.length; index += 1) {
    if (!playable[index] || !playable[index - 1]) continue;
    const gap = stamps[index] - stamps[index - 1];
    if (!Number.isFinite(gap) || gap <= 0 || gap > 30000) continue;
    intervals.push(gap);
    intervalStamps.push(stamps[index - 1]);
  }
  intervalStamps.push(stamps[stamps.length - 1]);

  const presented = intervalStatistics(intervals);
  const rafIntervals = [];
  for (let index = 1; index < series.rafAt.length; index += 1) {
    const gap = series.rafAt[index] - series.rafAt[index - 1];
    if (gap > 0 && gap < 30000) rafIntervals.push(gap);
  }
  const raf = intervalStatistics(rafIntervals);

  const threshold = STALL_FLOOR_MS ?? Math.max(50, (presented.medianMs ?? 16) * 5);
  const stalls = stallStatistics(intervalStamps, intervals, threshold);

  const events = [];
  let current = null;
  for (let index = 0; index < intervals.length; index += 1) {
    if (intervals[index] >= threshold) {
      if (current === null) current = { startAt: intervalStamps[index], endAt: intervalStamps[index + 1], durationMs: intervals[index] };
      else { current.endAt = intervalStamps[index + 1]; current.durationMs += intervals[index]; }
    } else if (current !== null) { events.push(current); current = null; }
  }
  if (current !== null) events.push(current);
  const classification = classifyStalls(events, series.rafAt, intervalStamps[0] ?? 0);

  // Latency drift: the Chrome collapse signature. If completion latency in the
  // last ten seconds is several times its value in the first ten, the fence is
  // walking and never recovering.
  const seconds = series.seconds ?? [];
  const latencyOf = (rows) => {
    const values = rows.map((row) => row.completionLatencyMs).filter((value) => Number.isFinite(value));
    return values.length === 0 ? null : round(values.reduce((sum, value) => sum + value, 0) / values.length);
  };
  const bufferSizes = [...new Set(seconds.map((row) => `${row.bufferWidth}x${row.bufferHeight}`))];
  const heapValues = seconds.map((row) => row.heapMb).filter((value) => Number.isFinite(value));

  return {
    lane: payload.lane,
    arena: payload.arena,
    context: payload.context,
    endState: payload.endState,
    driver: payload.driver,
    errors: payload.errors,
    presented,
    raf,
    stalls,
    classification,
    queue: {
      inFlightHistogram: series.inFlightHistogram,
      maxInFlight: seconds.length > 0 ? seconds[seconds.length - 1].maxInFlight : null,
      refusedPerSecondMean: seconds.length === 0 ? null
        : round(seconds.reduce((sum, row) => sum + (row.refusedHz ?? 0), 0) / seconds.length),
      starvationRecoveriesTotal: seconds.length === 0 ? null : seconds[seconds.length - 1].starvationRecoveries,
      starvationRecoveriesDuringWindow: seconds.length < 2 ? null
        : seconds[seconds.length - 1].starvationRecoveries - seconds[0].starvationRecoveries,
      completionLatencyFirst10sMs: latencyOf(seconds.slice(0, 10)),
      completionLatencyLast10sMs: latencyOf(seconds.slice(-10)),
      completionLatencyMaxMs: round(Math.max(0, ...seconds.map((row) => row.completionLatencyMs ?? 0))),
      outstandingProbesMax: Math.max(0, ...seconds.map((row) => row.outstandingProbes ?? 0)),
    },
    quality: {
      // Distinct drawing-buffer sizes over the window. More than one means the
      // adaptive pixel-ratio controller moved; many means it is oscillating.
      distinctBufferSizes: bufferSizes,
      bufferChanges: bufferSizes.length - 1,
      devicePixelRatio: seconds.length > 0 ? seconds[0].devicePixelRatio : null,
    },
    memory: heapValues.length === 0 ? null : {
      minMb: Math.min(...heapValues),
      maxMb: Math.max(...heapValues),
      swingMb: Math.max(...heapValues) - Math.min(...heapValues),
    },
    longTasks: {
      supported: series.longTaskSupported,
      count: (series.longTasks ?? []).length,
      maxMs: Math.max(0, ...(series.longTasks ?? []).map((task) => task.durationMs)),
      over100ms: (series.longTasks ?? []).filter((task) => task.durationMs >= 100).length,
    },
    seconds,
  };
}

// ---------------------------------------------------------------------------
// Lane launch
// ---------------------------------------------------------------------------
/** Processes of this browser that actually own a window - see runLane. */
function windowedProcesses(processName) {
  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `@(Get-Process -Name '${processName}' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.Id }) -join ','`,
    ], { encoding: 'utf8', timeout: 20_000, windowsHide: true });
    return output.trim().split(',').map((entry) => entry.trim()).filter(Boolean);
  } catch { return []; }
}

function executableFor(lane) {
  return lane.candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function placeWindow({ token, anyWindow, processName }) {
  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', join(SCRIPT_DIR, 'win-place-window.ps1'),
      ...(token ? ['-Token', token] : []),
      ...(anyWindow ? ['-AnyWindow'] : []),
      '-ProcessName', processName,
      '-X', String(WINDOW_X), '-Y', String(WINDOW_Y),
      '-Width', String(WINDOW_W), '-Height', String(WINDOW_H),
    ], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
    return JSON.parse(output.trim().split(/\r?\n/).filter(Boolean).at(-1) ?? '{}');
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 200) };
  }
}

async function runLane(laneId, url, awaitResult) {
  const lane = BROWSER_LANES[laneId];
  if (!lane) return { lane: laneId, verdict: 'unknown-lane' };
  const executable = executableFor(lane);
  if (!executable) return { lane: laneId, verdict: 'not-installed' };

  if (lane.usesDefaultProfile) {
    // A leftover instance owns the remoting handoff and would swallow the URL,
    // so a running browser blocks this lane. But "running" has to mean a
    // process WITH A WINDOW: measured 2026-08-31, an exited firefox.exe left a
    // zero-working-set entry in the process table from the night before, and a
    // bare process-name check refused the lane over a corpse. Refusing to
    // measure is the right call for a real window and the wrong one for that.
    const blocking = windowedProcesses(lane.processName);
    if (blocking.length > 0) {
      return {
        lane: laneId,
        verdict: 'blocked',
        reason: `${lane.label} already has ${blocking.length} window(s) open (pid ${blocking.join(', ')}); the default-profile lane cannot measure through it`,
      };
    }
  }

  let token = null;
  let args;
  const env = { ...process.env, ...(lane.env ?? {}) };
  if (lane.usesDefaultProfile) {
    args = ['-private-window', url];
  } else {
    let profile;
    if (PROFILE_NAME) {
      profile = join(tmpdir(), `xstall-profile-${PROFILE_NAME}-${laneId}`);
      mkdirSync(profile, { recursive: true });
    } else {
      profile = mkdtempSync(join(tmpdir(), `xstall-${laneId}-`));
    }
    token = profile;
    const base = [
      `--user-data-dir=${profile}`,
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      // HARD RULE: never on the owner's primary screen. 2560,0 is his second
      // monitor - a real, composited display, not an off-screen park.
      `--window-position=${WINDOW_X},${WINDOW_Y}`,
      `--window-size=${WINDOW_W},${WINDOW_H}`,
      '--new-window',
    ];
    if (laneId === 'edge') {
      base.unshift('--inprivate', '--disable-sync', '--disable-extensions', '--no-service-autorun');
      base.push('--disable-features=msImplicitSignin,msEdgeFre,msEdgeShoppingAssistant,CalculateNativeWinOcclusion');
    }
    args = [...base, url];
  }

  const child = spawn(executable, args, { stdio: 'ignore', windowsHide: false, env, detached: false });
  child.on('error', () => { /* launcher stub exits immediately on some browsers */ });

  // Give the window time to exist before taking the foreground and placing it.
  await new Promise((wait) => setTimeout(wait, 6_000));
  const placement = placeWindow({ token, anyWindow: token === null, processName: lane.processName });
  // Real click, not a posted one: content focus AND pointer lock both need
  // genuine user activation, and without the lock the game disables gameplay
  // input and the camera cannot look around.
  const foreground = foregroundWindow({
    token: token ?? undefined,
    anyWindow: token === null,
    processName: lane.processName,
    scriptDir: SCRIPT_DIR,
    realClick: true,
  });

  // Hold the foreground for the whole window. On a shared machine another
  // agent's PowerShell or a notification steals it, the renderer legitimately
  // stops presenting, and the run reports a collapse the game never had.
  const holdMs = (WARMUP_SECONDS + SECONDS) * 1000 + 120_000;
  const watchdog = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(SCRIPT_DIR, 'win-hold-foreground.ps1'),
    ...(token ? ['-Token', token] : ['-AnyWindow']),
    '-ProcessName', lane.processName,
    '-DurationMs', String(holdMs),
  ], { windowsHide: true });
  const reassertions = [];
  watchdog.stdout.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { reassertions.push(JSON.parse(trimmed)); } catch { /* partial line */ }
    }
  });

  const result = await awaitResult(laneId);
  watchdog.kill();

  // A second real click before teardown is pointless; release cleanly instead.
  if (lane.usesDefaultProfile) {
    foregroundWindow({ anyWindow: true, processName: lane.processName, scriptDir: SCRIPT_DIR, closeOnly: true });
    await closeGracefully(lane.processName);
  } else if (token) {
    killByToken(token);
  }
  await new Promise((wait) => setTimeout(wait, 2_000));

  return { lane: laneId, executable, placement, foreground, foregroundReassertions: reassertions, ...result };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const competing = competingBrowserAutomation({ selfScript: 'measure-cross-engine-stalls.mjs' });
if (competing.length > 0) {
  console.log(`WARNING: other browser automation is live (${competing.join(', ')}). The Windows foreground is a single global resource; these numbers may be contaminated.`);
}

const pending = new Map();
const beacons = [];

const server = await startMirror({
  port: PORT,
  onPayload(payload) {
    const lane = payload.lane ?? 'unknown';
    if (payload.stage === 'result' || payload.error) {
      const waiter = pending.get(lane);
      if (waiter) { pending.delete(lane); waiter(payload); }
      return;
    }
    beacons.push({ lane, stage: payload.stage, at: new Date().toISOString() });
    console.log(`  [${lane}] ${payload.stage}${payload.backend ? ` backend=${payload.backend}` : ''}${payload.pointerLocked === undefined ? '' : ` pointerLock=${payload.pointerLocked}`}${payload.hasFocus === undefined ? '' : ` focus=${payload.hasFocus}`}`);
  },
});

const laneTimeoutMs = (WARMUP_SECONDS + SECONDS) * 1000 + 420_000;
const awaitResult = (laneId) => new Promise((settle) => {
  const timer = setTimeout(() => { pending.delete(laneId); settle({ error: 'lane-timeout' }); }, laneTimeoutMs);
  pending.set(laneId, (payload) => { clearTimeout(timer); settle(payload); });
});

const lanes = [];
console.log(`Mirroring ${TARGET} on http://127.0.0.1:${PORT}/  (cache ${CACHE_DIR})`);
for (const laneId of LANES) {
  const url = `http://127.0.0.1:${PORT}/?release=latest&renderer=webgpu&xstall=1`
    + `&xstallLane=${encodeURIComponent(laneId)}&xstallArena=${encodeURIComponent(ARENA)}`
    + `&xstallSampleMs=${SECONDS * 1000}&xstallWarmupMs=${WARMUP_SECONDS * 1000}${IDLE ? '&xstallIdle=1' : ''}`;
  console.log(`\n=== ${laneId} ===`);
  const started = Date.now();
  const raw = await runLane(laneId, url, awaitResult);
  const elapsedS = Math.round((Date.now() - started) / 1000);
  if (raw.series) {
    const analysed = analyse(raw);
    lanes.push({ ...analysed, executable: raw.executable, placement: raw.placement, foreground: raw.foreground, foregroundReassertions: raw.foregroundReassertions ?? [], elapsedS });
    const { presented, stalls, classification } = analysed;
    console.log(`  presented ${presented.meanFps} fps mean · median ${presented.medianFps} · 1% low ${presented.low1PercentFps} · 0.1% low ${presented.low01PercentFps}`);
    console.log(`  stalls >=${stalls.thresholdMs} ms: ${stalls.count} in ${stalls.windowS}s (${stalls.perMinute}/min) · period median ${stalls.medianPeriodS}s · duration median ${stalls.medianDurationMs} ms / max ${stalls.maxDurationMs} ms · frozen ${stalls.frozenFractionPercent}% of the window`);
    console.log(`  kind: ${classification.verdict} (main-thread ${classification.mainThread} / presentation-only ${classification.presentationOnly})`);
    const unfocused = analysed.seconds.filter((row) => row.hasFocus === false).length;
    if (unfocused > 0 || (raw.foregroundReassertions ?? []).length > 0) {
      console.log(`  contested: ${unfocused}s without document focus, ${(raw.foregroundReassertions ?? []).length} foreground reassertions${(raw.foregroundReassertions ?? []).length > 0 ? ` (stolen by ${[...new Set(raw.foregroundReassertions.map((entry) => entry.stolenBy))].join(', ')})` : ''}`);
    }
  } else {
    lanes.push({ lane: laneId, verdict: raw.verdict ?? 'failed', reason: raw.reason ?? raw.error ?? null, errors: raw.errors ?? null, elapsedS });
    console.log(`  ${raw.verdict ?? 'failed'}: ${raw.reason ?? raw.error ?? 'no result'}`);
  }
}

server.close();

const report = {
  contract: 'cross-engine-stall-meter-v1',
  measuredAt: new Date().toISOString(),
  target: TARGET,
  arena: ARENA,
  label: LABEL,
  sampleSeconds: SECONDS,
  warmupSeconds: WARMUP_SECONDS,
  idle: IDLE,
  profile: PROFILE_NAME,
  stallFloorMs: STALL_FLOOR_MS,
  competingAutomation: competing,
  beacons,
  lanes,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nWrote ${OUT}`);

// A lane that could not be measured is never a pass: silence is not evidence.
const unmeasured = lanes.filter((lane) => !lane.presented);
if (unmeasured.length > 0) {
  console.log(`UNMEASURED LANES: ${unmeasured.map((lane) => `${lane.lane} (${lane.verdict ?? 'failed'})`).join(', ')}`);
  process.exitCode = 1;
}
