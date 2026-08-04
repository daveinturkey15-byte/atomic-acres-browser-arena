import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2');
await page.waitForSelector('#menu', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
console.log(JSON.stringify({
  originalArtLoaded: state.originalArtLoaded,
  weaponReady: state.weaponReady,
  detailsReady: state.weaponPresentation?.detailsReady,
  menuVisible: state.menuVisible,
  arenaStoryReady: state.arenaStoryReady,
  matchPhase: state.matchPhase,
  arena: state.selectedArena?.id,
  errors: errors.slice(0, 8),
}, null, 1));
await browser.close();
