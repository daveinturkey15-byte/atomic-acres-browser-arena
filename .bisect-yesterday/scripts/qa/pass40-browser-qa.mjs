import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const outDir = path.resolve('artifacts/pass40');
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

async function waitReady() {
  await page.waitForFunction(() => {
    const solo = document.querySelector('#solo');
    return Boolean(solo && !solo.disabled && window.__ATOMIC_ACRES_DEBUG__);
  }, undefined, { timeout: 30_000 });
}

async function snap(name) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

await page.goto(`${base}/?render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=4001`);
await waitReady();
const menuCss = await page.evaluate(() => {
  const app = document.getElementById('app') || document.body;
  const canvas = document.querySelector('canvas');
  const cs = getComputedStyle(app);
  const ccs = canvas ? getComputedStyle(canvas) : null;
  return {
    background: cs.backgroundColor,
    canvasVisibility: ccs?.visibility ?? null,
  };
});
await snap('01-menu-black.png');

await page.goto(`${base}/?render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=4002&map=rustworks-1v1`);
await waitReady();
await page.locator('#player-name').fill('PASS40');
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 15_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
for (let i = 0; i < 40; i += 1) await page.waitForTimeout(50);
const drawInfo = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return {
    snapshotKeys: Object.keys(s.render || {}),
    render: s.render,
    arena: s.arenaSelection.id,
    player: s.player.position,
  };
});
await snap('02-rustworks-performance-ground.png');

const lowerUp = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stageRustworksAccess('ground-to-lower', false));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true, true));
await page.waitForFunction((target) => {
  const p = window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position;
  return Math.hypot(p[0] - target[0], p[2] - target[2]) < 1.0 && Math.abs(p[1] - target[1]) < 1.0;
}, lowerUp.target, { timeout: 25_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false, false));
await snap('03-rustworks-lower-deck.png');

const upperUp = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.stageRustworksAccess('lower-to-upper', false));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true, true));
await page.waitForFunction((target) => {
  const p = window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position;
  return Math.hypot(p[0] - target[0], p[2] - target[2]) < 1.0 && Math.abs(p[1] - target[1]) < 1.0;
}, upperUp.target, { timeout: 25_000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false, false));
await snap('04-rustworks-upper-deck.png');

await page.goto(`${base}/?render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&renderPaused=1&seed=4003&map=rustworks-1v1`);
await waitReady();
await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render.rustworksBlender.status === 'ready', undefined, { timeout: 20_000 });
const quality = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render.rustworksBlender);
await snap('05-rustworks-quality-menu.png');

await page.goto(`${base}/?render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=4004`);
await waitReady();
const beforeGame = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return { visibility: getComputedStyle(canvas).visibility, display: getComputedStyle(canvas).display };
});
await page.locator('#player-name').fill('TRANS');
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active');
await page.waitForTimeout(300);
const afterGame = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  return { visibility: getComputedStyle(canvas).visibility, display: getComputedStyle(canvas).display };
});
await snap('06-gameplay-canvas.png');

const report = {
  base,
  menuCss,
  beforeGame,
  afterGame,
  drawInfo,
  quality,
  pageErrors,
  consoleErrors: consoleErrors.filter((e) => !/WebGL|SwiftShader|OFFSCREEN|context lost/i.test(e)),
  allConsoleErrors: consoleErrors,
};
await writeFile(path.join(outDir, 'browser-qa.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
