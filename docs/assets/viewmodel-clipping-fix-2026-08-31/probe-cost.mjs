// Cost of the per-frame contact path after the change: the authored fire-gate
// sweep, the measured-envelope sweep, and the fold solve, timed in the page.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--mute-audio','--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const s = await page.context().newCDPSession(page); await s.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(()=>{});
await page.goto('http://127.0.0.1:41988/?release=latest&renderer=webgpu&render=quality&seed=vmclip', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 180000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
await new Promise(r=>setTimeout(r,5000));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(-36.6, 1.7, 23.0, Math.PI/2, 0));
await new Promise(r=>setTimeout(r,1500));
console.log(JSON.stringify(await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.sampleFireAdmissionDiagnostics();
  const N = 2000;
  const t0 = performance.now();
  for (let i = 0; i < N; i += 1) api.sampleFireAdmissionDiagnostics();
  const perCall = (performance.now() - t0) / N;
  const d = api.sampleFireAdmissionDiagnostics();
  return { msPerDiagnosticsCall: +perCall.toFixed(4), dressingBoxCount: d.dressingBoxCount, note: 'one diagnostics call runs a full authored 9-probe sweep plus the pose resolve (authored sweep + measured-envelope sweep + fold solve)' };
})));
await browser.close();
