#!/usr/bin/env node
// Boots every arena on the REAL WebGPU route, in an installed browser.
//
// WHY THIS EXISTS. Headless Chromium on this machine cannot create a WebGPU
// device (requestDevice fails on a missing dxil.dll), so every automated visual
// and boot check in this repo has only ever exercised the WebGL2 compatibility
// path - while players run WebGPU. An arena that boots on WebGL2 and fails on
// WebGPU was invisible to the entire QA surface, and that is exactly how a
// "farcrysis will not boot" report reached the owner after a green six-arena
// capture.
//
// The page drives itself (qaFpsProbe accepts a comma-separated arena list) and
// POSTs one result per arena to a local receiver, so no automation protocol has
// to reach into a browser that cannot be puppeteered.
//
// Usage: node scripts/qa/verify-webgpu-arena-boot.mjs [--browser chrome]
//        [--url http://127.0.0.1:41876] [--renderer webgpu]
import { createServer } from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Lane discipline: scripts/qa/installed-browser-lanes.mjs
import { foregroundWindow, closeGracefully, processIsRunning } from './installed-browser-lanes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const BROWSER = arg('--browser', 'chrome');
const RENDERER = arg('--renderer', 'webgpu');
const PORT = Number(arg('--port', '9914'));
const ARENAS = arg('--arenas', 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range,farcrysis,high-seas');
const TIMEOUT_MS = Number(arg('--timeout', '600000'));

const EXECUTABLES = {
  chrome: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
  edge: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
  firefox: ['C:/Program Files/Mozilla Firefox/firefox.exe'],
  opera: [`${process.env.LOCALAPPDATA}/Programs/Opera/opera.exe`, 'C:/Program Files/Opera/opera.exe'],
};

const executable = (EXECUTABLES[BROWSER] ?? []).find((candidate) => candidate && existsSync(candidate));
if (!executable) {
  console.error(`[webgpu-boot] ${BROWSER} is not installed`);
  console.log(JSON.stringify({ verdict: 'SKIPPED', browser: BROWSER, reason: 'not-installed' }, null, 2));
  process.exit(2);
}

// HF-331 root cause (installed-browser-lanes.mjs): Firefox launched with an
// explicit -profile NEVER gives the content document focus on this machine,
// and the game's frame loop refuses to render while document.hasFocus() is
// false - so every -profile measurement was of the harness, not the game.
// The working lane drives Firefox's DEFAULT profile in a private window,
// which is only safe when no other Firefox instance exists to swallow the
// URL through remoting. Refuse instead of measuring a lie.
if (BROWSER === 'firefox' && processIsRunning('firefox')) {
  console.error('[webgpu-boot] firefox is already running; the default-profile lane would hand the URL to that instance. Close it and re-run.');
  console.log(JSON.stringify({ verdict: 'SKIPPED', browser: 'firefox', reason: 'firefox-already-running' }, null, 2));
  process.exit(2);
}
// Stable substring of the game page <title>; the only handle on "the window
// this run opened" once the disposable-profile route is off the table.
const FIREFOX_TITLE_MATCH = 'Browser Arena FPS';
let focusAttempts = 0;
let focusOk = false;
// Interval id of the Firefox focus keep-alive; cleared on every resolve path.
let focusTimer = null;
const stopFocusKeepAlive = () => {
  if (focusTimer !== null) { clearInterval(focusTimer); focusTimer = null; }
};

const results = [];
let sweepDone = false;
// Single-arena mode (one entry in --arenas) ends with the in-page probe's FPS
// sample instead of a sweep-complete marker. Without this branch the harness
// ignored the one payload that carries medianFps and timed out - which is why
// Firefox had never produced a measured frame-rate number.
let fpsResult = null;
const report = await new Promise((resolveReport) => {
  const timer = setTimeout(() => { stopFocusKeepAlive(); server.close(); resolveReport({ timedOut: true }); }, TIMEOUT_MS);
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      response.writeHead(200, { 'access-control-allow-origin': '*' });
      response.end('ok');
      if (request.method !== 'POST') return;
      let parsed = null;
      try { parsed = JSON.parse(body); } catch { return; }

      if (parsed.stage === 'arena-boot') {
        results.push(parsed);
        const detail = parsed.ok
          ? `${parsed.ms} ms on ${parsed.backend}`
          : `FAILED on ${parsed.backend} — ${parsed.thrown ?? parsed.statusText ?? 'timeout'}`;
        console.error(`[webgpu-boot] ${parsed.arena}: ${detail}`);
        for (const line of parsed.errors ?? []) console.error(`               ${line}`);
        return;
      }
      if (typeof parsed.medianFps === 'number') {
        fpsResult = parsed;
        console.error(`[webgpu-boot] FPS ${parsed.arena}: median ${parsed.medianFps} · p90-worst ${parsed.p90WorstFps} · p99-worst ${parsed.p99WorstFps} · ${parsed.frames} frames / ${parsed.sampleMs} ms on ${parsed.backend} (webgpuAvailable=${parsed.webgpuAvailable})`);
        clearTimeout(timer);
        stopFocusKeepAlive();
        server.close();
        resolveReport({ timedOut: false });
        return;
      }
      if (parsed.stage === 'bootstrap-ready') {
        console.error(`[webgpu-boot] bootstrap ready on backend=${parsed.backend}`);
        return;
      }
      if (parsed.stage === 'heartbeat') {
        // Only surface heartbeats that name trouble: a wedged activation stage
        // or a focus loss (an unfocused window is timer-throttled and would
        // poison any FPS sample taken during it).
        if (!parsed.hasFocus || (parsed.recentErrors ?? []).length > 0) {
          console.error(`[webgpu-boot] heartbeat: stage=${parsed.bootstrapStage} hasFocus=${parsed.hasFocus} visibility=${parsed.visibility} status="${parsed.statusText}"`);
        }
        return;
      }
      if (parsed.stage === 'sweep-complete') {
        sweepDone = true;
        clearTimeout(timer);
        stopFocusKeepAlive();
        server.close();
        resolveReport({ timedOut: false });
      }
    });
  });
  server.listen(PORT, '127.0.0.1');

  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', 'quality');
  if (RENDERER) url.searchParams.set('renderer', RENDERER);
  url.searchParams.set('qaFpsProbe', ARENAS);
  url.searchParams.set('qaFpsEndpoint', `http://127.0.0.1:${PORT}/report`);
  const profile = mkdtempSync(join(tmpdir(), `wgpuboot-${BROWSER}-`));
  console.error(`[webgpu-boot] launching ${BROWSER} on renderer=${RENDERER || 'auto'}`);
  if (BROWSER === 'firefox') {
    // Default profile + private window: see the HF-331 note above. Focus is
    // then won and VERIFIED from outside via win-foreground.ps1 (-RealClick,
    // because Firefox ignores a posted click for content-focus purposes).
    spawn(executable, ['-private-window', url.toString()], { stdio: 'ignore' });
    const keepFocus = setInterval(() => {
      try {
        const attempt = foregroundWindow({
          titleMatch: FIREFOX_TITLE_MATCH,
          processName: 'firefox',
          scriptDir: HERE,
          click: true,
          realClick: true,
        });
        focusAttempts += 1;
        focusOk = Boolean(attempt?.ok);
        if (!focusOk && attempt) {
          console.error(`[webgpu-boot] firefox focus attempt ${focusAttempts} FAILED: foregroundAfter=${attempt.foregroundAfter} windows=${JSON.stringify(attempt.windows ?? [])}`);
        }
      } catch (error) {
        // Silent catches here cost a whole measurement round once: the attempt
        // counter never moved while every single focus call was dying below it.
        focusAttempts += 1;
        console.error(`[webgpu-boot] firefox focus attempt ${focusAttempts} threw: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 3_000);
    focusTimer = keepFocus;
  } else {
    // DECLARED VISIBLE LANE, muted. This run reports fps from the real
    // compositor and wins the foreground on purpose just below, because the
    // renderer refuses to author frames without document focus. Parking it
    // off-screen would not hide the measurement, it would break it.
    // See scripts/qa/browser-visibility-contract.test.mjs.
    spawn(executable, [`--user-data-dir=${profile}`, '--mute-audio', '--no-first-run', '--new-window', url.toString()], { stdio: 'ignore' });
  }

  if (BROWSER !== 'firefox') {
    // The renderer refuses to author frames without document focus, so bring the
    // window forward - an unfocused window used to stall the prewarm entirely.
    const activate = () => {
      const image = BROWSER === 'edge' ? 'msedge' : BROWSER;
      try {
        execSync(`powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \\"Name='${image}.exe'\\" | Where-Object { $_.CommandLine -like '*wgpuboot-${BROWSER}-*' } | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate([int]$p.ProcessId) | Out-Null }"`, { stdio: 'ignore' });
      } catch { /* best effort */ }
    };
    for (const delay of [5_000, 20_000, 60_000, 150_000]) setTimeout(activate, delay);
  }
});

if (BROWSER === 'firefox') {
  // Close only the private window this run opened (WM_CLOSE by title), then
  // retire the instance we started - force-killing firefox.exe increments its
  // startup-crash counter and a survivor owns the remoting handoff.
  try {
    foregroundWindow({ titleMatch: FIREFOX_TITLE_MATCH, processName: 'firefox', scriptDir: HERE, closeOnly: true });
  } catch { /* already gone */ }
  await new Promise((wait) => setTimeout(wait, 1_500));
  try { await closeGracefully('firefox'); } catch { /* already gone */ }
} else {
  // Kill only the windows we opened, matched on the unique temp profile.
  try {
    execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*wgpuboot-${BROWSER}-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
  } catch { /* already gone */ }
}

const expected = ARENAS.split(',').map((entry) => entry.trim()).filter(Boolean);
const failed = results.filter((entry) => !entry.ok).map((entry) => entry.arena);
// A single-arena run succeeds on a delivered FPS sample; a sweep still needs
// every arena to have booted cleanly.
const fpsMode = expected.length === 1;
// A single-arena FPS run delivers its sample without any arena-boot row, so
// the "every requested arena reported" rule belongs to sweep mode only.
const missing = fpsMode
  ? []
  : expected.filter((arena) => !results.some((entry) => entry.arena === arena));
const verdict = !report.timedOut
  && failed.length === 0
  && missing.length === 0
  && (!fpsMode || (fpsResult !== null && fpsResult.frames > 0))
  ? 'PASS' : 'FAIL';

mkdirSync(resolve('artifacts/qa'), { recursive: true });
const receipt = {
  verdict,
  browser: BROWSER,
  requestedRenderer: RENDERER || 'auto',
  actualBackend: fpsResult?.backend ?? results[0]?.backend ?? null,
  sweepCompleted: sweepDone,
  fps: fpsResult,
  userAgent: fpsResult?.userAgent ?? null,
  focusEvidence: BROWSER === 'firefox' ? { attempts: focusAttempts, verified: focusOk } : null,
  failed,
};
writeFileSync(resolve('artifacts/qa/webgpu-arena-boot.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
process.exit(verdict === 'PASS' ? 0 : 1);
