#!/usr/bin/env node
// Day-4 perf-soak diagnostic: cold boot timing + console-error scan.
// Installed Chrome headless, WebGPU pattern (repo WebGPU flags).
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4201/';
const QUERY = process.argv[3] ?? 'renderer=webgpu';
const TIMEOUT = Number(process.argv[4] ?? '120000');

const candidates = [
  process.env.PASS65_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = candidates.find((c) => existsSync(c));
if (!executablePath) throw new Error('installed Chrome not found');

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-frame-rate-limit', '--disable-gpu-vsync', '--enable-precise-memory-info',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'],
});
const out = { base: BASE, query: QUERY, executablePath, t: {}, consoleErrors: [], pageErrors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => out.pageErrors.push(String(e).slice(0, 300)));
  const t0 = Date.now();
  const url = new URL(BASE);
  for (const [k, v] of new URLSearchParams(QUERY)) url.searchParams.set(k, v);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  out.t.domcontentloadedMs = Date.now() - t0;
  try {
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: TIMEOUT });
    out.t.debugReadyMs = Date.now() - t0;
  } catch (e) { out.debugReady = false; out.debugError = String(e).split('\n')[0]; }
  try {
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: Math.max(10000, TIMEOUT - (Date.now() - t0)) });
    out.t.weaponReadyMs = Date.now() - t0;
    out.weaponReady = true;
  } catch (e) { out.weaponReady = false; out.weaponError = String(e).split('\n')[0]; }
  try {
    out.webgpu = await page.evaluate(async () => {
      if (!navigator.gpu) return 'no-navigator-gpu';
      try { const a = await navigator.gpu.requestAdapter(); if (!a) return 'no-adapter'; const d = await a.requestDevice(); return d ? 'device-ok' : 'no-device'; }
      catch (e) { return `fail:${String(e).slice(0, 100)}`; }
    });
  } catch (e) { out.webgpu = `eval-fail:${String(e).slice(0, 100)}`; }
  out.title = await page.title().catch(() => null);
  await page.screenshot({ path: process.argv[5] ?? 'C:/Users/david/Desktop/stuff/aa-omp-newworld-prime-live/artifacts/qa/perf-soak-20260923/diag-boot.png' }).catch(() => {});
} finally {
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));
