#!/usr/bin/env node
// Can you actually FIGHT down there?
//
// Luminance tells you the room is lit. It does not tell you an enemy is
// visible - a uniformly lit corridor with a uniformly lit enemy in it is just
// as unreadable as a black one. The gameplay question is contrast: does a body
// at corridor range separate from the bulkhead behind it?
//
// Method: stand at a station, stage a bot at range, capture. Clear the bots,
// capture again from the identical pose. The pixels that changed ARE the enemy;
// compare their luminance against the same pixels' luminance with him gone.
// That yields a Weber contrast for the silhouette against its own background,
// which is the number that decides whether he can be seen.
//
// Usage: node scripts/qa/measure-below-deck-silhouette.mjs --label after
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const BASE = arg('--url', 'http://127.0.0.1:41876');
const LABEL = arg('--label', 'after');
const OUT = resolve(process.cwd(), arg('--out', `artifacts/qa/below-deck-luminance/silhouette/${LABEL}`));

// Ranges placeBotAhead accepts (it clamps to 2.5..9 m). 9 m is a corridor-length
// engagement below deck; 5 m is a room fight.
const STATIONS = [
  { id: 'engine-room-4m', pos: [0, 1.7, 4.6], yaw: Math.PI, range: 4, note: 'across the engine-room bulge' },
  { id: 'engine-room-3m', pos: [0, 1.7, 3.0], yaw: Math.PI, range: 3, note: 'close quarters in the room' },
  { id: 'corridor-9m', pos: [0, 1.7, -8], yaw: Math.PI, range: 9, note: 'down the bow corridor leg' },
];

// The sealed service-deck volume. placeBotAhead knows nothing about below deck:
// it clamps range and dodges "cover", then applies a yaw offset of up to ~0.39
// rad to find a clear spot - which at 9 m throws the target 3.4 m sideways,
// straight through a bulkhead into the hull void. Measured: asking for a bot 9 m
// ahead in a 1.44 m corridor staged it at x=3.44. A silhouette that was never
// in the room is not a dark silhouette, and this harness must not confuse the
// two, so a stage outside these bounds is reported UNMEASURED with its
// coordinates rather than as a contrast result.
const SERVICE_DECK = { minX: -2.6, maxX: 2.6, minY: -0.5, maxY: 3.0, minZ: -20.4, maxZ: 20.4 };
const insideServiceDeck = (position) => Array.isArray(position)
  && position[0] >= SERVICE_DECK.minX && position[0] <= SERVICE_DECK.maxX
  && position[1] >= SERVICE_DECK.minY && position[1] <= SERVICE_DECK.maxY
  && position[2] >= SERVICE_DECK.minZ && position[2] <= SERVICE_DECK.maxZ;

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb255 = (l) => Math.min(255, Math.max(0, (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255));

async function raw(file) {
  const image = sharp(file).removeAlpha();
  const { width, height } = await image.metadata();
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, width, height };
}

/** Weber contrast of the changed pixels against the same pixels without the bot. */
async function silhouetteContrast(withBot, withoutBot) {
  const a = await raw(withBot);
  const b = await raw(withoutBot);
  if (a.width !== b.width || a.height !== b.height) throw new Error('frame size mismatch');
  // World-only window: clear of the HUD panels and the viewmodel.
  const top = Math.round(a.height * 0.15);
  const bottom = Math.round(a.height * 0.62);
  const left = Math.round(a.width * 0.28);
  const right = Math.round(a.width * 0.72);
  let botSum = 0;
  let backgroundSum = 0;
  let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * a.width + x) * 3;
      const la = 0.2126 * toLinear(a.data[i] / 255) + 0.7152 * toLinear(a.data[i + 1] / 255) + 0.0722 * toLinear(a.data[i + 2] / 255);
      const lb = 0.2126 * toLinear(b.data[i] / 255) + 0.7152 * toLinear(b.data[i + 1] / 255) + 0.0722 * toLinear(b.data[i + 2] / 255);
      // 2/255 of sRGB change is well above encoder noise and well below anything
      // a player would call a visible difference.
      if (Math.abs(toSrgb255(la) - toSrgb255(lb)) < 2) continue;
      botSum += la;
      backgroundSum += lb;
      count += 1;
    }
  }
  const windowPixels = (bottom - top) * (right - left);
  if (count === 0) {
    return { silhouettePixels: 0, coveragePct: 0, botSrgb255: 0, backgroundSrgb255: 0, weberContrast: 0, srgbSeparation: 0 };
  }
  const bot = botSum / count;
  const background = backgroundSum / count;
  return {
    silhouettePixels: count,
    coveragePct: Number((count / windowPixels * 100).toFixed(2)),
    botSrgb255: Number(toSrgb255(bot).toFixed(1)),
    backgroundSrgb255: Number(toSrgb255(background).toFixed(1)),
    weberContrast: Number((Math.abs(bot - background) / Math.max(background, 1e-6)).toFixed(3)),
    srgbSeparation: Number((toSrgb255(bot) - toSrgb255(background)).toFixed(1)),
  };
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false, channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await page.goto(`${BASE}/?renderer=webgpu&render=quality&seed=below-deck&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 300_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
if (backend !== 'webgpu') { await browser.close(); throw new Error(`negotiated ${backend}, not webgpu`); }
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return s.matchPhase === 'active' && s.gameStarted === true; }, undefined, { timeout: 300_000 });
await page.waitForTimeout(6_000);

const frames = () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
const report = [];
for (const station of STATIONS) {
  await page.evaluate(([x, y, z, yaw]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, 0), [...station.pos, station.yaw]);
  await page.waitForTimeout(900);
  const staged = await page.evaluate((range) => window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(range), station.range);
  // Freeze AFTER staging so he holds the pose we measured him in.
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true); });
  await page.waitForTimeout(1_400);

  const f0 = await frames();
  const withBot = resolve(OUT, `${station.id}-with-bot.png`);
  await page.screenshot({ path: withBot });
  await page.waitForTimeout(400);
  const f1 = await frames();

  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots(); });
  await page.evaluate(([x, y, z, yaw]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, 0), [...station.pos, station.yaw]);
  await page.waitForTimeout(1_400);
  const withoutBot = resolve(OUT, `${station.id}-no-bot.png`);
  await page.screenshot({ path: withoutBot });
  const f2 = await frames();

  const contrast = await silhouetteContrast(withBot, withoutBot);
  const live = f1 > f0 && f2 > f1;
  const record = {
    ...station,
    live,
    stagedDistanceM: staged?.stagedDistanceM ?? null,
    botAlive: staged?.bot?.alive ?? null,
    ...contrast,
  };
  // A staged bot that produced no changed pixels is not "invisible because it is
  // dark" - it means the staging failed. Say which.
  const stagedInside = insideServiceDeck(staged?.bot?.logicalPosition);
  record.stagedPosition = staged?.bot?.logicalPosition?.map((value) => Number(value.toFixed(2))) ?? null;
  record.stagedInsideServiceDeck = stagedInside;
  record.verdict = !live ? 'UNMEASURED: frames not advancing'
    : !staged ? 'UNMEASURED: placeBotAhead staged nothing'
      : !stagedInside ? `UNMEASURED: placeBotAhead staged the bot outside the service deck at ${JSON.stringify(record.stagedPosition)}`
        : contrast.silhouettePixels < 200 ? 'UNMEASURED: staged bot never entered frame'
          : contrast.weberContrast >= 0.35 ? 'READABLE'
            : 'TOO LOW: silhouette does not separate from its background';
  console.error(`[silhouette ${LABEL}] ${station.id.padEnd(16)} px=${contrast.silhouettePixels} bot=${contrast.botSrgb255} bg=${contrast.backgroundSrgb255} weber=${contrast.weberContrast} ${record.verdict}`);
  report.push(record);

  // Restore the bot roster for the next station.
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(false); });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForTimeout(2_500);
}

await browser.close();
const payload = { label: LABEL, backend, stations: report };
writeFileSync(resolve(OUT, 'silhouette.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload, null, 2));
