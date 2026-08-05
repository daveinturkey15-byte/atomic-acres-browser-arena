const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 60000 }).catch(e => console.log('load err:', e.message));
  await page.waitForTimeout(8000);
  
  const dump = async (label) => {
    const state = await page.evaluate(() => {
      const t = document.querySelector('#deployment-transition');
      const m = document.querySelector('#menu');
      const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return {
        label: arguments[0],
        trans: t ? { hidden: t.hidden, ac: t.getAttribute('data-active'), lr: t.getAttribute('data-live-render'), med: t.getAttribute('data-media'), class: t.className, style: t.getAttribute('style') } : 'NOT_FOUND',
        menu: m ? { hidden: m.hidden, surf: m.getAttribute('data-lifecycle-surface'), aria: m.getAttribute('aria-hidden') } : 'NOT_FOUND',
        phase: snap?.matchPhase,
        surface: snap?.menuLifecycle?.surface,
      };
    }, label);
    console.log(`[${label}]`, JSON.stringify(state));
  };
  
  await dump('initial');
  
  // Click solo
  const solo = page.locator('#solo');
  if (await solo.isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.locator('#player-name').fill('PROBE');
    await solo.click();
    await page.waitForTimeout(2000);
    await dump('after-solo-2s');
    await page.waitForTimeout(5000);
    await dump('after-solo-7s');
  }
  
  await browser.close();
})();
