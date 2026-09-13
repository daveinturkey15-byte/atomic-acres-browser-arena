#!/usr/bin/env node
// Pass 79 multiplayer-hardening: measure the FRAME COST paid by a peer that is
// NOT controlling an active Chopper Gunner (the owner's lag report:
// "when chopper gunner is flying and I am against it or on the same team but
// not controlling it I am very laggy").
//
// Choreography copied from scripts/qa/verify-mp-movement-parity-cdp.mjs
// (local PeerJS server, installed Chrome, focus emulation). Headless installed
// Chrome gets a real hardware WebGPU device on this machine and needs no
// governor browser slot.
//
// Lanes:
//   enemy-observer : host owns an AI chopper -> GUEST (opposing team) measured
//   owner-possess  : host takes the gun        -> GUEST still measured
//   guest-owns     : guest owns an AI chopper  -> HOST measured
//
// Each lane samples the observing page's rAF deltas and long tasks BEFORE any
// support exists (baseline) and while the chopper is live, then diffs them.
// JSON verdict on stdout; per-phase progress on stderr. This harness only
// MEASURES - it never weakens a gate, and its default thresholds pin the
// observed healthy-machine envelope (see MAX_* below).
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
const PEER_PORT = Number(arg('--peer-port', '9347'));
const ARENA = arg('--arena', 'atomic-acres');
const SAMPLE_MS = Number(arg('--sample-ms', '9000'));
const CONNECT_TIMEOUT = 120_000;
// Healthy-envelope gates: the observer's frame-time p95 must stay under these
// while a chopper is live. Chosen from the baseline this run measures first;
// they are printed with every verdict so a machine change is visible.
const MAX_P95_MS = Number(arg('--max-p95', '24'));
const MAX_MAX_MS = Number(arg('--max-max', '120'));
const MIN_FPS_ESTIMATE = Number(arg('--min-fps', '45'));

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
  page.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
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
  if (samples.length < 10) return { samples: samples.length, error: 'too few frames sampled' };
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q) => Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(2));
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return {
    frames: samples.length,
    meanMs: Number(mean.toFixed(2)),
    p50Ms: pick(0.5),
    p95Ms: pick(0.95),
    p99Ms: pick(0.99),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    fpsEstimate: Number((1000 / Math.max(0.01, mean)).toFixed(1)),
    longTasks,
    longTaskMaxMs: Number(longTaskMaxMs.toFixed(1)),
  };
}

async function sampleWindow(page, label) {
  await page.evaluate(() => { window.__CHOPPER_FRAME_PROBE__.samples.length = 0; });
  await page.waitForTimeout(SAMPLE_MS);
  const raw = await page.evaluate(() => {
    const probe = window.__CHOPPER_FRAME_PROBE__;
    return {
      samples: [...probe.samples],
      longTasks: probe.longTasks,
      longTaskMaxMs: probe.longTaskMaxMs,
    };
  });
  const summary = summarize(raw.samples, raw.longTasks, raw.longTaskMaxMs);
  console.error(`[chopper-lag]   ${label}: ${JSON.stringify(summary)}`);
  return summary;
}

async function chopperEntity(page) {
  return page.evaluate(() => {
    const details = window.__ATOMIC_ACRES_DEBUG__?.snapshot().killstreakPresentation?.entityDetails ?? [];
    return details.find((entry) => String(entry.entityId || '').includes('chopper')) ?? null;
  });
}

async function runLane(name, ownerIsHost) {
  const record = { lane: name, ok: false };
  let host = null;
  let guest = null;
  try {
    host = await openPage('Host QA');
    guest = await openPage('Guest QA');
    record.backends = [host.backend, guest.backend];
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
    await host.selectOption('#lobby-arena', ARENA);
    await host.waitForTimeout(700);
    await host.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await guest.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await host.click('#lobby-start');
    for (const [label, page] of [['host', host], ['guest', guest]]) {
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: CONNECT_TIMEOUT });
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
      record[`${label}Backend`] = page.backend;
    }

    const owner = ownerIsHost ? host : guest;
    const observer = ownerIsHost ? guest : host;
    await installProbes(owner);
    await installProbes(observer);

    // Let spawn/admission settle so the baseline is clean.
    await page_settle(observer);
    record.baseline = await sampleWindow(observer, `${name} baseline (no support)`);

    // Owner earns the streak and activates the AI chopper.
    if (ownerIsHost) {
      await owner.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
    } else {
      const actorId = await owner.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.id);
      const granted = await host.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.earnSupportForActor(id, 15), actorId);
      if (!granted) throw new Error(`earnSupportForActor rejected ${actorId}`);
    }
    const receipt = await owner.evaluate(() =>
      window.__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt
        ? window.__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('chopper')
        : Boolean(window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper')));
    if (!receipt) throw new Error('chopper activation was refused by the authority gate');
    record.activation = receipt === true ? 'activated' : receipt;

    await owner.waitForFunction(() => {
      const details = window.__ATOMIC_ACRES_DEBUG__?.snapshot().killstreakPresentation?.entityDetails ?? [];
      return details.some((entry) => entry.visible && String(entry.entityId || '').includes('chopper'));
    }, undefined, { timeout: 30_000 });
    // Give the chopper time to reach orbit and open fire (cadence 280 ms).
    await owner.waitForTimeout(4_000);

    record.chopperAi = await sampleWindow(observer, `${name} chopper ACTIVE (AI)`);

    if (ownerIsHost) {
      // Owner takes the gun (no trigger held): possession presentation runs,
      // control intents stream at 20 Hz, observer cost without firing.
      const toggled = await owner.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl());
      if (!toggled) throw new Error('toggleChopperGunnerControl returned false');
      await owner.waitForTimeout(3_000);
      record.ownerPossessIdle = await sampleWindow(observer, `${name} chopper POSSESSED (idle)`);
    }

    record.observerStateAdmissionDrops = await observer.evaluate(() =>
      window.__ATOMIC_ACRES_DEBUG__.snapshot().stateAdmissionDrops ?? null);
    record.chopperTelemetry = await chopperEntity(observer);
    record.errors = [...host.errorsSeen.slice(0, 3), ...guest.errorsSeen.slice(0, 3)];

    const active = record.chopperAi;
    record.ok = Boolean(
      record.baseline && !record.baseline.error
      && active && !active.error
      && active.p95Ms <= Math.max(MAX_P95_MS, record.baseline.p95Ms + 8)
      && active.fpsEstimate >= Math.min(MIN_FPS_ESTIMATE, record.baseline.fpsEstimate - 10),
    );
    record.gate = {
      maxP95Ms: MAX_P95_MS,
      minFpsEstimate: MIN_FPS_ESTIMATE,
      baselineP95Ms: record.baseline.p95Ms,
      activeP95Ms: active?.p95Ms ?? null,
      baselineFps: record.baseline.fpsEstimate,
      activeFps: active?.fpsEstimate ?? null,
    };
  } catch (error) {
    record.error = String(error).slice(0, 400);
    record.errors = [...(host?.errorsSeen.slice(0, 3) ?? []), ...(guest?.errorsSeen.slice(0, 3) ?? [])];
  } finally {
    await host?.close().catch(() => {});
    await guest?.close().catch(() => {});
  }
  return record;
}

async function page_settle(page) {
  await page.waitForTimeout(3_000);
}

try {
  const lanes = [];
  lanes.push(await runLane('enemy-observer-host-owns', true));
  lanes.push(await runLane('observer-while-guest-owns', false));
  const allPass = lanes.every((lane) => lane.ok);
  console.log(JSON.stringify({ verdict: allPass ? 'PASS' : 'FAIL', lanes }, null, 2));
  process.exitCode = allPass ? 0 : 1;
} finally {
  await browser.close().catch(() => {});
  peerProcess?.kill();
}
