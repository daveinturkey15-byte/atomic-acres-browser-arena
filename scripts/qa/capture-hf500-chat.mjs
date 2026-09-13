#!/usr/bin/env node
// HF-500: one short, installed-Chrome native-WebGPU capture of the in-match
// chat lane. Deliberately keeps Chrome's stock launch flags; mute-audio is the
// only browser argument permitted on the owner's desktop.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:4196';
const out = resolve(process.cwd(), 'docs/evidence/pass94/hud-chat');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome', args: [...SILENT_ARGS] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

try {
  await page.goto(`${base}/?release=latest&renderer=webgpu&render=quality&seed=hf500-chat&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('nuketown2'); });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.waitForTimeout(1_000);

  const measurement = await page.evaluate(() => {
    const chat = document.querySelector('#text-chat');
    if (!(chat instanceof HTMLElement)) throw new Error('HF-500 chat surface missing');
    chat.dataset.open = 'false';
    chat.dataset.visible = 'true';
    chat.dataset.context = 'game';
    chat.hidden = false;
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement || element instanceof HTMLCanvasElement)) throw new Error(`Missing ${selector}`);
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height, pointerEvents: style.pointerEvents };
    };
    return {
      backend: document.documentElement.dataset.renderBackend ?? null,
      chat: rect('#text-chat'),
      ammo: rect('#weapon-block'),
      minimap: rect('.hud-map-console'),
      crosshair: rect('#crosshair'),
      chatOpen: chat.dataset.open,
      chatVisible: chat.dataset.visible,
      chatDisplay: getComputedStyle(chat).display,
      errors: [],
    };
  });
  measurement.errors = [...new Set(errors)];
  writeFileSync(resolve(out, 'measurement.json'), `${JSON.stringify(measurement, null, 2)}\n`);
  await page.screenshot({ path: resolve(out, 'hud-chat-1440p.png'), animations: 'disabled' });
  if (measurement.backend !== 'webgpu') throw new Error(`Expected native WebGPU, got ${measurement.backend}`);
  if (measurement.chat.pointerEvents !== 'none' || measurement.chatOpen !== 'false') throw new Error('Closed game chat was not pointer-inert and collapsed');
  if (measurement.errors.length > 0) throw new Error(`Browser errors: ${measurement.errors.join(' | ')}`);
  console.log(JSON.stringify(measurement, null, 2));
} finally {
  await browser.close();
}
