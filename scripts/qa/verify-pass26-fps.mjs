import { chromium } from '@playwright/test';

const baseUrl = process.env.ATOMIC_ACRES_BASE_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${baseUrl}?render=performance&seed=pass26-fps`);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => /^\d{1,3}$/.test(document.querySelector('#fps-counter b')?.textContent ?? ''), undefined, { timeout: 30_000 });
  const result = await page.evaluate(() => {
    const counter = document.querySelector('#fps-counter');
    const box = counter?.getBoundingClientRect();
    return {
      text: counter?.querySelector('b')?.textContent ?? null,
      pacing: counter instanceof HTMLElement ? counter.dataset.pacing ?? null : null,
      rightGap: box ? window.innerWidth - box.right : null,
      top: box?.top ?? null,
      framePacing: window.__ATOMIC_ACRES_DEBUG__.snapshot().render.framePacing,
    };
  });
  if (errors.length > 0) throw new Error(`page errors: ${errors.join(' | ')}`);
  if (result.rightGap === null || result.rightGap > 40 || result.top === null || result.top > 80) {
    throw new Error(`FPS counter is not in the top-right safe area: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify({ ok: true, ...result }));
} finally {
  await browser.close();
}
