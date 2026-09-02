#!/usr/bin/env node
// Lane AB (PASS 87) — TIME OF DAY x WEATHER capture and combat-safety judgement.
//
// WHAT MAKES THIS AN A/B AND NOT A GALLERY
// `src/rendering/lighting-conditions.ts` is the IDENTITY at each arena's
// authored hour, so `?tod=authored` on the SAME BUILD is the exact PASS 85
// look. Every state is therefore compared against a before frame taken from the
// same bundle, the same camera, the same seed and the same frozen visual time —
// the only variable is the hour. No second build, no cross-commit diff, and no
// argument about what else moved.
//
// WHAT IT JUDGES
// The safety claim the module makes is arithmetic ("the shadow floor can only
// rise"); this checks it in PIXELS, which is a different claim:
//   1. SHADOW MASS may not grow. If a time of day hides a player in a shadow,
//      the fraction of the frame below luma 24 goes UP, and this fails.
//   2. The 5th-percentile luma (the shadow-detail floor — an enemy in shade
//      lives here) may not collapse.
//   3. The frame must not go so bright that silhouettes wash out.
// Plus the two costs the owner cares about: DRAW CALLS may not move at all (a
// uniform write cannot add a draw; if it did, something built geometry), and the
// frame time may not regress.
//
// Runs INSTALLED CHROME HEADLESS over CDP. A run that asked for WebGPU and got
// anything else, or got the Microsoft software adapter, is INVALIDATED rather
// than written as evidence.
//
// Usage:
//   node scripts/qa/capture-lane-ab-time-of-day.mjs --serve-dist dist-lane-ab
//     [--arenas a,b] [--out artifacts/lane-ab] [--frame-samples 240]
import { chromium } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

/**
 * One review camera per arena — the authored OVERVIEW, which is the frame that
 * shows the most of the place. The point of this sweep is the LIGHT, and a
 * light change that is invisible in the overview is not a light change.
 */
const ARENA_CAMERAS = Object.freeze({
  'atomic-acres': 'nuke-town-street-axis',
  'skyline-terminal': 'terminal-overview',
  'rustworks-1v1': 'rustrig-overview',
  'gun-range': 'gun-range-overview',
  farcrysis: 'farcrysis-beach-golden',
  'high-seas': 'high-seas-starboard-overview',
  test1: 'test1-tower-overview',
  test2: 'test2-estate-overview',
  map3: 'map3-hub-vista',
});

/**
 * The three times of day, plus the before. `authored` is the identity, so it is
 * the A of the A/B rather than a fourth state.
 */
const TIME_STATES = Object.freeze(['authored', 'early', 'midday', 'late']);

/**
 * Two weathers per arena: clear, and the heaviest rung the arena AUTHORS.
 * Asking an indoor or pinned-clear arena for a storm would measure the weather
 * model's clamp, not this lane.
 */
const ARENA_HEAVY_WEATHER = Object.freeze({
  'atomic-acres': 'heavy-rain',
  'skyline-terminal': 'heavy-rain',
  'rustworks-1v1': 'storm',
  'gun-range': null,
  farcrysis: 'storm',
  'high-seas': 'storm',
  test1: null,
  test2: null,
  map3: 'overcast',
});

const ARENAS = arg('--arenas', Object.keys(ARENA_CAMERAS).join(','))
  .split(',').map((entry) => entry.trim()).filter(Boolean);
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/lane-ab'));
const FRAME_SAMPLES = Math.max(60, Number(arg('--frame-samples', '240')));
const VIEWPORT = (() => {
  const [w, h] = arg('--viewport', '1280x720').split('x').map(Number);
  return { width: w, height: h };
})();

/** Frame statistics on the sRGB frame the owner sees. Same metric family as
 *  scripts/qa/compare-lane-l-art-direction.mjs, so the two are comparable. */
async function measure(file) {
  const image = sharp(file);
  const { width, height } = await image.metadata();
  const raw = await image.clone().removeAlpha().raw().toBuffer();
  let sumR = 0, sumG = 0, sumB = 0, sumSat = 0;
  let shadowMass = 0, highlightMass = 0;
  const lumaHistogram = new Uint32Array(256);
  const pixels = width * height;
  for (let index = 0; index < raw.length; index += 3) {
    const r = raw[index], g = raw[index + 1], b = raw[index + 2];
    sumR += r; sumG += g; sumB += b;
    const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
    sumSat += maximum === 0 ? 0 : (maximum - minimum) / maximum;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaHistogram[Math.min(255, Math.round(luma))] += 1;
    if (luma < 24) shadowMass += 1;
    if (luma > 232) highlightMass += 1;
  }
  const percentile = (fraction) => {
    let seen = 0;
    const target = pixels * fraction;
    for (let level = 0; level < 256; level += 1) {
      seen += lumaHistogram[level];
      if (seen >= target) return level;
    }
    return 255;
  };
  const round = (value) => Number(value.toFixed(2));
  return {
    width, height,
    meanR: round(sumR / pixels), meanG: round(sumG / pixels), meanB: round(sumB / pixels),
    meanLuma: round((0.2126 * sumR + 0.7152 * sumG + 0.0722 * sumB) / pixels),
    meanSaturation: round((sumSat / pixels) * 100),
    shadowMassPercent: round((shadowMass / pixels) * 100),
    highlightMassPercent: round((highlightMass / pixels) * 100),
    lumaP05: percentile(0.05), lumaP50: percentile(0.5), lumaP95: percentile(0.95),
  };
}

/** Stated as CHANGES from the authored frame; absolute thresholds would judge
 *  the arena's own lighting rather than what this lane did to it. */
const SAFETY = Object.freeze({
  maximumShadowMassGrowthPoints: 3,
  maximumShadowFloorDropSteps: 2,
  maximumHighlightMassGrowthPoints: 6,
  maximumDrawCallDelta: 0,
});

let SERVE_CHILD = null;
const killServeChild = () => {
  if (!SERVE_CHILD || SERVE_CHILD.pid == null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(SERVE_CHILD.pid), '/T', '/F'], { stdio: 'ignore' });
  } else SERVE_CHILD.kill('SIGTERM');
};

let BASE = arg('--url', 'http://127.0.0.1:41933');
const serveDist = arg('--serve-dist', null);
if (serveDist) {
  const PORT = 41933;
  const server = spawn('npx', ['vite', 'preview', '--outDir', serveDist,
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', shell: process.platform === 'win32' });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try { up = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; } catch { /* not up yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { killServeChild(); console.error('[lane-ab] served dist never came up'); process.exit(2); }
  BASE = `http://127.0.0.1:${PORT}`;
  SERVE_CHILD = server;
}

mkdirSync(OUT, { recursive: true });
const gitSha = await execFileAsync('git', ['rev-parse', 'HEAD'])
  .then((r) => r.stdout.trim()).catch(() => null);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});

let exitCode = 0;
const runs = [];
let environmentInvalid = null;
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  for (const arena of ARENAS) {
    for (const weather of ['clear', ARENA_HEAVY_WEATHER[arena]].filter(Boolean)) {
      const startedAt = Date.now();
      const record = { arena, weather, states: [] };
      const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=laneab&previewTime=0`
        + `&weather=${weather}&map=${arena}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
        if (environmentInvalid === null) {
          const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
          const adapterInfo = await page.evaluate(async () => {
            if (!navigator.gpu) return { gpu: false };
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) return { gpu: true, adapter: false };
            const device = await adapter.requestDevice();
            return { gpu: true, adapter: true, device: Boolean(device), vendor: adapter.info?.vendor ?? null };
          }).catch((error) => ({ gpu: true, adapter: 'error', error: String(error).slice(0, 120) }));
          environmentInvalid =
            backend !== 'webgpu' ? `asked for webgpu, got backend=${backend}`
            : adapterInfo.gpu !== true ? 'navigator.gpu unavailable'
            : adapterInfo.adapter !== true ? 'requestAdapter returned nothing'
            : adapterInfo.device !== true ? 'requestDevice failed'
            : (adapterInfo.vendor ?? '').toLowerCase() === 'microsoft'
              ? 'adapter vendor=microsoft means the software rasteriser'
              : false;
          console.error(`[lane-ab] backend=${backend} adapter=${JSON.stringify(adapterInfo)}`);
        }
        if (environmentInvalid) { record.environmentInvalid = environmentInvalid; runs.push(record); break; }

        await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
        await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
        await page.waitForFunction(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
        }, undefined, { timeout: 180_000 });
        await page.waitForTimeout(5_000);
        await page.evaluate(() => {
          window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
          window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
        });

        const cameraId = ARENA_CAMERAS[arena];
        if (cameraId) {
          const applied = await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraId);
          if (applied === false) record.cameraWarning = `authored camera '${cameraId}' missing; using the spawn view`;
          else await page.waitForTimeout(900);
        }

        mkdirSync(resolve(OUT, arena), { recursive: true });
        for (const tod of TIME_STATES) {
          // The choice is switched LIVE through the debug hook rather than by
          // reloading, so every state in this record shares one deploy, one
          // arena construction and one set of compiled pipelines. A reload
          // between states would put arena-construction noise in the frame-time
          // delta and make the draw-call comparison meaningless.
          const telemetry = await page.evaluate((choice) =>
            window.__ATOMIC_ACRES_DEBUG__.setLightingTimeChoice(choice), tod);
          await page.waitForTimeout(700);
          const file = resolve(OUT, arena, `${arena}--${weather}--${tod}.png`);
          await page.screenshot({ path: file });
          const budget = await page.evaluate(() => {
            const audit = window.__ATOMIC_ACRES_DEBUG__.snapshot().budgetAudit ?? {};
            return { drawCalls: Number(audit.drawCalls ?? 0), triangles: Number(audit.triangles ?? 0) };
          });
          // Frame time on the SAME deploy, immediately after the write.
          const frame = await page.evaluate(async (samples) => {
            const deltas = [];
            let previous = performance.now();
            await new Promise((done) => {
              const step = () => {
                const now = performance.now();
                deltas.push(now - previous);
                previous = now;
                if (deltas.length >= samples) { done(); return; }
                requestAnimationFrame(step);
              };
              requestAnimationFrame(step);
            });
            deltas.sort((a, b) => a - b);
            const at = (f) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * f))];
            return { p50: Number(at(0.5).toFixed(3)), p95: Number(at(0.95).toFixed(3)), frames: deltas.length };
          }, FRAME_SAMPLES);
          record.states.push({
            tod,
            file,
            telemetry,
            budget,
            frame,
            stats: await measure(file),
          });
          console.error(`[lane-ab] ${arena.padEnd(17)} ${weather.padEnd(11)} ${tod.padEnd(9)}`
            + ` hour=${telemetry?.hour ?? '?'} sun=${telemetry?.sunIntensityScale ?? '?'}`
            + ` floor=${telemetry?.shadowFloorScale ?? '?'} draws=${budget.drawCalls} p50=${frame.p50}ms`);
        }
        record.ok = record.states.length === TIME_STATES.length;
      } catch (error) {
        record.error = String(error).slice(0, 200);
        exitCode = 1;
      }
      record.ms = Date.now() - startedAt;
      runs.push(record);
    }
    if (environmentInvalid) break;
  }
} finally {
  await browser.close().catch(() => {});
  killServeChild();
}

// ---- judgement -------------------------------------------------------------
const findings = [];
for (const record of runs) {
  const before = record.states?.find((state) => state.tod === 'authored');
  if (!before) continue;
  for (const state of record.states) {
    if (state.tod === 'authored') continue;
    const shadowGrowth = Number((state.stats.shadowMassPercent - before.stats.shadowMassPercent).toFixed(2));
    const floorDrop = before.stats.lumaP05 - state.stats.lumaP05;
    const highlightGrowth = Number((state.stats.highlightMassPercent - before.stats.highlightMassPercent).toFixed(2));
    const drawDelta = state.budget.drawCalls - before.budget.drawCalls;
    state.verdict = {
      shadowMassGrowthPoints: shadowGrowth,
      shadowFloorDropSteps: floorDrop,
      highlightMassGrowthPoints: highlightGrowth,
      drawCallDelta: drawDelta,
      frameP50DeltaMs: Number((state.frame.p50 - before.frame.p50).toFixed(3)),
      meanLumaDelta: Number((state.stats.meanLuma - before.stats.meanLuma).toFixed(2)),
      pass:
        shadowGrowth <= SAFETY.maximumShadowMassGrowthPoints
        && floorDrop <= SAFETY.maximumShadowFloorDropSteps
        && highlightGrowth <= SAFETY.maximumHighlightMassGrowthPoints
        && Math.abs(drawDelta) <= SAFETY.maximumDrawCallDelta,
    };
    if (!state.verdict.pass) {
      findings.push(`${record.arena}/${record.weather}/${state.tod}: `
        + `shadowMass +${shadowGrowth}pt, floor -${floorDrop} steps, `
        + `highlight +${highlightGrowth}pt, draws ${drawDelta >= 0 ? '+' : ''}${drawDelta}`);
      exitCode = 1;
    }
  }
}

const report = {
  lane: 'AB',
  generatedAt: new Date().toISOString(),
  gitSha,
  viewport: VIEWPORT,
  frameSamples: FRAME_SAMPLES,
  safety: SAFETY,
  environmentInvalid: environmentInvalid || null,
  runs,
  findings,
};
writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.error(`[lane-ab] wrote ${resolve(OUT, 'report.json')}; findings=${findings.length}`);
for (const finding of findings) console.error(`[lane-ab] FAIL ${finding}`);
if (environmentInvalid) {
  console.error(`[lane-ab] ENVIRONMENT INVALID: ${environmentInvalid} — this run is not evidence`);
  exitCode = 2;
}
process.exit(exitCode);
