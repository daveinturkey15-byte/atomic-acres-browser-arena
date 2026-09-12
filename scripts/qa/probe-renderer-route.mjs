#!/usr/bin/env node
// Renderer-route probe: what happens when a route is forced.
//
// Boots the app with an explicit ?renderer= and reports how far bootstrap got,
// plus every console error and page error along the way. Exists because a
// forced route that cannot initialise is very different from one that falls
// back, and a screenshot harness that simply times out cannot tell you which
// one you are looking at.
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const RENDERER = arg('--renderer', 'webgpu');
const WAIT_MS = Number(arg('--wait', '25000'));

const browser = await chromium.launch({
  headless: true,
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
});
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));

// 'auto' omits the parameter entirely, which is what a real visitor gets.
const rendererParam = RENDERER === 'auto' ? '' : `renderer=${RENDERER}&`;
await page.goto(`${BASE}/?release=latest&${rendererParam}render=quality&seed=route-probe&previewTime=0`, {
  waitUntil: 'domcontentloaded',
});

await page.waitForTimeout(WAIT_MS);

const state = await page.evaluate(() => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  let bootstrap = null;
  try { bootstrap = debug?.snapshot()?.bootstrap ?? null; } catch (error) { bootstrap = { readError: String(error).slice(0, 200) }; }
  return {
    debugHandlePresent: Boolean(debug),
    renderBackendAttr: document.documentElement.dataset.renderBackend ?? null,
    navigatorGpu: Boolean(navigator.gpu),
    // What the loading screen is telling a real user right now.
    visibleLoadingText: (document.querySelector('#loading, #boot, #bootstrap')?.textContent ?? '').trim().slice(0, 200),
    bootstrap,
  };
});

let adapter = null;
try {
  adapter = await page.evaluate(async () => {
    if (!navigator.gpu) return { available: false };
    const requested = await navigator.gpu.requestAdapter().catch((error) => ({ error: String(error) }));
    if (!requested || requested.error) return { available: true, adapter: null, error: requested?.error ?? 'null adapter' };
    return { available: true, adapter: requested.info?.description ?? requested.info?.vendor ?? 'adapter acquired' };
  });
} catch (error) {
  adapter = { probeError: String(error).slice(0, 200) };
}

console.log(JSON.stringify({
  renderer: RENDERER,
  waitedMs: WAIT_MS,
  ...state,
  adapter,
  consoleErrors: [...new Set(consoleErrors)].slice(0, 10),
  pageErrors: [...new Set(pageErrors)].slice(0, 10),
}, null, 2));

await browser.close();
