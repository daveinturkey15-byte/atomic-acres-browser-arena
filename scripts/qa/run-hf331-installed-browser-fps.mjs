#!/usr/bin/env node
// =====================================================================
// SUPERSEDED 2026-08-23 (Lane Q). DO NOT REACH FOR THIS FOR HF-331.
//
// HF-331 is CLOSED and this instrument is one of the ones that could not
// close it. Root cause, bisected: Firefox launched with an explicit
// `-profile <dir>` never gives the content document focus - document
// .hasFocus() stays false forever and no focus/blur/focusin event ever
// fires, even with the window verified foreground, visible, and clicked
// into with synthesised input. The product pauses its frame loop on
// exactly that predicate (`ownsForeground()` in src/legacy-main.ts), so
// every harness that used a disposable -profile measured a game that was
// deliberately rendering nothing and reported it as "Firefox is slow".
//
// The measured answer: Firefox 154 runs atomic-acres at 38.5 fps median on
// WebGPU against its own 166.7 fps presentation ceiling - about 88% of
// Chrome, not a fifteenth of it.
//
// Working instrument:  scripts/qa/verify-cross-browser-matrix.mjs
// Standing gate:       npm run qa:cross-browser
// Lane discipline:     scripts/qa/installed-browser-lanes.mjs
// Write-up:            docs/LANE_Q_CROSS_BROWSER_AND_MOBILE_AUDIT_2026-08-23.md
// =====================================================================
// HF-331: frame-rate measurement in INSTALLED browsers via the in-page probe.
//
// No driver, no automation protocol: the page is opened with qaFpsProbe params,
// runs a solo match, samples its own frame times and POSTs the result here.
// This is how the Firefox number finally gets measured - Playwright's bundled
// Firefox hangs in launch() on this machine and stock Firefox cannot be
// puppeteered, so every reach-in approach was a dead instrument.
//
// Usage: node scripts/qa/run-hf331-installed-browser-fps.mjs
//        [--arena atomic-acres] [--sample-ms 12000] [--browsers firefox,chrome]
// --------------------------------------------------------------------------
// DECLARED VISIBLE LANE, muted. Installed-browser fps against the real
// compositor; it takes the foreground deliberately, because the renderer
// refuses to author frames without document focus. An off-screen window would
// free-run requestAnimationFrame and report fiction, so this one stays visible
// and says so. The Chromium spawns mute; Firefox has no --mute-audio flag.
// See scripts/qa/browser-visibility-contract.test.mjs.
// --------------------------------------------------------------------------

import { createServer } from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876/');
const ARENA = arg('--arena', 'atomic-acres');
const SAMPLE_MS = Number(arg('--sample-ms', '12000'));
const RECEIVER_PORT = Number(arg('--port', '9911'));
const TIMEOUT_MS = Number(arg('--timeout', '180000'));

const BROWSERS = {
  firefox: {
    candidates: [
      'C:/Program Files/Mozilla Firefox/firefox.exe',
      'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
    ],
    launch: (executable, url) => {
      const profile = mkdtempSync(join(tmpdir(), 'hf331-firefox-'));
      return spawn(executable, ['-no-remote', '-profile', profile, '-new-window', url], { stdio: 'ignore', windowsHide: false });
    },
  },
  chrome: {
    candidates: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ],
    launch: (executable, url) => {
      const profile = mkdtempSync(join(tmpdir(), 'hf331-chrome-'));
      return spawn(executable, [`--user-data-dir=${profile}`, '--mute-audio', '--no-first-run', '--new-window', url], { stdio: 'ignore', windowsHide: false });
    },
  },
  edge: {
    candidates: ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
    launch: (executable, url) => {
      const profile = mkdtempSync(join(tmpdir(), 'hf331-edge-'));
      return spawn(executable, [`--user-data-dir=${profile}`, '--mute-audio', '--no-first-run', '--new-window', url], { stdio: 'ignore', windowsHide: false });
    },
  },
};

const requested = arg('--browsers', 'firefox,chrome').split(',').map((entry) => entry.trim()).filter(Boolean);

function waitForReport(timeoutMs) {
  return new Promise((resolveReport) => {
    let server;
    const timer = setTimeout(() => { server?.close(); resolveReport({ error: 'receiver-timeout' }); }, timeoutMs);
    server = createServer((request, response) => {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST',
          'access-control-allow-headers': 'content-type',
        });
        response.end();
        return;
      }
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        response.writeHead(200, { 'access-control-allow-origin': '*' });
        response.end('ok');
        if (request.method === 'POST') {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch { parsed = { error: 'bad-json', body: body.slice(0, 200) }; }
          // Stage beacons report progress; only a result or error ends the wait.
          if (parsed?.stage) {
            const detail = parsed.stage === 'heartbeat'
              ? ` bootstrap=${parsed.bootstrapStage} backend=${parsed.backend} focus=${parsed.hasFocus} vis=${parsed.visibility}`
              : '';
            console.error(`[hf331] page reports stage: ${parsed.stage}${detail}`);
            return;
          }
          clearTimeout(timer);
          server.close();
          resolveReport(parsed);
        }
      });
    });
    server.listen(RECEIVER_PORT, '127.0.0.1');
  });
}

const results = [];
for (const name of requested) {
  const spec = BROWSERS[name];
  if (!spec) { results.push({ browser: name, error: 'unknown-browser' }); continue; }
  const executable = spec.candidates.find((candidate) => existsSync(candidate));
  if (!executable) { results.push({ browser: name, error: 'not-installed' }); continue; }

  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', arg('--render', 'quality'));
  const rendererOverride = arg('--renderer', '');
  if (rendererOverride) url.searchParams.set('renderer', rendererOverride);
  url.searchParams.set('qaFpsProbe', ARENA);
  url.searchParams.set('qaFpsSampleMs', String(SAMPLE_MS));
  url.searchParams.set('qaFpsEndpoint', `http://127.0.0.1:${RECEIVER_PORT}/report`);

  console.error(`[hf331] launching ${name} (${executable})`);
  const reportPromise = waitForReport(TIMEOUT_MS);
  spec.launch(executable, url.toString());
  // FOCUS MATTERS: the render runtime refuses to author frames without
  // document focus (browserOwnsForegroundPresentation), so an unfocused window
  // spins in the prewarm loop forever and reads as a browser wedge. The first
  // version of this runner produced exactly that false signal. Activate the
  // window shortly after launch, and again mid-run in case something stole it.
  const activate = () => {
    try {
      execSync(`powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \"Name='${name === 'firefox' ? 'firefox' : name === 'edge' ? 'msedge' : 'chrome'}.exe'\" | Where-Object { $_.CommandLine -like '*hf331-${name}-*' } | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate([int]$p.ProcessId) | Out-Null }"`, { stdio: 'ignore' });
    } catch { /* best effort */ }
  };
  const activateTimers = [setTimeout(activate, 6_000), setTimeout(activate, 30_000), setTimeout(activate, 90_000)];
  const report = await reportPromise;
  for (const timer of activateTimers) clearTimeout(timer);
  results.push({ browser: name, executable, ...report });
  // Close only the windows we opened: the spawn pid is a launcher stub, so kill
  // by command-line match on the unique temp profile - a user's own browser
  // session can never match it.
  try {
    execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*hf331-${name}-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
  } catch { /* windows already gone */ }
  console.error(`[hf331] ${name}: ${report.error ?? `median ${report.medianFps} fps on ${report.backend}`}`);
}

mkdirSync(resolve('artifacts/qa'), { recursive: true });
const receipt = { measuredAt: new Date().toISOString(), arena: ARENA, sampleMs: SAMPLE_MS, results };
writeFileSync(resolve('artifacts/qa/hf331-installed-browser-fps.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
