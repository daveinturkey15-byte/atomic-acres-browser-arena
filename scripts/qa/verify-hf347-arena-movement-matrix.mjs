#!/usr/bin/env node
// HF-347 / HF-322 close-out: host+guest movement matrix on the faulted arenas.
//
// The owner's faults were "rust and terminal still issues ... when multiplayer"
// and "cant mov when spawn into rustrig in host guest lobby", plus
// "Synchronizing Terminal before ready-up ... between swapping maps". The
// permanent-freeze wedges were fixed (9a8e5786) but only static source guards
// covered them - nothing since has actually driven a host and a guest onto
// RustRig and Terminal and pressed W.
//
// This does exactly that, per arena:
//   1. Host creates a private room on a local PeerJS server; guest joins.
//   2. AFTER the guest is in the room, the host swaps the map - including a
//      double swap on the Terminal lane, because "between swapping maps" was
//      the owner's reproduction path for the Synchronizing wedge.
//   3. Both ready up, host starts, both must reach matchPhase 'active'.
//   4. Movement is tested with REAL key events (keyboard.down('KeyW')), not
//      teleports, because the fault was the input->physics path being dead on
//      spawn. Both roles must displace by more than the threshold.
//
// Exit 0 only when every lane passes. JSON verdict on stdout.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876/');
const PEER_PORT = Number(arg('--peer-port', '9337'));
const MOVE_HOLD_MS = Number(arg('--move-ms', '1800'));
const MOVE_THRESHOLD_M = Number(arg('--threshold', '1.2'));
const CONNECT_TIMEOUT = 60_000;

// The two owner-faulted arenas, plus atomic-acres as the known-good control:
// if the control lane failed too, the harness (not the arena) would be suspect.
const LANES = [
  { arena: 'rustworks-1v1', swaps: ['rustworks-1v1'] },
  // Double swap on the Terminal lane - the owner hit the wedge "between
  // swapping maps", so the lane swaps away and back before ready-up.
  { arena: 'skyline-terminal', swaps: ['skyline-terminal', 'rustworks-1v1', 'skyline-terminal'] },
  { arena: 'atomic-acres', swaps: ['atomic-acres'] },
  // Not owner-faulted, but the two arenas this pass reworked most heavily -
  // multiplayer movement on them is HITL evidence the rework broke nothing.
  { arena: 'farcrysis', swaps: ['farcrysis'] },
  { arena: 'high-seas', swaps: ['high-seas'] },
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
  headless: true,
  args: [
    '--use-angle=d3d11',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

async function openPage(label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errorsSeen = [];
  page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 160)}`));
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', 'compat');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
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
  const record = { arena: lane.arena, swaps: lane.swaps, ok: false };
  const host = await openPage('Host QA');
  const guest = await openPage('Guest QA');
  try {
    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
    const roomCode = (await host.textContent('#room-code')).trim();

    await guest.fill('#room-input', roomCode);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    for (const page of [host, guest]) {
      await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
    }

    // Swap maps with the guest ALREADY in the room - the owner's wedge path.
    for (const swapTarget of lane.swaps) {
      await host.selectOption('#lobby-arena', swapTarget);
      await host.waitForTimeout(700);
    }
    // The guest must converge on the final arena before ready-up.
    await guest.waitForFunction(
      (arenaId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.arenaId === arenaId
        || document.querySelector('#lobby-arena')?.value === arenaId,
      lane.arena,
      { timeout: CONNECT_TIMEOUT },
    );

    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await host.click('#lobby-start');

    for (const [label, page] of [['host', host], ['guest', guest]]) {
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: CONNECT_TIMEOUT });
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
      record[`${label}ArenaId`] = await page.evaluate(() => document.documentElement.dataset.arenaId ?? null);
    }
    // Trace the guest's first seconds: if they die at spawn, the movement
    // failure is a symptom and the death is the fault.
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

    record.hostMove = await measureMovement(host);
    record.guestMove = await measureMovement(guest);
    // When a role failed to move, name the gate clause that held it still.
    if (record.guestMove.movedM < MOVE_THRESHOLD_M) {
      record.guestGate = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
    }
    if (record.hostMove.movedM < MOVE_THRESHOLD_M) {
      record.hostGate = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
    }
    record.hostErrors = host.errorsSeen.slice(0, 4);
    record.guestErrors = guest.errorsSeen.slice(0, 4);
    record.ok = record.hostArenaId === lane.arena
      && record.guestArenaId === lane.arena
      && record.hostMove.movedM >= MOVE_THRESHOLD_M
      && record.guestMove.movedM >= MOVE_THRESHOLD_M;
  } catch (error) {
    record.error = String(error).slice(0, 300);
    record.hostErrors = host.errorsSeen.slice(0, 4);
    record.guestErrors = guest.errorsSeen.slice(0, 4);
  } finally {
    await host.close().catch(() => {});
    await guest.close().catch(() => {});
  }
  lanes.push(record);
  console.error(`[hf347] ${lane.arena}: ${record.ok ? 'PASS' : 'FAIL'}`
    + ` host=${record.hostMove?.movedM ?? '?'}m guest=${record.guestMove?.movedM ?? '?'}m${record.error ? ` error=${record.error}` : ''}`);
}

await browser.close();
peerProcess?.kill();

const allPass = lanes.every((lane) => lane.ok);
console.log(JSON.stringify({ verdict: allPass ? 'PASS' : 'FAIL', thresholdM: MOVE_THRESHOLD_M, lanes }, null, 2));
process.exit(allPass ? 0 : 1);
