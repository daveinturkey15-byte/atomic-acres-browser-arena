#!/usr/bin/env node
// Focused probe for the guest-side "Synchronizing <Arena> before ready-up…"
// deadlock seen in verify-pass79-host-guest-fault-matrix (rustworks-1v1 and
// farcrysis lanes): the HOST reaches READY-enabled but the GUEST's
// #lobby-ready never enables because lobbyArenaSynchronized
// (legacy-main.ts:9688) stays false on the guest.
//
// One question per invocation: what does the GUEST's arena transaction do
// after the host selects the target arena — does it start, fail, or never
// start? Samples snapshot().transition every second until the guest's ready
// button enables or the budget expires.
//
//   node scripts/qa/diagnose-guest-lobby-arena-sync.mjs --arena rustworks-1v1
//
// Exit 0 = guest synchronized; 2 = budget expired unsynchronized; 3 = env error.
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41921/');
const PEER_PORT = Number(arg('--peer-port', '9343'));
const TARGET_ARENA = arg('--arena', 'rustworks-1v1');
const TARGET_MODE = arg('--mode', 'tdm');
const WAIT_MS = Number(arg('--wait-ms', '45000'));
const CONNECT_TIMEOUT = 120_000;

function peerServerReady() {
  return new Promise((resolveReady) => {
    const probe = httpRequest({ host: '127.0.0.1', port: PEER_PORT, path: '/peerjs/id', timeout: 500 }, (r) => { r.resume(); resolveReady(true); });
    probe.on('error', () => resolveReady(false));
    probe.on('timeout', () => { probe.destroy(); resolveReady(false); });
    probe.end();
  });
}
async function ensurePeerServer() {
  if (await peerServerReady()) return null;
  const child = spawn(process.execPath, [
    resolve('node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1', '--port', String(PEER_PORT), '--path', '/peerjs', '--no-allow_discovery',
  ], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 100; i += 1) {
    if (await peerServerReady()) return child;
    await new Promise((w) => setTimeout(w, 100));
  }
  child.kill();
  throw new Error('peer server never ready');
}

const peerProcess = await ensurePeerServer();
const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

async function openPage(label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errorsSeen = [];
  page.on('pageerror', (e) => page.errorsSeen.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') page.errorsSeen.push(`console: ${m.text().slice(0, 160)}`); });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('render', 'quality');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
  await page.fill('#player-name', label);
  return page;
}

function sample(page) {
  return page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const s = debug.snapshot();
    return {
      t: Math.round(performance.now()),
      readyDisabled: document.querySelector('#lobby-ready')?.disabled ?? null,
      guidance: (document.getElementById('lobby-guidance')?.textContent ?? '').slice(0, 90),
      selectedArenaId: s.arenaId ?? document.documentElement.dataset.gameplayArena ?? null,
      configArenaId: s.privateMatch?.arenaId ?? null,
      transition: s.transition ?? null,
      gameplayDataset: document.documentElement.dataset.gameplayArena ?? null,
      renderSubmissionPaused: s.transition?.renderSubmissionPaused ?? null,
    };
  });
}

let host = null;
let guest = null;
try {
  host = await openPage('Probe Host');
  guest = await openPage('Probe Guest');
  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
  const code = (await host.textContent('#room-code')).trim();
  await guest.fill('#room-input', code);
  await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  for (const page of [host, guest]) {
    await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
  }
  if (TARGET_MODE === 'tdm' || TARGET_MODE === 'ffa') {
    await host.selectOption('#lobby-mode', TARGET_MODE);
    await host.waitForTimeout(300);
  }
  console.error(`[guest-sync-probe] selecting ${TARGET_ARENA} on the host`);
  await host.selectOption('#lobby-arena', TARGET_ARENA);

  const samples = [];
  const deadline = Date.now() + WAIT_MS;
  let outcome = 'unsynchronized';
  while (Date.now() < deadline) {
    const s = await sample(guest).catch((e) => ({ error: String(e).slice(0, 120) }));
    samples.push(s);
    if (s.readyDisabled === false) { outcome = 'GUEST-SYNCHRONIZED'; break; }
    await guest.waitForTimeout(1000);
  }
  const hostSample = await sample(host).catch(() => null);
  console.log(JSON.stringify({ target: TARGET_ARENA, mode: TARGET_MODE, outcome, hostSample, guestSamples: samples, guestErrors: guest.errorsSeen }, null, 2));
  process.exitCode = outcome === 'GUEST-SYNCHRONIZED' ? 0 : 2;
} catch (error) {
  console.error(`[guest-sync-probe] environment error: ${String(error).slice(0, 200)}`);
  process.exitCode = 3;
} finally {
  await host?.close().catch(() => {});
  await guest?.close().catch(() => {});
  await browser.close().catch(() => {});
  peerProcess?.kill();
}
