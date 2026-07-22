import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const maps = ['atomic-acres', 'rustworks-1v1', 'gun-range', 'skyline-terminal'];
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const map of maps) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/?render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&map=${map}&seed=3311`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().frameCount > 24, undefined, { timeout: 60_000 });
    const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    const record = {
      map,
      activeRoots: state.arenaSelection.activeRoots,
      calls: state.render.calls,
      triangles: state.render.triangles,
      contextLost: state.render.contextLifecycle.lost,
      errors,
    };
    if (record.activeRoots.length !== 1 || record.activeRoots[0] !== map) throw new Error(`${map}: active-root mismatch`);
    if (record.calls > 147) throw new Error(`${map}: ${record.calls} calls exceeds 147`);
    if (record.triangles > 158000) throw new Error(`${map}: ${record.triangles} triangles exceeds 158000`);
    if (record.contextLost || record.errors.length) throw new Error(`${map}: browser errors ${JSON.stringify(record.errors)}`);
    results.push(record);
    await page.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
