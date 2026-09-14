#!/usr/bin/env node
// Pass 79 weather lane probe: what does the LIVE scene actually contain that
// weather could legitimately drive? Fog type/params, light inventory, and
// whether placeBotAhead lands a bot in frame at the range we want to prove.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41917');
const ARENA = arg('--arena', 'atomic-acres');
const STATE = arg('--weather', 'heavy-rain');
const RANGE = Number(arg('--range', '30'));
const OUT = 'artifacts/pass79/weather';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addInitScript(() => {
  try {
    window.localStorage.setItem('atomic-acres-pass65-settings-v1', JSON.stringify({
      version: 1,
      graphics: { schemaVersion: 1, preset: 'custom', weatherIntensity: 'storm', rainDensity: 1.5, windStrength: 2, lightning: true },
    }));
  } catch { /* ignore */ }
});
const page = await context.newPage();
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
page.on('pageerror', (error) => console.error('[pageerror]', String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=pass79weather&weather=${STATE}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 240_000 });
await page.waitForTimeout(2500);

const scene = await page.evaluate(() => {
  const root = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const fog = root.fog
    ? { type: root.fog.constructor?.name ?? 'unknown', color: root.fog.color?.getHexString?.() ?? null, density: root.fog.density ?? null, near: root.fog.near ?? null, far: root.fog.far ?? null }
    : null;
  const lights = [];
  root.traverse((object) => {
    if (object.isLight) {
      lights.push({
        type: object.type, name: object.name || null, intensity: object.intensity,
        color: object.color?.getHexString?.() ?? null,
        groundColor: object.groundColor?.getHexString?.() ?? null,
        castShadow: Boolean(object.castShadow),
        position: [object.position.x, object.position.y, object.position.z].map((v) => Number(v.toFixed(2))),
      });
    }
  });
  return {
    fog,
    background: root.background?.isColor ? root.background.getHexString() : (root.background?.constructor?.name ?? null),
    environmentIntensity: root.environmentIntensity ?? null,
    lights,
  };
});
console.error('SCENE', JSON.stringify(scene, null, 2));

const placement = await page.evaluate((range) => {
  window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
  window.__ATOMIC_ACRES_DEBUG__.clearBots();
  const staged = window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(range);
  window.__ATOMIC_ACRES_DEBUG__.aimAtBot();
  return { staged, player: window.__ATOMIC_ACRES_DEBUG__.snapshot().player };
}, RANGE);
console.error('PLACEMENT', JSON.stringify(placement, null, 2));
await page.waitForTimeout(2500);
await page.screenshot({ path: resolve(`${OUT}/probe-${ARENA}-${STATE}-bot.png`) });

const weather = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleWeather());
console.error('RAIN', JSON.stringify(weather.rain, null, 2));

await browser.close();
