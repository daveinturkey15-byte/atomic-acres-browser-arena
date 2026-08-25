#!/usr/bin/env node
// Pass 79 weather lane — prove an enemy stays readable at the HEAVIEST weather
// this build can show, on REAL hardware WebGPU, by measuring the pixels the
// enemy actually puts on the screen rather than the numbers we fed the sim.
//
// METHOD (assert the output, not the input)
//
//   1. Stage the arena's bot at `--range` metres dead ahead, frozen, and aim at
//      it so it lands on the crosshair. `placeBotAhead` MOVES the bot the match
//      already spawned - calling clearBots() first leaves it nothing to move
//      and it silently returns null, which is how the first run of this harness
//      measured a scene with no enemy in it at all.
//   2. Median N frames. Rain moves and the enemy does not, so the median is the
//      static scene with the weather largely removed from it - on BOTH sides of
//      the comparison, which is what makes the difference below mean "enemy".
//   3. The enemy MASK is measured once, on the clear pass, as the pixels that
//      change when the bot is removed. The same mask is then reused unchanged
//      at every heavier state, so every state is judged on identical pixels.
//   4. SILHOUETTE CONTRAST is then read off the with-bot median alone: mean
//      luminance inside the mask against mean luminance of a ring dilated
//      around it. That is the quantity a player's eye actually uses to find a
//      target against its background, and it needs no second capture, so it
//      cannot be contaminated by anything that moved between the two.
//
// Usage:
//   node scripts/qa/capture-pass79-weather-readability.mjs \
//     --url http://127.0.0.1:41917 --arena high-seas --range 30
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41917');
const ARENA = arg('--arena', 'high-seas');
const RANGE = Number(arg('--range', '30'));
const OUT = arg('--out', 'artifacts/pass79/weather');
const FRAMES = Number(arg('--frames', '5'));
const TAG = arg('--tag', 'run');
const STATES = (arg('--states', 'clear,light-rain,heavy-rain,storm')).split(',');

const WIDTH = 1920;
const HEIGHT = 1080;
const CROP = { width: 460, height: 460 };
const CROP_LEFT = Math.round(WIDTH / 2 - CROP.width / 2);
const CROP_TOP = Math.round(HEIGHT / 2 - CROP.height / 2);
/** Pixels the background ring is dilated out from the enemy mask. */
const RING_PIXELS = 10;
/** Difference (0-255 mean over RGB) above which a pixel counts as the enemy. */
const MASK_THRESHOLD = 12;

mkdirSync(OUT, { recursive: true });

// MAXIMUM shipped weather settings. This is the case that matters: the proof
// has to hold at the top of every slider, not at the authored default.
const MAX_WEATHER_SETTINGS = {
  version: 1,
  graphics: {
    schemaVersion: 1,
    preset: 'custom',
    weatherIntensity: 'storm',
    rainDensity: 1.5,
    windStrength: 2,
    lightning: true,
    wetSurfaces: true,
    ambientLife: 2,
  },
};

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});

const results = [];
let mask = null;
let ring = null;
let deviceReport = null;

function medianStack(buffers) {
  const length = buffers[0].length;
  const out = Buffer.alloc(length);
  const scratch = new Array(buffers.length);
  for (let i = 0; i < length; i += 1) {
    for (let b = 0; b < buffers.length; b += 1) scratch[b] = buffers[b][i];
    scratch.sort((a, c) => a - c);
    out[i] = scratch[(scratch.length - 1) >> 1];
  }
  return out;
}

const luminance = (data, index) => (
  0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]
);

function buildMask(a, b, channels, width, height) {
  const flags = new Uint8Array(width * height);
  let hits = 0;
  for (let i = 0; i < width * height; i += 1) {
    const base = i * channels;
    const delta = (Math.abs(a[base] - b[base]) + Math.abs(a[base + 1] - b[base + 1]) + Math.abs(a[base + 2] - b[base + 2])) / 3;
    if (delta >= MASK_THRESHOLD) { flags[i] = 1; hits += 1; }
  }
  return { flags, hits };
}

/** Ring = dilate(mask, RING_PIXELS) minus dilate(mask, 2). Background only. */
function buildRing(flags, width, height) {
  const dilate = (source, radius) => {
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!source[y * width + x]) continue;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            out[ny * width + nx] = 1;
          }
        }
      }
    }
    return out;
  };
  const outer = dilate(flags, RING_PIXELS);
  const inner = dilate(flags, 2);
  const out = new Uint8Array(width * height);
  let hits = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (outer[i] && !inner[i]) { out[i] = 1; hits += 1; }
  }
  return { flags: out, hits };
}

function meanLuminance(data, channels, flags) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < flags.length; i += 1) {
    if (!flags[i]) continue;
    sum += luminance(data, i * channels);
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function meanAbsDiffMasked(a, b, channels, flags) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < flags.length; i += 1) {
    if (!flags[i]) continue;
    const base = i * channels;
    sum += (Math.abs(a[base] - b[base]) + Math.abs(a[base + 1] - b[base + 1]) + Math.abs(a[base + 2] - b[base + 2])) / 3;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

async function grabMedian(page, count) {
  const buffers = [];
  let channels = 3;
  for (let i = 0; i < count; i += 1) {
    const png = await page.screenshot({
      clip: { x: CROP_LEFT, y: CROP_TOP, width: CROP.width, height: CROP.height },
    });
    const raw = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    channels = raw.info.channels;
    buffers.push(raw.data);
    await page.waitForTimeout(110);
  }
  return { data: medianStack(buffers), channels };
}

for (const state of STATES) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
  await context.addInitScript((payload) => {
    try {
      window.localStorage.setItem('atomic-acres-pass65-settings-v1', JSON.stringify(payload));
    } catch { /* private mode: fall through to defaults */ }
  }, MAX_WEATHER_SETTINGS);
  const page = await context.newPage();
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });

  const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=pass79weather&weather=${state}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });

  if (!deviceReport) {
    // An adapter is not a device: request one and read the vendor string. A
    // Microsoft vendor means the software rasteriser and every number below
    // would be meaningless.
    deviceReport = await page.evaluate(async () => {
      if (!navigator.gpu) return { secureContext: window.isSecureContext, gpu: false };
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { secureContext: window.isSecureContext, gpu: true, adapter: false };
      const device = await adapter.requestDevice().catch(() => null);
      return {
        secureContext: window.isSecureContext,
        gpu: true,
        adapter: true,
        device: Boolean(device),
        vendor: adapter.info?.vendor ?? null,
        architecture: adapter.info?.architecture ?? null,
        backend: document.documentElement.dataset.renderBackend ?? null,
      };
    });
    console.error(`[weather] device ${JSON.stringify(deviceReport)}`);
  }

  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 240_000 });

  // Frozen: the enemy must not walk out of the measured mask between captures.
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
  const placement = await page.evaluate((range) => {
    const staged = window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(range);
    window.__ATOMIC_ACRES_DEBUG__.aimAtBot();
    return staged;
  }, RANGE);
  if (!placement) throw new Error(`placeBotAhead(${RANGE}) returned null on ${ARENA} - no enemy to measure`);
  // Let rain reach a steady state and the aim settle.
  await page.waitForTimeout(4_000);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.aimAtBot(); });
  await page.waitForTimeout(600);

  const weather = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleWeather());

  await page.screenshot({ path: resolve(`${OUT}/${TAG}-${ARENA}-${state}-full.png`) });
  const withBot = await grabMedian(page, FRAMES);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots(); });
  await page.waitForTimeout(800);
  const withoutBot = await grabMedian(page, FRAMES);

  if (!mask) {
    mask = buildMask(withBot.data, withoutBot.data, withBot.channels, CROP.width, CROP.height);
    ring = buildRing(mask.flags, CROP.width, CROP.height);
    console.error(`[weather] enemy mask ${mask.hits} px, background ring ${ring.hits} px`);
    if (mask.hits < 400) throw new Error(`enemy mask is only ${mask.hits} px - the enemy is not in the crop`);
  }

  const enemyLuminance = meanLuminance(withBot.data, withBot.channels, mask.flags);
  const ringLuminance = meanLuminance(withBot.data, withBot.channels, ring.flags);
  const silhouetteContrast = (enemyLuminance + ringLuminance) > 0
    ? Math.abs(enemyLuminance - ringLuminance) / (enemyLuminance + ringLuminance)
    : 0;
  const enemySignal = meanAbsDiffMasked(withBot.data, withoutBot.data, withBot.channels, mask.flags);

  await sharp(withBot.data, { raw: { width: CROP.width, height: CROP.height, channels: withBot.channels } })
    .png().toFile(resolve(`${OUT}/${TAG}-${ARENA}-${state}-target.png`));

  results.push({
    state,
    requestedRangeM: RANGE,
    stagedDistanceM: placement.stagedDistanceM,
    maskPixels: mask.hits,
    ringPixels: ring.hits,
    enemyLuminance: Number(enemyLuminance.toFixed(2)),
    backgroundLuminance: Number(ringLuminance.toFixed(2)),
    silhouetteContrast: Number(silhouetteContrast.toFixed(4)),
    enemySignal: Number(enemySignal.toFixed(3)),
    rain: weather?.rain ?? null,
    particles: weather?.particles
      ? {
        quality: weather.particles.quality,
        instancedDraws: weather.particles.instancedDraws,
        looseMeshes: weather.particles.looseMeshes,
        liveParticles: weather.particles.liveParticles,
        visibleParticles: weather.particles.visibleParticles,
        capacityAtQuality: weather.particles.capacityAtQuality,
        ambientLifeScale: weather.particles.ambientLifeScale,
        adaptiveDensityScale: weather.particles.adaptiveDensityScale,
        perFrameAllocations: weather.particles.perFrameAllocations,
        families: weather.particles.families?.map((family) => ({
          id: family.id, live: family.live, visible: family.visible,
          peakOpacity: family.peakOpacity, perFrameAllocations: family.perFrameAllocations,
        })),
      }
      : null,
    errors: errors.slice(0, 5),
  });
  console.error(`[weather] ${state} contrast=${silhouetteContrast.toFixed(4)} signal=${enemySignal.toFixed(2)} enemyL=${enemyLuminance.toFixed(1)} bgL=${ringLuminance.toFixed(1)}`);
  await context.close();
}

await browser.close();

const clear = results.find((entry) => entry.state === 'clear');
for (const entry of results) {
  entry.contrastRetentionVsClear = clear && clear.silhouetteContrast > 0
    ? Number((entry.silhouetteContrast / clear.silhouetteContrast).toFixed(3))
    : null;
}

const report = { tag: TAG, arena: ARENA, requestedRangeM: RANGE, frames: FRAMES, device: deviceReport, results };
writeFileSync(resolve(`${OUT}/${TAG}-${ARENA}-readability.json`), `${JSON.stringify(report, null, 2)}\n`);
console.error(JSON.stringify(report.results.map((entry) => ({
  state: entry.state,
  stagedDistanceM: entry.stagedDistanceM,
  silhouetteContrast: entry.silhouetteContrast,
  contrastRetentionVsClear: entry.contrastRetentionVsClear,
  enemySignal: entry.enemySignal,
  streaks: entry.rain?.streakInstances ?? null,
  fogFar: entry.rain?.fogFar ?? null,
  authoredFogFar: entry.rain?.authoredFogFar ?? null,
  fogAddedAt30M: entry.rain?.fogAddedExtinctionAt30M ?? null,
  overcastFill: entry.rain?.overcastFillIntensity ?? null,
  weatherState: entry.rain?.rainRate ?? null,
}), null, 2)));
