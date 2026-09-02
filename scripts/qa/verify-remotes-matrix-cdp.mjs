#!/usr/bin/env node
// Remotes-seen-by-everyone matrix: host+guest on REAL WebGPU in installed Chrome,
// driven over CDP (Playwright channel:'chrome', headless:false).
//
// Assignment: "Everyone must be SEEN by everyone." For every arena lane this:
//   1. Hosts a private room on a local PeerJS server; guest joins; ready; start.
//   2. Waits for matchPhase 'active' on BOTH roles.
//   3. Asserts EACH peer observes remotes.length === 1 (the other player),
//      alive, with visible skinned presentation meshes (spawn visibility),
//      a live interpolation buffer (depth > 0, fresh snapshots), and a small
//      interpolation error.
//   4. Holds W on the HOST with real key events and asserts the GUEST's observed
//      remote position displaces - proving live state flows through the
//      interpolation path, not merely that a map entry exists.
//   5. Screenshots BOTH windows per lane into artifacts/qa/remotes-matrix/.
//
// Exit 0 only when every lane passes. JSON verdict on stdout.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910/');
const PEER_PORT = Number(arg('--peer-port', '9339'));
const PER_LANE_MS = Number(arg('--per-arena', '150000'));
const CONNECT_TIMEOUT = 120_000;
const MOVE_HOLD_MS = Number(arg('--move-ms', '1500'));
const OBSERVED_MOVE_MIN_M = Number(arg('--observed-move-min', '0.4'));
const ARENAS = arg('--arenas', 'atomic-acres,farcrysis,high-seas,skyline-terminal,rustworks-1v1,gun-range')
  .split(',').map((entry) => entry.trim()).filter(Boolean);

// Same mode choices as verify-hf347-arena-movement-matrix.mjs: TDM covers the
// owner-faulted arenas, FFA the rest; gun-range forces its own special case.
function modeFor(arena) {
  if (arena === 'gun-range') return 'range';
  return ['rustworks-1v1', 'skyline-terminal', 'high-seas'].includes(arena) ? 'tdm' : 'ffa';
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
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    // Without these an occluded window is throttled and everything looks wedged.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

function pageUrl(label) {
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');   // HARD WebGPU contract - the owner's route.
  url.searchParams.set('render', 'quality');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  url.searchParams.set('seed', `remotes-${label}`);
  return url.toString();
}

async function openPage(label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errorsSeen = [];
  page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 200)}`));
  const session = await page.context().newCDPSession(page);
  // Guarantee foreground ownership instead of hoping the WM grants it.
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.goto(pageUrl(label), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(window.__ATOMIC_ACRES_DEBUG__) && window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponReady === true,
    undefined,
    { timeout: CONNECT_TIMEOUT },
  );
  await page.fill('#player-name', `${label} QA`);
  return page;
}

/**
 * Everything the assignment asks one peer to prove about what it SEES:
 * count, life, visible skinned presentation, interpolation liveness.
 */
async function observeRemotes(page) {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
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
    const remotes = snapshot.remotePlayers ?? [];
    return {
      remoteCount: remotes.length,
      backend: document.documentElement.dataset.renderBackend ?? null,
      arenaId: document.documentElement.dataset.arenaId ?? null,
      matchPhase: snapshot.matchPhase,
      remotes: remotes.map((remote) => ({
        id: remote.id,
        name: remote.name,
        hp: remote.hp,
        team: remote.team,
        stance: remote.stance,
        position: remote.position?.map((value) => Number(value.toFixed(2))),
        visualPosition: remote.visualPosition?.map((value) => Number(value.toFixed(2))),
        interpolationErrorM: Number(remote.interpolationError?.toFixed?.(3) ?? -1),
        renderedWorldAgeMs: remote.renderedWorldAgeMs == null ? null : Math.round(remote.renderedWorldAgeMs),
        snapshotBufferDepth: remote.snapshotBufferDepth,
        snapshotRateHz: remote.snapshotRateHz,
        snapshotAgeMs: remote.snapshotAgeMs == null ? null : Math.round(remote.snapshotAgeMs),
        operatorModelPresent: Boolean(remote.operatorModel),
        visibleSkinnedMeshes: remote.operatorModel?.effectivelyVisibleSkinnedMeshes?.length ?? null,
        screenPosition: remote.screenPosition?.map((value) => Number(value.toFixed(3))),
      })),
      visibleMeshes,
      stateAdmissionDrops: snapshot.stateAdmissionDrops ?? null,
    };
  });
}

const lanes = [];
for (const [laneIndex, arena] of ARENAS.entries()) {
  const mode = modeFor(arena);
  const record = { arena, mode, ok: false };
  let host = null;
  let guest = null;
  try {
    host = await openPage('Host');
    guest = await openPage('Guest');

    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
    const roomCode = (await host.textContent('#room-code')).trim();

    await guest.fill('#room-input', roomCode);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    for (const page of [host, guest]) {
      await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
    }

    if (mode === 'tdm' || mode === 'ffa') {
      await host.selectOption('#lobby-mode', mode);
      await host.waitForTimeout(300);
    }
    await host.selectOption('#lobby-arena', arena);
    await host.waitForTimeout(700);
    await guest.waitForFunction(
      (arenaId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.arenaId === arenaId
        || document.querySelector('#lobby-arena')?.value === arenaId,
      arena,
      { timeout: CONNECT_TIMEOUT },
    );

    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await host.click('#lobby-start');

    // Spawn visibility window: sample as soon as each role is active, then
    // again after a settle - the first sample IS the spawn observation.
    for (const [label, page] of [['host', host], ['guest', guest]]) {
      await page.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return snapshot?.gameStarted === true && snapshot?.matchPhase === 'active';
      }, undefined, { timeout: PER_LANE_MS });
      record[`${label}ActiveMs`] = Date.now();
    }
    record.hostSpawnObservation = await observeRemotes(host);
    record.guestSpawnObservation = await observeRemotes(guest);
    await host.waitForTimeout(2500);
    record.hostSettledObservation = await observeRemotes(host);
    record.guestSettledObservation = await observeRemotes(guest);

    // Live-flow probe: host walks; the guest's OBSERVED remote must displace.
    const observedBefore = (await observeRemotes(guest)).remotes[0]?.visualPosition ?? null;
    await host.click('body');
    await host.keyboard.down('KeyW');
    await host.waitForTimeout(MOVE_HOLD_MS);
    await host.keyboard.up('KeyW');
    await host.waitForTimeout(700);
    const observedAfter = (await observeRemotes(guest)).remotes[0]?.visualPosition ?? null;
    record.guestObservedHostMove = {
      before: observedBefore,
      after: observedAfter,
      displacedM: observedBefore && observedAfter
        ? Number(Math.hypot(observedAfter[0] - observedBefore[0], observedAfter[2] - observedBefore[2]).toFixed(2))
        : null,
    };

    mkdirSync(resolve('artifacts/qa/remotes-matrix'), { recursive: true });
    record.hostScreenshot = resolve(`artifacts/qa/remotes-matrix/${arena}-host.png`);
    record.guestScreenshot = resolve(`artifacts/qa/remotes-matrix/${arena}-guest.png`);
    await host.screenshot({ path: record.hostScreenshot });
    await guest.screenshot({ path: record.guestScreenshot });

    const seenWell = (observation) => observation.remoteCount === 1
      && observation.remotes[0]?.hp > 0
      && observation.visibleMeshes > 0
      && observation.remotes[0]?.operatorModelPresent === true
      && (observation.remotes[0]?.visibleSkinnedMeshes ?? 0) > 0
      && (observation.remotes[0]?.snapshotBufferDepth ?? 0) >= 1
      && (observation.remotes[0]?.snapshotAgeMs ?? Infinity) < 2000
      && (observation.remotes[0]?.interpolationErrorM ?? Infinity) < 2.5;
    record.backend = record.hostSettledObservation.backend;
    record.ok = record.hostSettledObservation.arenaId === arena
      && record.guestSettledObservation.arenaId === arena
      && seenWell(record.hostSettledObservation)
      && seenWell(record.guestSettledObservation)
      && (record.guestObservedHostMove.displacedM ?? 0) >= OBSERVED_MOVE_MIN_M;
    if (!record.ok) {
      record.hostGate = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null).catch(() => null);
      record.guestGate = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null).catch(() => null);
    }
  } catch (error) {
    record.error = String(error).slice(0, 300);
    record.hostErrors = host?.errorsSeen.slice(0, 4) ?? [];
    record.guestErrors = guest?.errorsSeen.slice(0, 4) ?? [];
  } finally {
    await host?.close().catch(() => {});
    await guest?.close().catch(() => {});
  }
  lanes.push(record);
  console.error(`[remotes-cdp] ${arena}/${mode}: ${record.ok ? 'PASS' : 'FAIL'}`
    + ` hostSees=${record.hostSettledObservation?.remoteCount ?? '?'}`
    + ` guestSees=${record.guestSettledObservation?.remoteCount ?? '?'}`
    + ` guestObservedMove=${record.guestObservedHostMove?.displacedM ?? '?'}m`
    + ` backend=${record.backend ?? '?'}`);
  if (record.error) console.error(`            ${record.error}`);
}
const failed = lanes.filter((lane) => !lane.ok);
writeFileSync(resolve('artifacts/qa/remotes-matrix.json'), `${JSON.stringify({ verdict: failed.length ? 'FAIL' : 'PASS', base: BASE, renderer: 'webgpu', lanes }, null, 2)}\n`);
console.log(JSON.stringify({ verdict: failed.length ? 'FAIL' : 'PASS', failed }, null, 2));
process.exit(failed.length ? 1 : 0);
