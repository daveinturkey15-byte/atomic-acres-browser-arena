#!/usr/bin/env node
// Playtest-and-debug recon probe: confirm installed Chrome HEADLESS gets a real
// hardware WebGPU device on this machine, over the shared preview on 41911.
// Gotchas honoured (GAUNTLET-SPEC failure mode 2):
//   - navigator.gpu needs a SECURE CONTEXT -> navigate to 127.0.0.1 first, never about:blank.
//   - An adapter is not a device -> call requestDevice() and check adapter.info.vendor;
//     a Microsoft vendor string means the software rasteriser.

import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41911';

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
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

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probe&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const report = await page.evaluate(async () => {
  const gpu = navigator.gpu;
  if (!gpu) return { secureContext: isSecureContext, gpu: false };
  const adapter = await gpu.requestAdapter();
  if (!adapter) return { secureContext: isSecureContext, gpu: true, adapter: false };
  let vendor = null;
  try { vendor = adapter.info?.vendor ?? null; } catch {}
  let deviceOk = false;
  let deviceError = null;
  try {
    const device = await adapter.requestDevice();
    deviceOk = Boolean(device);
  } catch (error) { deviceError = String(error).slice(0, 200); }
  return {
    secureContext: isSecureContext,
    gpu: true,
    adapter: true,
    vendor,
    deviceOk,
    deviceError,
    renderBackend: document.documentElement.dataset.renderBackend ?? null,
    ua: navigator.userAgent,
  };
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
