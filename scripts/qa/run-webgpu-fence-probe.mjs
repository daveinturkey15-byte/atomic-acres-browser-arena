#!/usr/bin/env node
// Opens public/qa-webgpu-fence-probe.html in an installed browser and prints
// which WebGPU completion primitives resolve there. See the HTML for why.
// Usage: node scripts/qa/run-webgpu-fence-probe.mjs [--browser firefox|chrome]
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BROWSER = arg('--browser', 'firefox');
const PORT = Number(arg('--port', '9912'));
const BASE = arg('--url', 'http://127.0.0.1:41876');

const executables = {
  firefox: ['C:/Program Files/Mozilla Firefox/firefox.exe'],
  chrome: ['C:/Program Files/Google/Chrome/Application/chrome.exe'],
};
const executable = (executables[BROWSER] ?? []).find((candidate) => existsSync(candidate));
if (!executable) { console.error(`${BROWSER} not installed`); process.exit(2); }

const report = await new Promise((resolveReport) => {
  const timer = setTimeout(() => { server.close(); resolveReport({ error: 'timeout' }); }, 90_000);
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      response.writeHead(200, { 'access-control-allow-origin': '*' });
      response.end('ok');
      if (request.method !== 'POST') return;
      clearTimeout(timer);
      server.close();
      try { resolveReport(JSON.parse(body)); } catch { resolveReport({ error: 'bad-json' }); }
    });
  });
  server.listen(PORT, '127.0.0.1');

  const url = `${BASE}/qa-webgpu-fence-probe.html?endpoint=http://127.0.0.1:${PORT}/report`;
  const profile = mkdtempSync(join(tmpdir(), `fence-${BROWSER}-`));
  // DECLARED VISIBLE LANE, muted. This probe times GPU fence completion against
  // the real presentation path, so it is deliberately not parked off-screen: an
  // uncomposited window stops presenting and the fence timings it reports would
  // be measuring nothing. Muting is the half that costs the measurement nothing.
  // See scripts/qa/browser-visibility-contract.test.mjs.
  if (BROWSER === 'firefox') spawn(executable, ['-no-remote', '-profile', profile, '-new-window', url], { stdio: 'ignore' });
  else spawn(executable, [`--user-data-dir=${profile}`, '--mute-audio', '--no-first-run', '--new-window', url], { stdio: 'ignore' });
});

// Kill ONLY windows we opened: match the temp profile in the command line so a
// user's own browser session is untouchable. (A plain taskkill of the spawn pid
// kills the launcher stub, not the real process - the first version of the
// hf331 runner learned that by leaving orphan windows behind.)
try {
  execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='${BROWSER}.exe'\\" | Where-Object { $_.CommandLine -like '*fence-${BROWSER}-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' });
} catch { /* best-effort cleanup */ }

console.log(JSON.stringify(report, null, 2));
