import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  if (!existsSync('artifacts')) {
    mkdirSync('artifacts', { recursive: true });
  }

  console.log('[probe] Launching installed Chrome headless with WebGPU args...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--mute-audio',
      '--use-angle=d3d11',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  page.on('console', (msg) => console.log(`[browser console ${msg.type()}]:`, msg.text()));
  page.on('pageerror', (err) => console.error('[browser error]:', err));

  console.log('[probe] Navigating to http://localhost:41931/map3.html ...');
  await page.goto('http://localhost:41931/map3.html', { waitUntil: 'domcontentloaded' });

  // Wait for rendering
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1000);
    const hud = await page.evaluate(() => {
      const el = document.getElementById('hud');
      return el ? el.textContent : null;
    });
    console.log(`[probe t+${i + 1}s] HUD:`, hud);
  }

  const result = await page.evaluate(() => {
    const hud = document.getElementById('hud');
    const status = document.getElementById('status');
    const err = document.getElementById('error-overlay');
    return {
      hud: hud ? hud.textContent : null,
      status: status ? status.textContent : null,
      err: err ? err.textContent : null,
      hasMap3: typeof window.__MAP3 !== 'undefined',
    };
  });

  console.log('[probe] Final result:', JSON.stringify(result, null, 2));

  const screenshotPath = resolve('artifacts/map3-settle-webgpu-hud.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`[probe] Screenshot saved to ${screenshotPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error('[probe] Fatal error:', err);
  process.exit(1);
});
