import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:41996';
const out = resolve(process.argv[3] ?? 'artifacts/technique-lab/capture');
const ids = (process.argv[4] ?? '2,18,23,38,46').split(',').map(Number);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const shots = [];
try {
  await page.goto(`${base}/map3.html?lab=techniques&source=${ids[0]}`, { waitUntil: 'networkidle' });
  await page.locator('.tl-metrics').waitFor({ timeout: 30000 });
  for (const id of ids) {
    const start = errors.length;
    await page.locator(`button.tl-item[data-source-id="${id}"]`).click();
    await page.waitForTimeout(2500);
    const metrics = await page.locator('.tl-metrics').innerText();
    const detail = await page.locator('.tl-detail').innerText().catch(() => '');
    const visibleErrors = await page.locator('.tl-error').innerText().catch(() => '');
    const path = resolve(out, `source-${String(id).padStart(2, '0')}.png`);
    await page.screenshot({ path });
    const row = { id, metrics, detail, visibleErrors, errors: errors.slice(start), path };
    shots.push(row);
    console.log(JSON.stringify({ id, metrics, visibleErrors, errors: row.errors }));
  }
} finally {
  await writeFile(resolve(out, 'capture.json'), JSON.stringify({ capturedAt: new Date().toISOString(), base, shots, errors }, null, 2));
  await browser.close();
}
if (errors.length || shots.some(s => !s.metrics.includes('WebGPU') || s.visibleErrors)) process.exitCode = 1;
