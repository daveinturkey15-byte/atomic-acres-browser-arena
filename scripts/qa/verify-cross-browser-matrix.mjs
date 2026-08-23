#!/usr/bin/env node
// THE STANDING CROSS-BROWSER GATE. One command, the whole matrix, fails closed.
//
// The owner's row is "working in chrome edge firefox safari and opera all ok,
// and on mobiles". This answers it mechanically: every lane boots the real
// build, reaches an active solo match in EVERY arena, and reports the renderer
// backend it ACTUALLY took, the adapter behind it, whether it fell back to
// software, its in-match frame rate against the browser's own measured ceiling,
// its console errors, and whether the HUD rendered legibly without horizontal
// overflow.
//
// FOUR VERDICTS, and they are not interchangeable:
//   pass          - measured, and every check held.
//   fail          - measured, and something did not hold.
//   not-installed - the browser is not on this machine. NEVER a pass. It is an
//                   uncovered browser and the gate fails on it if the caller
//                   listed it in --require.
//   blocked       - the lane could not be measured at all (no foreground, a
//                   browser the human already had open). Also never a pass:
//                   an unmeasured lane is an uncovered lane.
//
// INSTRUMENT: the page measures itself (scripts/qa/cross-browser-probe.html) and
// POSTs each arena's verdict to a local receiver. No driver is reached into an
// installed browser, because Playwright's bundled Firefox hangs in launch() on
// this machine and stock Firefox and Opera cannot be puppeteered at all - every
// reach-in approach is a dead instrument for half the matrix. Playwright appears
// here only as a LAUNCHER for the lanes with no installed browser to open:
// bundled WebKit (the only Safari-family engine available on Windows) and the
// two device-emulation lanes. Every lane loads the same probe, so every number
// in the table was produced by one instrument.
//
// Usage:
//   node scripts/qa/verify-cross-browser-matrix.mjs
//     [--url http://127.0.0.1:41876] [--arenas a,b,c] [--sample-ms 12000]
//     [--lanes chrome,edge,firefox,opera,webkit,mobile,tablet] [--port 9913]
//     [--timeout 900000] [--render quality] [--renderer <backend>]
//     [--min-median-fps 0] [--require chrome,edge] [--headed]
//     [--out artifacts/qa/cross-browser-matrix.json]
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { startStableDevProxy } from './stable-dev-proxy.mjs';
import {
  BROWSER_LANES, foregroundWindow, killByToken, closeGracefully, processIsRunning,
  competingBrowserAutomation,
} from './installed-browser-lanes.mjs';
import { computeMatrixVerdict } from './cross-browser-gate-contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const list = (value) => value.split(',').map((entry) => entry.trim()).filter(Boolean);

const BASE = arg('--url', 'http://127.0.0.1:41876');
const ARENAS = list(arg('--arenas', 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range,farcrysis,high-seas'));
const SAMPLE_MS = Number(arg('--sample-ms', '12000'));
const RECEIVER_PORT = Number(arg('--port', '9913'));
const LANE_TIMEOUT_MS = Number(arg('--timeout', '900000'));
// MUST exceed the probe page's own worst case, or the harness gives up before
// the page has finished failing and the lane is truncated for a reason that has
// nothing to do with the browser. The page budgets up to 180 s for bootstrap,
// then three deploy attempts of 60 s, then settle and sample - so anything under
// ~300 s cuts arenas off mid-answer. Measured: at 240 s the Chrome lane lost
// high-seas entirely because farcrysis was still working through its retries.
const ARENA_TIMEOUT_MS = Number(arg('--arena-timeout', '420000'));
const RENDER_PROFILE = arg('--render', 'quality');
const RENDERER_OVERRIDE = arg('--renderer', '');
const MIN_MEDIAN_FPS = Number(arg('--min-median-fps', '0'));
const REQUIRED = list(arg('--require', ''));
const HEADED = argv.includes('--headed');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/qa/cross-browser-matrix.json'));

// One token per run, embedded in every temp profile path. Cleanup matches on
// it, so two matrices running at once cannot kill each other's windows and a
// human's own browser session can never match.
const RUN_TOKEN = `xbmatrix-${process.pid}-${Date.now().toString(36)}`;


/**
 * Playwright-launched lanes. WebKit is the only Safari-family engine that can
 * be run on Windows at all, so it is the honest stand-in for Safari and is
 * labelled as such rather than being called "Safari". The two device lanes are
 * Chromium's emulation at the contract phone and tablet viewports with touch,
 * which is what those layouts and input models actually exercise.
 */
const PLAYWRIGHT_LANES = {
  webkit: {
    engine: 'webkit',
    standsInFor: 'safari-family (NOT Safari itself - see the report)',
    context: { viewport: { width: 1280, height: 720 } },
  },
  mobile: {
    engine: 'chromium',
    standsInFor: 'phone 390x844',
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
  tablet: {
    engine: 'chromium',
    standsInFor: 'tablet 768x1024',
    context: {
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
  },
};

const LANES = list(arg('--lanes', 'chrome,edge,firefox,opera,webkit,mobile,tablet'));

// ---------------------------------------------------------------------------
// Receiver: one long-lived server for the whole matrix. Every payload carries
// its lane, so a straggler beacon from a killed window can never be credited to
// the lane that is currently running.
// ---------------------------------------------------------------------------
const pending = new Map();
const receiver = createServer((request, response) => {
  // Buffered as bytes and decoded once: concatenating chunks as strings splits
  // multi-byte characters across a packet boundary, and the HUD samples this
  // carries are full of them.
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    response.writeHead(200, { 'access-control-allow-origin': '*' });
    response.end('ok');
    if (request.method !== 'POST') return;
    const body = Buffer.concat(chunks).toString('utf8');
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { parsed = { error: 'bad-json', body: body.slice(0, 200) }; }
    const waiter = pending.get(parsed?.lane);
    if (!waiter) return;
    waiter.onPayload(parsed);
  });
});
await new Promise((ready) => receiver.listen(RECEIVER_PORT, '127.0.0.1', ready));
const ENDPOINT = `http://127.0.0.1:${RECEIVER_PORT}/report`;

// Every lane is served through the reload-stripping proxy rather than straight
// off the dev server. Another agent saving a file under src/ makes Vite
// broadcast a full-reload, and a lane that reloads halfway through its frame
// sample reports nothing; an installed browser cannot be protected any other
// way. See stable-dev-proxy.mjs.
// The Windows foreground is a single global resource and the game will not
// render without it, so another lane driving a browser on this machine steals
// focus back between our attempts and turns a good browser into an unmeasurable
// one. Detected up front and recorded in the receipt, because the failure it
// causes looks exactly like a browser fault.
const competing = competingBrowserAutomation({ selfScript: 'verify-cross-browser-matrix.mjs' });
if (competing.length > 0) {
  console.error(`[xbrowser] WARNING: other QA automation is driving browsers on this machine: ${competing.join(', ')}`);
  console.error('[xbrowser]          Foreground is a single global resource - lanes may lose focus and report BLOCKED.');
}

const proxy = await startStableDevProxy({ target: new URL(BASE) });
console.error(`[xbrowser] serving lanes through ${proxy.origin} -> ${BASE}`);

function laneUrl(lane) {
  const url = new URL('/scripts/qa/cross-browser-probe.html', proxy.origin);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', RENDER_PROFILE);
  if (RENDERER_OVERRIDE) url.searchParams.set('renderer', RENDERER_OVERRIDE);
  // Nothing in this row needs a remote service, and a lane that stalls on one
  // would report a network fault as a browser fault.
  url.searchParams.set('externalServices', 'off');
  url.searchParams.set('xbLane', lane);
  url.searchParams.set('xbArenas', ARENAS.join(','));
  url.searchParams.set('xbIndex', '0');
  url.searchParams.set('xbSampleMs', String(SAMPLE_MS));
  url.searchParams.set('xbEndpoint', ENDPOINT);
  return url.toString();
}

/**
 * Collect one arena result per arena, then the sweep-complete beacon.
 *
 * The per-ARENA timeout is what stops one wedged arena from costing the whole
 * lane: the page navigates itself to the next arena after every result, so a
 * lane that has gone quiet for longer than one arena's budget is abandoned and
 * whatever it did report is kept. Before this, one bad arena reported six.
 */
function awaitLaneSweep(lane) {
  const stages = [];
  const arenaResults = [];
  const waiter = { stages, lastHeartbeat: null };
  return {
    arenaResults,
    promise: new Promise((settleReport) => {
      const started = Date.now();
      let arenaTimer = null;
      const finish = (extra) => {
        if (arenaTimer) clearTimeout(arenaTimer);
        clearTimeout(laneTimer);
        pending.delete(lane);
        settleReport({ arenaResults, stages, lastHeartbeat: waiter.lastHeartbeat, ...extra });
      };
      const laneTimer = setTimeout(() => finish({ laneTimedOut: true }), LANE_TIMEOUT_MS);
      const armArenaTimer = () => {
        if (arenaTimer) clearTimeout(arenaTimer);
        arenaTimer = setTimeout(() => finish({
          arenaTimedOut: true,
          lastStage: stages.at(-1) ?? 'none',
        }), ARENA_TIMEOUT_MS);
      };
      armArenaTimer();
      waiter.onPayload = (parsed) => {
        if (parsed.stage === 'arena-result') {
          arenaResults.push(parsed);
          armArenaTimer();
          const detail = parsed.ok
            ? `${parsed.medianFps}fps (ceiling ${parsed.ceilingMedianFps}fps) on ${parsed.backendDataset}`
            : `FAILED - ${parsed.error ?? 'unknown'}`;
          console.error(`[xbrowser]   ${lane}/${parsed.arena}: ${detail}`);
          for (const line of parsed.consoleErrors ?? parsed.errors ?? []) console.error(`[xbrowser]     ! ${line}`);
          if (arenaResults.length >= ARENAS.length) finish({ sweepCompleted: true, elapsedMs: Date.now() - started });
          return;
        }
        if (parsed.stage === 'sweep-complete') { finish({ sweepCompleted: true, elapsedMs: Date.now() - started }); return; }
        stages.push(parsed.stage);
        if (parsed.stage === 'heartbeat') {
          waiter.lastHeartbeat = parsed;
          console.error(`[xbrowser]   ${lane}/${parsed.arena} heartbeat backend=${parsed.backend} focus=${parsed.hasFocus} vis=${parsed.visibility} "${(parsed.status ?? '').slice(0, 50)}"`);
        }
      };
      pending.set(lane, waiter);
    }),
  };
}

async function runInstalledLane(lane, spec) {
  const executable = spec.candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    return { lane, kind: 'installed', engine: spec.family, status: 'not-installed', searched: spec.candidates };
  }
  // The Firefox lane drives the DEFAULT profile (an explicit -profile costs it
  // content focus entirely - see installed-browser-lanes.mjs), so a browser the
  // human already has open would swallow the URL through remoting and the lane
  // would time out blaming Firefox. Refuse instead of measuring a lie.
  if (spec.usesDefaultProfile && processIsRunning(spec.processName)) {
    return {
      lane,
      kind: 'installed',
      engine: spec.family,
      executable,
      status: 'blocked-browser-already-running',
      blockedReason: `${spec.processName}.exe was already running. This lane drives the default profile and will not touch a session it did not start - close ${spec.label} and re-run.`,
    };
  }

  const profileToken = `${RUN_TOKEN}-${lane}`;
  const profile = mkdtempSync(join(tmpdir(), `${profileToken}-`));
  if (spec.family === 'gecko' && !spec.usesDefaultProfile) writeFileSync(join(profile, 'user.js'), `${spec.prefs({})}\n`);
  // The default-profile lane owns every window of the process (it refused to
  // start if one was already open), which is the only handle that survives the
  // app rewriting document.title on boot.
  const ownsProcess = Boolean(spec.usesDefaultProfile);

  const sweep = awaitLaneSweep(lane);
  console.error(`[xbrowser] launching ${lane} (${executable})`);
  spawn(executable, spec.args({ profile, url: laneUrl(lane) }), {
    stdio: 'ignore',
    windowsHide: false,
    env: { ...process.env, ...(spec.env ?? {}) },
  });

  // KEEP the foreground, do not take it once and hope. The game refuses to
  // author frames without document focus, so a window that loses the foreground
  // half way through an arena stops producing frames and the arena reads as a
  // wedge. Every attempt is recorded, and the fraction that held is published
  // next to the numbers it protects.
  const foregroundAttempts = [];
  const keepForeground = setInterval(() => {
    const attempt = foregroundWindow({
      token: ownsProcess ? undefined : profileToken,
      anyWindow: ownsProcess,
      processName: spec.processName,
      scriptDir: HERE,
    });
    foregroundAttempts.push(attempt.ok);
  }, 5_000);

  const report = await sweep.promise;
  clearInterval(keepForeground);

  if (ownsProcess) {
    foregroundWindow({ anyWindow: true, processName: spec.processName, scriptDir: HERE, closeOnly: true });
    await new Promise((wait) => setTimeout(wait, 1_500));
    // Graceful, then forced. A force-killed Firefox records a startup crash and
    // three of those turn the NEXT launch into a "Troubleshoot Mode?" modal that
    // eats the URL - an impatient teardown here breaks the following run.
    await closeGracefully(spec.processName);
  } else {
    killByToken(profileToken);
  }
  if (profile) {
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked; temp dir is disposable */ }
  }

  return {
    lane,
    kind: 'installed',
    engine: spec.family,
    executable,
    usesDefaultProfile: Boolean(spec.usesDefaultProfile),
    foregroundHeldFraction: foregroundAttempts.length
      ? Number((foregroundAttempts.filter(Boolean).length / foregroundAttempts.length).toFixed(3))
      : null,
    ...report,
  };
}

async function runPlaywrightLane(lane, spec) {
  const launcher = spec.engine === 'webkit' ? webkit : chromium;
  let browser = null;
  const sweep = awaitLaneSweep(lane);
  try {
    console.error(`[xbrowser] launching ${lane} (playwright ${spec.engine})`);
    browser = await launcher.launch({
      headless: !HEADED,
      // Chromium headless defaults to SwiftShader; pin real hardware ANGLE so
      // the lane reports the GPU it would have on a desktop. The receipt still
      // records softwareAdapter, so a fallback can never pass unnoticed.
      args: spec.engine === 'chromium'
        ? ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
          '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
        : [],
    });
    const context = await browser.newContext(spec.context);
    const page = await context.newPage();
    // Playwright sees console errors natively; the probe collects them too, and
    // the two lists are merged so a lane cannot hide one behind the other.
    const driverErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') driverErrors.push(message.text().slice(0, 220)); });
    page.on('pageerror', (error) => driverErrors.push(`pageerror: ${String(error).slice(0, 220)}`));
    await page.goto(laneUrl(lane), { waitUntil: 'domcontentloaded' });
    const report = await sweep.promise;
    return {
      lane,
      kind: 'playwright',
      engine: spec.engine,
      standsInFor: spec.standsInFor,
      headless: !HEADED,
      driverErrors: [...new Set(driverErrors)].slice(0, 12),
      ...report,
    };
  } catch (error) {
    return { lane, kind: 'playwright', engine: spec.engine, standsInFor: spec.standsInFor, status: 'failed-launch', error: `launch-failed: ${String(error).slice(0, 200)}` };
  } finally {
    await browser?.close().catch(() => {});
  }
}

/** Everything a reader needs to judge one arena of one lane. */
function gradeArena(laneRecord, arena) {
  const result = (laneRecord.arenaResults ?? []).find((entry) => entry.arena === arena) ?? null;
  if (!result) {
    // Never reported at all. If the lane's last heartbeat says the window was
    // not presentable, that is a harness fault, not a product fault - but it is
    // still not a pass, because nothing was measured.
    const heartbeat = laneRecord.lastHeartbeat;
    const blockedOnForeground = heartbeat && (heartbeat.hasFocus === false || heartbeat.visibility !== 'visible');
    return {
      arena,
      verdict: blockedOnForeground ? 'blocked' : 'fail',
      failures: [blockedOnForeground
        ? `window-never-presentable(focus=${heartbeat.hasFocus}, visibility=${heartbeat.visibility})`
        : 'never-reported'],
      backend: null,
      medianFps: null,
      ceilingMedianFps: null,
    };
  }

  const consoleErrors = [...new Set([...(result.consoleErrors ?? []), ...(result.errors ?? [])])];
  const failures = [];
  if (!result.ok) failures.push(result.error ?? 'arena-failed');
  if (result.ok) {
    if (result.matchPhase !== 'active' || result.gameStarted !== true) failures.push('no-active-match');
    const audit = result.hudAudit ?? null;
    if (!audit || audit.error) failures.push(`hud-audit-unavailable${audit?.error ? `:${audit.error}` : ''}`);
    else {
      if ((audit.belowNinePx ?? []).length > 0) failures.push(`hud-text-below-9px:${audit.belowNinePx.length}`);
      if ((audit.pageOverflowX ?? 0) > 0) failures.push(`hud-horizontal-overflow:${audit.pageOverflowX}px`);
    }
    if (result.runtime?.failClosed === true) failures.push('renderer-fail-closed');
    if (result.runtime?.deviceLost === true) failures.push('renderer-device-lost');
    // A frame-rate floor is machine- and lane-specific (a headless lane may
    // legitimately land on a software rasteriser), so the numbers are always
    // recorded and only gated when the operator asks for a gate.
    if (MIN_MEDIAN_FPS > 0 && Number(result.medianFps ?? 0) < MIN_MEDIAN_FPS) {
      failures.push(`median-fps-${result.medianFps ?? 'none'}-below-${MIN_MEDIAN_FPS}`);
    }
  }
  if (consoleErrors.length > 0) failures.push(`console-errors:${consoleErrors.length}`);
  // A sample taken without focus is not a slow number, it is not a number.
  const focusedFraction = result.inMatch?.focusedFraction ?? null;
  if (result.ok && focusedFraction !== null && focusedFraction < 0.5) {
    failures.push(`sampled-without-focus:${focusedFraction}`);
  }

  return {
    arena,
    verdict: failures.length === 0 ? 'pass' : 'fail',
    failures,
    ok: result.ok === true,
    backend: result.runtime?.actualBackend ?? result.backendDataset ?? null,
    adapter: result.runtime?.adapterLabel ?? result.context?.unmaskedRenderer ?? result.context?.renderer ?? null,
    softwareFallback: softwareFallback(result),
    medianFps: result.medianFps ?? null,
    p90WorstFps: result.p90WorstFps ?? null,
    medianFrameMs: result.medianFrameMs ?? null,
    ceilingMedianFps: result.ceilingMedianFps ?? null,
    focusedFraction,
    hudBelowNinePx: (result.hudAudit?.belowNinePx ?? []).length,
    hudOverflowX: result.hudAudit?.pageOverflowX ?? null,
    viewport: result.viewport ?? null,
    consoleErrors,
  };
}

function softwareFallback(result) {
  if (result.runtime?.softwareAdapter === true) return true;
  if (result.atomicSignalRenderer === 'software') return true;
  const adapter = String(result.runtime?.adapterLabel ?? result.context?.unmaskedRenderer ?? result.context?.renderer ?? '');
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(adapter)) return true;
  return adapter ? false : null;
}

function gradeLane(record) {
  if (record.status === 'not-installed') {
    return { ...record, verdict: 'not-installed', arenas: ARENAS.map((arena) => ({ arena, verdict: 'not-installed' })) };
  }
  if (record.status === 'blocked-browser-already-running' || record.status === 'failed-launch') {
    return {
      ...record,
      verdict: 'blocked',
      arenas: ARENAS.map((arena) => ({ arena, verdict: 'blocked', failures: [record.blockedReason ?? record.error ?? record.status] })),
    };
  }
  const arenas = ARENAS.map((arena) => gradeArena(record, arena));
  const failed = arenas.filter((entry) => entry.verdict === 'fail');
  const blocked = arenas.filter((entry) => entry.verdict === 'blocked');
  const verdict = failed.length > 0 ? 'fail' : (blocked.length > 0 ? 'blocked' : 'pass');
  return { ...record, verdict, arenas };
}

/**
 * The receipt, as it stands. Written after EVERY lane, not once at the end: a
 * full matrix is a two-hour run, and a harness that only persists what it found
 * on its last line throws all of it away the moment anything interrupts it. A
 * partial receipt is marked partial and names the lanes that never ran, so it
 * can never be mistaken for a completed sweep - and a partial sweep is never a
 * PASS, because a lane that did not run is a browser that is not covered.
 */
function buildReceipt(laneRecords, { complete }) {
  const {
    verdict, notInstalled, failedLanes, blockedLanes, requiredMissingOrBlocked, measured,
  } = computeMatrixVerdict({ lanes: laneRecords, required: REQUIRED });
  const ran = laneRecords.map((record) => record.lane);
  const lanesNeverRun = LANES.filter((lane) => !ran.includes(lane));
  const finished = complete && lanesNeverRun.length === 0;
  return {
    verdict: finished ? verdict : 'FAIL',
    complete: finished,
    lanesNeverRun,
    measuredAt: new Date().toISOString(),
    base: BASE,
    servedVia: proxy.origin,
    devServerReloadsSuppressed: proxy.suppressedReloads(),
    competingBrowserAutomation: competing,
    arenas: ARENAS,
    sampleMs: SAMPLE_MS,
    renderProfile: RENDER_PROFILE,
    rendererOverride: RENDERER_OVERRIDE || null,
    minMedianFpsGate: MIN_MEDIAN_FPS || null,
    requiredLanes: REQUIRED,
    requiredMissingOrBlocked,
    measuredLanes: measured,
    notInstalled,
    failedLanes,
    blockedLanes,
    lanes: laneRecords,
  };
}

mkdirSync(resolve(OUT, '..'), { recursive: true });
const records = [];
for (const lane of LANES) {
  let raw;
  if (BROWSER_LANES[lane]) raw = await runInstalledLane(lane, BROWSER_LANES[lane]);
  else if (PLAYWRIGHT_LANES[lane]) raw = await runPlaywrightLane(lane, PLAYWRIGHT_LANES[lane]);
  else raw = { lane, status: 'unknown-lane', error: `no such lane: ${lane}` };
  const graded = gradeLane(raw);
  records.push(graded);
  console.error(`[xbrowser] ${lane}: ${graded.verdict.toUpperCase()}`);
  writeFileSync(OUT, `${JSON.stringify(buildReceipt(records, { complete: false }), null, 2)}
`);
}

receiver.close();
await proxy.close();

// The verdict rule lives in cross-browser-gate-contract.mjs and is unit-tested
// there (`node --test scripts/qa/cross-browser-gate-contract.test.mjs`), because
// "an uninstalled browser must never read as a pass" is arithmetic and should
// not need a two-hour browser sweep to re-check.
const receipt = buildReceipt(records, { complete: true });
const { verdict } = receipt;
writeFileSync(OUT, `${JSON.stringify(receipt, null, 2)}
`);

// Readable table, one row per browser per arena. Fixed columns rather than
// JSON, because the point of this row is that a human can see at a glance which
// browser is broken and in which map.
const rows = [];
for (const record of records) {
  for (const arena of record.arenas ?? []) {
    rows.push([
      record.lane,
      arena.arena,
      arena.verdict === 'not-installed' ? 'SKIPPED' : arena.verdict.toUpperCase(),
      arena.backend ?? '-',
      arena.softwareFallback === null || arena.softwareFallback === undefined ? '-' : String(arena.softwareFallback),
      arena.medianFps == null ? 'UNMEASURED' : `${arena.medianFps}`,
      arena.ceilingMedianFps == null ? 'UNMEASURED' : `${arena.ceilingMedianFps}`,
      arena.focusedFraction == null ? '-' : `${Math.round(arena.focusedFraction * 100)}%`,
      String((arena.consoleErrors ?? []).length || 0),
      arena.hudBelowNinePx == null ? '-' : String(arena.hudBelowNinePx),
      arena.hudOverflowX == null ? '-' : String(arena.hudOverflowX),
    ]);
  }
}
const headers = ['LANE', 'ARENA', 'STATUS', 'BACKEND', 'SOFTWARE', 'FPS', 'CEILING', 'FOCUS', 'ERRS', 'HUD<9PX', 'OVERFLOW'];
const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
console.log(line(headers));
console.log(widths.map((width) => '-'.repeat(width)).join('  '));
for (const row of rows) console.log(line(row));
console.log('');
for (const record of records) {
  if (record.verdict === 'not-installed') {
    console.log(`SKIPPED ${record.lane}: not installed on this machine - searched ${(record.searched ?? []).join(' ; ')}`);
    console.log(`        SKIPPED IS NOT A PASS. This browser is uncovered.`);
  }
  if (record.verdict === 'blocked') {
    console.log(`BLOCKED ${record.lane}: ${record.blockedReason ?? record.error ?? 'lane could not be measured'}`);
    console.log(`        BLOCKED IS NOT A PASS. Nothing was measured, so this browser is uncovered.`);
  }
  for (const arena of record.arenas ?? []) {
    if (arena.verdict === 'fail') console.log(`FAIL ${record.lane}/${arena.arena}: ${(arena.failures ?? []).join(' | ')}`);
  }
}
console.log(`\nverdict=${verdict}  receipt=${OUT}`);
process.exit(verdict === 'PASS' ? 0 : 1);
