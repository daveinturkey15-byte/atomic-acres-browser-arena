#!/usr/bin/env node
// Lane AB (PASS 87) — BAND READABILITY SCAN.
//
// WHY THIS EXISTS
// The capture harness answers "is this state safe?" three times per arena, at
// the band's two ends and its middle. That is the right shape for evidence and
// the wrong shape for a DECISION: when a band end fails, three points do not
// say where the band should have stopped, and the 2026-09-03 sweep spent two
// full builds guessing. Worse, the two guesses disagreed about the mechanism —
// shortening Nuke Town's shadows cut its shadow mass (4.21 -> 3.40 points) while
// the same change made Terminal WORSE (3.57 -> 5.32), because on an apron whose
// deck sits just above the luma-24 threshold the dominant term is the ambient
// LIFT that the same clamp reduces, not the shadow length. A model that behaves
// oppositely on two arenas cannot be tuned from three samples each.
//
// So this scans. One deploy, one camera, one arena construction; the hour is
// stepped through `__ATOMIC_ACRES_DEBUG__.setLightingFixedHour`, which is a pure
// argument to `resolveLightingConditions` and writes the same uniforms over the
// same frozen light set. Every hour is measured against an identity frame
// re-taken in the same pass, so the result is a curve of shadow-mass growth
// across the band and the answer is read off it rather than guessed at.
//
// It prints, per arena and weather, the SAFE SUB-BAND: the widest interval
// around the authored hour over which growth stays inside the capture harness's
// own bound. That interval is what belongs in `ARENA_DAYLIGHT_PROFILES`.
//
// Usage:
//   node scripts/qa/scan-lane-ab-band-readability.mjs --serve-dist dist-lane-ab
//     [--arenas atomic-acres,skyline-terminal,test1] [--steps 9]
import { chromium } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import {
  ARENA_DAYLIGHT_PROFILES,
  resolveLightingConditions,
} from '../../src/rendering/lighting-conditions.ts';

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
  test1: 'test1-tower-overview',
  test2: 'test2-estate-overview',
  nuketown2: 'nuketown2-street-centre',
});

const ARENA_HEAVY_WEATHER = Object.freeze({
  'atomic-acres': 'heavy-rain',
  'skyline-terminal': 'heavy-rain',
  'rustworks-1v1': 'storm',
  farcrysis: 'storm',
  'high-seas': 'storm',
  test1: null,
  test2: null,
  nuketown2: null,
});

const ARENAS = arg('--arenas', 'atomic-acres,skyline-terminal,test1')
  .split(',').map((entry) => entry.trim()).filter(Boolean);
const STEPS = Math.max(3, Number(arg('--steps', '9')));
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/lane-ab-scan'));
const VIEWPORT = { width: 1280, height: 720 };

/** The capture harness's bounds, copied by value so the two cannot drift. A
 *  band end is only usable if it satisfies BOTH: the fraction of the frame in
 *  shadow may not grow, and the shadow-DETAIL floor (the 5th-percentile luma,
 *  where an enemy standing in shade lives) may not collapse. v1 of this scan
 *  measured only the first, which is why the merged-head sweep could still
 *  fail a band end this scan had blessed -- skyline-terminal/heavy-rain at
 *  06:48 grew shadow mass by only 0.2 points and dropped P05 by 3 steps. */
const MAX_SHADOW_MASS_GROWTH_POINTS = 3;
const MAX_SHADOW_FLOOR_DROP_STEPS = 2;

async function frameStats(file) {
  const image = sharp(file);
  const { width, height } = await image.metadata();
  const raw = await image.clone().removeAlpha().raw().toBuffer();
  const pixels = width * height;
  const histogram = new Uint32Array(256);
  let shadow = 0;
  for (let index = 0; index < raw.length; index += 3) {
    const luma = 0.2126 * raw[index] + 0.7152 * raw[index + 1] + 0.0722 * raw[index + 2];
    histogram[Math.min(255, Math.round(luma))] += 1;
    if (luma < 24) shadow += 1;
  }
  let seen = 0;
  let lumaP05 = 255;
  for (let level = 0; level < 256; level += 1) {
    seen += histogram[level];
    if (seen >= pixels * 0.05) { lumaP05 = level; break; }
  }
  return { shadowMassPercent: Number(((shadow / pixels) * 100).toFixed(2)), lumaP05 };
}

let SERVE_CHILD = null;
const killServeChild = () => {
  if (!SERVE_CHILD || SERVE_CHILD.pid == null) return;
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(SERVE_CHILD.pid), '/T', '/F'], { stdio: 'ignore' });
  else SERVE_CHILD.kill('SIGTERM');
};

let BASE = arg('--url', 'http://127.0.0.1:41934');
const serveDist = arg('--serve-dist', null);
if (serveDist) {
  const PORT = 41934;
  const server = spawn('npx', ['vite', 'preview', '--outDir', serveDist, '--host', '127.0.0.1',
    '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try { up = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; } catch { /* not up yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { killServeChild(); console.error('[lane-ab-scan] served dist never came up'); process.exit(2); }
  BASE = `http://127.0.0.1:${PORT}`;
  SERVE_CHILD = server;
}

mkdirSync(OUT, { recursive: true });
const gitSha = await execFileAsync('git', ['rev-parse', 'HEAD']).then((r) => r.stdout.trim()).catch(() => null);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});

const scans = [];
let environmentInvalid = null;
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.context().newCDPSession(page)
    .then((session) => session.send('Emulation.setFocusEmulationEnabled', { enabled: true })).catch(() => {});

  for (const arena of ARENAS) {
    for (const weather of ['clear', ARENA_HEAVY_WEATHER[arena]].filter(Boolean)) {
      const profile = ARENA_DAYLIGHT_PROFILES[arena];
      const scan = { arena, weather, band: [...profile.hourRange], authoredHour: profile.authoredHour, samples: [] };
      try {
        await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=laneab&previewTime=0`
          + `&weather=${weather}&map=${arena}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
        if (environmentInvalid === null) {
          const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
          environmentInvalid = backend !== 'webgpu' ? `asked for webgpu, got backend=${backend}` : false;
          console.error(`[lane-ab-scan] backend=${backend}`);
        }
        if (environmentInvalid) { scan.environmentInvalid = environmentInvalid; scans.push(scan); break; }

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
          await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraId);
          await page.waitForTimeout(1_200);
        }
        mkdirSync(resolve(OUT, arena), { recursive: true });

        /** Pin an hour, settle, shoot, measure. */
        const at = async (hour, tag) => {
          await page.evaluate((value) => window.__ATOMIC_ACRES_DEBUG__.setLightingFixedHour(value), hour);
          await page.waitForTimeout(1_100);
          const file = resolve(OUT, arena, `${arena}--${weather}--${tag}.png`);
          await page.screenshot({ path: file });
          return frameStats(file);
        };

        // Warm-up, then the identity. The authored hour IS the identity, so it
        // is the baseline every sample below is compared against, and it is
        // re-taken between samples so the pairing stays ~1 s tight.
        await at(profile.authoredHour, 'warmup');
        await page.waitForTimeout(1_200);

        const low = profile.hourRange[0];
        const high = profile.hourRange[1];
        for (let step = 0; step <= STEPS; step += 1) {
          const hour = low + ((high - low) * step) / STEPS;
          const before = await at(profile.authoredHour, `identity-${step}`);
          const sample = await at(hour, `h${hour.toFixed(2)}`);
          const writes = resolveLightingConditions({ arenaId: arena, fixedHour: hour });
          const growth = Number((sample.shadowMassPercent - before.shadowMassPercent).toFixed(2));
          const floorDrop = before.lumaP05 - sample.lumaP05;
          const safe = growth <= MAX_SHADOW_MASS_GROWTH_POINTS && floorDrop <= MAX_SHADOW_FLOOR_DROP_STEPS;
          scan.samples.push({
            hour: Number(hour.toFixed(3)),
            identityShadowMassPercent: before.shadowMassPercent,
            shadowMassPercent: sample.shadowMassPercent,
            shadowMassGrowthPoints: growth,
            identityLumaP05: before.lumaP05,
            lumaP05: sample.lumaP05,
            shadowFloorDropSteps: floorDrop,
            sunIntensityScale: Number(writes.sunIntensityScale.toFixed(4)),
            shadowFloorScale: Number(writes.shadowFloorScale.toFixed(4)),
            safe,
          });
          console.error(`[lane-ab-scan] ${arena.padEnd(17)} ${weather.padEnd(11)} h=${hour.toFixed(2)}`
            + ` sun=${writes.sunIntensityScale.toFixed(3)}`
            + ` shadow ${before.shadowMassPercent}->${sample.shadowMassPercent} (${growth >= 0 ? '+' : ''}${growth})`
            + ` P05 ${before.lumaP05}->${sample.lumaP05} (-${floorDrop})`
            + ` ${safe ? 'safe' : 'UNSAFE'}`);
        }

        // The widest CONTIGUOUS run of safe hours containing the authored hour.
        // Contiguity matters: a band is an interval the player's match walks
        // through, so an isolated safe hour on the far side of an unsafe one is
        // not usable and must not widen the answer.
        const samples = scan.samples;
        const anchor = samples.reduce((best, sample, index) =>
          Math.abs(sample.hour - profile.authoredHour) < Math.abs(samples[best].hour - profile.authoredHour)
            ? index : best, 0);
        let lowIndex = anchor;
        let highIndex = anchor;
        while (lowIndex > 0 && samples[lowIndex - 1].safe) lowIndex -= 1;
        while (highIndex < samples.length - 1 && samples[highIndex + 1].safe) highIndex += 1;
        scan.safeBand = [samples[lowIndex].hour, samples[highIndex].hour];
        scan.anchorSafe = samples[anchor].safe;
        scan.unsafeHours = samples.filter((sample) => !sample.safe).map((sample) => sample.hour);
        console.error(`[lane-ab-scan] ${arena}/${weather} SAFE BAND `
          + `${scan.safeBand[0].toFixed(2)}-${scan.safeBand[1].toFixed(2)} `
          + `(authored band ${low}-${high})`);
      } catch (error) {
        scan.error = String(error).slice(0, 200);
        exitCode = 1;
      }
      scans.push(scan);
    }
    if (environmentInvalid) break;
  }
} finally {
  await browser.close().catch(() => {});
  killServeChild();
}

writeFileSync(resolve(OUT, 'scan.json'), `${JSON.stringify({
  lane: 'AB',
  contract: 'band-readability-scan-v2-with-shadow-floor',
  generatedAt: new Date().toISOString(),
  gitSha,
  viewport: VIEWPORT,
  maxShadowMassGrowthPoints: MAX_SHADOW_MASS_GROWTH_POINTS,
  maxShadowFloorDropSteps: MAX_SHADOW_FLOOR_DROP_STEPS,
  environmentInvalid: environmentInvalid || null,
  scans,
}, null, 2)}\n`);
console.error(`[lane-ab-scan] wrote ${resolve(OUT, 'scan.json')}`);
if (environmentInvalid) exitCode = 2;
process.exit(exitCode);
