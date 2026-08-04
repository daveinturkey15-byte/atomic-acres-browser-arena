import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
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
  return { story: s.arenaStoryReady, art: s.originalArtLoaded, menu: s.menuVisible };
});
console.log('MENU:', JSON.stringify(s0));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
let final = null;
for (const wait of [4000, 5000, 8000]) {
  await page.waitForTimeout(wait);
  const a = await page.evaluate(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const ad = window.__ATOMIC_ACRES_DEBUG__.admissionState();
    return { started: ad.gameStarted, phase: ad.matchPhase, story: s.arenaStoryReady, art: s.originalArtLoaded, hud: !!document.querySelector('#hud') && !document.querySelector('#hud').hidden };
  });
  console.log('AFTER DEPLOY:', JSON.stringify(a));
  if (a.started) { final = a; break; }
}
console.log('FINAL:', JSON.stringify(final));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 6), null, 1));
await browser.close();
