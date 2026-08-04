import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 250)); });
await page.goto('http://127.0.0.1:4180/?render=blender&signal=on&release=latest', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const status = document.querySelector('#network-status');
  const solo = document.querySelector('#solo');
  const debugApi = window.__ATOMIC_ACRES_DEBUG__;
  return status?.dataset.kind === 'ok' && solo?.disabled === false && !!debugApi?.snapshot();
}, undefined, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
const menu = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return {
    profile: s.render?.profile, representation: s.render?.representation,
    story: s.arenaStoryReady, art: s.originalArtLoaded, weapon: s.weaponReady, details: s.weaponPresentation?.detailsReady,
    blenderStatus: s.render?.blenderEnvironment?.status, blenderMesh: s.render?.blenderEnvironment?.meshCount,
    antialias: s.render?.antialias, shadows: s.render?.shadows, shadowMode: s.render?.shadowMode,
    graphicsProfile: document.querySelector('#graphics-profile')?.value,
    spawnSafety: s.spawnSafety,
  };
});
console.log('MENU(blender):', JSON.stringify(menu, null, 1));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
await page.waitForTimeout(20000);
const post = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const ad = window.__ATOMIC_ACRES_DEBUG__.admissionState();
  return {
    started: ad.gameStarted, phase: ad.matchPhase, story: s.arenaStoryReady,
    blenderStatus: s.render?.blenderEnvironment?.status, blenderMesh: s.render?.blenderEnvironment?.meshCount,
    boundWindows: s.render?.blenderEnvironment?.semanticWindows, errors: null,
  };
});
console.log('AFTER DEPLOY:', JSON.stringify(post, null, 1));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 6), null, 1));
await browser.close();
