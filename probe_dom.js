const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  
  // Wait for the game to load
  await page.waitForTimeout(5000);
  
  // Click kit tab
  const kitTab = page.locator('[data-menu-tab="kit"]');
  if (await kitTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await kitTab.click();
    await page.waitForTimeout(1000);
  }
  
  // Dump loadout elements
  const html = await page.evaluate(() => {
    const kitPanel = document.querySelector('[data-menu-tab-panel="kit"]') || document.querySelector('#loadout-manager')?.parentElement;
    if (!kitPanel) return 'NO_KIT_PANEL';
    return kitPanel.innerHTML.substring(0, 5000);
  });
  console.log('=== KIT PANEL DOM ===');
  console.log(html);
  
  // Also check for loadout-manage presence
  const hasManage = await page.evaluate(() => !!document.querySelector('#loadout-manage'));
  const hasKitIds = await page.evaluate(() => document.querySelectorAll('[data-kit-id]').length);
  const hasCustomPresets = await page.evaluate(() => document.querySelectorAll('[data-custom-preset-id]').length);
  console.log('\n#loadout-manage:', hasManage);
  console.log('[data-kit-id] count:', hasKitIds);
  console.log('[data-custom-preset-id] count:', hasCustomPresets);
  
  // Check deployment transition
  const transHTML = await page.evaluate(() => {
    const t = document.querySelector('#deployment-transition');
    return t ? { hidden: t.hidden, ariaHidden: t.getAttribute('aria-hidden'), dataLiveRender: t.getAttribute('data-live-render'),
      dataMedia: t.getAttribute('data-media'), innerTrim: t.innerHTML.substring(0, 1000) } : 'NOT_FOUND';
  });
  console.log('\n=== DEPLOYMENT TRANSITION ===');
  console.log(JSON.stringify(transHTML, null, 2));
  
  // Check countdown
  const cd = await page.evaluate(() => {
    const c = document.querySelector('#countdown');
    return c ? { hidden: c.hidden, cue: c.dataset?.cue, tagName: c.tagName } : 'NOT_FOUND';
  });
  console.log('\n=== COUNTDOWN ===');
  console.log(JSON.stringify(cd, null, 2));
  
  await browser.close();
})();
