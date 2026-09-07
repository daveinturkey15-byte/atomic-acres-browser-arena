#!/usr/bin/env node
// HF-331 CONTROL EXPERIMENT: what frame rate can this browser reach on this
// machine when the game is not involved at all?
//
// WHY. "Firefox runs at ~10 FPS and Chrome at 150+" was carried for weeks as a
// product defect, and every attempt to measure it reached for a driver: bundled
// Playwright-Firefox (hangs in launch() here), geckodriver, CDP. All of them are
// dead instruments for stock Firefox and Opera. Worse, none of them answered the
// question that decides whether there is a defect at all - a game frame rate is
// only meaningful against the browser's own CEILING. A browser pinned to the
// monitor's refresh by vsync and a browser crawling under GPU load produce the
// same number with no way to tell them apart.
//
// So this measures the ceiling directly, with no game, no bundler and no
// automation protocol: a static page served by this script's own server (same
// origin, so the POST back is not even a CORS question), driven by nothing but
// requestAnimationFrame.
//
// Three stages, in one page load:
//   idle     - rAF with an empty callback. This is the browser's presentation
//              cadence and nothing else.
//   clear    - rAF driving a WebGL2 glClear. Proves the compositor path is live
//              without asking anything of the GPU.
//   load     - rAF driving N full-screen shader passes. If this stays at the
//              idle rate the browser is presentation-bound (vsync); if it falls
//              away, this machine is GPU-bound and the game's number should be
//              read the same way.
//
// --uncap removes the vsync limiter (Firefox layout.frame_rate=0, Chromium
// --disable-gpu-vsync --disable-frame-rate-limit). An idle rate that jumps from
// ~monitor-Hz to hundreds under --uncap is proof the default number was a vsync
// cap and not a performance ceiling.
//
// --no-foreground deliberately leaves the window unfocused. That control exists
// because an unfocused window on this machine reads EXACTLY like a wedged
// browser, and the only way to stop mistaking one for the other is to have both
// numbers side by side in the same receipt.
//
// Usage:
//   node scripts/qa/measure-refresh-ceiling.mjs [--browsers chrome,edge,firefox,opera]
//     [--sample-ms 4000] [--passes 24] [--uncap] [--no-foreground]
//     [--out artifacts/qa/browser-refresh-ceiling.json]
// --------------------------------------------------------------------------
// DECLARED VISIBLE LANE, muted. This measures the display refresh ceiling, so
// the real compositor is the instrument - it calls foregroundWindow() on
// purpose because an unfocused or occluded window is throttled and reads as a
// wedged browser. Parking it off-screen would break the measurement rather
// than hide it. Muting is free and is applied via installed-browser-lanes.mjs.
// See scripts/qa/browser-visibility-contract.test.mjs.
// --------------------------------------------------------------------------

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_LANES, foregroundWindow, killByToken, closeGracefully, processIsRunning,
} from './installed-browser-lanes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const list = (value) => value.split(',').map((entry) => entry.trim()).filter(Boolean);

const BROWSERS = list(arg('--browsers', 'chrome,edge,firefox,opera'));
const SAMPLE_MS = Number(arg('--sample-ms', '4000'));
const PASSES = Number(arg('--passes', '24'));
const PORT = Number(arg('--port', '9915'));
const TIMEOUT_MS = Number(arg('--timeout', '120000'));
const UNCAP = argv.includes('--uncap');
const NO_FOREGROUND = argv.includes('--no-foreground');
const CLICK_FOCUS = argv.includes('--click-focus');
const REAL_CLICK = argv.includes('--real-click');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/qa/browser-refresh-ceiling.json'));

const RUN_TOKEN = `ceiling-${process.pid}-${Date.now().toString(36)}`;

// ---------------------------------------------------------------------------
// The page. Inlined rather than a file next to this script because it is served
// by this script's own server: same origin as the receiver, so the report POST
// is a same-origin request and no browser can decide to drop it.
// ---------------------------------------------------------------------------
const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>frame-rate ceiling probe</title>
<style>
  html,body{margin:0;height:100%;background:#0b1014;color:#cfe;font:14px/1.5 system-ui,sans-serif}
  canvas{position:fixed;inset:0;width:100%;height:100%;display:block}
  #log{position:fixed;left:12px;top:12px;z-index:2;white-space:pre;text-shadow:0 1px 2px #000}
</style></head>
<body><canvas id="c"></canvas><pre id="log">starting…</pre>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var sampleMs = Number(params.get('sampleMs') || 4000);
  var passes = Number(params.get('passes') || 24);
  var log = document.getElementById('log');
  var say = function (text) { log.textContent = text; };

  // Focus is sampled THROUGHOUT every stage, not once at the end. A window that
  // is focused when the run starts and loses it midway produces a low number
  // for a reason that has nothing to do with the browser, and a single
  // end-of-run reading cannot tell that story.
  function makeStage() { return { deltas: [], focusSamples: 0, focusedSamples: 0, hiddenSamples: 0 }; }

  function runStage(stage, onFrame) {
    return new Promise(function (done) {
      var startedAt = performance.now();
      var previous = startedAt;
      function frame() {
        var now = performance.now();
        stage.deltas.push(now - previous);
        previous = now;
        stage.focusSamples += 1;
        if (typeof document.hasFocus === 'function' && document.hasFocus()) stage.focusedSamples += 1;
        if (document.visibilityState !== 'visible') stage.hiddenSamples += 1;
        if (onFrame) onFrame(now - startedAt);
        if (now - startedAt >= sampleMs) { done(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function summarise(stage) {
    var deltas = stage.deltas.slice().sort(function (a, b) { return a - b; });
    if (deltas.length === 0) return { frames: 0 };
    var at = function (f) { return deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * f))]; };
    var round = function (n) { return Number(n.toFixed(2)); };
    var fps = function (ms) { return Number((1000 / Math.max(0.001, ms)).toFixed(1)); };
    return {
      frames: deltas.length,
      medianFrameMs: round(at(0.5)),
      p90FrameMs: round(at(0.9)),
      p99FrameMs: round(at(0.99)),
      minFrameMs: round(deltas[0]),
      maxFrameMs: round(deltas[deltas.length - 1]),
      medianFps: fps(at(0.5)),
      p90WorstFps: fps(at(0.9)),
      focusedFraction: Number((stage.focusedSamples / Math.max(1, stage.focusSamples)).toFixed(3)),
      hiddenFraction: Number((stage.hiddenSamples / Math.max(1, stage.focusSamples)).toFixed(3))
    };
  }

  // Taking the OS foreground is not the same as the CONTENT having focus. In
  // Firefox a freshly launched window can sit in the foreground with focus in
  // the address bar, and document.hasFocus() is false for the whole run - which
  // is precisely the state the game's frame loop refuses to render in. Ask for
  // content focus from inside the page, repeatedly, and record whether it took.
  // A focus TIMELINE, not a focus reading. "document.hasFocus() was false at the
  // end" is compatible with three different stories - never focused, focused and
  // lost it, or focused but the API disagrees with the window's own events - and
  // the game's frame loop is gated on exactly this predicate, so which story it
  // is decides whether a slow frame rate is the browser's fault or the gate's.
  var focusEvents = [];
  var t0 = performance.now();
  var noteEvent = function (name) {
    if (focusEvents.length < 60) focusEvents.push({ at: Math.round(performance.now() - t0), event: name });
  };
  window.addEventListener('focus', function () { noteEvent('window.focus'); });
  window.addEventListener('blur', function () { noteEvent('window.blur'); });
  document.addEventListener('focusin', function (event) {
    noteEvent('focusin:' + ((event.target && event.target.tagName) || '?'));
  });
  document.addEventListener('visibilitychange', function () { noteEvent('visibility:' + document.visibilityState); });

  var focusPulls = 0;
  function pullFocusIntoContent() {
    if (typeof document.hasFocus === 'function' && document.hasFocus()) return;
    focusPulls += 1;
    try { window.focus(); } catch (ignored) { /* popup-blocked; the element focus below still helps */ }
    try {
      if (!document.body.hasAttribute('tabindex')) document.body.setAttribute('tabindex', '-1');
      document.body.focus({ preventScroll: true });
    } catch (ignored) { /* nothing else to try from in here */ }
  }
  pullFocusIntoContent();
  setInterval(pullFocusIntoContent, 1000);

  var canvas = document.getElementById('c');
  var gl = null;
  var glError = null;
  var program = null;
  try {
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      var vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}');
      gl.compileShader(vs);
      var fs = gl.createShader(gl.FRAGMENT_SHADER);
      // Deliberately expensive per pixel, and dependent on a uniform so no
      // driver can fold it away: the point is to put real work on the GPU.
      gl.shaderSource(fs, 'precision highp float;uniform float t;void main(){float a=0.0;vec2 uv=gl_FragCoord.xy*0.001;for(int i=0;i<48;i++){a+=sin(uv.x*float(i)+t)*cos(uv.y*float(i)-t);}gl_FragColor=vec4(vec3(a*0.02+0.5),1.0);}');
      gl.compileShader(fs);
      program = gl.createProgram();
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      var buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
  } catch (error) { glError = String(error).slice(0, 200); }

  function sizeCanvas() {
    canvas.width = Math.floor(window.innerWidth * (window.devicePixelRatio || 1));
    canvas.height = Math.floor(window.innerHeight * (window.devicePixelRatio || 1));
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
  }
  sizeCanvas();

  function adapterIdentity() {
    if (!gl) return { available: false, error: glError };
    var unmasked = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      version: String(gl.getParameter(gl.VERSION)),
      renderer: String(gl.getParameter(gl.RENDERER)),
      vendor: String(gl.getParameter(gl.VENDOR)),
      unmaskedRenderer: unmasked ? String(gl.getParameter(unmasked.UNMASKED_RENDERER_WEBGL)) : null,
      unmaskedVendor: unmasked ? String(gl.getParameter(unmasked.UNMASKED_VENDOR_WEBGL)) : null
    };
  }

  function post(payload) {
    var body = JSON.stringify(payload);
    try {
      fetch('/report', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: body, keepalive: true });
    } catch (ignored) {
      try { navigator.sendBeacon('/report', body); } catch (alsoIgnored) { /* receiver gone */ }
    }
  }

  (async function () {
    try {
      // A cold first second is compositor startup, not cadence.
      await new Promise(function (settle) { setTimeout(settle, 1200); });

      say('stage 1/3: idle rAF');
      var idle = makeStage();
      await runStage(idle, null);

      say('stage 2/3: webgl clear');
      var clear = makeStage();
      await runStage(clear, function () {
        if (!gl) return;
        gl.clearColor(0.04, 0.06, 0.08, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      });

      say('stage 3/3: webgl fragment load');
      var load = makeStage();
      var tLoc = gl && program ? gl.getUniformLocation(program, 't') : null;
      await runStage(load, function (elapsed) {
        if (!gl || !program) return;
        gl.useProgram(program);
        for (var pass = 0; pass < passes; pass++) {
          if (tLoc) gl.uniform1f(tLoc, (elapsed * 0.001) + pass);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      });

      post({
        done: true,
        userAgent: navigator.userAgent,
        sampleMs: sampleMs,
        passes: passes,
        stages: { idle: summarise(idle), clear: summarise(clear), load: summarise(load) },
        webgpuAvailable: Boolean(navigator.gpu),
        adapter: adapterIdentity(),
        canvasPixels: canvas.width + 'x' + canvas.height,
        display: {
          screenWidth: screen.width,
          screenHeight: screen.height,
          availWidth: screen.availWidth,
          availHeight: screen.availHeight,
          colorDepth: screen.colorDepth,
          devicePixelRatio: window.devicePixelRatio,
          // Which physical monitor the window landed on decides the vsync
          // ceiling on a mixed-refresh desktop, so it is part of the evidence.
          windowScreenX: window.screenX,
          windowScreenY: window.screenY,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight
        },
        focusAtEnd: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
        visibilityAtEnd: document.visibilityState,
        contentFocusPulls: focusPulls,
        focusEvents: focusEvents,
        activeElementAtEnd: document.activeElement
          ? (document.activeElement.tagName + (document.activeElement.id ? '#' + document.activeElement.id : ''))
          : null
      });
      say('done - median idle ' + summarise(idle).medianFps + ' fps');
    } catch (error) {
      post({ done: false, error: String(error).slice(0, 300) });
      say('probe threw: ' + error);
    }
  }());
}());
</script></body></html>`;

// ---------------------------------------------------------------------------
const reports = new Map();
let currentBrowser = null;
const server = createServer((request, response) => {
  if (request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(PAGE);
    return;
  }
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    response.writeHead(204);
    response.end();
    let parsed = null;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return; }
    const waiter = reports.get(currentBrowser);
    if (waiter) waiter(parsed);
  });
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

const results = [];
for (const browser of BROWSERS) {
  const spec = BROWSER_LANES[browser];
  if (!spec) { results.push({ browser, status: 'unknown-browser' }); continue; }
  const executable = spec.candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    // NOT a pass and NOT a silent skip: an absent browser is an uncovered
    // browser, and the receipt has to be able to say so out loud.
    results.push({ browser, status: 'not-installed', searched: spec.candidates });
    console.error(`[ceiling] ${browser}: NOT INSTALLED`);
    continue;
  }

  const token = `${RUN_TOKEN}-${browser}`;
  // The Firefox lane cannot use a disposable profile at all - see
  // installed-browser-lanes.mjs - so it is identified by the probe page's own
  // window title instead of by a profile token.
  const titleMatch = spec.identifyByTitle ? 'frame-rate ceiling probe' : null;
  const profile = mkdtempSync(join(tmpdir(), `${token}-`));
  if (spec.family === 'gecko' && !spec.usesDefaultProfile) {
    writeFileSync(join(profile, 'user.js'), `${spec.prefs({ uncap: UNCAP })}\n`);
  }
  // A default-profile lane hands its URL to any instance already running, so a
  // browser the human left open would swallow the probe and the lane would time
  // out blaming the browser. Refuse instead of guessing.
  const preexisting = spec.usesDefaultProfile && processIsRunning(spec.processName);
  if (preexisting) {
    results.push({
      browser,
      executable,
      status: 'blocked-browser-already-running',
      detail: `${spec.processName}.exe was already running; this lane drives the default profile and will not touch a session it did not start. Close ${spec.label} and re-run.`,
    });
    console.error(`[ceiling] ${browser}: BLOCKED - ${spec.label} already running`);
    continue;
  }
  const url = `http://127.0.0.1:${PORT}/?sampleMs=${SAMPLE_MS}&passes=${PASSES}`;
  currentBrowser = browser;

  const settled = new Promise((settle) => {
    const timer = setTimeout(() => settle({ error: 'receiver-timeout' }), TIMEOUT_MS);
    reports.set(browser, (payload) => { clearTimeout(timer); settle(payload); });
  });

  console.error(`[ceiling] launching ${browser}${UNCAP ? ' (vsync uncapped)' : ''}${NO_FOREGROUND ? ' (foreground deliberately NOT taken)' : ''}`);
  spawn(executable, spec.args({ profile, url, uncap: UNCAP }), {
    stdio: 'ignore',
    windowsHide: false,
    env: { ...process.env, ...(spec.env ?? {}) },
  });

  // KEEP the foreground for the whole run, do not take it once and hope. Focus
  // is stolen back by anything the desktop does - a notification, the terminal
  // this harness runs in - and a single early attempt is how every previous
  // Firefox run ended up measuring an unfocused window.
  const foreground = [];
  const startedAt = Date.now();
  const keepForeground = NO_FOREGROUND ? null : setInterval(() => {
    const attempt = foregroundWindow({
      token: titleMatch ? undefined : token,
      titleMatch: titleMatch ?? undefined,
      processName: spec.processName,
      scriptDir: HERE,
      click: CLICK_FOCUS,
      realClick: REAL_CLICK,
    });
    foreground.push({
      atMs: Date.now() - startedAt,
      ok: attempt.ok,
      title: attempt.windows?.[0]?.title ?? null,
      clicked: attempt.windows?.[0]?.clicked ?? false,
      realClicked: attempt.windows?.[0]?.realClicked ?? false,
    });
  }, 4_000);

  const report = await settled;
  if (keepForeground) clearInterval(keepForeground);
  reports.delete(browser);
  if (titleMatch) {
    // Close the window this run opened, then retire the instance we started -
    // a surviving Firefox owns the remoting handoff and would swallow the next
    // lane's URL. Safe only because the lane refused to start if one was
    // already running.
    foregroundWindow({ titleMatch, processName: spec.processName, scriptDir: HERE, closeOnly: true });
    await new Promise((wait) => setTimeout(wait, 1_500));
    await closeGracefully(spec.processName);
  } else {
    killByToken(token);
  }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* temp dir is disposable */ }

  const record = {
    browser,
    executable,
    status: report.error ? 'failed' : 'measured',
    vsyncUncapped: UNCAP,
    foregroundRequested: !NO_FOREGROUND,
    // Whether the window ACTUALLY held the foreground is the difference between
    // a number and a rumour. It is recorded next to every number it produced.
    foregroundVerified: foreground.some((attempt) => attempt.ok),
    foregroundHeldFraction: foreground.length
      ? Number((foreground.filter((attempt) => attempt.ok).length / foreground.length).toFixed(3))
      : null,
    foregroundAttempts: foreground,
    ...report,
  };
  results.push(record);
  const idle = record.stages?.idle;
  console.error(`[ceiling] ${browser}: ${record.status}`
    + (idle ? ` idle=${idle.medianFps}fps (${idle.medianFrameMs}ms) clear=${record.stages.clear.medianFps}fps load=${record.stages.load.medianFps}fps focus=${idle.focusedFraction}` : ` ${record.error ?? ''}`));
}

server.close();

mkdirSync(resolve(OUT, '..'), { recursive: true });
const receipt = {
  measuredAt: new Date().toISOString(),
  sampleMs: SAMPLE_MS,
  fragmentPassesPerFrame: PASSES,
  vsyncUncapped: UNCAP,
  foregroundRequested: !NO_FOREGROUND,
  results,
};
writeFileSync(OUT, `${JSON.stringify(receipt, null, 2)}\n`);

const columns = [
  ['BROWSER', (row) => row.browser],
  ['STATUS', (row) => row.status],
  ['FOREGROUND', (row) => (row.status === 'not-installed' ? '-' : String(row.foregroundVerified))],
  ['FOCUSED%', (row) => (row.stages ? `${Math.round((row.stages.idle.focusedFraction ?? 0) * 100)}%` : '-')],
  ['IDLE', (row) => (row.stages ? `${row.stages.idle.medianFps}fps` : '-')],
  ['IDLE ms', (row) => (row.stages ? `${row.stages.idle.medianFrameMs}` : '-')],
  ['CLEAR', (row) => (row.stages ? `${row.stages.clear.medianFps}fps` : '-')],
  ['LOAD', (row) => (row.stages ? `${row.stages.load.medianFps}fps` : '-')],
  ['ADAPTER', (row) => String(row.adapter?.unmaskedRenderer ?? row.adapter?.renderer ?? '-').slice(0, 52)],
];
const rows = results.map((row) => columns.map(([, read]) => String(read(row) ?? '-')));
const widths = columns.map(([header], index) => Math.max(header.length, ...rows.map((row) => row[index].length)));
const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');
console.log(line(columns.map(([header]) => header)));
console.log(widths.map((width) => '-'.repeat(width)).join('  '));
for (const row of rows) console.log(line(row));
console.log(`\nreceipt=${OUT}`);
