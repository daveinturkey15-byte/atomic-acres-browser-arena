// Repeated cold live sessions: does the async-recompile retry keep WebGPU?
import { chromium } from 'playwright';
const runs = [];
for (let run = 0; run < 3; run += 1) {
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await page.goto('https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass81/?release=latest&coldrun=' + run, { waitUntil: 'domcontentloaded', timeout: 120000 });
    for (let i = 0; i < 200; i += 1) {
      const ok = await page.evaluate(() => Boolean(window.__ATOMIC_ACRES_DEBUG__)).catch(() => false);
      if (ok) break;
      await page.waitForTimeout(1000);
    }
    await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    let outcome = 'timeout';
    for (let i = 0; i < 300; i += 1) {
      const st = await page.evaluate(() => {
        const d = window.__ATOMIC_ACRES_DEBUG__;
        const s = d ? d.snapshot() : null;
        return {
          url: location.search,
          phase: s?.matchPhase ?? 'no-debug',
          started: s?.gameStarted === true,
          backend: document.documentElement.dataset.renderBackend,
          sweeps: sessionStorage.getItem('atomic-acres:tint-admission-sweeps') ?? '0',
        };
      }).catch(() => null);
      if (st && st.phase === 'active' && st.started) { outcome = `ACTIVE backend=${st.backend} sweeps=${st.sweeps}`; break; }
      if (st && st.url.includes('renderer=webgl2')) {
        // wait for redeploy completion on the fallback side
        for (let j = 0; j < 200; j += 1) {
          const st2 = await page.evaluate(() => {
            const d = window.__ATOMIC_ACRES_DEBUG__;
            const s = d ? d.snapshot() : null;
            return { phase: s?.matchPhase ?? 'no-debug', started: s?.gameStarted === true, sweeps: sessionStorage.getItem('atomic-acres:tint-admission-sweeps') ?? '0' };
          }).catch(() => null);
          if (st2 && st2.phase === 'active' && st2.started) { outcome = `FELL-BACK-webgl2-active sweeps=${st2.sweeps}`; break; }
          await page.waitForTimeout(1000);
        }
        if (outcome === 'timeout') outcome = 'fell-back-no-match';
        break;
      }
      await page.waitForTimeout(1000);
    }
    runs.push(outcome);
    console.log(`run ${run}: ${outcome}`);
  } catch (error) {
    runs.push('error');
    console.log(`run ${run} error:`, String(error).split('\n')[0]);
  }
  await browser.close();
}
console.log('SUMMARY:', JSON.stringify(runs));
