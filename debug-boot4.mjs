import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2&release=latest', { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => {
    const status = document.querySelector('#network-status');
    const solo = document.querySelector('#solo');
    const debugApi = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debugApi?.snapshot();
    return status?.dataset.kind === 'ok' && solo?.disabled === false && !!snapshot;
  }, undefined, { timeout: 30000 });
  console.log('PAGE READY OK');
} catch (e) {
  console.log('PAGE READY TIMEOUT');
}
await page.waitForTimeout(1000);
const info = await page.evaluate(() => ({
  url: location.href,
  menuVisible: !!document.querySelector('#menu'),
  hasDebug: typeof window.__ATOMIC_ACRES_DEBUG__?.snapshot === 'function',
  bodyHead: document.body.innerText.slice(0, 200),
}));
console.log(JSON.stringify(info, null, 1));
if (info.hasDebug) {
  const s = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  console.log(JSON.stringify({
    art: s.originalArtLoaded, weapon: s.weaponReady, details: s.weaponPresentation?.detailsReady,
    menu: s.menuVisible, story: s.arenaStoryReady, matchPhase: s.matchPhase,
  }, null, 1));
}
console.log('ERRORS:', JSON.stringify(errors.slice(0, 6), null, 1));
await browser.close();
