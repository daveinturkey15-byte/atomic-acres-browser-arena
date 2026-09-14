/* Probe the ADS crosshair DOM state live in the owned preview. */
const { chromium } = require('playwright');
const { execSync } = require('child_process');

(async () => {
  // Start the owned preview server (same as the qa runner).
  // Free the port first: stale probe servers keep squatting on it.
  const { execFileSync } = require('child_process');
  try {
    execFileSync('powershell', ['-Command', "Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"], { stdio: 'ignore', timeout: 15000 });
  } catch { }
  await new Promise((r) => setTimeout(r, 800));
  const { spawn } = require('child_process');
  const server = spawn('node', ['scripts/qa/playwright-web-server.mjs'], { stdio: 'ignore', detached: true });
  const http = require('http');
  let ready = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:4173/', (res) => { res.resume(); resolve(); });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      ready = true;
      break;
    } catch { /* keep polling */ }
  }
  if (!ready) throw new Error('preview server never became ready');
  const browser = await chromium.launch({
    channel: process.env.QA_EDGE_CHANNEL || 'msedge',
    headless: true,
    args: ['--mute-audio', '--enable-unsafe-swiftshader', '--enable-webgpu-developer-features', '--disable-gpu-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('request', (r) => { if (r.url().includes('/assets/')) console.log('REQ:', r.method(), r.url().slice(21)); });
    page.on('response', (r) => { if (r.url().includes('/assets/')) console.log('RES:', r.status(), r.url().slice(21)); });
    page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text().slice(0, 160), '|', m.location().url.slice(0, 120)); });
    page.on('pageerror', (e) => console.log('PAGE THREW:', String(e).slice(0, 300)));
    await page.goto('http://localhost:4173/channels/the-big-one/?qa=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for the game module + debug API to be live.
    let debugReady = false;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(1000);
      debugReady = await page.evaluate(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.snapshot));
      if (debugReady) break;
    }
    console.log('debugReady:', debugReady);
    if (!debugReady) {
      const errs = await page.evaluate(() => window.__LAST_PAGE_ERROR__ || 'none');
      console.log('last page error:', errs);
      return;
    }
    const state = await page.evaluate(() => {
      const d = window.__ATOMIC_ACRES_DEBUG__;
      d.startSolo();
      const snap = d.snapshot();
      d.equipWeapon('carbine');
      d.setAds(true);
      return { weapon: snap.player.weapon, phase: snap.matchPhase };
    });
    console.log('state:', JSON.stringify(state));
    // Wait for the game HUD to actually deploy.
    let deployed = false;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(1000);
      deployed = await page.evaluate(() => {
        const hud = document.querySelector('#hud');
        return Boolean(hud && getComputedStyle(hud).display !== 'none');
      });
      if (deployed) break;
    }
    console.log('deployed:', deployed);
    await page.waitForTimeout(1500);
    const probe = await page.evaluate(() => {
      const el = document.querySelector('#crosshair');
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const after = getComputedStyle(el, '::after');
      const rect = el.getBoundingClientRect();
      const snap = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        found: true,
        hidden: el.hidden,
        className: el.className,
        adsHeld: snap.weaponPresentation?.adsHeld ?? snap.adsHeld ?? null,
        debugAdsOverride: snap.debugAdsOverride ?? null,
        railgunAdsResetRequired: snap.railgunAdsResetRequired ?? null,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        before: { content: before.content, display: before.display, visibility: before.visibility, border: before.borderTopWidth, size: before.width, color: before.borderTopColor, opacity: before.opacity },
        after: { display: after.display, visibility: after.visibility, size: after.width, color: after.backgroundColor, opacity: after.opacity },
        styleAttr: el.getAttribute('style') || '',
      };
    });
    console.log('crosshair:', JSON.stringify(probe, null, 1));
    // Mirror the e2e isolated-reticle CSS to reproduce the black capture.
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.id = 'probe-isolated';
      style.textContent = `
        html, body, #hud { background: #02080b !important; }
        body > :not(#hud), canvas, #hud > * { visibility: hidden !important; }
        #hud, html body #crosshair, #sniper-scope:not([hidden]), #dmr-thermal:not([hidden]), #railgun-thermal:not([hidden]),
        #crosshair::before, #crosshair::after, #sniper-scope *, #dmr-thermal *, #railgun-thermal * {
          visibility: visible !important;
        }
        #crosshair { display: block !important; }
        #hud::before, #hud::after { display: none !important; }
      `;
      document.head.append(style);
    });
    await page.waitForTimeout(500);
    const isolated = await page.screenshot({ path: '/tmp/ads-isolated.png', clip: { x: 640 - 160, y: 360 - 160, width: 320, height: 320 } });
    console.log('isolated screenshot bytes:', isolated.length);
    const postInjection = await page.evaluate(() => {
      const el = document.querySelector('#crosshair');
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      const before = getComputedStyle(el, '::before');
      const after = getComputedStyle(el, '::after');
      const rect = el.getBoundingClientRect();
      return {
        found: true,
        hidden: el.hidden,
        hasHiddenAttr: el.hasAttribute('hidden'),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        left: cs.left,
        top: cs.top,
        zIndex: cs.zIndex,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        before: { content: before.content, display: before.display, visibility: before.visibility, opacity: before.opacity },
        after: { content: after.content, display: after.display, visibility: after.visibility, opacity: after.opacity },
      };
    });
    console.log('post-injection:', JSON.stringify(postInjection, null, 1));
    // Try forcing hidden=false to prove the marker itself renders.
    const forced = await page.evaluate(() => {
      const el = document.querySelector('#crosshair');
      el.hidden = false;
      const rect = el.getBoundingClientRect();
      const before = getComputedStyle(el, '::before');
      const after = getComputedStyle(el, '::after');
      const bRect = before.getBoundingClientRect?.();
      return {
        hidden: el.hidden,
        display: getComputedStyle(el).display,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        beforePos: before.position,
        beforeLeft: before.left,
        beforeTop: before.top,
        beforeSize: before.width + 'x' + before.height,
      };
    });
    console.log('forced hidden=false:', JSON.stringify(forced));
    await page.waitForTimeout(300);
    const forcedShot = await page.screenshot({ path: '/tmp/ads-forced.png', clip: { x: 640 - 160, y: 360 - 160, width: 320, height: 320 } });
    console.log('forced screenshot bytes:', forcedShot.length);
    const img = await page.screenshot({ path: '/tmp/ads-probe.png', clip: { x: 640 - 160, y: 360 - 160, width: 320, height: 320 } });
    console.log('screenshot bytes:', img.length);
    const full = await page.screenshot({ path: '/tmp/ads-probe-full.png' });
    console.log('full screenshot bytes:', full.length);
  } finally {
    await browser.close();
    try { process.kill(-server.pid); } catch { }
  }
})().catch((e) => { console.error('PROBE FAILED:', e.message); process.exit(1); });
