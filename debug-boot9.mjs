import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type().toUpperCase() + ': ' + m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2&release=latest', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const status = document.querySelector('#network-status');
  const solo = document.querySelector('#solo');
  const debugApi = window.__ATOMIC_ACRES_DEBUG__;
  return status?.dataset.kind === 'ok' && solo?.disabled === false && !!debugApi?.snapshot();
}, undefined, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
const s = await page.evaluate(() => {
  const d = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return {
    art: d.originalArtLoaded, story: d.arenaStoryReady, menu: d.menuVisible,
    streaming: d.qualityAssetStreaming, bootstrap: d.bootstrapStage,
    arenaId: d.selectedArena?.id, arenaTransitionPhase: d.arenaTransitionPhase,
    render: d.render, weaponCatalog: d.weaponCatalogReadiness,
  };
});
console.log(JSON.stringify(s, null, 1));
console.log('MSG:', JSON.stringify(errors.slice(0, 10), null, 1));
await browser.close();
