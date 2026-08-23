#!/usr/bin/env node
// HF-358 swim verification.
//
// Drops the player into the farcrysis water volume and watches the live swim
// telemetry, then puts them back on dry land and watches it release. This is
// the check that distinguishes "the reducer is correct" (unit tests already
// cover that) from "the reducer is reached by the movement loop", which is the
// part that was missing.
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const ARENA = arg('--arena', 'farcrysis');

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgl2&render=quality&seed=swim&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 120_000 });
await page.waitForTimeout(2_000);

const sampleSwim = () => page.evaluate(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return { swim: snapshot.swim, y: Number(snapshot.player?.y ?? NaN) };
});

const timeline = [];

timeline.push({ phase: 'on-land-at-spawn', ...(await sampleSwim()) });

// Well outside the island pad (half extents are 32 m) and below the -0.3 m
// water level, so the float zone and the swim reducer both see real depth.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, -2.2, 46); });
for (let index = 0; index < 6; index += 1) {
  await page.waitForTimeout(400);
  timeline.push({ phase: `in-water-${index}`, ...(await sampleSwim()) });
}

// Back onto the island, high and dry.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 6, 0); });
for (let index = 0; index < 4; index += 1) {
  await page.waitForTimeout(400);
  timeline.push({ phase: `back-on-land-${index}`, ...(await sampleSwim()) });
}

const enteredSwim = timeline.some((entry) => entry.phase.startsWith('in-water') && entry.swim?.swimming === true);
const releasedSwim = timeline.at(-1)?.swim?.swimming === false;

// REGRESSION SIDE. The float-zone constants and the surface clamp are a
// rustworks contract: a player who falls out of bounds must be caught by the
// water and floated, not dropped through it. Swimming must not have changed
// that, so the same drop is repeated on a NON-swimmable body and the player is
// expected to be caught near the surface rather than sinking away.
await page.goto(`${BASE}/?release=latest&renderer=webgl2&render=quality&seed=swim&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('rustworks-1v1'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 120_000 });
await page.waitForTimeout(2_000);

const readY = () => page.evaluate(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return {
    swimmable: snapshot.swim?.bodySwimmable ?? null,
    swimming: snapshot.swim?.swimming ?? null,
    y: Number(snapshot.deterministicReview?.captureCameraY ?? NaN),
  };
});

// The rustworks sea sits at y = -19.5 and the deck is far above it, so the
// drop has to start AT the water: an earlier version of this check released
// the player at y = -3 and then measured during the 16 m fall, reading the
// fall itself as "sinking". Start submerged, outside the 27x29 island pad.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, -22, 60); });
// Let the float zone take hold before sampling begins.
await page.waitForTimeout(1_500);
const floatSamples = [];
for (let index = 0; index < 6; index += 1) {
  await page.waitForTimeout(500);
  floatSamples.push(await readY());
}
const finalY = floatSamples.at(-1)?.y ?? NaN;
// "Caught" means the DESCENT STOPS, not that y stops moving: the rustworks
// ocean runs a storm spectrum, so a floating player keeps bobbing by more than
// a metre and any "y is steady" test would fail on correct behaviour. Nor can a
// specific height be asserted - where the float zone settles depends on the
// arena's water level and island extents, and inventing a number would be
// inventing a contract. The real signal is that the player is no longer
// SINKING: compare the first half of the window against the second half.
const settleWindow = floatSamples.map((entry) => entry.y).filter(Number.isFinite);
const half = Math.floor(settleWindow.length / 2);
const mean = (values) => values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
const earlyMean = mean(settleWindow.slice(0, half));
const lateMean = mean(settleWindow.slice(half));
// Still falling at ~9.8 m/s would drop metres between the halves; bobbing does not.
const rustworksFloatHeld = settleWindow.length >= 4 && earlyMean - lateMean < 1.5;
const rustworksNeverSwims = floatSamples.every((entry) => entry.swimming === false);

console.log(JSON.stringify({
  arena: ARENA,
  rustworksFloatHeld,
  rustworksNeverSwims,
  rustworksFinalY: finalY,
  rustworksDescentM: Number((earlyMean - lateMean).toFixed(3)),
  rustworksSettleSpreadM: settleWindow.length >= 2 ? Number((Math.max(...settleWindow) - Math.min(...settleWindow)).toFixed(3)) : null,
  rustworksSwimmable: floatSamples[0]?.swimmable ?? null,
  bodySwimmable: timeline[0]?.swim?.bodySwimmable ?? null,
  enteredSwim,
  releasedSwim,
  verdict: enteredSwim && releasedSwim && rustworksFloatHeld && rustworksNeverSwims ? 'PASS' : 'FAIL',
  pageErrors: [...new Set(errors)].slice(0, 5),
  timeline,
}, null, 2));

await browser.close();
process.exit(enteredSwim && releasedSwim && rustworksFloatHeld && rustworksNeverSwims ? 0 : 1);
