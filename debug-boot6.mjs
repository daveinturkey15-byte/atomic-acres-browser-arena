import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2&release=latest', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const status = document.querySelector('#network-status');
  const solo = document.querySelector('#solo');
  const debugApi = window.__ATOMIC_ACRES_DEBUG__;
  return status?.dataset.kind === 'ok' && solo?.disabled === false && !!debugApi?.snapshot();
}, undefined, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const s = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
console.log(JSON.stringify({
  arenaId: s.selectedArena?.id,
  art: s.originalArtLoaded,
  weapon: s.weaponReady,
  details: s.weaponPresentation?.detailsReady,
  menu: s.menuVisible,
  story: s.arenaStoryReady,
  matchPhase: s.matchPhase,
  qualityStreaming: s.qualityAssetStreaming,
  bootstrap: s.bootstrapStage,
}, null, 1));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 5), null, 1));
// Now try startSolo and watch admission state
const result = await page.evaluate(() => {
  const dbg = window.__ATOMIC_ACRES_DEBUG__;
  try { dbg.startSolo(); return 'started'; } catch (e) { return 'throw: ' + e.message; }
});
console.log('startSolo:', result);
await page.waitForTimeout(4000);
const a = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.admissionState());
console.log('admission after 4s:', JSON.stringify(a, null, 1));
console.log('ERRORS2:', JSON.stringify(errors.slice(0, 8), null, 1));
await browser.close();
