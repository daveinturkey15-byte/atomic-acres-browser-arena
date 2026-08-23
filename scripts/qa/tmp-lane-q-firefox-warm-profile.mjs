#!/usr/bin/env node
// Follow-up bisect: is it "fresh profile" or "Firefox" that withholds content
// focus? Same profile directory, launched twice. If the second run gets focus,
// the fix is a WARMED profile the gate reuses, not a virgin one per run.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foregroundWindow, killByToken } from './installed-browser-lanes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIREFOX = 'C:/Program Files/Mozilla Firefox/firefox.exe';
const PORT = 9918;
const OBSERVE_MS = 10_000;
const PROFILE = resolve('artifacts/qa/lane-q/ff-warm-profile');

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>ff warm bisect</title></head>
<body style="background:#123;color:#cfe;font:16px sans-serif"><h1 id="h">watching…</h1>
<script>
var events=[],t0=performance.now(),samples=0,focused=0,ever=false;
var note=function(n){ if(events.length<40) events.push({at:Math.round(performance.now()-t0),event:n}); };
addEventListener('focus',function(){note('window.focus')});
addEventListener('blur',function(){note('window.blur')});
setInterval(function(){samples++;var f=document.hasFocus();if(f){focused++;ever=true;}document.getElementById('h').textContent='hasFocus='+f+' ever='+ever;},250);
setTimeout(function(){fetch('/report',{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify({
  run:new URLSearchParams(location.search).get('run'),everFocused:ever,
  focusedFraction:Number((focused/Math.max(1,samples)).toFixed(3)),
  visibility:document.visibilityState,events:events})});}, ${OBSERVE_MS});
</script></body></html>`;

let settle = null;
const server = createServer((request, response) => {
  if (request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(PAGE);
    return;
  }
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => { response.writeHead(204); response.end(); try { settle?.(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { /* ignore */ } });
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });
writeFileSync(resolve(PROFILE, 'user.js'), [
  'user_pref("widget.windows.window_occlusion_tracking.enabled", false);',
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("browser.aboutwelcome.enabled", false);',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("privacy.reduceTimerPrecision", false);',
  'user_pref("browser.sessionstore.resume_from_crash", false);',
  '',
].join('\n'));

const results = [];
for (const run of ['cold', 'warm', 'warm-2']) {
  const token = `ffwarm-${process.pid}-${run}`;
  const url = `http://127.0.0.1:${PORT}/?run=${run}`;
  const done = new Promise((settleReport) => {
    const timer = setTimeout(() => settleReport({ error: 'timeout' }), OBSERVE_MS + 45_000);
    settle = (payload) => { clearTimeout(timer); settleReport(payload); };
  });
  console.error(`[ffwarm] ${run}`);
  // MOZ_PROFILE marker in the env is not visible in the command line, so the
  // kill has to match on something that is: a unique -new-instance token is not
  // available, so match on the profile path, which is unique to this harness.
  spawn(FIREFOX, ['-no-remote', '-profile', PROFILE, '-new-window', url], { stdio: 'ignore', windowsHide: false });
  const foreground = [];
  const keep = setInterval(() => {
    foreground.push(foregroundWindow({ token: 'ff-warm-profile', processName: 'firefox', scriptDir: HERE, realClick: true }).ok);
  }, 3_000);
  const report = await done;
  clearInterval(keep);
  killByToken('ff-warm-profile');
  await new Promise((wait) => setTimeout(wait, 2_500));
  results.push({ run, foreground: `${foreground.filter(Boolean).length}/${foreground.length}`, ...report });
  console.error(`[ffwarm] ${run}: everFocused=${report.everFocused} fraction=${report.focusedFraction}`);
}
server.close();
mkdirSync(resolve('artifacts/qa/lane-q'), { recursive: true });
writeFileSync(resolve('artifacts/qa/lane-q/firefox-warm-profile.json'), `${JSON.stringify({ measuredAt: new Date().toISOString(), profile: PROFILE, results }, null, 2)}
`);
console.log(JSON.stringify(results, null, 2));
