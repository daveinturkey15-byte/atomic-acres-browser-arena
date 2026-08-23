#!/usr/bin/env node
// Pass 75 QA row: cross-browser coverage - Chrome, Edge, Firefox, Safari-family
// (WebKit), Opera and mobile.
//
// The owner's row is "does the game actually work in the browsers people have",
// and until now the only mechanical answer was HF-331's frame-rate number in
// three Chromium-family browsers. This closes the row: every lane boots the
// real build, reaches an active solo match, and reports the renderer backend it
// ACTUALLY took, the adapter behind it, whether it fell back to software, its
// median/p90 frame rate, its console errors, and whether the HUD rendered
// legibly and without horizontal overflow.
//
// INSTRUMENT: the page measures itself (scripts/qa/cross-browser-probe.html)
// and POSTs the verdict to a local receiver, exactly the shape HF-331 arrived
// at. No driver is reached into an installed browser, because Playwright's
// bundled Firefox hangs in launch() on this machine and stock Firefox and Opera
// cannot be puppeteered at all - every reach-in approach is a dead instrument
// for half the matrix. Playwright appears here only as a LAUNCHER for the two
// lanes that have no installed browser to open: bundled WebKit (the only
// Safari-family engine available on Windows) and the mobile-emulation lane.
// Both load the same probe page, so every number in the table was produced by
// one instrument.
//
// A browser that is not installed is reported as 'not-installed'. It is never
// skipped silently and never guessed at: an absent lane is a gap in coverage
// and has to read like one.
//
// Usage:
//   node scripts/qa/verify-cross-browser-matrix.mjs
//     [--url http://127.0.0.1:41876] [--arena atomic-acres] [--sample-ms 12000]
//     [--lanes chrome,edge,firefox,opera,webkit,mobile] [--port 9913]
//     [--timeout 300000] [--render quality] [--renderer <backend>]
//     [--min-median-fps 0] [--require chrome,edge] [--headed]
//     [--out artifacts/qa/cross-browser-matrix.json]
import { createServer } from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, webkit } from '@playwright/test';
import { startStableDevProxy } from './stable-dev-proxy.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const list = (value) => value.split(',').map((entry) => entry.trim()).filter(Boolean);

const BASE = arg('--url', 'http://127.0.0.1:41876');
const ARENA = arg('--arena', 'atomic-acres');
const SAMPLE_MS = Number(arg('--sample-ms', '12000'));
const RECEIVER_PORT = Number(arg('--port', '9913'));
const LANE_TIMEOUT_MS = Number(arg('--timeout', '300000'));
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

const LOCAL_APP_DATA = process.env.LOCALAPPDATA ?? 'C:/Users/Default/AppData/Local';
const PROGRAM_FILES = process.env.ProgramFiles ?? 'C:/Program Files';
const PROGRAM_FILES_X86 = process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)';

/**
 * Installed-browser lanes. `processName` is what Windows calls the running
 * image - needed only for the focus activation, never for the kill, which
 * matches on the profile token instead (see the cleanup note below).
 */
// The render runtime refuses to author frames unless the browser owns
// foreground presentation. On this machine a freshly launched window is
// reported OCCLUDED - document.visibilityState 'hidden' - and the arena then
// never commits, which reads as "this browser cannot run the game" when the
// truth is "nothing was ever asked to paint". Chromium's native occlusion
// calculation is what produces that state, so it is turned off for the QA
// window only; Firefox gets the equivalent through a profile pref below.
const CHROMIUM_PRESENTATION_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--window-position=0,0',
  '--window-size=1280,800',
  '--new-window',
];

/** Firefox's equivalent of the occlusion switch, written into the QA profile. */
const FIREFOX_PROFILE_PREFS = [
  'user_pref("widget.windows.window_occlusion_tracking.enabled", false);',
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("browser.startup.homepage_override.mstone", "ignore");',
].join('\n');

const INSTALLED_LANES = {
  chrome: {
    family: 'chromium',
    processName: 'chrome',
    candidates: [
      `${PROGRAM_FILES}/Google/Chrome/Application/chrome.exe`,
      `${PROGRAM_FILES_X86}/Google/Chrome/Application/chrome.exe`,
      `${LOCAL_APP_DATA}/Google/Chrome/Application/chrome.exe`,
    ],
    args: (profile, url) => [`--user-data-dir=${profile}`, ...CHROMIUM_PRESENTATION_ARGS, url],
  },
  edge: {
    family: 'chromium',
    processName: 'msedge',
    candidates: [
      `${PROGRAM_FILES_X86}/Microsoft/Edge/Application/msedge.exe`,
      `${PROGRAM_FILES}/Microsoft/Edge/Application/msedge.exe`,
    ],
    args: (profile, url) => [`--user-data-dir=${profile}`, ...CHROMIUM_PRESENTATION_ARGS, url],
  },
  firefox: {
    family: 'gecko',
    processName: 'firefox',
    candidates: [
      `${PROGRAM_FILES}/Mozilla Firefox/firefox.exe`,
      `${PROGRAM_FILES_X86}/Mozilla Firefox/firefox.exe`,
    ],
    args: (profile, url) => ['-no-remote', '-profile', profile, '-new-window', url],
  },
  opera: {
    family: 'chromium',
    processName: 'opera',
    // Opera installs per-user by default and ships a launcher stub beside the
    // real binary; both live under the same directory, and either can open a
    // URL. Opera GX is a separate product with its own directory.
    candidates: [
      `${LOCAL_APP_DATA}/Programs/Opera/opera.exe`,
      `${LOCAL_APP_DATA}/Programs/Opera/launcher.exe`,
      `${LOCAL_APP_DATA}/Programs/Opera GX/opera.exe`,
      `${PROGRAM_FILES}/Opera/opera.exe`,
      `${PROGRAM_FILES_X86}/Opera/opera.exe`,
    ],
    args: (profile, url) => [`--user-data-dir=${profile}`, ...CHROMIUM_PRESENTATION_ARGS, url],
  },
};

/**
 * Playwright-launched lanes. WebKit is the only Safari-family engine that can
 * be run on Windows at all, so it is the honest stand-in for Safari and is
 * labelled as such rather than being called "Safari". The mobile lane is
 * Chromium's device emulation at the contract phone viewport with touch, which
 * is what a phone's layout and input model actually exercise.
 */
const PLAYWRIGHT_LANES = {
  webkit: {
    engine: 'webkit',
    stands_in_for: 'safari',
    context: { viewport: { width: 1280, height: 720 } },
  },
  mobile: {
    engine: 'chromium',
    stands_in_for: 'mobile',
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
};

const LANES = list(arg('--lanes', 'chrome,edge,firefox,opera,webkit,mobile'));

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
    if (parsed.stage) {
      const detail = parsed.stage === 'heartbeat'
        ? ` backend=${parsed.backend} focus=${parsed.hasFocus} vis=${parsed.visibility} status="${parsed.status ?? ''}"`
        : '';
      console.error(`[xbrowser] ${parsed.lane} stage: ${parsed.stage}${detail}`);
      waiter.stages.push(parsed.stage);
      // The last heartbeat is the only evidence that separates "this browser
      // cannot run the game" from "this window was never allowed to paint".
      if (parsed.stage === 'heartbeat') waiter.lastHeartbeat = parsed;
      return;
    }
    waiter.settle(parsed);
  });
});
await new Promise((ready) => receiver.listen(RECEIVER_PORT, '127.0.0.1', ready));
const ENDPOINT = `http://127.0.0.1:${RECEIVER_PORT}/report`;

// Every lane is served through the reload-stripping proxy rather than straight
// off the dev server. Another agent saving a file under src/ makes Vite
// broadcast a full-reload, and a lane that reloads halfway through its frame
// sample reports nothing; an installed browser cannot be protected any other
// way. See stable-dev-proxy.mjs.
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
  url.searchParams.set('xbArena', ARENA);
  url.searchParams.set('xbSampleMs', String(SAMPLE_MS));
  url.searchParams.set('xbEndpoint', ENDPOINT);
  return url.toString();
}

function awaitLaneReport(lane, timeoutMs) {
  const stages = [];
  const waiter = { stages, lastHeartbeat: null };
  return {
    stages,
    promise: new Promise((settleReport) => {
      const timer = setTimeout(() => {
        pending.delete(lane);
        settleReport({
          error: 'receiver-timeout',
          lastStage: stages.at(-1) ?? 'none',
          lastHeartbeat: waiter.lastHeartbeat,
        });
      }, timeoutMs);
      waiter.settle = (payload) => {
        clearTimeout(timer);
        pending.delete(lane);
        settleReport({ lastHeartbeat: waiter.lastHeartbeat, ...payload });
      };
      pending.set(lane, waiter);
    }),
  };
}

// ---------------------------------------------------------------------------
// Cleanup. Killing the spawn pid is WRONG on Windows: for several of these
// browsers the thing spawned is a launcher stub that exits immediately and
// leaves the real windows orphaned (documented in
// run-hf331-installed-browser-fps.mjs, which was bitten by exactly this). Match
// on the unique temp-profile token in the command line instead - it appears in
// every process of the tree this run started, and in nothing else.
// ---------------------------------------------------------------------------
function killLaneWindows(profileToken) {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${profileToken}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' },
    );
  } catch { /* windows already gone */ }
}

function activateLaneWindow(processName, profileToken) {
  // FOCUS MATTERS: the render runtime refuses to author frames without document
  // focus, so an unfocused window spins in prewarm forever and reads as a
  // browser wedge rather than the harness fault it is.
  // AppActivate alone returns true against a MINIMISED or occluded window and
  // leaves it that way, so the page stays hidden and the arena never commits.
  // Restore the window first, then take the foreground. Strictly scoped to the
  // processes whose command line carries this lane's profile token - never any
  // other browser the human happens to have open.
  try {
    execSync(
      `powershell -NoProfile -Command "Add-Type -Namespace Qa -Name Win -MemberDefinition '[DllImport(\\"user32.dll\\")] public static extern bool ShowWindowAsync(IntPtr h, int n); [DllImport(\\"user32.dll\\")] public static extern bool SetForegroundWindow(IntPtr h);'; $ids = Get-CimInstance Win32_Process -Filter \\"Name='${processName}.exe'\\" | Where-Object { $_.CommandLine -like '*${profileToken}*' } | Select-Object -ExpandProperty ProcessId; foreach ($id in $ids) { $proc = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($proc -and $proc.MainWindowHandle -ne 0) { [Qa.Win]::ShowWindowAsync($proc.MainWindowHandle, 9) | Out-Null; [Qa.Win]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null } }"`,
      { stdio: 'ignore' },
    );
  } catch { /* best effort */ }
}

async function runInstalledLane(lane, spec) {
  const executable = spec.candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    return { lane, kind: 'installed', engine: spec.family, status: 'not-installed', searched: spec.candidates };
  }
  const profileToken = `${RUN_TOKEN}-${lane}`;
  const profile = mkdtempSync(join(tmpdir(), `${profileToken}-`));
  if (spec.family === 'gecko') writeFileSync(join(profile, 'user.js'), `${FIREFOX_PROFILE_PREFS}\n`);
  const waiter = awaitLaneReport(lane, LANE_TIMEOUT_MS);
  console.error(`[xbrowser] launching ${lane} (${executable})`);
  spawn(executable, spec.args(profile, laneUrl(lane)), { stdio: 'ignore', windowsHide: false });
  const activateTimers = [6_000, 30_000, 90_000, 150_000]
    .map((delay) => setTimeout(() => activateLaneWindow(spec.processName, profileToken), delay));
  const report = await waiter.promise;
  for (const timer of activateTimers) clearTimeout(timer);
  killLaneWindows(profileToken);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* profile still locked; temp dir is disposable */ }
  return { lane, kind: 'installed', engine: spec.family, executable, ...report };
}

async function runPlaywrightLane(lane, spec) {
  const launcher = spec.engine === 'webkit' ? webkit : chromium;
  let browser = null;
  const waiter = awaitLaneReport(lane, LANE_TIMEOUT_MS);
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
    const report = await waiter.promise;
    return {
      lane,
      kind: 'playwright',
      engine: spec.engine,
      standsInFor: spec.stands_in_for,
      headless: !HEADED,
      ...report,
      consoleErrors: [...new Set([...(report.consoleErrors ?? []), ...driverErrors])],
    };
  } catch (error) {
    return { lane, kind: 'playwright', engine: spec.engine, standsInFor: spec.stands_in_for, error: `launch-failed: ${String(error).slice(0, 200)}` };
  } finally {
    await browser?.close().catch(() => {});
  }
}

/** Everything a reader needs to judge one lane, plus the pass/fail reasons. */
function gradeLane(record) {
  if (record.status === 'not-installed') return { ...record, verdict: 'not-installed', failures: [] };
  // A lane that timed out never sends its final payload, so the errors it did
  // report - in its heartbeats - are the only ones there are. Fold them in, or
  // the table shows a browser that threw three times with an error count of 0.
  const heartbeatErrors = record.lastHeartbeat?.errors ?? [];
  const consoleErrors = [...new Set([...(record.consoleErrors ?? []), ...heartbeatErrors])];
  const presentable = record.lastHeartbeat
    && record.lastHeartbeat.visibility === 'visible'
    && record.lastHeartbeat.hasFocus !== false;
  // A window the desktop never let paint proves nothing about the browser, and
  // the render runtime needs BOTH visibility and focus before it authors a
  // frame. Give that its own verdict rather than booking it as a product
  // failure - but only when the page reported no errors of its own: a lane that
  // threw has a real fault to answer for whether or not it was in front. Never a
  // pass either way; an unmeasured lane is still an uncovered lane.
  if (record.done !== true && record.lastHeartbeat && !presentable && consoleErrors.length === 0) {
    return {
      ...record,
      consoleErrors,
      verdict: 'blocked-no-foreground',
      failures: [`window-never-presentable(visibility=${record.lastHeartbeat.visibility}, focus=${record.lastHeartbeat.hasFocus}, lastStage=${record.lastStage ?? 'unknown'})`],
    };
  }
  const failures = [];
  const audit = record.hudAudit ?? null;
  if (record.error) failures.push(record.error);
  if (record.done !== true) failures.push(`never-completed(lastStage=${record.lastStage ?? 'unknown'})`);
  if (record.matchPhase !== 'active' || record.gameStarted !== true) failures.push('no-active-match');
  if (consoleErrors.length > 0) failures.push(`console-errors:${consoleErrors.length}`);
  if (!audit || audit.error) failures.push(`hud-audit-unavailable${audit?.error ? `:${audit.error}` : ''}`);
  else {
    if ((audit.belowNinePx ?? []).length > 0) failures.push(`hud-text-below-9px:${audit.belowNinePx.length}`);
    if ((audit.pageOverflowX ?? 0) > 0) failures.push(`hud-horizontal-overflow:${audit.pageOverflowX}px`);
  }
  if (record.runtime?.failClosed === true) failures.push('renderer-fail-closed');
  if (record.runtime?.deviceLost === true) failures.push('renderer-device-lost');
  // A frame-rate floor is machine- and lane-specific (a headless lane may
  // legitimately land on a software rasteriser), so the numbers are always
  // recorded and only gated when the operator asks for a gate.
  if (MIN_MEDIAN_FPS > 0 && Number(record.medianFps ?? 0) < MIN_MEDIAN_FPS) {
    failures.push(`median-fps-${record.medianFps ?? 'none'}-below-${MIN_MEDIAN_FPS}`);
  }
  return { ...record, consoleErrors, verdict: failures.length === 0 ? 'pass' : 'fail', failures };
}

function backendTaken(record) {
  return record.runtime?.actualBackend ?? record.backendDataset ?? 'unknown';
}

function adapterIdentity(record) {
  return record.runtime?.adapterLabel
    ?? record.context?.unmaskedRenderer
    ?? record.context?.renderer
    ?? 'unknown';
}

function softwareFallback(record) {
  if (record.status === 'not-installed') return null;
  if (record.runtime?.softwareAdapter === true) return true;
  if (record.atomicSignalRenderer === 'software') return true;
  const adapter = String(adapterIdentity(record));
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(adapter)) return true;
  return record.runtime || record.context?.available ? false : null;
}

const records = [];
for (const lane of LANES) {
  if (INSTALLED_LANES[lane]) records.push(gradeLane(await runInstalledLane(lane, INSTALLED_LANES[lane])));
  else if (PLAYWRIGHT_LANES[lane]) records.push(gradeLane(await runPlaywrightLane(lane, PLAYWRIGHT_LANES[lane])));
  else records.push({ lane, verdict: 'fail', failures: ['unknown-lane'] });
  const last = records.at(-1);
  console.error(`[xbrowser] ${lane}: ${last.verdict}`
    + (last.verdict === 'not-installed' ? '' : ` backend=${backendTaken(last)} median=${last.medianFps ?? '?'}fps`)
    + (last.failures?.length ? ` failures=${last.failures.join(',')}` : ''));
}

receiver.close();
await proxy.close();

const missing = records.filter((record) => record.verdict === 'not-installed').map((record) => record.lane);
const failed = records.filter((record) => record.verdict === 'fail').map((record) => record.lane);
const blocked = records.filter((record) => record.verdict === 'blocked-no-foreground').map((record) => record.lane);
const requiredMissing = REQUIRED.filter((lane) => missing.includes(lane));
// A blocked lane is not a pass. The row closes only when every lane that exists
// on this machine was actually measured.
const verdict = failed.length === 0 && blocked.length === 0 && requiredMissing.length === 0 ? 'PASS' : 'FAIL';

const receipt = {
  verdict,
  measuredAt: new Date().toISOString(),
  base: BASE,
  servedVia: proxy.origin,
  devServerReloadsSuppressed: proxy.suppressedReloads(),
  arena: ARENA,
  sampleMs: SAMPLE_MS,
  renderProfile: RENDER_PROFILE,
  rendererOverride: RENDERER_OVERRIDE || null,
  minMedianFpsGate: MIN_MEDIAN_FPS || null,
  requiredLanes: REQUIRED,
  requiredMissing,
  notInstalled: missing,
  failedLanes: failed,
  blockedLanes: blocked,
  lanes: records.map((record) => ({
    ...record,
    backendTaken: record.verdict === 'not-installed' ? null : backendTaken(record),
    adapterIdentity: record.verdict === 'not-installed' ? null : adapterIdentity(record),
    softwareFallback: softwareFallback(record),
  })),
};

mkdirSync(resolve(OUT, '..'), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(receipt, null, 2)}\n`);

// Readable table. Fixed columns rather than JSON, because the point of this row
// is that a human can see at a glance which browser is broken.
const columns = [
  ['LANE', (row) => row.lane],
  ['ENGINE', (row) => row.engine ?? '-'],
  ['STATUS', (row) => row.verdict],
  ['BACKEND', (row) => row.backendTaken ?? '-'],
  ['SOFTWARE', (row) => (row.softwareFallback === null ? '-' : String(row.softwareFallback))],
  ['MEDIAN', (row) => (row.medianFps === undefined ? '-' : `${row.medianFps}fps`)],
  ['P90', (row) => (row.p90WorstFps === undefined ? '-' : `${row.p90WorstFps}fps`)],
  ['ERRS', (row) => String((row.consoleErrors ?? []).length)],
  ['HUD<9PX', (row) => String((row.hudAudit?.belowNinePx ?? []).length)],
  ['OVERFLOW', (row) => String(row.hudAudit?.pageOverflowX ?? '-')],
  ['ADAPTER', (row) => String(row.adapterIdentity ?? '-').slice(0, 46)],
];
const rows = receipt.lanes.map((row) => columns.map(([, read]) => String(read(row) ?? '-')));
const widths = columns.map(([header], index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
console.log(line(columns.map(([header]) => header)));
console.log(widths.map((width) => '-'.repeat(width)).join('  '));
for (const row of rows) console.log(line(row));
console.log('');
for (const row of receipt.lanes) {
  if (row.verdict === 'fail' && row.failures?.length) console.log(`FAIL ${row.lane}: ${row.failures.join(' | ')}`);
  if (row.verdict === 'not-installed') console.log(`NOT INSTALLED ${row.lane}: searched ${(row.searched ?? []).join(' ; ')}`);
  if (row.verdict === 'blocked-no-foreground') console.log(`BLOCKED ${row.lane}: ${row.failures.join(' | ')} - nothing was measured, so this lane is still uncovered`);
}
console.log(`\nverdict=${verdict}  receipt=${OUT}`);
process.exit(verdict === 'PASS' ? 0 : 1);
