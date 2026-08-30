#!/usr/bin/env node
// Final probe: (1) gun-range weapon-station F pickup loop end to end;
// (2) screenshot farcrysis map centre (0,0) where the player is stuck inside
// a collider — is there a VISIBLE asset there, or an invisible volume?
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const OUT_DIR = resolve('artifacts/qa/pass79-playtest-r2');
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const url = 'http://127.0.0.1:41911/?release=latest&renderer=webgpu&render=quality&seed=probes79d&previewTime=0';
const out = {};

const boot = async (arena) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: 240_000 });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
};

// 1. gun-range station pickup.
await boot('gun-range');
out.stations = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.gunRange?.stations?.map((st) => ({ weapon: st.weapon, position: st.position })) ?? null;
});
// Walk to the first station and try the pinned F interaction.
out.pickup = await page.evaluate(async () => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const s = api.snapshot();
  const stations = s.gunRange?.stations ?? [];
  if (!stations.length) return { note: 'no stations in snapshot' };
  const st = stations[0];
  api.setStance('stand');
  api.teleportPlayer(st.position[0], 1.8, st.position[2] + 1.2, Math.PI, 0);
  await new Promise((r) => setTimeout(r, 900));
  const before = api.snapshot().player.weapon;
  const viaBay = api.interactTestBayStation ? api.interactTestBayStation() : 'no-api';
  await new Promise((r) => setTimeout(r, 700));
  const viaDrop = api.interactDrop();
  await new Promise((r) => setTimeout(r, 700));
  const after = api.snapshot().player.weapon;
  return { stationWeapon: st.weapon, before, viaBay, viaDrop, after };
});
await page.screenshot({ path: resolve(OUT_DIR, 'gunrange-pickup.png') }).catch(() => {});

// 2. farcrysis centre view.
await boot('farcrysis');
await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.setStance('stand');
  api.teleportPlayer(2.5, 3.0, 2.5, Math.PI, -0.2); // just outside the stuck volume, looking at it
});
await sleep(1200);
out.centreProbe = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  return {
    collisionProbe0: api.collisionProbe(0, 0),
    collisionProbe25: api.collisionProbe(2.5, 2.5),
  };
});
await page.screenshot({ path: resolve(OUT_DIR, 'farcrysis-centre-view.png') }).catch(() => {});

await browser.close();
writeFileSync(resolve(OUT_DIR, 'pickup-centre-probe.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
