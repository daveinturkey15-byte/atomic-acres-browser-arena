// Capture the exact WGSL that Chrome 153's Tint refuses to compile in DEFAULT Chrome.
//
// Every material pipeline fails with "swizzle view instruction still has usages after
// lowering" - a Tint IR lowering error - but only without --enable-unsafe-webgpu, so no
// flagged harness ever sees it. This wraps createShaderModule to remember each module's
// source, arms an error scope around createRenderPipelineAsync, and dumps the first
// failing pipeline's shader source to disk for a human to read.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('--url', 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass81');
const ARENA = arg('--arena', 'atomic-acres');
const OUT = resolve('artifacts/qa/tint-swizzle');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

// Installed before any page script runs, so the wrap catches the real device.
await page.addInitScript(() => {
  window.__WGSL_FAILURES__ = [];
  const wrapDevice = (device) => {
    if (device.__wrapped) return device;
    device.__wrapped = true;
    const createShaderModule = device.createShaderModule.bind(device);
    window.__WGSL_SOURCES__ = window.__WGSL_SOURCES__ ?? new WeakMap();
    device.createShaderModule = (descriptor) => {
      const module = createShaderModule(descriptor);
      // GPUShaderModule rejects expandos in some contexts; WeakMap always works.
      window.__WGSL_SOURCES__.set(module, { code: descriptor.code, label: descriptor.label ?? null });
      return module;
    };
    const createRenderPipeline = device.createRenderPipeline.bind(device);
    device.createRenderPipeline = (descriptor) => {
      // Sync path: validation errors surface via error scope, not exceptions.
      device.pushErrorScope('validation');
      const pipeline = createRenderPipeline(descriptor);
      const sources = window.__WGSL_SOURCES__;
      const vertex = sources?.get(descriptor.vertex?.module)?.code ?? null;
      const fragment = sources?.get(descriptor.fragment?.module)?.code ?? null;
      const label = descriptor.label ?? null;
      device.popErrorScope().then((error) => {
        if (error) {
          window.__WGSL_FAILURES__.push({
            label,
            error: String(error.message ?? error).slice(0, 500),
            vertex,
            fragment,
          });
        }
      });
      return pipeline;
    };
    const createRenderPipelineAsync = device.createRenderPipelineAsync.bind(device);
    device.createRenderPipelineAsync = async (descriptor) => {
      try {
        return await createRenderPipelineAsync(descriptor);
      } catch (error) {
        const sources = window.__WGSL_SOURCES__;
        window.__WGSL_FAILURES__.push({
          label: descriptor.label ?? null,
          error: String(error?.message ?? error).slice(0, 500),
          vertex: sources?.get(descriptor.vertex?.module)?.code ?? null,
          fragment: sources?.get(descriptor.fragment?.module)?.code ?? null,
        });
        throw error;
      }
    };
    return device;
  };
  const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
  navigator.gpu.requestAdapter = async (...args) => {
    const adapter = await requestAdapter(...args);
    if (!adapter) return adapter;
    const requestDevice = adapter.requestDevice.bind(adapter);
    adapter.requestDevice = async (...deviceArgs) => wrapDevice(await requestDevice(...deviceArgs));
    return adapter;
  };
  // Also record the advertised WGSL language features - the flag may change this set,
  // which would explain why Three emits different (working) code under the harness flags.
  window.__WGSL_FEATURES__ = [...(navigator.gpu.wgslLanguageFeatures ?? [])];
});

const PARAMS = arg('--params', 'release=latest');
await page.goto(`${BASE}/?${PARAMS}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#solo:not([disabled])', { timeout: 120_000 });
await page.locator(`.map-card[data-arena-id="${ARENA}"]`).click();
await page.locator('#solo').click();

// Wait until failures accumulate or the match starts.
await page.waitForFunction(() => {
  const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
  return (window.__WGSL_FAILURES__?.length ?? 0) > 0
    || Boolean(snap && snap.matchPhase === 'active');
}, undefined, { timeout: 240_000 }).catch(() => {});
await page.waitForTimeout(4000);

const report = await page.evaluate(() => ({
  features: window.__WGSL_FEATURES__,
  failureCount: window.__WGSL_FAILURES__.length,
  first: window.__WGSL_FAILURES__[0] ?? null,
  labels: window.__WGSL_FAILURES__.slice(0, 12).map((f) => f.label),
}));

console.log('wgslLanguageFeatures:', JSON.stringify(report.features));
console.log('failing pipelines   :', report.failureCount, JSON.stringify(report.labels));
if (report.first) {
  writeFileSync(`${OUT}/error.txt`, report.first.error ?? '');
  writeFileSync(`${OUT}/vertex.wgsl`, report.first.vertex ?? '(no source captured)');
  writeFileSync(`${OUT}/fragment.wgsl`, report.first.fragment ?? '(no source captured)');
  console.log(`captured ${report.first.label} -> ${OUT}/{error.txt,vertex.wgsl,fragment.wgsl}`);
} else {
  console.log('no pipeline failure captured (did it launch?)');
}
await browser.close();
