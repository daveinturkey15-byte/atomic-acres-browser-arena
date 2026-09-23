import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const out = { consoleErrors: [], pageErrors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => out.pageErrors.push(String(e).slice(0, 200)));
  const t0 = Date.now();
  await page.goto('http://127.0.0.1:4201/?renderer=webgl2&render=compat&seed=diag-bundled', { waitUntil: 'domcontentloaded' });
  out.domcontentloadedMs = Date.now() - t0;
  try {
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 45000 });
    out.debugReadyMs = Date.now() - t0;
  } catch (e) { out.debugReady = false; }
  try {
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 45000 });
    out.weaponReadyMs = Date.now() - t0;
    out.weaponReady = true;
  } catch (e) { out.weaponReady = false; out.weaponError = String(e).split('\n')[0]; }
  out.webgl = await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); return gl ? `webgl2-ok:${gl.getParameter(gl.RENDERER)}` : 'no-webgl2'; }).catch((e) => `eval-fail:${String(e).slice(0,80)}`);
} finally { await browser.close(); }
console.log(JSON.stringify(out, null, 2));
