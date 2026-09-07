#!/usr/bin/env node
// ===========================================================================
// HF-414 — the measured answer to "does RTX / RAY TRACED only work on NVIDIA
// cards, and what WebGPU features does it need?"
//
// The question can only be answered with the adapter in front of you, so this
// reports, from a real headless WebGPU Chrome on this machine:
//   - the adapter's identity and whether it is a software fallback;
//   - every feature the ADAPTER advertises;
//   - every feature the DEVICE is actually granted (WebGPU grants only what
//     the caller requests, which is why OPTIONAL_WEBGPU_DEVICE_FEATURES is an
//     allowlist and not `[...adapter.features]`);
//   - the limits that bound a large single-pass tracer;
//   - and the direct check: is there ANY ray-tracing surface at all
//     (ray-query, acceleration structures, a vendor extension hook)?
//
// The last one is the important row. If it is ever non-empty, the "no browser
// exposes hardware ray tracing" statement in the profile copy, the docs and
// the RTX explainer has to be re-checked rather than repeated.
//
// HEADLESS ONLY. Usage:
//   node scripts/qa/probe-webgpu-adapter-features.mjs --out artifacts/graphics-audit
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

// The renderer's allowlist, read out of the source rather than imported.
// render-runtime.ts reaches a module graph with extensionless relative imports
// that Node's TypeScript stripping cannot resolve, and pulling three r185 into
// a probe process to read one array would be absurd. Parsing the literal keeps
// the probe honest: if the allowlist moves or is renamed, this throws instead
// of silently reporting a stale list as the current one.
function readOptionalDeviceFeatures() {
  const source = readFileSync('src/rendering/render-runtime.ts', 'utf8');
  const block = source.match(
    /export const OPTIONAL_WEBGPU_DEVICE_FEATURES: readonly string\[\] = Object\.freeze\(\[([\s\S]*?)\]\);/,
  );
  if (!block) {
    throw new Error('OPTIONAL_WEBGPU_DEVICE_FEATURES not found in src/rendering/render-runtime.ts');
  }
  // Strip the per-entry `// Consumer:` comments FIRST. Without this the quote
  // scan picks up apostrophes inside the prose and reports sentence fragments
  // as WebGPU feature names - which the first run of this probe duly did.
  const withoutComments = block[1].replaceAll(/\/\/[^\n]*/g, '');
  const features = [...withoutComments.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
  if (features.length === 0) throw new Error('OPTIONAL_WEBGPU_DEVICE_FEATURES parsed as empty');
  return features;
}
const OPTIONAL_WEBGPU_DEVICE_FEATURES = readOptionalDeviceFeatures();

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const OUT_DIR = arg('--out', 'artifacts/graphics-audit');
const BASE = arg('--url', 'http://localhost:41977');

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS, '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});

let report = null;
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  // WebGPU needs a SECURE CONTEXT. `about:blank` has none, so navigator.gpu
  // is undefined there and the first version of this probe reported
  // "WebGPU unavailable" on a machine with a working RTX 5080. Point it at
  // the served origin (localhost counts as secure) before asking.
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  report = await page.evaluate(async (allowList) => {
    if (!navigator.gpu) return { available: false, reason: 'navigator.gpu is undefined' };
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { available: false, reason: 'requestAdapter returned null' };
    const adapterFeatures = [...adapter.features].sort();
    const info = adapter.info ?? {};
    const granted = allowList.filter((feature) => adapter.features.has(feature));
    const device = await adapter.requestDevice(
      granted.length > 0 ? { requiredFeatures: granted } : undefined,
    );
    const limitKeys = [
      'maxTextureDimension2D', 'maxStorageBufferBindingSize', 'maxBufferSize',
      'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup',
      'maxColorAttachments', 'maxColorAttachmentBytesPerSample',
      'maxSampledTexturesPerShaderStage', 'maxStorageTexturesPerShaderStage',
      'maxUniformBufferBindingSize', 'maxBindGroups',
    ];
    const limits = Object.fromEntries(limitKeys.map((key) => [key, adapter.limits?.[key] ?? null]));
    // The ray-tracing question, asked of the adapter rather than assumed.
    const rayTracingSurface = adapterFeatures.filter((feature) =>
      /ray|accel|bvh|rtx|traversal/i.test(feature));
    return {
      available: true,
      preferredCanvasFormat: navigator.gpu.getPreferredCanvasFormat?.() ?? null,
      wgslLanguageFeatures: [...(navigator.gpu.wgslLanguageFeatures ?? [])].sort(),
      adapterInfo: {
        vendor: info.vendor ?? null,
        architecture: info.architecture ?? null,
        device: info.device ?? null,
        description: info.description ?? null,
      },
      isFallbackAdapter: adapter.isFallbackAdapter === true,
      adapterFeatures,
      appAllowList: allowList,
      appGrantedFeatures: granted,
      deviceFeatures: [...device.features].sort(),
      limits,
      rayTracingSurface,
      neuralInferenceSurface: adapterFeatures.filter((feature) =>
        /subgroup|f16|cooperative|matrix|dot4/i.test(feature)),
    };
  }, OPTIONAL_WEBGPU_DEVICE_FEATURES);
} finally {
  await browser.close();
}

mkdirSync(resolve(process.cwd(), OUT_DIR), { recursive: true });
writeFileSync(resolve(process.cwd(), OUT_DIR, 'webgpu-adapter.json'),
  `${JSON.stringify({ probedAtIso: new Date().toISOString(), ...report }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
