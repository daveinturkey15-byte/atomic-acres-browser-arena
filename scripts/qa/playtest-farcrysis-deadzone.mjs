#!/usr/bin/env node
// B3: localize the farcrysis movement dead zone around (0,16): try movement
// from a ring of tiles and record which ones move.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const OUT_DIR = resolve('artifacts/qa/pass79-playtest-r2');
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const url = 'http://127.0.0.1:41911/?release=latest&renderer=webgpu&render=quality&seed=probes79c&previewTime=0';

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240_000 });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });

const pos = () => page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return {
    p: s.player.position.map((v) => Number(v.toFixed(2))),
    grounded: s.player.grounded,
    stance: s.player.stance,
    swim: s.swim?.swimming ?? null,
  };
});

const spots = [[0, 16], [4, 16], [-4, 16], [0, 8], [0, 24], [8, 8], [16, 16], [0, 0], [-16, -16]];
const findings = [];
for (const [x, z] of spots) {
  await page.evaluate(([px, pz]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    api.teleportPlayer(px, 3.0, pz, Math.PI / 2, 0);
  }, [x, z]);
  await sleep(1400);
  const before = await pos();
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true));
  await sleep(1600);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
  const after = await pos();
  const moved = Math.hypot(after.p[0] - before.p[0], after.p[2] - before.p[2]);
  const blockedHere = await page.evaluate(([px, pz]) => (
    window.__ATOMIC_ACRES_DEBUG__.collisionProbe(px, pz)
  ), [before.p[0], before.p[2]]);
  findings.push({
    spot: [x, z], landedY: before.p[1], grounded: before.grounded, swim: before.swim,
    movedM: Number(moved.toFixed(2)), endP: after.p,
    collisionProbeAtRest: blockedHere,
    verdict: !before.grounded && after.p[1] < before.p[1] ? 'falling' : moved < 0.3 ? 'STUCK' : 'moves',
  });
  console.error(`farcrysis (${x},${z}): ${findings.at(-1).verdict} moved=${moved.toFixed(2)} y=${before.p[1]} grounded=${before.grounded}`);
}
await page.screenshot({ path: resolve(OUT_DIR, 'farcrysis-b3-end.png') }).catch(() => {});
await browser.close();
writeFileSync(resolve(OUT_DIR, 'farcrysis-deadzone.json'), `${JSON.stringify(findings, null, 2)}\n`);
console.log(JSON.stringify(findings.map((f) => ({ spot: f.spot, verdict: f.verdict, y: f.landedY, grounded: f.grounded, collisionProbeAtRest: f.collisionProbeAtRest }))));
