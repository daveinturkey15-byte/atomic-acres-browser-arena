#!/usr/bin/env node
// Headless installed-Chrome WebGPU boot measurement for the farcrysis
// elevation lane. Copied from scripts/qa/verify-arena-boot-cdp.mjs and changed:
//   - headless:true (channel:'chrome' still gets real hardware WebGPU here;
//     measured 2026-08-25, see GAUNTLET-SPEC failure mode 2 table)
//   - captures PNG frames after boot for human reading
//   - reports arenaTransitionPhase timings from the snapshot if present
// Usage: node scripts/qa/verify-elev-boot-headless.mjs [--url ...] [--arenas farcrysis] [--shots 3]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910');
const RENDERER = arg('--renderer', 'webgpu');
const PER_ARENA_MS = Number(arg('--per-arena', '150000'));
const SHOTS = Number(arg('--shots', '3'));
const ARENAS = arg('--arenas', 'farcrysis').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = arg('--out', 'artifacts/elev-boot');

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
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

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

// Secure context: navigate to 127.0.0.1 BEFORE probing navigator.gpu.
const url = `${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=elevboot&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const deviceProbe = await page.evaluate(async () => {
  if (!navigator.gpu) return { gpu: false };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { gpu: true, adapter: false };
  const device = await adapter.requestDevice().catch(() => null);
  return { gpu: true, adapter: true, device: Boolean(device), vendor: adapter.info?.vendor ?? null };
});
console.error(`[elev-boot] device probe: ${JSON.stringify(deviceProbe)}`);

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[elev-boot] backend=${backend} renderer=${RENDERER}`);

for (const arena of ARENAS) {
  errors.length = 0;
  const startedAt = Date.now();
  const record = { arena, ok: false, ms: 0 };
  try {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    const commitMs = Date.now() - startedAt;
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: PER_ARENA_MS });
    record.ok = true;
    record.ms = Date.now() - startedAt;
    record.commitMs = commitMs;
    // Let the first frames settle before capturing.
    await page.waitForTimeout(4000);
    record.snapshot = await page.evaluate(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        matchPhase: s.matchPhase,
        graphics: s.settings?.graphics ?? null,
        renderer: document.documentElement.dataset.renderBackend ?? null,
      };
    }).catch(() => null);
    for (let i = 0; i < SHOTS; i += 1) {
      // Small yaw sweep so successive frames show different sightlines.
      await page.mouse.move(640 + i * 40, 360);
      await page.mouse.down(); await page.mouse.move(640 + i * 40 - 220, 350, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(1200);
      const shot = `${OUT}/${arena}-t${Date.now()}-${i}.png`;
      await page.screenshot({ path: shot });
      record.frames = record.frames || [];
      record.frames.push(shot);
    }
  } catch (error) {
    record.error = String(error).slice(0, 200);
    record.ms = Date.now() - startedAt;
    record.diagnostics = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        bootstrapStage: snapshot.bootstrap?.stage ?? null,
        matchPhase: snapshot.matchPhase ?? null,
        status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 140),
      };
    }).catch(() => null);
  }
  console.log(JSON.stringify(record, null, 2));
}

if (errors.length) console.error(`[elev-boot] console/page errors:\n${errors.join('\n')}`);
await browser.close();
