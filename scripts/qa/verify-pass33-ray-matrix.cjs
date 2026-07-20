const { chromium } = require('playwright');

const base = process.env.BASE_URL || 'http://127.0.0.1:4173';
const viewports = [
  { width: 960, height: 540 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
const weapons = ['carbine', 'smg', 'scattergun', 'sniper', 'pistol', 'machine-pistol'];
const results = [];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${base}/?render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=${viewport.width}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__ && !document.querySelector('#solo').disabled, undefined, { timeout: 60_000 });
      await page.fill('#player-name', `RAY ${viewport.width}`);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 30_000 });
      const reticle = await page.evaluate(() => {
        const rect = document.querySelector('#crosshair').getBoundingClientRect();
        return [rect.left + rect.width / 2 - innerWidth / 2, rect.top + rect.height / 2 - innerHeight / 2];
      });
      if (Math.hypot(...reticle) > 0.01) throw new Error(`${viewport.width}x${viewport.height}: reticle is off-centre`);
      for (const weapon of weapons) {
        await page.evaluate((id) => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          api.setAds(false);
          api.setMovement(false);
          api.equipWeapon(id);
          api.setAds(true);
        }, weapon);
        await page.waitForFunction(() => {
          const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return state.weaponPresentation.adsProgress > 0.98 && state.weaponPresentation.sightOffset
            && Math.hypot(...state.weaponPresentation.sightOffset) < 0.006;
        }, undefined, { timeout: 30_000 });
        await page.evaluate(() => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          api.setMovement(true);
          api.fireOnce();
        });
        await page.waitForTimeout(90);
        const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
        if (!state.lastPrincipalShotAlignment || state.lastPrincipalShotAlignment.weapon !== weapon) throw new Error(`${viewport.width}x${viewport.height}/${weapon}: no principal-shot telemetry`);
        if (state.lastPrincipalShotAlignment.angularError > 1e-7 || Math.hypot(...state.lastPrincipalShotAlignment.sample) > 1e-9) throw new Error(`${viewport.width}x${viewport.height}/${weapon}: principal shot left centre ray`);
        if (!state.weaponPresentation.sightOffset || Math.hypot(...state.weaponPresentation.sightOffset) >= 0.012) throw new Error(`${viewport.width}x${viewport.height}/${weapon}: physical sight left centre ray`);
        if (state.aimAlignment.errorCssPixels >= 0.01) throw new Error(`${viewport.width}x${viewport.height}/${weapon}: HUD ray mismatch`);
        results.push({
          viewport: `${viewport.width}x${viewport.height}`,
          weapon,
          angularError: state.lastPrincipalShotAlignment.angularError,
          sightOffset: Math.hypot(...state.weaponPresentation.sightOffset),
          hudErrorCssPixels: state.aimAlignment.errorCssPixels,
        });
        await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
      }
      if (errors.length) throw new Error(`${viewport.width}x${viewport.height}: browser errors ${JSON.stringify(errors)}`);
      await page.close();
    }
    if (results.length !== 18) throw new Error(`Expected 18 combinations, got ${results.length}`);
    console.log(JSON.stringify({ combinations: results.length, results }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
