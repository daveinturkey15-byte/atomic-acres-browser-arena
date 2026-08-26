import { chromium } from '@playwright/test';

const baseUrl = process.env.ATOMIC_ACRES_BASE_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({ headless: true });
const errors = [];
const shaderErrors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Shader Error|WebGLProgram|Atomic Signal/.test(message.text())) shaderErrors.push(message.text());
  });
  await page.goto(`${baseUrl}?render=performance&signal=on&seed=pass26-fps`);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => /^\d{1,3}$/.test(document.querySelector('#fps-counter b')?.textContent ?? '')
    && window.__ATOMIC_ACRES_DEBUG__?.snapshot().render.atomicSignal.samples >= 2, undefined, { timeout: 30_000 });
  const result = await page.evaluate(() => {
    const counter = document.querySelector('#fps-counter');
    const box = counter?.getBoundingClientRect();
    const render = window.__ATOMIC_ACRES_DEBUG__.snapshot().render;
    return {
      text: counter?.querySelector('b')?.textContent ?? null,
      pacing: counter instanceof HTMLElement ? counter.dataset.pacing ?? null : null,
      rightGap: box ? window.innerWidth - box.right : null,
      top: box?.top ?? null,
      framePacing: render.framePacing,
      atomicSignal: render.atomicSignal,
      fpsCounter: render.fpsCounter,
    };
  });
  if (errors.length > 0) throw new Error(`page errors: ${errors.join(' | ')}`);
  if (shaderErrors.length > 0) throw new Error(`shader errors: ${shaderErrors.join(' | ')}`);
  if (result.rightGap === null || result.rightGap > 40 || result.top === null || result.top > 80) {
    throw new Error(`FPS counter is not in the top-right safe area: ${JSON.stringify(result)}`);
  }
  if (result.fpsCounter.anchor !== 'top-right' || !result.atomicSignal.enabled
    || result.atomicSignal.fallbackReason !== null || result.atomicSignal.textureSamples !== 1
    || result.atomicSignal.samples < 2 || result.atomicSignal.passCpuMs > 12
    || result.atomicSignal.averagePassCpuMs > 12) {
    throw new Error(`Atomic Signal Performance path is outside its bounded contract: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify({ ok: true, ...result }));
} finally {
  await browser.close();
}
