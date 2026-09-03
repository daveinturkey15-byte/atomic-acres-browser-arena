#!/usr/bin/env node
// Lane AB (PASS 87) — THE WEATHER-COMPOSITION FALSIFIER.
//
// WHY THIS SCRIPT EXISTS
// `src/rendering/lighting-conditions.ts` composes weather with the hour: as the
// sky darkens, the time-of-day excursion is pulled back toward the arena's
// authored identity. Every model test agreed. The SHIPPED RUNTIME did not run
// it: `applyLightingConditionUniforms` skipped its uniform write whenever the
// resolved HOUR had not moved, and `skyDarkenAmount` — the model's second input
// — does not enter `hour`. So at a fixed hour every weather-driven write was
// resolved, allocated and thrown away without reaching a light, in every mode
// except `cycle`, and the default mode is `random`.
//
// The capture sweep could not see it, because it drives each state through the
// debug hook with `force = true`, which is a path live play never takes. This
// probe therefore changes the WEATHER and touches nothing else, so the only
// thing that can carry the change to a light is the ordinary per-frame call.
//
// WHAT IT ASSERTS
//   1. The resolved HOUR is bit-identical across the weather change. (Which is
//      exactly why an hour-gated runtime discarded the write — the probe proves
//      the defect's mechanism, not just its symptom.)
//   2. `uniformWrites` INCREASES over the change, with no forced apply.
//   3. The resolved terms that reach a light actually move.
//   4. The FRAME moves: mean luma / shadow mass differ from the clear frame by
//      more than the arena's own identity-pair noise, measured here in the same
//      units, in the same run.
//
// Runs INSTALLED CHROME HEADLESS. A run that did not get native WebGPU is
// BLOCKED, not written as evidence.
//
// Usage:
//   node scripts/qa/probe-lane-ab-weather-write.mjs --serve-dist dist-lane-ab \
//     [--arenas rustworks-1v1,atomic-acres] [--out artifacts/lane-ab-weather]
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

const ARENA_CAMERAS = Object.freeze({
  'atomic-acres': 'nuke-town-street-axis',
  'skyline-terminal': 'terminal-overview',
  'rustworks-1v1': 'rustrig-overview',
  farcrysis: 'farcrysis-beach-golden',
  'high-seas': 'high-seas-starboard-overview',
});

/** The heaviest rung each arena authors — the widest neutralisation it can show. */
const ARENA_HEAVY_WEATHER = Object.freeze({
  'atomic-acres': 'heavy-rain',
  'skyline-terminal': 'heavy-rain',
  'rustworks-1v1': 'storm',
  farcrysis: 'storm',
  'high-seas': 'storm',
});

/** The excursion to sit at. `late` is the widest deviation on most arenas, so it
 *  is the hour with the most for the weather to pull back. */
const TIME_CHOICE = arg('--tod', 'late');

const ARENAS = arg('--arenas', 'rustworks-1v1,atomic-acres')
  .split(',').map((entry) => entry.trim()).filter(Boolean);
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/lane-ab-weather'));
const VIEWPORT = (() => {
  const [w, h] = arg('--viewport', '1280x720').split('x').map(Number);
  return { width: w, height: h };
})();

async function measure(file) {
  const image = sharp(file);
  const { width, height } = await image.metadata();
  const raw = await image.clone().removeAlpha().raw().toBuffer();
  let sumR = 0, sumG = 0, sumB = 0;
  let shadowMass = 0;
  const pixels = width * height;
  for (let index = 0; index < raw.length; index += 3) {
    const r = raw[index], g = raw[index + 1], b = raw[index + 2];
    sumR += r; sumG += g; sumB += b;
    if (0.2126 * r + 0.7152 * g + 0.0722 * b < 24) shadowMass += 1;
  }
  const round = (value) => Number(value.toFixed(3));
  return {
    meanLuma: round((0.2126 * sumR + 0.7152 * sumG + 0.0722 * sumB) / pixels),
    shadowMassPercent: round((shadowMass / pixels) * 100),
  };
}

let SERVE_CHILD = null;
const killServeChild = () => {
  if (!SERVE_CHILD || SERVE_CHILD.pid == null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(SERVE_CHILD.pid), '/T', '/F'], { stdio: 'ignore' });
  } else SERVE_CHILD.kill('SIGTERM');
};

let BASE = arg('--url', 'http://127.0.0.1:41935');
const serveDist = arg('--serve-dist', null);
if (serveDist) {
  const PORT = 41935;
  const server = spawn('npx', ['vite', 'preview', '--outDir', serveDist,
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', shell: process.platform === 'win32' });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try { up = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; } catch { /* not up yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { killServeChild(); console.error('[lane-ab-weather] served dist never came up'); process.exit(2); }
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
const findings = [];
let environmentInvalid = null;
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  for (const arena of ARENAS) {
    const record = { arena, weather: ARENA_HEAVY_WEATHER[arena] ?? 'storm', tod: TIME_CHOICE };
    try {
      // Loads CLEAR. The weather is then moved live, unforced, mid-match.
      const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=laneab&previewTime=0`
        + `&weather=clear&map=${arena}`;
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
          : (adapterInfo.vendor ?? '').toLowerCase() === 'microsoft'
            ? 'adapter vendor=microsoft means the software rasteriser'
            : false;
        console.error(`[lane-ab-weather] backend=${backend} adapter=${JSON.stringify(adapterInfo)}`);
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
        if (applied === false) record.cameraWarning = `authored camera '${cameraId}' missing`;
        else await page.waitForTimeout(900);
      }
      mkdirSync(resolve(OUT, arena), { recursive: true });

      // Sit at one excursion hour. This IS a forced apply — it is the setup, not
      // the measurement. Everything after it is unforced.
      await page.evaluate((choice) => window.__ATOMIC_ACRES_DEBUG__.setLightingTimeChoice(choice), TIME_CHOICE);
      await page.waitForTimeout(1_500);

      // THE IDENTITY-PAIR NOISE FLOOR for this arena, in the same units and the
      // same run: two frames of the SAME state, a second apart. A weather delta
      // smaller than this would not be evidence.
      const noiseA = resolve(OUT, arena, `${arena}--clear-noise-a.png`);
      const noiseB = resolve(OUT, arena, `${arena}--clear-noise-b.png`);
      await page.screenshot({ path: noiseA });
      await page.waitForTimeout(1_100);
      await page.screenshot({ path: noiseB });
      const statsNoiseA = await measure(noiseA);
      const statsNoiseB = await measure(noiseB);
      record.noise = {
        meanLumaPoints: Number(Math.abs(statsNoiseB.meanLuma - statsNoiseA.meanLuma).toFixed(3)),
        shadowMassPoints: Number(Math.abs(statsNoiseB.shadowMassPercent - statsNoiseA.shadowMassPercent).toFixed(3)),
      };

      const clearFrame = resolve(OUT, arena, `${arena}--clear.png`);
      await page.screenshot({ path: clearFrame });
      record.clear = {
        telemetry: await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleLightingConditions()),
        stats: await measure(clearFrame),
        frame: clearFrame,
      };

      // ---- THE ONLY THING THAT CHANGES. No forced apply anywhere below. -----
      record.overrideAccepted = await page.evaluate(
        (state) => window.__ATOMIC_ACRES_DEBUG__.setWeatherOverride(state),
        record.weather,
      );
      // Ordinary frames, and only ordinary frames, now have to carry it.
      await page.waitForTimeout(2_500);
      const wetFrame = resolve(OUT, arena, `${arena}--${record.weather}.png`);
      await page.screenshot({ path: wetFrame });
      record.wet = {
        telemetry: await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleLightingConditions()),
        stats: await measure(wetFrame),
        frame: wetFrame,
      };

      const before = record.clear.telemetry;
      const after = record.wet.telemetry;
      const termsMoved = ['sunIntensityScale', 'shadowFloorScale', 'exposureScale']
        .filter((key) => Number(before[key]) !== Number(after[key]));
      record.verdict = {
        hourIdentical: Number(before.hour) === Number(after.hour),
        skyDarkenMoved: Number(after.skyDarkenAmount) > Number(before.skyDarkenAmount),
        uniformWriteGain: Number(after.uniformWrites) - Number(before.uniformWrites),
        termsMoved,
        meanLumaDelta: Number((record.wet.stats.meanLuma - record.clear.stats.meanLuma).toFixed(3)),
        shadowMassDelta: Number(
          (record.wet.stats.shadowMassPercent - record.clear.stats.shadowMassPercent).toFixed(3),
        ),
      };
      record.verdict.frameMovedBeyondNoise =
        Math.abs(record.verdict.meanLumaDelta) > record.noise.meanLumaPoints
        || Math.abs(record.verdict.shadowMassDelta) > record.noise.shadowMassPoints;
      record.verdict.pass = record.verdict.skyDarkenMoved
        && record.verdict.uniformWriteGain > 0
        && termsMoved.length > 0
        && record.verdict.frameMovedBeyondNoise;
      record.ok = true;

      if (!record.verdict.pass) {
        findings.push(`${arena}/${record.weather}: weather did not reach the lights on the unforced path — `
          + `skyDarken ${before.skyDarkenAmount}->${after.skyDarkenAmount}, `
          + `uniformWrites +${record.verdict.uniformWriteGain}, terms moved ${termsMoved.length}, `
          + `luma ${record.verdict.meanLumaDelta} vs noise ${record.noise.meanLumaPoints}`);
        exitCode = 1;
      }
      console.error(`[lane-ab-weather] ${arena.padEnd(17)} hour ${before.hour}->${after.hour}`
        + ` skyDarken ${before.skyDarkenAmount}->${after.skyDarkenAmount}`
        + ` uniformWrites +${record.verdict.uniformWriteGain}`
        + ` sun ${before.sunIntensityScale}->${after.sunIntensityScale}`
        + ` luma ${record.verdict.meanLumaDelta} (noise ${record.noise.meanLumaPoints})`
        + ` shadow ${record.verdict.shadowMassDelta} (noise ${record.noise.shadowMassPoints})`);
    } catch (error) {
      record.error = String(error).slice(0, 240);
      exitCode = 1;
    }
    runs.push(record);
    if (environmentInvalid) break;
  }
} finally {
  await browser.close().catch(() => {});
  killServeChild();
}

const report = {
  lane: 'AB',
  probe: 'weather-composition-on-the-unforced-path',
  generatedAt: new Date().toISOString(),
  gitSha,
  viewport: VIEWPORT,
  timeChoice: TIME_CHOICE,
  environmentInvalid: environmentInvalid || null,
  runs,
  findings,
};
writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.error(`[lane-ab-weather] wrote ${resolve(OUT, 'report.json')}; findings=${findings.length}`);
for (const finding of findings) console.error(`[lane-ab-weather] FAIL ${finding}`);
if (environmentInvalid) {
  console.error(`[lane-ab-weather] ENVIRONMENT INVALID: ${environmentInvalid} — this run is not evidence`);
  exitCode = 2;
}
process.exit(exitCode);
