#!/usr/bin/env node
// Drives installed Chrome on REAL WebGPU against a running server and captures
// the menu + deployment loading screen. Copied from the shape of
// scripts/qa/verify-arena-boot-cdp.mjs (focus emulation, anti-throttle flags).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT = arg('--out', 'C:/Users/david/AppData/Local/Temp/claude/C--Users-david-Desktop-stuff/c72fb822-7456-475d-b1a5-bc43d782eeba/scratchpad/shots-hf382');
const TAG = arg('--tag', 'run');
const ARENA = arg('--arena', 'atomic-acres');
const DEPLOY = argv.includes('--deploy');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
const failedRequests = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
page.on('requestfailed', (r) => failedRequests.push(`${r.url().slice(-90)} :: ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url().slice(-90)}`); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf382&previewTime=0&map=${ARENA}`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.log('[probe] backend =', backend);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/${TAG}-menu.png` });

const probe = await page.evaluate(() => {
  const q = (sel) => document.querySelector(sel);
  const art = q('#menu-backdrop-art');
  const loadArt = q('#deployment-loading-art');
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const appBg = getComputedStyle(document.querySelector('#app')).backgroundColor;
  return {
    appBg,
    backdropArt: art ? {
      tag: art.tagName, src: art.getAttribute('src'),
      naturalWidth: art.naturalWidth ?? null, naturalHeight: art.naturalHeight ?? null,
      complete: art.complete ?? null,
      display: cs(art).display, opacity: cs(art).opacity, zIndex: cs(art).zIndex,
      rect: art.getBoundingClientRect().toJSON(),
    } : null,
    loadingArt: loadArt ? {
      src: loadArt.getAttribute('src'), naturalWidth: loadArt.naturalWidth,
      naturalHeight: loadArt.naturalHeight, complete: loadArt.complete,
      hidden: loadArt.hidden, display: cs(loadArt).display,
      rect: loadArt.getBoundingClientRect().toJSON(),
    } : null,
    deploymentArena: q('#deployment-transition')?.dataset.arena ?? null,
  };
});
console.log('[probe] menu:', JSON.stringify(probe, null, 1));

if (DEPLOY) {
  // Select the arena card, then start solo so the deployment/loading screen paints.
  await page.evaluate((arena) => {
    document.querySelector(`[data-map='${arena}']`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, ARENA);
  await page.waitForTimeout(600);
  const started = await page.evaluate(() => {
    const btn = document.querySelector('#start-solo') ?? document.querySelector('#start')
      ?? [...document.querySelectorAll('button')].find((b) => /solo|deploy/i.test(b.textContent ?? ''));
    if (!btn) return null;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return btn.id || btn.textContent?.trim().slice(0, 40);
  });
  console.log('[probe] pressed:', started);
  for (const ms of [250, 500, 900, 1500, 2500]) {
    await page.waitForTimeout(ms);
    const state = await page.evaluate(() => {
      const dt = document.querySelector('#deployment-transition');
      const la = document.querySelector('#deployment-loading-art');
      return {
        hidden: dt?.hidden, arena: dt?.dataset.arena, media: dt?.dataset.media,
        art: la ? { src: la.getAttribute('src'), nw: la.naturalWidth, nh: la.naturalHeight, hidden: la.hidden, disp: getComputedStyle(la).display, op: getComputedStyle(la).opacity } : null,
      };
    });
    console.log('[probe] deploy state', ms, JSON.stringify(state));
    if (state.hidden === false) await page.screenshot({ path: `${OUT}/${TAG}-deploy-${ms}.png` });
  }
}

console.log('[probe] pageerrors:', errors.slice(0, 10));
console.log('[probe] failed requests:', failedRequests.slice(0, 20));
await browser.close();
