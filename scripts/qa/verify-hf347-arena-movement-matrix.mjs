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
const CONNECT_TIMEOUT = 120_000;

// The two owner-faulted arenas, plus atomic-acres as the known-good control:
// if the control lane failed too, the harness (not the arena) would be suspect.
// Owner requirement: "everything should work the same way whether it's TDM or
// FFA", across all maps "even gun range". The lobby's mode select defaults to
// FFA, so a matrix that never touches it - as the first version of this file
// did not - silently tests only half the product. Modes are now explicit and
// TDM covers the owner-faulted arenas.
const LANES = [
  { arena: 'rustworks-1v1', mode: 'tdm', swaps: ['rustworks-1v1'] },
  // Double swap on the Terminal lane - the owner hit the wedge "between
  // swapping maps", so the lane swaps away and back before ready-up.
  { arena: 'skyline-terminal', mode: 'tdm', swaps: ['skyline-terminal', 'rustworks-1v1', 'skyline-terminal'] },
  { arena: 'atomic-acres', mode: 'ffa', swaps: ['atomic-acres'] },
  { arena: 'farcrysis', mode: 'ffa', swaps: ['farcrysis'] },
  { arena: 'high-seas', mode: 'tdm', swaps: ['high-seas'] },
  // The gun-range lobby forces FFA and zero bots; selecting it exercises that
  // special-case path end to end.
];

// Lane J forensics: an optional subset filter for iteration. Default (no
// flag) runs every lane exactly as before - this only ever SHRINKS the set
// explicitly requested on the command line, never the default coverage.
const ONLY = (() => {
  const index = argv.indexOf('--only');
  return index >= 0 && argv[index + 1] ? argv[index + 1].split(',').map((value) => value.trim()) : null;
})();
const ACTIVE_LANES = ONLY ? LANES.filter((lane) => ONLY.includes(lane.arena)) : LANES;
if (ONLY && ACTIVE_LANES.length === 0) {
  console.error(`[hf347] --only matched no lanes: ${ONLY.join(', ')}`);
  process.exit(2);
}

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
  args: ['--mute-audio', 
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
    const before = await page.evaluate(() => ({
      position: window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position,
      presentedGameplayFrame: window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame,
    }));
    await page.click('body');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    const midHold = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        heldKeys: snapshot.textChat?.heldKeys ?? null,
        midPosition: snapshot.player.position,
      };
    });
    await page.waitForTimeout(MOVE_HOLD_MS);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
      position: window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position,
      presentedGameplayFrame: window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame,
    }));
    const dx = after.position[0] - before.position[0];
    const dz = after.position[2] - before.position[2];
    const moved = Math.hypot(dx, dz);
    if (moved >= MOVE_THRESHOLD_M || attempt === 1) return {
      movedM: Number(moved.toFixed(2)), before, after,
      heldKeys: midHold.heldKeys,
      presentedFrames: after.presentedGameplayFrame - before.presentedGameplayFrame,
    };
  }
  return { movedM: 0, presentedFrames: null };
}

/**
 * Lane J forensics: the admission-handshake state of a role, sampled after
 * every lane. Captured for PASSING lanes too - a failure that only shows in
 * post-mortem telemetry on green lanes is exactly how this residual kept
 * surviving. Read-only; changes no game state.
 */
async function handshakeTelemetry(page) {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      clientWorldRepair: snapshot.clientWorldRepair ?? null,
      clientWorldRepairFailures: snapshot.clientWorldRepairFailures ?? null,
      matchAdmissionPark: snapshot.matchAdmissionPark ?? null,
      presentedGameplayFrame: window.__ATOMIC_ACRES_DEBUG__.admissionState().presentedGameplayFrame,
      renderSubmissionPaused: snapshot.deterministicReview?.renderSubmissionPaused ?? null,
      matchAdmissionPresentationPaused: snapshot.deterministicReview?.matchAdmissionPresentationPaused ?? null,
      hasFocus: document.hasFocus(),
      visibilityState: document.visibilityState,
      status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 120),
    };
  });
}

const lanes = [];
for (const lane of ACTIVE_LANES) {
  const record = { arena: lane.arena, mode: lane.mode, swaps: lane.swaps, ok: false };
  let host = null;
  let guest = null;
  try {
    // Inside the try: a page that cannot even open must fail ITS lane, not
    // kill the whole matrix.
    host = await openPage('Host QA');
    guest = await openPage('Guest QA');
    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
    const roomCode = (await host.textContent('#room-code')).trim();
    await guest.fill('#room-input', roomCode);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    for (const page of [host, guest]) {
      await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
    }

    // Mode first (gun-range disables the control and forces FFA itself).
    if (lane.mode === 'tdm' || lane.mode === 'ffa') {
      await host.selectOption('#lobby-mode', lane.mode);
      await host.waitForTimeout(300);
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
    // When a role failed to move, name the gate clause that held it still.
    if (record.guestMove.movedM < MOVE_THRESHOLD_M) {
      record.guestGate = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
    }
    if (record.hostMove.movedM < MOVE_THRESHOLD_M) {
      record.hostGate = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
    }
    // Lane J: silent state/join admission drops are the leading suspect when a
    // role cannot move; capture the counters from both sides on any failure.
    if (record.guestMove.movedM < MOVE_THRESHOLD_M || record.hostMove.movedM < MOVE_THRESHOLD_M) {
      record.hostStateAdmissionDrops = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().stateAdmissionDrops ?? null);
      record.guestStateAdmissionDrops = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().stateAdmissionDrops ?? null);
    }
    record.hostErrors = host.errorsSeen.slice(0, 4);
    record.guestErrors = guest.errorsSeen.slice(0, 4);
    // Lane J forensics: handshake telemetry on EVERY lane, pass or fail.
    try {
      record.hostHandshake = await handshakeTelemetry(host);
      record.guestHandshake = await handshakeTelemetry(guest);
    } catch (telemetryError) {
      record.handshakeTelemetryError = String(telemetryError).slice(0, 160);
    }
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
  console.error(`[hf347] ${lane.arena}/${lane.mode}: ${record.ok ? 'PASS' : 'FAIL'}`
    + ` host=${record.hostMove?.movedM ?? '?'}m guest=${record.guestMove?.movedM ?? '?'}m${record.error ? ` error=${record.error}` : ''}`);
}

await browser.close();
peerProcess?.kill();

const allPass = lanes.every((lane) => lane.ok);
console.log(JSON.stringify({ verdict: allPass ? 'PASS' : 'FAIL', thresholdM: MOVE_THRESHOLD_M, lanes }, null, 2));
process.exit(allPass ? 0 : 1);
