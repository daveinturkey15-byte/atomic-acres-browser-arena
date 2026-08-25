import { chromium } from '@playwright/test';
const b = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://127.0.0.1:41917/?release=latest&renderer=webgpu', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
const rows = await page.evaluate(() => {
  const out = [];
  for (const id of ['graphics-weather-intensity','graphics-rain-density','graphics-wind-strength','graphics-lightning','graphics-wet-surfaces','graphics-ambient-life']) {
    const el = document.getElementById(id);
    const label = el?.closest('label');
    out.push({
      id,
      present: Boolean(el),
      tag: el?.tagName ?? null,
      type: el?.getAttribute('type') ?? null,
      min: el?.getAttribute('min') ?? null,
      max: el?.getAttribute('max') ?? null,
      category: el?.closest('[data-graphics-category]')?.getAttribute('data-graphics-category') ?? null,
      label: label?.querySelector('span')?.textContent ?? null,
      description: label?.querySelector('small')?.textContent ?? null,
    });
  }
  return { registryCount: document.querySelector('.advanced-graphics-catalog')?.getAttribute('data-graphics-registry-count') ?? null, rows: out };
});
console.error(JSON.stringify(rows, null, 2));
await b.close();
