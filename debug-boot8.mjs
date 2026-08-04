import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 250)); });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2&release=latest', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const status = document.querySelector('#network-status');
  const solo = document.querySelector('#solo');
  const debugApi = window.__ATOMIC_ACRES_DEBUG__;
  return status?.dataset.kind === 'ok' && solo?.disabled === false && !!debugApi?.snapshot();
}, undefined, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const s0 = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return { art: s.originalArtLoaded, story: s.arenaStoryReady, menu: s.menuVisible, phase: s.matchPhase, bootstrap: s.bootstrapStage };
});
console.log('MENU:', JSON.stringify(s0));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
// Watch the stall for up to 30s
for (const wait of [5000, 10000, 15000, 15000]) {
  await page.waitForTimeout(wait);
  const a = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.admissionState());
  console.log('T+' + wait + 'ms:', JSON.stringify({ stage: a.bootstrapStage, started: a.gameStarted, phase: a.matchPhase, arenaPhase: a.arenaTransitionPhase, presented: a.presentedGameplayFrame }));
  if (a.gameStarted) break;
}
console.log('ERRORS:', JSON.stringify(errors.slice(0, 6), null, 1));
await browser.close();
