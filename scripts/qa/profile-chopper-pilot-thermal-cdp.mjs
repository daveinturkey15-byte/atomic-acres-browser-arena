#!/usr/bin/env node
// ===========================================================================
// CHOPPER PILOT THERMAL-REVEAL INSTRUMENT (pass84).
//
// The handoff's discriminator: existing chopper profilers instrument the
// OBSERVING peer; the pilot's lag was never measured. This drives the real
// host lobby (bots at max), grants and possesses the Chopper Gunner through
// the debug surface, and samples the PILOT side: presented-frame intervals,
// ghost-rig build/release churn counters, active ghost layers and scene draw
// calls, before and after any thermal fix. Diagnostic evidence for the pass84
// pilot-freeze change - not a gate.
//
// HEADLESS, installed Chrome (channel:'chrome'), muted, no pointer lock.
// ===========================================================================
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => argv.indexOf(name) >= 0 && argv[argv.indexOf(name) + 1] ? argv[argv.indexOf(name) + 1] : fallback;
const DIST = resolve(arg('--dist', 'dist'));
const LABEL = arg('--label', 'run');
const OUT = resolve(arg('--out', `artifacts/qa/chopper-pilot/${LABEL}.json`));
const PORT = Number(arg('--port', '4199'));
const WIDTH = Number(arg('--width', '1600'));
const HEIGHT = Number(arg('--height', '900'));
const GROUND_SECONDS = Number(arg('--ground-seconds', '6'));
const RIDE_SECONDS = Number(arg('--ride-seconds', '20'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance', '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}`);
const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  const file = join(DIST, relative);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404).end('nope'); return; }
  const body = readFileSync(file);
  response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.context().newCDPSession(page).then((cdp) => cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}));
page.on('pageerror', (error) => console.error('[pageerror]', String(error).slice(0, 300)));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 300_000 });
// The menu's map cards are the known-good boot gate (verify-map-card-provenance).
await page.waitForSelector('.map-card', { timeout: 300_000 });
await page.waitForTimeout(1_000);

// Boot the real hosted lobby with the maximum bot count through the DOM.
await page.click('#host');
await page.waitForSelector('#lobby-bots', { timeout: 60_000, state: 'attached' });
await page.evaluate(() => {
  const bots = document.querySelector('#lobby-bots');
  bots.value = [...bots.options].reduce((best, option) => (Number(option.value) > Number(best.value) ? option : best), bots.options[0]).value;
  bots.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);
const startControls = ['#lobby-start', '#start', '#deploy'];
let started = false;
for (const selector of startControls) {
  if (await page.$(selector)) { await page.click(selector); started = true; break; }
}
if (!started) throw new Error('no lobby start control found');
// Match admission (arena compile behind the deployment fence) can take a while cold.
await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__
  && window.__ATOMIC_ACRES_DEBUG__.sampleChopperPilotLoad
  && window.__ATOMIC_ACRES_DEBUG__.sampleChopperPilotLoad().matchPhase === 'active', { timeout: 420_000 });
console.error('[pilot] match active');

// rAF interval sampler installed in the page.
await page.evaluate(() => {
  window.__PILOT_RAF__ = { stamps: [], sampling: true };
  const tick = (stamp) => {
    if (!window.__PILOT_RAF__.sampling) return;
    window.__PILOT_RAF__.stamps.push(stamp);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const sample = () => page.evaluate(() => {
  const load = window.__ATOMIC_ACRES_DEBUG__.sampleChopperPilotLoad();
  const stamps = window.__PILOT_RAF__.stamps;
  window.__PILOT_RAF__.stamps = [];
  const intervals = stamps.slice(1).map((value, index) => value - stamps[index]);
  intervals.sort((left, right) => left - right);
  return {
    ...load,
    rafFrames: stamps.length,
    rafMeanGapMs: intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null,
    rafMaxGapMs: intervals.length ? intervals[intervals.length - 1] : null,
  };
});
const sleep = (ms) => new Promise((wait) => setTimeout(wait, ms));

// Phase A: ground baseline (alive, no reveal).
await sleep(GROUND_SECONDS * 1000);
const groundBefore = await sample();
const groundSamples = [groundBefore];
for (let i = 0; i < 3; i += 1) { await sleep(1000); groundSamples.push(await sample()); }

// Grant + possess the chopper through the real support flow.
await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.earnSupport(15);
  return api.activateKillstreak('chopper');
});
let possessed = false;
for (let attempt = 0; attempt < 40 && !possessed; attempt += 1) {
  possessed = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl());
  if (!possessed) await sleep(500);
}
if (!possessed) throw new Error('chopper possession never succeeded');
console.error('[pilot] possessed');

// Phase B: riding, firing periodically so bots die and the target set churns.
const rideStart = Date.now();
const rideSamples = [];
let fireTick = 0;
while ((Date.now() - rideStart) / 1000 < RIDE_SECONDS) {
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    for (let i = 0; i < 3; i++) api.fireOnce();
  });
  await sleep(1000);
  rideSamples.push(await sample());
  fireTick += 1;
}

await page.evaluate(() => { window.__PILOT_RAF__.sampling = false; });
const summarize = (samples) => {
  const gaps = samples.flatMap((entry) => (entry.rafMeanGapMs === null ? [] : [entry]));
  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
  return {
    samples: samples.length,
    rafMeanGapMs: mean(gaps.map((entry) => entry.rafMeanGapMs)),
    rafWorstGapMs: gaps.length ? Math.max(...gaps.map((entry) => entry.rafMaxGapMs)) : null,
    impliedFps: mean(gaps.map((entry) => (entry.rafMeanGapMs ? 1000 / entry.rafMeanGapMs : null))),
    drawCalls: mean(samples.map((entry) => entry.sceneDrawCalls)),
    triangles: mean(samples.map((entry) => entry.sceneTriangles)),
    activeModelLayers: mean(samples.map((entry) => entry.ghost.activeModelLayers)),
    trackedTargets: mean(samples.map((entry) => entry.ghost.trackedTargets)),
  };
};
const first = rideSamples[0];
const last = rideSamples[rideSamples.length - 1];
const report = {
  contract: 'chopper-pilot-thermal-instrument-v1',
  measuredAt: new Date().toISOString(),
  label: LABEL,
  ground: { ...summarize(groundSamples), ghostBuildCount: groundSamples[0].ghost.ghostBuildCount, ghostReleaseCount: groundSamples[0].ghost.ghostReleaseCount },
  ride: {
    ...summarize(rideSamples),
    ghostBuildsDuringRide: last.ghost.ghostBuildCount - groundSamples[0].ghost.ghostBuildCount,
    ghostReleasesDuringRide: last.ghost.ghostReleaseCount - groundSamples[0].ghost.ghostReleaseCount,
    activeModelLayersFirst: first.ghost.activeModelLayers,
    activeModelLayersLast: last.ghost.activeModelLayers,
  },
  ridePerSecond: rideSamples.map((entry) => ({
    rafMeanGapMs: entry.rafMeanGapMs, drawCalls: entry.sceneDrawCalls,
    builds: entry.ghost.ghostBuildCount, releases: entry.ghost.ghostReleaseCount,
    activeModelLayers: entry.ghost.activeModelLayers, trackedTargets: entry.ghost.trackedTargets,
  })),
};
mkdirSync(dirname(OUT), { recursive: true });
console.error(`[pilot] report ${JSON.stringify({ ground: report.ground, ride: report.ride })}`);
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.error(`[pilot] ground fps=${report.ground.impliedFps} draws=${report.ground.drawCalls}`);
console.error(`[pilot] ride fps=${report.ride.impliedFps} draws=${report.ride.drawCalls} builds=${report.ride.ghostBuildsDuringRide} releases=${report.ride.ghostReleasesDuringRide} layers=${report.ride.activeModelLayers}`);
console.error(`Wrote ${OUT}`);
await browser.close();
server.close();
