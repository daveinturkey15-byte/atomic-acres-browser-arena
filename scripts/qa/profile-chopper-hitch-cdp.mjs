#!/usr/bin/env node
// Pass 79 multiplayer-hardening HITCH ATTRIBUTION: profiles the observing
// peer across the exact moment an enemy Chopper Gunner activates and appears,
// with per-phase longtask counters (reset each phase), to name the 664 ms
// main-thread stall measured by profile-chopper-render-cost-cdp.mjs.
// Diagnostic only - no gate.
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
const PEER_PORT = Number(arg('--peer-port', '9355'));
const CONNECT_TIMEOUT = 120_000;

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
  page.cdp = session;
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
  await page.fill('#player-name', label);
  return page;
}

async function installProbe(page) {
  await page.evaluate(() => {
    if (window.__HITCH_PROBE__) return;
    const probe = window.__HITCH_PROBE__ = { longTasks: [], maxMs: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longTasks.push(Number(entry.duration.toFixed(1)));
        probe.maxMs = Math.max(probe.maxMs, entry.duration);
      }
    }).observe({ entryTypes: ['longtask'] });
  });
}

async function resetProbe(page) {
  await page.evaluate(() => {
    window.__HITCH_PROBE__.longTasks.length = 0;
    window.__HITCH_PROBE__.maxMs = 0;
  });
}

async function readProbe(page) {
  return page.evaluate(() => ({
    longTasks: [...window.__HITCH_PROBE__.longTasks],
    maxMs: Number(window.__HITCH_PROBE__.maxMs.toFixed(1)),
  }));
}

async function captureProfile(page, ms) {
  await page.cdp.send('Profiler.enable');
  await page.cdp.send('Profiler.start');
  await page.waitForTimeout(ms);
  const { profile } = await page.cdp.send('Profiler.stop');
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  // Attribute SELF time per node, but also build total-time per function name
  // including children of the same url for readable hot-spot ranking.
  const selfHits = new Map();
  for (const id of profile.samples) {
    const node = nodesById.get(id);
    if (!node) continue;
    const fn = node.callFrame;
    const label = `${fn.functionName || '(anonymous)'} @ ${(fn.url || '').split('/').pop()}:${fn.lineNumber + 1}`;
    selfHits.set(label, (selfHits.get(label) ?? 0) + 1);
  }
  const total = profile.samples.length;
  return {
    totalSamples: total,
    topSelfTime: [...selfHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
      .map(([label, hits]) => ({ label, hits, pct: Number(((hits / total) * 100).toFixed(1)) })),
  };
}

const host = await openPage('Host QA');
const guest = await openPage('Guest QA');
try {
  console.error(`[hitch] backends ${host.backend}/${guest.backend}`);
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

  await installProbe(guest);

  // Phase 1: activation -> first visible frame. Profiler covers the whole
  // window so the stall lands inside the captured samples.
  await resetProbe(guest);
  await guest.cdp.send('Profiler.enable');
  await guest.cdp.send('Profiler.start');
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
  const receipt = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('chopper'));
  console.error(`[hitch] activation ${JSON.stringify(receipt)}`);
  await guest.waitForFunction(() => {
    const details = window.__ATOMIC_ACRES_DEBUG__?.snapshot().killstreakPresentation?.entityDetails ?? [];
    return details.some((entry) => entry.visible && String(entry.entityId || '').includes('chopper'));
  }, undefined, { timeout: 30_000 });
  await guest.waitForTimeout(4_000);
  const { profile } = await guest.cdp.send('Profiler.stop');
  const appearLongTasks = await readProbe(guest);
  console.error(`[hitch] appearance longtasks ${JSON.stringify(appearLongTasks)}`);

  // Aggregate profile with a proper tree walk: find nodes whose TOTAL time is
  // large (self + descendants) to catch the single blocking call stack.
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parentOf.set(child, node.id);
  }
  // Compute total sample counts per node id via bottom-up accumulation.
  const selfCount = new Map();
  for (const id of profile.samples) selfCount.set(id, (selfCount.get(id) ?? 0) + 1);
  const totalCount = new Map(selfCount);
  const totalSamples = profile.samples.length;
  const allIds = profile.nodes.map((node) => node.id);
  for (let index = allIds.length - 1; index >= 0; index -= 1) {
    const id = allIds[index];
    const own = totalCount.get(id) ?? 0;
    if (own === 0) continue;
    const parentId = parentOf.get(id);
    if (parentId !== undefined) totalCount.set(parentId, (totalCount.get(parentId) ?? 0) + own);
  }
  const hotTotal = [...totalCount.entries()]
    .filter(([, hits]) => hits / totalSamples > 0.03)
    .sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([id, hits]) => {
      const node = nodesById.get(id);
      const fn = node.callFrame;
      const chain = [];
      let cursor = node.id;
      while (cursor !== undefined && chain.length < 6) {
        const n = nodesById.get(cursor);
        chain.push(`${n.callFrame.functionName || '(anon)'}`);
        cursor = parentOf.get(cursor);
      }
      return {
        pct: Number(((hits / totalSamples) * 100).toFixed(1)),
        hits,
        frame: `${fn.functionName || '(anonymous)'} @ ${(fn.url || '').split('/').pop()}:${fn.lineNumber + 1}`,
        chain: chain.join(' <- '),
      };
    });

  // Phase 2: steady firing window - separate longtask accounting.
  await resetProbe(guest);
  await guest.waitForTimeout(8_000);
  const steadyLongTasks = await readProbe(guest);

  console.log(JSON.stringify({
    verdict: 'MEASURED',
    backend: [host.backend, guest.backend],
    appearanceWindow: appearLongTasks,
    steadyWindow: steadyLongTasks,
    hotTotalTime: hotTotal,
    errors: [...host.errorsSeen.slice(0, 3), ...guest.errorsSeen.slice(0, 3)],
  }, null, 2));
} finally {
  await host.close().catch(() => {});
  await guest.close().catch(() => {});
  await browser.close().catch(() => {});
  peerProcess?.kill();
}
