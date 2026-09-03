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
// INTERLEAVED BASELINE, AND WHY v1 OF THIS SCRIPT WAS NOT EVIDENCE
// v1 captured `authored` once, then the three excursions after it, and compared
// each against that single before frame. The 2026-09-03 01:20 sweep proved that
// instrument wrong using its own null experiment: `gun-range` and `map3` are
// PINNED in `ARENA_DAYLIGHT_PROFILES`, so every one of their states resolves to
// the bit-identical identity write (sun 1.000, floor 1.000, tints [1,1,1]) — and
// gun-range still read shadow mass 37.14% -> 41.15/41.20/41.17%, a +4.0 point
// swing on frames where NOTHING was written. That is more than the 3-point
// safety threshold, so every v1 verdict at or under ~4 points measured the
// scene settling, not the lighting.
//
// v2 therefore re-applies `authored` immediately BEFORE each excursion and pairs
// the two frames ~1 s apart, so the drift that accumulates over a 30 s record
// cannot land in a verdict. The three identity frames are kept: their spread is
// the instrument's own noise (`identityDriftPoints`), and on a PINNED arena the
// excursion deltas must come out at zero. A run whose pinned arenas do not read
// zero is not evidence about any arena, and this script says so.
//
// AND THE SAME MISTAKE, ONCE MORE, IN THE FRAME-TIME COLUMN
// v2 fixed the pixel baseline and left the frame-time one exactly as broken:
// the identity was frame-sampled ONCE per record and never paired, so
// `frameP50DeltaMs` had no measured error bar. Its own evidence then carried
// +4.5 ms and -18.0 ms swings, which cannot falsify a ~1 ms/frame budget in
// either direction. v3 frame-samples the control pair (that difference is the
// record's `frameNoiseMs`) and every interleaved identity, so each state's
// frame delta is paired and each verdict carries `frameWithinNoise`. A delta
// inside `frameNoiseMs` is reported as unresolvable rather than as a number.
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
  nuketown2: 'nuketown2-street-centre',
  raid2: 'raid2-estate-overview',
  map3: 'map3-hub-vista',
});

/**
 * The three excursions. `authored` is not in this list because it is not a
 * fourth state: it is the IDENTITY, and v2 of this instrument re-captures it
 * immediately before every excursion rather than once at the top (see
 * INTERLEAVED BASELINE below).
 */
const TIME_STATES = Object.freeze(['early', 'midday', 'late']);

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
  nuketown2: null,
  raid2: null,
  map3: 'overcast',
});

/**
 * The NULL EXPERIMENT. These three arenas are `pinned: true` in
 * `ARENA_DAYLIGHT_PROFILES`, so every choice resolves to the identity write and
 * their excursion deltas must be zero to within the noise floor. They are the
 * only rows in this sweep whose correct answer is known in advance, which makes
 * them the check on the instrument rather than on the lane.
 */
const PINNED_ARENAS = new Set(['gun-range', 'map3', 'nuketown2', 'raid2']);

/**
 * How far a PINNED arena is allowed to move before this run stops being
 * evidence. It is not a safety threshold and must never be relaxed to make a
 * run pass: a pinned arena that moves means the frames are not comparable, and
 * the only correct response is to fix the instrument.
 */
const PINNED_NULL_TOLERANCE_POINTS = 0.5;

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

        /** One choice applied live, settled, shot and measured. */
        const captureChoice = async (choice, file, sampleFrames) => {
          // The choice is switched LIVE through the debug hook rather than by
          // reloading, so every frame in this record shares one deploy, one
          // arena construction and one set of compiled pipelines. A reload
          // between states would put arena-construction noise in the frame-time
          // delta and make the draw-call comparison meaningless.
          const telemetry = await page.evaluate((value) =>
            window.__ATOMIC_ACRES_DEBUG__.setLightingTimeChoice(value), choice);
          // Long enough for the static shadow map to have been refreshed on the
          // re-aimed sun. The v1 settle (700 ms) was the reason the very first
          // frame of a record read systematically UNDER-shadowed.
          await page.waitForTimeout(1_100);
          await page.screenshot({ path: file });
          const budget = await page.evaluate(() => {
            const audit = window.__ATOMIC_ACRES_DEBUG__.snapshot().budgetAudit ?? {};
            return { drawCalls: Number(audit.drawCalls ?? 0), triangles: Number(audit.triangles ?? 0) };
          });
          const frame = sampleFrames
            ? await page.evaluate(async (samples) => {
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
            }, FRAME_SAMPLES)
            : null;
          return { choice, file, telemetry, budget, frame, stats: await measure(file) };
        };

        // Warm-up: apply the identity once and throw the frame away. Whatever
        // has not converged by the end of it (shadow map, temporal history,
        // exposure ramp) converges here rather than inside the first baseline.
        await captureChoice('authored', resolve(OUT, arena, `${arena}--${weather}--warmup.png`), false);
        await page.waitForTimeout(1_500);

        // THE CONTROL PAIR. Identity against identity, captured exactly the way
        // a verdict pair is captured, so every record carries its own error bar
        // in the same units as its findings. An arena with animated geometry in
        // the review frame (Gun Range's target carriers, the Firing Range
        // silhouettes) moves here on its own, and a verdict smaller than this
        // number is not a claim about lighting.
        const controlA = await captureChoice('authored', resolve(OUT, arena, `${arena}--${weather}--control-a.png`), true);
        const controlB = await captureChoice('authored', resolve(OUT, arena, `${arena}--${weather}--control-b.png`), true);
        record.pairNoisePoints = Number(
          Math.abs(controlB.stats.shadowMassPercent - controlA.stats.shadowMassPercent).toFixed(2),
        );
        // THE FRAME-TIME NOISE FLOOR, in the same units and from the same pair
        // as the pixel one. v2 of this script frame-sampled the identity ONCE
        // per record and never paired it, so `frameP50DeltaMs` had no
        // characterised error bar and could not falsify a 1 ms budget in either
        // direction -- the same mistake v1 made with pixels. Two identity
        // samples taken exactly the way a verdict sample is taken bound what
        // this instrument can resolve, and every frame-time verdict below is
        // stated against THIS number rather than against the owner's budget.
        record.frameNoiseMs = controlA.frame && controlB.frame
          ? Number(Math.abs(controlB.frame.p50 - controlA.frame.p50).toFixed(3))
          : null;

        for (const tod of TIME_STATES) {
          // THE INTERLEAVE. The identity is re-applied and re-shot immediately
          // before every excursion, so each verdict is a pair of frames about a
          // second apart on one deploy.
          // Frame-sampled EVERY round, not just the first: an excursion's frame
          // time is only meaningful against an identity measured beside it.
          const before = await captureChoice(
            'authored',
            resolve(OUT, arena, `${arena}--${weather}--authored-for-${tod}.png`),
            true,
          );
          const state = await captureChoice(tod, resolve(OUT, arena, `${arena}--${weather}--${tod}.png`), true);
          record.states.push({ tod, ...state, before });
          const telemetry = state.telemetry;
          console.error(`[lane-ab] ${arena.padEnd(17)} ${weather.padEnd(11)} ${tod.padEnd(9)}`
            + ` hour=${telemetry?.hour ?? '?'} sun=${telemetry?.sunIntensityScale ?? '?'}`
            + ` floor=${telemetry?.shadowFloorScale ?? '?'} draws=${state.budget.drawCalls}`
            + ` p50=${state.frame.p50}ms shadow=${before.stats.shadowMassPercent}->${state.stats.shadowMassPercent}`);
        }
        // The spread of the three identity frames IS this record's noise floor.
        const identityMasses = record.states.map((state) => state.before.stats.shadowMassPercent);
        record.identityDriftPoints = identityMasses.length
          ? Number((Math.max(...identityMasses) - Math.min(...identityMasses)).toFixed(2))
          : null;
        record.pinned = PINNED_ARENAS.has(arena);
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
const instrumentFindings = [];
for (const record of runs) {
  if (!record.states?.length) continue;
  for (const state of record.states) {
    // The paired identity frame, taken ~1 s before this one on the same deploy.
    const before = state.before;
    if (!before) continue;
    const frameTimeBaselineMs = before.frame ? before.frame.p50 : null;
    const shadowGrowth = Number((state.stats.shadowMassPercent - before.stats.shadowMassPercent).toFixed(2));
    const floorDrop = before.stats.lumaP05 - state.stats.lumaP05;
    const highlightGrowth = Number((state.stats.highlightMassPercent - before.stats.highlightMassPercent).toFixed(2));
    const drawDelta = state.budget.drawCalls - before.budget.drawCalls;
    state.verdict = {
      shadowMassGrowthPoints: shadowGrowth,
      shadowFloorDropSteps: floorDrop,
      highlightMassGrowthPoints: highlightGrowth,
      drawCallDelta: drawDelta,
      // Frame time against the identity sampled IMMEDIATELY BEFORE this state,
      // on the same deploy — paired exactly like the pixel metric.
      frameP50DeltaMs: frameTimeBaselineMs === null
        ? null
        : Number((state.frame.p50 - frameTimeBaselineMs).toFixed(3)),
      // ... and whether that delta is inside what the record's own identity/
      // identity pair could resolve. A delta smaller than the noise floor is
      // NOT a measurement of the lane, and this instrument says so instead of
      // quoting a decimal place it cannot support.
      frameWithinNoise: frameTimeBaselineMs === null || record.frameNoiseMs === null
        ? null
        : Math.abs(state.frame.p50 - frameTimeBaselineMs) <= record.frameNoiseMs,
      meanLumaDelta: Number((state.stats.meanLuma - before.stats.meanLuma).toFixed(2)),
      // Reported, never subtracted. A verdict inside the record's own control
      // pair is a number this instrument cannot resolve, and saying so is the
      // difference between evidence and a decimal place.
      withinInstrumentNoise: record.pairNoisePoints !== null
        && Math.abs(shadowGrowth) <= record.pairNoisePoints,
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
    // THE NULL EXPERIMENT. A pinned arena writes the identity at every choice,
    // so any movement here is the instrument, not the lane.
    if (record.pinned && Math.abs(shadowGrowth) > PINNED_NULL_TOLERANCE_POINTS) {
      instrumentFindings.push(`${record.arena}/${record.weather}/${state.tod}: PINNED arena moved `
        + `${shadowGrowth >= 0 ? '+' : ''}${shadowGrowth}pt on an identity write`);
    }
  }
}
// A record whose OWN control pair moves further than the null tolerance cannot
// resolve a verdict at the resolution the safety threshold is stated at. v2
// computed `pairNoisePoints` and printed it but never compared it to anything,
// so a record that was self-evidently too noisy still issued verdicts (the
// pre-merge sweep's gun-range record spread 0.87 points against a 0.5
// tolerance and was trusted). This is the guard the header always claimed.
for (const record of runs) {
  if (!record.states?.length || record.pairNoisePoints === null || record.pairNoisePoints === undefined) continue;
  if (record.pairNoisePoints > PINNED_NULL_TOLERANCE_POINTS) {
    instrumentFindings.push(`${record.arena}/${record.weather}: control pair spread `
      + `${record.pairNoisePoints}pt exceeds the ${PINNED_NULL_TOLERANCE_POINTS}pt resolution this run `
      + 'claims, so its verdicts are not finer than its own noise');
  }
}
if (instrumentFindings.length) exitCode = 3;

const report = {
  lane: 'AB',
  generatedAt: new Date().toISOString(),
  gitSha,
  viewport: VIEWPORT,
  frameSamples: FRAME_SAMPLES,
  safety: SAFETY,
  instrument: {
    version: 'interleaved-identity-baseline-v3-paired-frame-time',
    pinnedNullTolerancePoints: PINNED_NULL_TOLERANCE_POINTS,
    pinnedArenas: [...PINNED_ARENAS],
  },
  environmentInvalid: environmentInvalid || null,
  runs,
  findings,
  instrumentFindings,
};
writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.error(`[lane-ab] wrote ${resolve(OUT, 'report.json')}; findings=${findings.length}`);
for (const finding of findings) console.error(`[lane-ab] FAIL ${finding}`);
for (const finding of instrumentFindings) console.error(`[lane-ab] INSTRUMENT ${finding}`);
if (instrumentFindings.length) {
  console.error('[lane-ab] NULL EXPERIMENT FAILED: a pinned arena moved on an identity write, '
    + 'so no verdict in this run is evidence about any arena');
}
if (environmentInvalid) {
  console.error(`[lane-ab] ENVIRONMENT INVALID: ${environmentInvalid} — this run is not evidence`);
  exitCode = 2;
}
process.exit(exitCode);
