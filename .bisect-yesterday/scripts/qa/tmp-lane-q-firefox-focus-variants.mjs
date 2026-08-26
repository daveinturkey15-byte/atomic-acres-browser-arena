#!/usr/bin/env node
// Throwaway bisect for HF-331: which Firefox launch variant, if any, ever gives
// the CONTENT document focus? The game's frame loop is gated on
// document.hasFocus(), so this single predicate decides whether Firefox can run
// the game at all on this machine.
//
// Serves a tiny page from its own server, launches Firefox one way per variant,
// takes and holds the Windows foreground, and reports whether the page ever saw
// focus. No game, no bundler - only the predicate.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { foregroundWindow, killByToken } from './installed-browser-lanes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIREFOX = 'C:/Program Files/Mozilla Firefox/firefox.exe';
const PORT = 9917;
const OBSERVE_MS = 12_000;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>ff focus bisect</title></head>
<body style="background:#123;color:#cfe;font:16px sans-serif"><h1 id="h">watching focus…</h1>
<script>
var events=[],t0=performance.now();
var note=function(n){ if(events.length<40) events.push({at:Math.round(performance.now()-t0),event:n}); };
addEventListener('focus',function(){note('window.focus')});
addEventListener('blur',function(){note('window.blur')});
document.addEventListener('focusin',function(e){note('focusin:'+((e.target&&e.target.tagName)||'?'))});
var everFocused=false,samples=0,focused=0;
setInterval(function(){
  samples++;
  var f = typeof document.hasFocus==='function' && document.hasFocus();
  if(f){focused++;everFocused=true;}
  document.getElementById('h').textContent='hasFocus='+f+' ever='+everFocused+' n='+samples;
},250);
setTimeout(function(){
  fetch('/report',{method:'POST',headers:{'content-type':'text/plain'},body:JSON.stringify({
    variant:new URLSearchParams(location.search).get('variant'),
    everFocused:everFocused, focusedFraction:Number((focused/Math.max(1,samples)).toFixed(3)),
    hasFocusAtEnd:document.hasFocus(), visibility:document.visibilityState,
    activeElement:document.activeElement?document.activeElement.tagName:null,
    events:events, userAgent:navigator.userAgent
  })});
}, ${OBSERVE_MS});
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
  request.on('end', () => {
    response.writeHead(204); response.end();
    try { settle?.(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { /* ignore */ }
  });
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

const PREFS_FULL = [
  'user_pref("widget.windows.window_occlusion_tracking.enabled", false);',
  'user_pref("browser.shell.checkDefaultBrowser", false);',
  'user_pref("browser.aboutwelcome.enabled", false);',
  'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
  'user_pref("privacy.reduceTimerPrecision", false);',
].join('\n');

const VARIANTS = [
  { name: 'profile-newwindow', prefs: PREFS_FULL, args: (profile, url) => ['-no-remote', '-profile', profile, '-new-window', url] },
  { name: 'profile-privatewindow', prefs: PREFS_FULL, args: (profile, url) => ['-no-remote', '-profile', profile, '-private-window', url] },
  { name: 'profile-privatewindow-remote', prefs: PREFS_FULL, args: (profile, url) => ['-profile', profile, '-private-window', url] },
  { name: 'default-profile-private', prefs: null, args: (profile, url) => ['-private-window', url] },
];

const results = [];
for (const variant of VARIANTS) {
  const token = `fffocus-${process.pid}-${variant.name}`;
  const profile = mkdtempSync(join(tmpdir(), `${token}-`));
  if (variant.prefs !== null) writeFileSync(join(profile, 'user.js'), `${variant.prefs}\n`);
  const url = `http://127.0.0.1:${PORT}/?variant=${variant.name}`;
  const done = new Promise((settleReport) => {
    const timer = setTimeout(() => settleReport({ error: 'timeout' }), OBSERVE_MS + 60_000);
    settle = (payload) => { clearTimeout(timer); settleReport(payload); };
  });
  console.error(`[ffbisect] ${variant.name}`);
  spawn(FIREFOX, variant.args(profile, url), { stdio: 'ignore', windowsHide: false });
  const foreground = [];
  const keep = setInterval(() => {
    // The default-profile variant has no token in its command line, so match on
    // the process name alone for that one - it is still only Firefox windows.
    const attempt = foregroundWindow({
      token: variant.prefs === null ? 'firefox.exe' : token,
      processName: 'firefox',
      scriptDir: HERE,
      realClick: true,
    });
    foreground.push(attempt.ok);
  }, 3_000);
  const report = await done;
  clearInterval(keep);
  killByToken(variant.prefs === null ? 'private-window' : token);
  results.push({ variant: variant.name, foregroundHeld: foreground.filter(Boolean).length, foregroundTries: foreground.length, ...report });
  console.error(`[ffbisect] ${variant.name}: everFocused=${report.everFocused} fraction=${report.focusedFraction} events=${(report.events ?? []).length}`);
}

server.close();
mkdirSync(resolve('artifacts/qa/lane-q'), { recursive: true });
writeFileSync(resolve('artifacts/qa/lane-q/firefox-focus-variants.json'), `${JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(JSON.stringify(results.map((row) => ({
  variant: row.variant, everFocused: row.everFocused ?? null, focusedFraction: row.focusedFraction ?? null,
  events: (row.events ?? []).length, foreground: `${row.foregroundHeld}/${row.foregroundTries}`, error: row.error ?? null,
})), null, 2));
