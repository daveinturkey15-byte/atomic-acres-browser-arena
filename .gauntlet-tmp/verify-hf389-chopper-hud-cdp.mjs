#!/usr/bin/env node
// HF-389 archaeology verification: drive installed Chrome on real WebGPU over
// CDP, possess the Chopper Gunner, then the Piloted Drone, and read the LIVE
// cockpit HUD DOM state plus captured frames.
// Launch flags copied from scripts/qa/verify-arena-boot-cdp.mjs (focus
// emulation + anti-throttling) per the gauntlet brief.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41910';
const OUT = '.gauntlet-tmp/hf389';

const browser = await chromium.launch({
  headless: false,
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=performance&grass=off&mist=off&rays=off&externalServices=off&seed=hf389-chopper-hud`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf389] backend=${backend}`);

const loadout = ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'];
const readHud = () => page.evaluate(() => {
  const $ = (id) => document.getElementById(id);
  const strip = $('gunner-control-strip');
  const style = getComputedStyle(strip);
  return {
    backend: document.documentElement.dataset.renderBackend,
    possession: document.documentElement.dataset.killstreakPossession ?? null,
    hudHidden: $('gunner-cockpit-hud').hidden,
    supportKind: $('gunner-cockpit-hud').dataset.supportKind,
    stripVisible: style.display !== 'none',
    stripAriaHidden: strip.getAttribute('aria-hidden'),
    gunAmmoStrip: $('gunner-control-gun-ammo')?.textContent ?? null,
    ammoInstruments: $('gunner-ammo')?.textContent ?? null,
    missileAmmo: $('gunner-missile-ammo')?.textContent ?? null,
    missileCooldown: $('gunner-missile-cooldown')?.textContent ?? null,
    platform: $('gunner-platform')?.textContent ?? null,
  };
});
mkdirSync(OUT, { recursive: true });

// --- Chopper Gunner ---------------------------------------------------------
await page.evaluate((slots) => {
  localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify({ schemaVersion: 1, slots }));
}, loadout);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.gameStarted && s.matchPhase === 'active' && s.supportVehiclePresentation?.state === 'ready';
}, undefined, { timeout: 120_000 });
await page.evaluate(() => {
  window.__ATOMIC_ACRES_DEBUG__.earnSupport(15);
  if (!window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper')) throw new Error('chopper activation rejected');
});
if (!await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())) throw new Error('toggle into chopper rejected');
const possessedChopper = await page.waitForFunction(
  () => document.documentElement.dataset.killstreakPossession === 'chopper-gunner',
  undefined, { timeout: 15_000 },
).then(() => true).catch(() => false);
if (!possessedChopper) {
  const diag = await page.evaluate(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { possession: s.killstreak?.possession ?? null, alive: s.player?.alive ?? null,
      entities: (s.killstreak?.entities ?? []).map((e) => ({ kind: e.kind, phase: e.phase, expiresInMs: e.expiresInMs })) };
  });
  console.log('CHOPPER-POSSESSION-DIAG', JSON.stringify(diag));
}
const chopper = await readHud();
await page.screenshot({ path: resolve(OUT, 'chopper-possession.png') });
writeFileSync(resolve(OUT, 'chopper-state.json'), `${JSON.stringify(chopper, null, 2)}\n`);
console.log('CHOPPER', JSON.stringify(chopper));

// --- Piloted Drone (fresh session: the still-orbiting chopper would refuse
// --- a second live platform activation) -------------------------------
const url2 = `${BASE}/?release=latest&renderer=webgpu&render=performance&grass=off&mist=off&rays=off&externalServices=off&seed=hf389-drone-hud`;
await page.goto(url2, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.gameStarted && s.matchPhase === 'active' && s.supportVehiclePresentation?.state === 'ready';
}, undefined, { timeout: 120_000 });
const droneReceipt = await page.evaluate(() => {
  window.__ATOMIC_ACRES_DEBUG__.earnSupport(15);
  const receipt = window.__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('piloted-drone');
  const feed = Array.from(document.querySelectorAll('#feed li, .hud-feed li')).map((n) => n.textContent?.trim()).filter(Boolean).slice(-6);
  return { receipt, feed };
});
console.log('DRONE-ACTIVATION', JSON.stringify(droneReceipt));
if (!droneReceipt.receipt) throw new Error('drone activation rejected');
if (!await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())) throw new Error('toggle into drone rejected');
await page.waitForFunction(() => document.documentElement.dataset.killstreakPossession === 'piloted-drone',
  undefined, { timeout: 15_000 });
await page.waitForTimeout(2_000);
const droneAtEnter = await readHud();
// Firing needs real input we do not drive here; the contradiction is already
// visible at entry: instruments AMMO shows the finite magazine while the LMB
// GUN strip readout is stuck.
const droneSnapshot = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const drone = s.killstreak.entities.find((e) => e.kind === 'drone');
  return { magazine: drone?.magazine ?? null };
});
await page.screenshot({ path: resolve(OUT, 'drone-possession.png') });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl());
await page.waitForTimeout(500);
const afterExit = await readHud();

const result = { backend, chopper, droneAtEnter, droneMagazine: droneSnapshot.magazine, afterExit, pageErrors: [...new Set(errors)].slice(0, 6) };
writeFileSync(resolve(OUT, 'hud-state.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
