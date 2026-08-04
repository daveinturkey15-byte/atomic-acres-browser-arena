import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2');
await page.waitForSelector('#menu', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);
const hasDebug = await page.evaluate(() => typeof window.__ATOMIC_ACRES_DEBUG__?.snapshot === 'function');
console.log('hasDebug:', hasDebug, 'errors:', errors.length ? JSON.stringify(errors.slice(0,5)) : 'none');
if (hasDebug) {
  const s = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  console.log(JSON.stringify({art: s.originalArtLoaded, weapon: s.weaponReady, details: s.weaponPresentation?.detailsReady, menu: s.menuVisible, story: s.arenaStoryReady}, null, 1));
}
await browser.close();
