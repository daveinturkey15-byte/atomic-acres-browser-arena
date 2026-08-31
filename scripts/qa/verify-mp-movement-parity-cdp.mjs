#!/usr/bin/env node
// Pass 79 mp-core movement-parity proof: HOST and GUEST must both move on
// EVERY arena, driven with real key input in two windows.
//
// Copied from scripts/qa/verify-hf347-arena-movement-matrix.mjs (same lobby
// choreography: private room -> guest joins -> host swaps map AFTER join ->
// both ready -> start -> matchPhase active -> hold W) with three changes:
//   1. Launches INSTALLED CHROME (channel: 'chrome', headed, real WebGPU)
//      instead of headless Chromium. Headless cannot create a WebGPU device
//      here, and gameplay-facing verification must run the route the owner
//      plays (gauntlet failure mode #2).
//   2. Emulation.setFocusEmulationEnabled per page, copied from
//      verify-arena-boot-cdp.mjs - an unfocused window is timer-throttled and
//      reads exactly like a wedged/won't-move arena.
//   3. All six arenas from src/arena-identity.ts, TDM and FFA mixed.
//
// Exit 0 only when every lane passes (both roles displace >= threshold).
// JSON verdict on stdout; per-lane progress on stderr.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { chromium } from '@playwright/test';
import { OFFSCREEN_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41933/');
const PEER_PORT = Number(arg('--peer-port', '9341'));
const MOVE_HOLD_MS = Number(arg('--move-ms', '1800'));
const MOVE_THRESHOLD_M = Number(arg('--threshold', '1.2'));
const CONNECT_TIMEOUT = 120_000;

const LANES = [
  // RustRig first: the reported spawn freeze lives here.
  { arena: 'rustworks-1v1', mode: 'tdm', swaps: ['rustworks-1v1'] },
  { arena: 'atomic-acres', mode: 'ffa', swaps: ['atomic-acres'] },
  { arena: 'skyline-terminal', mode: 'tdm', swaps: ['skyline-terminal', 'rustworks-1v1', 'skyline-terminal'] },
  { arena: 'farcrysis', mode: 'ffa', swaps: ['farcrysis'] },
  { arena: 'high-seas', mode: 'tdm', swaps: ['high-seas'] },
  { arena: 'gun-range', mode: 'range', swaps: ['gun-range'] },
];

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
  headless: false,
  channel: 'chrome',
  args: [...OFFSCREEN_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    // Without these an occluded window is throttled and every lane looks wedged.
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
  // Guarantee foreground ownership instead of hoping the WM grants focus.
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

/**
 * Real-input movement probe: hold W, measure horizontal displacement. Retries
 * once with a fresh focus, because a missed first keydown is a harness fault
 * rather than the game fault this exists to detect.
 */
async function measureMovement(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
    await page.click('body');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(MOVE_HOLD_MS);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
    const dx = after[0] - before[0];
    const dz = after[2] - before[2];
    const moved = Math.hypot(dx, dz);
    if (moved >= MOVE_THRESHOLD_M || attempt === 1) return { movedM: Number(moved.toFixed(2)), before, after };
  }
  return { movedM: 0 };
}

const lanes = [];
for (const lane of LANES) {
  const record = { arena: lane.arena, mode: lane.mode, swaps: lane.swaps, ok: false };
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

    if (lane.mode === 'tdm' || lane.mode === 'ffa') {
      await host.selectOption('#lobby-mode', lane.mode);
      await host.waitForTimeout(300);
    }
    for (const swapTarget of lane.swaps) {
      await host.selectOption('#lobby-arena', swapTarget);
      await host.waitForTimeout(700);
    }
    await guest.waitForFunction(
      (arenaId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.arenaId === arenaId
        || document.querySelector('#lobby-arena')?.value === arenaId,
      lane.arena,
      { timeout: CONNECT_TIMEOUT },
    );

    // Arena synchronization (full gameplay-asset preparation) legitimately
    // takes ~30 s per swap on WebGPU - far longer than Playwright's default
    // 30 s click-actionability window, which is what made every heavy lane
    // time out as "READY disabled". Wait for each gate explicitly instead.
    await host.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await guest.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await host.click('#lobby-start');

    for (const [label, page] of [['host', host], ['guest', guest]]) {
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: CONNECT_TIMEOUT });
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
      record[`${label}ArenaId`] = await page.evaluate(() => document.documentElement.dataset.arenaId ?? null);
    }
    record.guestSpawnTrace = [];
    for (let tick = 0; tick < 6; tick += 1) {
      record.guestSpawnTrace.push(await guest.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          t: Math.round(performance.now()),
          alive: snapshot.player.alive,
          hp: snapshot.player.hp,
          deaths: snapshot.player.deaths,
          y: Number(snapshot.player.position[1].toFixed(2)),
          x: Number(snapshot.player.position[0].toFixed(2)),
          z: Number(snapshot.player.position[2].toFixed(2)),
          respawnOverlay: !document.getElementById('respawn')?.classList.contains('hidden')
            && document.getElementById('respawn')?.offsetParent !== null,
          status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 90),
        };
      }));
      await guest.waitForTimeout(400);
    }

    const visibilityOf = (page) => page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const remote = snapshot.remotePlayers?.[0] ?? null;
      let visibleMeshes = 0;
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph?.();
      scene?.traverse((object) => {
        if (object.name !== 'remote-player-world') return;
        object.traverse((child) => {
          if (!child.isMesh || !child.visible) return;
          for (let parent = child.parent; parent; parent = parent.parent) {
            if (!parent.visible) return;
          }
          visibleMeshes += 1;
        });
      });
      return remote ? {
        remoteCount: snapshot.remotePlayers.length,
        hp: remote.hp,
        interpolationError: Number(remote.interpolationError?.toFixed?.(2) ?? -1),
        visualPosition: remote.visualPosition?.map((value) => Number(value.toFixed(1))),
        visibleMeshes,
      } : { remoteCount: 0, visibleMeshes };
    });

    record.hostSeesGuest = await visibilityOf(host);
    record.guestSeesHost = await visibilityOf(guest);

    record.hostMove = await measureMovement(host);
    record.guestMove = await measureMovement(guest);
    if (record.guestMove.movedM < MOVE_THRESHOLD_M) {
      record.guestGate = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
    }
    if (record.hostMove.movedM < MOVE_THRESHOLD_M) {
      record.hostGate = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
    }
    if (record.guestMove.movedM < MOVE_THRESHOLD_M || record.hostMove.movedM < MOVE_THRESHOLD_M) {
      record.hostStateAdmissionDrops = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().stateAdmissionDrops ?? null);
      record.guestStateAdmissionDrops = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().stateAdmissionDrops ?? null);
    }
    record.hostErrors = host.errorsSeen.slice(0, 4);
    record.guestErrors = guest.errorsSeen.slice(0, 4);
    const seen = (visibility) => visibility
      && visibility.remoteCount === 1
      && visibility.hp > 0
      && visibility.visibleMeshes > 0;
    record.ok = record.hostArenaId === lane.arena
      && record.guestArenaId === lane.arena
      && record.hostMove.movedM >= MOVE_THRESHOLD_M
      && record.guestMove.movedM >= MOVE_THRESHOLD_M
      && seen(record.hostSeesGuest)
      && seen(record.guestSeesHost);
  } catch (error) {
    record.error = String(error).slice(0, 300);
    record.hostErrors = host?.errorsSeen.slice(0, 4) ?? [];
    record.guestErrors = guest?.errorsSeen.slice(0, 4) ?? [];
  } finally {
    await host?.close().catch(() => {});
    await guest?.close().catch(() => {});
  }
  lanes.push(record);
  console.error(`[mp-parity] ${lane.arena}/${lane.mode}: ${record.ok ? 'PASS' : 'FAIL'}`
    + ` host=${record.hostMove?.movedM ?? '?'}m guest=${record.guestMove?.movedM ?? '?'}m${record.error ? ` error=${record.error}` : ''}`);
}

await browser.close();
peerProcess?.kill();
await browser.close().catch(() => {});

const allPass = lanes.every((lane) => lane.ok);
console.log(JSON.stringify({ verdict: allPass ? 'PASS' : 'FAIL', thresholdM: MOVE_THRESHOLD_M, lanes }, null, 2));
process.exit(allPass ? 0 : 1);
