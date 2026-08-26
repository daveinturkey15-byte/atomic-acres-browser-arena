#!/usr/bin/env node
// weapons-fidelity lane (owner request 2026-08-25): "ensure crimson flamethrower has
// same fire style as the original btw, just with the adjusted dmg?"
//
// Captures the SAME solo bot firing BOTH flamethrowers on the REAL WebGPU route
// (installed Chrome, headless - real hardware device, no browser slot needed).
//
// Why a bot: the map M2 is a timed-map weapon whose authority lane is disabled in
// solo, so the local player cannot fire it here. Bots CAN carry the map flamethrower,
// and setBotPresentation forces the bot's weapon id - so one bot fires the map M2
// (stream presentation) and then the crimson variant (whatever the runtime actually
// draws for it). That difference IS the claim under test.
//
// Usage: node scripts/qa/capture-crimson-flamethrower-style.mjs [--url http://127.0.0.1:41911]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT_DIR = arg('--out', 'artifacts/qa/crimson-flamethrower-style');
mkdirSync(resolve(OUT_DIR), { recursive: true });

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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=crimsonstyle&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });

async function flameTelemetry() {
  return page.evaluate(() => ({
    flameStream: window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons?.flameStream ?? null,
    playerAlive: window.__ATOMIC_ACRES_DEBUG__.snapshot().player?.alive ?? null,
  }));
}

// Stage the bot ahead with the requested weapon, then release it so its AI engages.
async function stageBotFiring(weapon) {
  const staged = await page.evaluate((id) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotPresentation('stand', 0, id);
    const receipt = debug.placeBotAhead(6);
    debug.setBotPresentation(null, 0, id); // stance null releases the freeze, weapon kept
    return receipt ? { botWeapon: receipt.bot.weapon, stagedDistanceM: receipt.stagedDistanceM } : null;
  }, weapon);
  // Wait until the bot actually opens fire (stream emissions rise) or timeout.
  await page.waitForFunction(() => {
    const stream = window.__ATOMIC_ACRES_DEBUG__.snapshot().timedMapWeapons?.flameStream;
    return (stream?.emissions ?? 0) > 0;
  }, undefined, { timeout: 20_000 }).catch(() => {});
  return staged;
}

async function capturePhase(weapon, label) {
  const staged = await stageBotFiring(weapon);
  await page.waitForTimeout(1_500); // let the effect develop in frame
  const shot = resolve(OUT_DIR, `${label}.png`);
  await page.screenshot({ path: shot });
  await page.waitForTimeout(800);
  const shot2 = resolve(OUT_DIR, `${label}-late.png`);
  await page.screenshot({ path: shot2 });
  const telemetry = await flameTelemetry();
  console.error(`[crimson-style] ${label}: captured (staged=${JSON.stringify(staged)})`);
  return { weapon, staged, screenshot: shot, screenshotLate: shot2, telemetry };
}

// Revive the player if the flame killed them between phases.
async function ensureAlive() {
  const alive = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player?.alive === true);
  if (!alive) {
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.respawn(); });
    await page.waitForTimeout(1_500);
  }
}

await ensureAlive();
const results = [];
results.push(await capturePhase('flamethrower', 'flamethrower'));
await ensureAlive();
results.push(await capturePhase('crimson-flamethrower', 'crimson-flamethrower'));

await browser.close();

const receipt = { backend, results, consoleErrors: [...new Set(errors)].slice(0, 8) };
writeFileSync(resolve(OUT_DIR, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  backend,
  captured: results.map((entry) => entry.weapon),
  phases: Object.fromEntries(results.map((entry) => [entry.weapon, {
    staged: entry.staged,
    emissions: entry.telemetry?.flameStream?.emissions ?? null,
    particlesSpawned: entry.telemetry?.flameStream?.particlesSpawned ?? null,
    maximumActive: entry.telemetry?.flameStream?.maximumActive ?? null,
    groundFireActive: entry.telemetry?.flameStream?.groundFireActive ?? null,
  }])),
}, null, 2));
