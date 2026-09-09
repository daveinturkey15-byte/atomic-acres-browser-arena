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
  args: ['--mute-audio', 
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
let maskCentroidOffset = null;
let pinnedStance = null;

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

/**
 * The enemy blob, restricted to the middle of the crop. An unrestricted
 * difference also catches the enemy's CAST SHADOW, which on a low sun is a
 * blob as large as the enemy and metres away from it - and that pulled the
 * measured silhouette off the target entirely on an earlier run.
 */
const MASK_RADIUS_PX = 150;

function centralMask(a, b, channels) {
  const flags = new Uint8Array(CROP.width * CROP.height);
  let hits = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < CROP.height; y += 1) {
    for (let x = 0; x < CROP.width; x += 1) {
      if (Math.hypot(x - CROP.width / 2, y - CROP.height / 2) > MASK_RADIUS_PX) continue;
      const index = y * CROP.width + x;
      const base = index * channels;
      const delta = (Math.abs(a[base] - b[base]) + Math.abs(a[base + 1] - b[base + 1]) + Math.abs(a[base + 2] - b[base + 2])) / 3;
      if (delta >= MASK_THRESHOLD) { flags[index] = 1; hits += 1; sumX += x; sumY += y; }
    }
  }
  const offset = hits > 0
    ? Math.hypot(sumX / hits - CROP.width / 2, sumY / hits - CROP.height / 2)
    : Infinity;
  return { flags, hits, offset };
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

  // SELECT, THEN PROVE IT SELECTED. The first run of this harness recorded
  // four states of "high-seas" that were all actually Nuketown, because
  // selectArena resolves before the transition commits and nothing checked.
  // A harness that cannot fail is not evidence.
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.waitForFunction((id) => {
    const selection = window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection;
    return selection && selection.id === id && selection.transition?.phase !== 'failed';
  }, ARENA, { timeout: 240_000 });
  const committedArena = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection);
  if (committedArena.id !== ARENA) throw new Error(`arena did not commit: wanted ${ARENA}, got ${committedArena.id}`);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 240_000 });

  // Frozen: the enemy must not walk out of the measured mask between captures.
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
  // THE STANCE, AND WHY IT IS THIS ONE.
  //
  // `placeBotAhead` is the only staging route in the game that CERTIFIES the
  // enemy is visible: it rejects a bearing whose target is out of bounds or
  // inside a collider, then raycasts the eye to the enemy at torso (1.06 m) and
  // skull (1.58 m) height and rejects the bearing if either ray is blocked.
  // What it will not do is stand the enemy further away than 9 m - the distance
  // is hard-clamped to [2.5, 9].
  //
  // Walking the player BACK from there with teleportPlayer was tried and is
  // recorded in this lane's report as a dead end, not as a result: on Nuke Town
  // every stance past ~15 m along the staging bearing is outside the world (the
  // player lands at eye height -24 m and falls), and the stances that do land
  // put a hedge in the sightline placeBotAhead had certified from the spawn.
  //
  // Even at 9 m the certification is not sufficient on its own - its raycast
  // set does not include every hedge - and the spawn alternates between runs.
  // So the stance is SEARCHED with pixels: respawn, stage, aim, and check that
  // removing the enemy actually changes a blob of the right size on the
  // crosshair. The first accepted stance is then pinned by absolute position
  // and yaw and REPLAYED in every later weather state, so all states are
  // measured from one identical camera with one identical enemy.
  //
  // The first two runs of this harness had no such gate and reported a
  // confident 30 m while measuring drifting cloud, and then the enemy's cast
  // SHADOW on grass. A harness that cannot fail is not evidence.
  async function stageAndProbe() {
    const staged = await page.evaluate(() => {
      const result = window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(9);
      if (result) window.__ATOMIC_ACRES_DEBUG__.aimAtBot();
      return result;
    });
    if (!staged) return { staged: null, blob: { hits: 0, offset: Infinity } };
    await page.waitForTimeout(2_500);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.aimAtBot(); });
    await page.waitForTimeout(700);
    const withEnemy = await grabMedian(page, 2);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots(); });
    await page.waitForTimeout(700);
    const withoutEnemy = await grabMedian(page, 2);
    return { staged, blob: centralMask(withEnemy.data, withoutEnemy.data, withEnemy.channels) };
  }

  let placement = null;
  const stanceAttempts = [];
  for (let attempt = 0; attempt < (pinnedStance ? 1 : 10); attempt += 1) {
    if (pinnedStance) {
      await page.evaluate((stance) => {
        window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(stance.x, stance.y, stance.z, stance.yaw, 0);
      }, pinnedStance);
      await page.waitForTimeout(1_200);
    } else if (attempt > 0) {
      // The probe REMOVED the enemy to measure it, so a retry has to put one
      // back before it can stage anything - without this every retry after the
      // first found no bot at all and reported `staged: false` forever.
      await page.evaluate(() => {
        window.__ATOMIC_ACRES_DEBUG__.startSolo();
        window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
        window.__ATOMIC_ACRES_DEBUG__.respawn();
      });
      await page.waitForTimeout(1_600);
    }
    const probe = await stageAndProbe();
    stanceAttempts.push({
      attempt,
      staged: Boolean(probe.staged),
      maskPx: probe.blob.hits,
      centroidOffsetPx: Number.isFinite(probe.blob.offset) ? Number(probe.blob.offset.toFixed(1)) : null,
    });
    if (probe.staged && probe.blob.hits >= 800 && probe.blob.offset <= 70) {
      placement = probe.staged;
      if (!pinnedStance) {
        pinnedStance = {
          x: probe.staged.sourcePlayer.position[0],
          y: probe.staged.sourcePlayer.position[1],
          z: probe.staged.sourcePlayer.position[2],
          yaw: probe.staged.sourcePlayer.yaw,
        };
      }
      break;
    }
  }
  if (!placement) throw new Error(`no pixel-verified enemy stance on ${ARENA}: ${JSON.stringify(stanceAttempts)}`);
  console.error(`[weather] ${state} stance ok after ${stanceAttempts.length} attempt(s): ${JSON.stringify(stanceAttempts[stanceAttempts.length - 1])}`);
  // The probe removed the enemy. Put it back at the same pinned stance.
  await page.evaluate((stance) => {
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(stance.x, stance.y, stance.z, stance.yaw, 0);
  }, pinnedStance);
  await page.waitForTimeout(1_200);
  placement = await page.evaluate(() => {
    const staged = window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(9);
    if (staged) window.__ATOMIC_ACRES_DEBUG__.aimAtBot();
    return staged;
  });
  if (!placement) throw new Error('could not restage the enemy at the pinned stance');
  // Let rain reach a steady state at the pinned stance.
  await page.waitForTimeout(3_500);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.aimAtBot(); });
  await page.waitForTimeout(700);

  const weather = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleWeather());

  await page.screenshot({ path: resolve(`${OUT}/${TAG}-${ARENA}-${state}-full.png`) });
  const withBot = await grabMedian(page, FRAMES);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots(); });
  await page.waitForTimeout(800);
  const withoutBot = await grabMedian(page, FRAMES);

  // The mask is measured on the CLEAR pass and reused unchanged, so every state
  // is judged on identical pixels. Its centroid is gated: a mask made of
  // drifting cloud rather than of a standing enemy is not centred on the
  // crosshair, and an earlier run of this harness measured exactly that.
  if (!mask) {
    mask = centralMask(withBot.data, withoutBot.data, withBot.channels);
    ring = buildRing(mask.flags, CROP.width, CROP.height);
    console.error(`[weather] enemy mask ${mask.hits} px, ring ${ring.hits} px, centroid offset ${mask.offset.toFixed(1)} px`);
    if (mask.hits < 500) throw new Error(`enemy mask is only ${mask.hits} px - the enemy is not in the crop`);
    if (mask.offset > 70) throw new Error(`enemy mask centroid is ${mask.offset.toFixed(1)} px off the crosshair - that is not the enemy`);
    maskCentroidOffset = mask.offset;
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
    yawOffsetRadians: placement.yawOffsetRadians,
    stance: pinnedStance,
    stanceAttempts,
    maskPixels: mask.hits,
    maskCentroidOffsetPx: Number((maskCentroidOffset ?? 0).toFixed(1)),
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
