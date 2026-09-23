#!/usr/bin/env node
/**
 * HF-396 - headless hip and ADS frames of the railed / scoped weapons.
 *
 * The seating contract (src/weapon-rail-alignment-contract.test.ts) grades the
 * geometry; this captures what the player sees so the fix is also graded on
 * pixels. One frame per weapon per pose, on open ground in Nuke Town facing a
 * plain sky so the rail's underside reads against a flat background.
 *
 * Headless, installed Chrome, muted. Never on the owner's display.
 *
 * Usage:
 *   QA_PORT=41942 node scripts/qa/run-with-preview-server.mjs \
 *     node scripts/qa/capture-weapon-rail-frames-cdp.mjs --url http://127.0.0.1:41942/ --out artifacts/qa/hf396 --label after
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:41933/');
const OUT = arg('--out', 'artifacts/qa/hf396');
const LABEL = arg('--label', 'run');
const WEAPONS = arg('--weapons', 'm14-ebr,railgun,carbine,m4a1,slug-shotgun,sniper').split(',').map((s) => s.trim()).filter(Boolean);
mkdirSync(resolve(OUT), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), null, { timeout: 120_000 });
await page.evaluate(async () => {
  await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres');
  window.__ATOMIC_ACRES_DEBUG__.startSolo();
});
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot?.player && snapshot.gameStarted !== false;
}, null, { timeout: 180_000 }).catch(() => {});
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true));

const report = [];
for (const weapon of WEAPONS) {
  await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon?.(id), weapon).catch(() => {});
  // Open ground, looking slightly up so the sky backs the weapon's top line.
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.teleportPlayer(0, 1.7, 0, 0, 0.18);
  });
  await page.waitForFunction((id) => {
    const readiness = window.__ATOMIC_ACRES_DEBUG__.sampleActiveWeaponReadiness?.();
    return readiness ? readiness.ready === true && readiness.importedWeapon === id : true;
  }, weapon, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1_200);
  const hip = `${LABEL}-${weapon}-hip.png`;
  await page.screenshot({ path: resolve(OUT, hip) });

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot()?.weaponPresentation?.adsProgress ?? 0) > 0.98, null, { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(400);
  const ads = `${LABEL}-${weapon}-ads.png`;
  await page.screenshot({ path: resolve(OUT, ads) });
  const state = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { adsProgress: snapshot?.weaponPresentation?.adsProgress ?? null, weapon: snapshot?.player?.weapon ?? null };
  });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(false));
  report.push({ weapon, hip, ads, ...state });
  console.log(JSON.stringify(report[report.length - 1]));
}
await browser.close();
writeFileSync(resolve(OUT, `${LABEL}-frames.json`), `${JSON.stringify(report, null, 2)}\n`);
