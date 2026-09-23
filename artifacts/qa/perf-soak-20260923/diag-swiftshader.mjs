import { chromium } from '@playwright/test';
for (const args of [[ '--enable-unsafe-webgpu' ], [ '--enable-unsafe-webgpu', '--use-angle=swiftshader' ]]) {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', ...args] });
  try {
    const page = await browser.newPage();
    const r = await page.evaluate(async () => {
      if (!navigator.gpu) return 'no-navigator-gpu';
      try { const a = await navigator.gpu.requestAdapter(); return a ? `adapter:${a.info?.backend ?? '?'}:${a.info?.device ?? '?'}` : 'no-adapter'; }
      catch (e) { return `fail:${String(e).slice(0, 80)}`; }
    }).catch((e) => `eval-fail:${String(e).slice(0, 80)}`);
    console.log(JSON.stringify(args), '=>', r);
  } finally { await browser.close(); }
}
