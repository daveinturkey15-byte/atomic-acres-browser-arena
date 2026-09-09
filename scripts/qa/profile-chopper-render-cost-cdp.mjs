#!/usr/bin/env node
// Pass 79 multiplayer-hardening RENDER-COST run: quantifies what an observing
// peer pays per FRAME while a hostile Chopper Gunner is live and firing at it.
// Reads renderer call/triangle counters, killstreak presentation LOD/batch
// telemetry and rAF deltas in three phases: baseline, chopper-live (orbit,
// not yet firing), chopper-firing (observer is taking autocannon damage).
// Diagnostic only - no gate. JSON on stdout.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41933/');
const PEER_PORT = Number(arg('--peer-port', '9353'));
const CONNECT_TIMEOUT = 120_000;
const SAMPLE_MS = Number(arg('--sample-ms', '8000'));

function peerServerReady() {
  return new Promise((resolveReady) => {
    const probe = httpRequest({ host: '127.0.0.1', port: PEER_PORT, path: '/peerjs/id', timeout: 500 }, (response) => {
      response.resume();
      resolveReady(true);
    });
    probe.on('error', () => resolveReady(false));
    probe.on('timeout', () => { probe.destroy(); resolveReady(false); });
    probe.end();
  });
}

async function ensurePeerServer() {
  if (await peerServerReady()) return null;
  const child = spawn(process.execPath, [
    resolve('node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1',
    '--port', String(PEER_PORT),
    '--path', '/peerjs',
    '--no-allow_discovery',
  ], { cwd: process.cwd(), stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await peerServerReady()) return child;
    if (child.exitCode !== null) throw new Error(`local PeerJS server exited ${child.exitCode}`);
    await new Promise((wait) => setTimeout(wait, 100));
  }
  child.kill();
  throw new Error('local PeerJS server never became ready');
}

const peerProcess = await ensurePeerServer();
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
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

async function openPage(label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errorsSeen = [];
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 160)}`));
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('render', 'quality');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: CONNECT_TIMEOUT });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
  page.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  await page.fill('#player-name', label);
  return page;
}

async function installProbes(page) {
  await page.evaluate(() => {
    if (window.__CHOPPER_FRAME_PROBE__) return;
    const probe = window.__CHOPPER_FRAME_PROBE__ = { samples: [], longTasks: 0, longTaskMaxMs: 0 };
    let last = performance.now();
    const loop = (now) => {
      probe.samples.push(now - last);
      last = now;
      if (probe.samples.length > 30_000) probe.samples.splice(0, 15_000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longTasks += 1;
        probe.longTaskMaxMs = Math.max(probe.longTaskMaxMs, entry.duration);
      }
    }).observe({ entryTypes: ['longtask'] });
  });
}

function summarize(samples, longTasks, longTaskMaxMs) {
  if (samples.length < 10) return { frames: samples.length, error: 'too few frames' };
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q) => Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(2));
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
  return {
    frames: samples.length,
    meanMs: Number(mean.toFixed(2)),
    p50Ms: pick(0.5), p95Ms: pick(0.95), p99Ms: pick(0.99),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    fpsEstimate: Number((1000 / Math.max(0.01, mean)).toFixed(1)),
    longTasks, longTaskMaxMs: Number(longTaskMaxMs.toFixed(1)),
  };
}

async function observe(page, ms) {
  await page.evaluate(() => { window.__CHOPPER_FRAME_PROBE__.samples.length = 0; });
  await page.waitForTimeout(ms);
  const raw = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const details = snapshot.killstreakPresentation?.entityDetails ?? [];
    const chopper = details.find((entry) => String(entry.entityId || '').includes('chopper')) ?? null;
    return {
      samples: [...window.__CHOPPER_FRAME_PROBE__.samples],
      longTasks: window.__CHOPPER_FRAME_PROBE__.longTasks,
      longTaskMaxMs: window.__CHOPPER_FRAME_PROBE__.longTaskMaxMs,
      hp: snapshot.player.hp,
      alive: snapshot.player.alive,
      renderCalls: snapshot.render?.calls ?? null,
      triangles: snapshot.render?.triangles ?? null,
      sceneObjects: snapshot.render?.sceneObjects ?? null,
      shadows: snapshot.render?.shadows ?? null,
      staticBatchesChopper: snapshot.supportVehiclePresentation?.staticBatches?.chopper ?? null,
      chopper: chopper ? {
        entityId: chopper.entityId,
        activeLodIndex: chopper.activeLodIndex,
        stableAirframeMeshCount: chopper.stableAirframeMeshCount,
        drawableStableAirframeMeshCount: chopper.drawableStableAirframeMeshCount,
        visibleMeshCount: chopper.visibleMeshCount,
        drawRejections: chopper.stableAirframeDrawRejections ?? null,
      } : null,
    };
  });
  const summary = summarize(raw.samples, raw.longTasks, raw.longTaskMaxMs);
  console.error(`[render-cost] ${JSON.stringify(summary)} render=${raw.renderCalls} tris=${raw.triangles} lod=${raw.chopper?.activeLodIndex} drawable=${raw.chopper?.drawableStableAirframeMeshCount} hp=${raw.hp}`);
  return raw;
}

async function readRenderOnly(page) {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { renderCalls: snapshot.render?.calls ?? null, triangles: snapshot.render?.triangles ?? null };
  });
}

const host = await openPage('Host QA');
const guest = await openPage('Guest QA');
try {
  console.error(`[render-cost] backends ${host.backend}/${guest.backend}`);
  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.fill('#room-input', roomCode);
  await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  for (const page of [host, guest]) {
    await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
  }
  await host.selectOption('#lobby-mode', 'tdm');
  await host.waitForTimeout(300);
  await host.selectOption('#lobby-arena', 'atomic-acres');
  await host.waitForTimeout(700);
  for (const page of [host, guest]) {
    await page.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
  }
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
  await host.click('#lobby-start');
  for (const page of [host, guest]) {
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
  }
  await guest.waitForTimeout(5_000);

  await installProbes(host);
  await installProbes(guest);

  const guestBaseline = await observe(guest, SAMPLE_MS);
  const hostBaseline = await readRenderOnly(host);
  console.error(`[render-cost] host baseline render=${JSON.stringify(hostBaseline)}`);

  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
  const receipt = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('chopper'));
  console.error(`[render-cost] activation ${JSON.stringify(receipt)}`);
  // Wait for orbit (inbound ~8% of 30 s = 2.4 s) before the live sample so we
  // separate steady-state presence from first-sight compile.
  await host.waitForFunction(() => {
    const details = window.__ATOMIC_ACRES_DEBUG__?.snapshot().killstreakPresentation?.entityDetails ?? [];
    return details.some((entry) => entry.visible && String(entry.entityId || '').includes('chopper'));
  }, undefined, { timeout: 30_000 });
  await host.waitForTimeout(6_000);

  const guestLive = await observe(guest, SAMPLE_MS);
  const hostLive = await readRenderOnly(host);

  // Drive the guest into the open until the AI gunner damages them.
  let fired = false;
  for (let burst = 0; burst < 4 && !fired; burst += 1) {
    await guest.click('body');
    await guest.keyboard.down('KeyW');
    await guest.waitForTimeout(1_400);
    await guest.keyboard.up('KeyW');
    await guest.waitForTimeout(500);
    const hp = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.hp);
    if (hp < 100) fired = true;
  }
  console.error(`[render-cost] firedProof=${fired}`);
  const guestFiring = await observe(guest, SAMPLE_MS);

  console.log(JSON.stringify({
    verdict: fired ? 'FIRED' : 'NO-FIRE-EVIDENCE',
    backend: [host.backend, guest.backend],
    guestBaseline, guestLive, guestFiring,
    hostBaseline, hostLive,
    errors: [...host.errorsSeen.slice(0, 3), ...guest.errorsSeen.slice(0, 3)],
  }, null, 2));
} finally {
  await host.close().catch(() => {});
  await guest.close().catch(() => {});
  await browser.close().catch(() => {});
  peerProcess?.kill();
}
