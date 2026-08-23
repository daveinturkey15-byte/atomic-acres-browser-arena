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
import { join, resolve } from 'node:path';

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

const results = [];
let sweepDone = false;

const report = await new Promise((resolveReport) => {
  const timer = setTimeout(() => { server.close(); resolveReport({ timedOut: true }); }, TIMEOUT_MS);
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
      if (parsed.stage === 'bootstrap-ready') {
        console.error(`[webgpu-boot] bootstrap ready on backend=${parsed.backend}`);
        return;
      }
      if (parsed.stage === 'sweep-complete') {
        sweepDone = true;
        clearTimeout(timer);
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
    spawn(executable, ['-no-remote', '-profile', profile, '-new-window', url.toString()], { stdio: 'ignore' });
  } else {
    spawn(executable, [`--user-data-dir=${profile}`, '--no-first-run', '--new-window', url.toString()], { stdio: 'ignore' });
  }

  // The renderer refuses to author frames without document focus, so bring the
  // window forward - an unfocused window used to stall the prewarm entirely.
  const activate = () => {
    const image = BROWSER === 'edge' ? 'msedge' : BROWSER;
    try {
      execSync(`powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \\"Name='${image}.exe'\\" | Where-Object { $_.CommandLine -like '*wgpuboot-${BROWSER}-*' } | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate([int]$p.ProcessId) | Out-Null }"`, { stdio: 'ignore' });
    } catch { /* best effort */ }
  };
  for (const delay of [5_000, 20_000, 60_000, 150_000]) setTimeout(activate, delay);
});

// Kill only the windows we opened, matched on the unique temp profile.
try {
  execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*wgpuboot-${BROWSER}-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
} catch { /* already gone */ }

const expected = ARENAS.split(',').map((entry) => entry.trim()).filter(Boolean);
const failed = results.filter((entry) => !entry.ok).map((entry) => entry.arena);
const missing = expected.filter((arena) => !results.some((entry) => entry.arena === arena));
const verdict = !report.timedOut && failed.length === 0 && missing.length === 0 ? 'PASS' : 'FAIL';

mkdirSync(resolve('artifacts/qa'), { recursive: true });
const receipt = {
  verdict,
  browser: BROWSER,
  requestedRenderer: RENDERER || 'auto',
  actualBackend: results[0]?.backend ?? null,
  sweepCompleted: sweepDone,
  failed,
  neverReported: missing,
  arenas: results,
};
writeFileSync(resolve('artifacts/qa/webgpu-arena-boot.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
process.exit(verdict === 'PASS' ? 0 : 1);
