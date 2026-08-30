#!/usr/bin/env node
// Pass 79 mp-core: admission-handshake close-out on the REAL WebGPU route in
// installed Chrome over CDP.
//
// Verifies the Lane J residual fix end to end: the repair-ready retry that the
// deadline timer now spends (src/legacy-main.ts scheduleClientWorldRepairTimeout)
// alongside the parked admission triple (join / state / killstreak-loadout-intent
// + killstreak-state ack). Historic residual forensics: host contact 19059 ms,
// admission failure 24614 ms, attempts frozen at 1 of 2 - guest died at spawn,
// auto-respawned ~1.9s later, permanent status line accusing a healthy host.
//
// Per lane (fresh pages, private lobby, real start):
//   - Guest trace sampled from START through OBSERVE_MS past matchPhase
//     'active': alive/hp/deaths/status, clientWorldRepair admission state,
//     clientWorldRepairFailures total AND last forensic record.
//   - FAIL conditions: any death during the window, any admission failure in
//     telemetry, an unacknowledged pending admission after the window, a
//     status line accusing the host, or either role unable to move/see.
//   - Screenshots captured per lane for visual confirmation.
//
// Backend honesty: this harness launches INSTALLED CHROME HEADED with
// --enable-unsafe-webgpu and fails a lane whose render backend is not webgpu
// instead of silently measuring the WebGL2 compatibility path.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://localhost:41910/');
const PEER_PORT = Number(arg('--peer-port', '9339'));
const CONNECT_TIMEOUT = 120_000;
const OBSERVE_MS = Number(arg('--observe-ms', '10000'));
const MOVE_HOLD_MS = Number(arg('--move-ms', '1800'));
const MOVE_THRESHOLD_M = Number(arg('--threshold', '1.2'));
const OUT_DIR = arg('--out', 'artifacts/qa/admission-handshake');
mkdirSync(OUT_DIR, { recursive: true });

const ONLY = arg('--only', ''); // comma-separated lane indices to run

const LANES = [
  // The two historically worst arenas for this fault first, control last.
  { arena: 'rustworks-1v1', mode: 'tdm', swaps: ['rustworks-1v1'] },
  { arena: 'skyline-terminal', mode: 'tdm', swaps: ['skyline-terminal', 'rustworks-1v1', 'skyline-terminal'] },
  { arena: 'rustworks-1v1', mode: 'ffa', swaps: ['rustworks-1v1'] },
  { arena: 'atomic-acres', mode: 'tdm', swaps: ['atomic-acres'] },
];
const laneFilter = ONLY === '' ? null : new Set(ONLY.split(',').map((n) => Number(n.trim())));

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
const HEADLESS = arg('--headless', '0') === '1';

const browser = await chromium.launch({
  // --headless 1 runs INSTALLED CHROME HEADLESS: on this machine that still
  // gets a real hardware WebGPU device (GAUNTLET-SPEC failure-mode 2 table)
  // and does not consume a governor browser slot. Focus emulation below plus
  // the background-throttling flags keep timers and input live either way.
  headless: HEADLESS,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    // Without these an occluded window is throttled and reads like a wedged match.
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
  page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 200)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') page.errorsSeen.push(`${label}: ${message.text().slice(0, 200)}`);
  });
  const session = await page.context().newCDPSession(page);
  // Guarantee foreground ownership instead of hoping the WM grants focus.
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('render', 'quality');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
  await page.fill('#player-name', label === 'host' ? 'Host QA' : 'Guest QA');
  return page;
}

async function sampleGuest(guest) {
  return guest.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      t: Math.round(performance.now()),
      alive: snapshot.player.alive,
      hp: snapshot.player.hp,
      deaths: snapshot.player.deaths,
      gameStarted: snapshot.gameStarted ?? null,
      matchPhase: snapshot.matchPhase ?? null,
      pendingRepair: snapshot.pendingClientWorldRepair ?? null,
      repair: snapshot.clientWorldRepair ?? null,
      repairFailuresTotal: snapshot.clientWorldRepairFailures?.total ?? null,
      repairFailuresLast: snapshot.clientWorldRepairFailures?.last ?? null,
      park: snapshot.matchAdmissionPark ?? null,
      status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 120),
      respawnOverlay: !document.getElementById('respawn')?.classList.contains('hidden')
        && document.getElementById('respawn')?.offsetParent !== null,
    };
  });
}

async function measureMovement(page) {
  const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  await page.click('body');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(MOVE_HOLD_MS);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  return Math.hypot(after[0] - before[0], after[2] - before[2]);
}

async function visibilityOf(page) {
  return page.evaluate(() => {
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
      visibleMeshes,
    } : { remoteCount: 0, visibleMeshes };
  });
}

const lanes = [];
for (const [laneIndex, lane] of LANES.entries()) {
  if (laneFilter !== null && !laneFilter.has(laneIndex)) continue;
  const record = { arena: lane.arena, mode: lane.mode, ok: false };
  let host = null;
  let guest = null;
  try {
    host = await openPage('host');
    guest = await openPage('guest');

    record.hostBackend = await host.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
    record.guestBackend = await guest.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
    const roomCode = (await host.textContent('#room-code')).trim();
    await guest.fill('#room-input', roomCode);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    for (const page of [host, guest]) {
      await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
    }
    if (lane.mode !== 'ffa') {
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
    // Ready-up can stay disabled while the lobby synchronizes a heavy arena;
    // give it the full connect budget instead of Playwright's default 30s.
    for (const [label, page] of [['host', host], ['guest', guest]]) {
      await page.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT })
        .catch(() => { throw new Error(`${label}: #lobby-ready never enabled`); });
    }
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    record.startClickedAtMs = Date.now();
    await host.click('#lobby-start');

    // Sample from the moment START is pressed so the load window itself is
    // visible; keep sampling OBSERVE_MS past matchPhase 'active'.
    record.guestSpawnTrace = [];
    let activeAtMs = null;
    const traceDeadline = Date.now() + CONNECT_TIMEOUT + OBSERVE_MS;
    while (Date.now() < traceDeadline) {
      record.guestSpawnTrace.push(await sampleGuest(guest));
      const isActive = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active');
      if (isActive && activeAtMs === null) activeAtMs = Date.now();
      if (isActive && Date.now() - activeAtMs >= OBSERVE_MS) break;
      await guest.waitForTimeout(500);
    }

    record.hostMoveM = Number((await measureMovement(host)).toFixed(2));
    record.guestMoveM = Number((await measureMovement(guest)).toFixed(2));
    record.hostSeesGuest = await visibilityOf(host);
    record.guestSeesHost = await visibilityOf(guest);
    await host.screenshot({ path: resolve(OUT_DIR, `lane${laneIndex}-host.png`) });
    await guest.screenshot({ path: resolve(OUT_DIR, `lane${laneIndex}-guest.png`) });

    const finalSample = record.guestSpawnTrace[record.guestSpawnTrace.length - 1];
    const worstDeaths = Math.max(...record.guestSpawnTrace.map((entry) => entry.deaths));
    const anyFailureTelemetry = record.guestSpawnTrace.some((entry) => (entry.repairFailuresTotal ?? 0) > 0);
    const accusedHost = record.guestSpawnTrace.some((entry) => /unacknowledged/i.test(entry.status));
    const ackedOrIdle = finalSample.repair === null || finalSample.repair.acknowledged === true;

    record.verdictChecks = {
      noSpawnDeath: worstDeaths === 0,
      noAdmissionFailureTelemetry: !anyFailureTelemetry,
      noAccusationStatusLine: !accusedHost,
      handshakeSettled: ackedOrIdle,
      guestMoves: record.guestMoveM >= MOVE_THRESHOLD_M,
      hostMoves: record.hostMoveM >= MOVE_THRESHOLD_M,
      eachSeesOther: record.hostSeesGuest.remoteCount === 1 && record.hostSeesGuest.hp > 0
        && record.guestSeesHost.remoteCount === 1 && record.guestSeesHost.hp > 0,
      webgpuBothSides: record.hostBackend === 'webgpu' && record.guestBackend === 'webgpu',
    };
    record.ok = Object.values(record.verdictChecks).every(Boolean);
  } catch (error) {
    record.error = String(error).slice(0, 400);
    record.hostErrors = host?.errorsSeen.slice(0, 4) ?? [];
    record.guestErrors = guest?.errorsSeen.slice(0, 4) ?? [];
  } finally {
    record.pageErrors = [...(host?.errorsSeen ?? []), ...(guest?.errorsSeen ?? [])].slice(0, 6);
    await host?.close().catch(() => {});
    await guest?.close().catch(() => {});
  }
  lanes.push(record);
  console.error(`[handshake] lane ${laneIndex} ${lane.arena}/${lane.mode}: ${record.ok ? 'PASS' : 'FAIL'}`
    + ` guest=${record.guestMoveM ?? '?'}m host=${record.hostMoveM ?? '?'}m`
    + ` checks=${JSON.stringify(record.verdictChecks ?? {})}`
    + `${record.error ? ` error=${record.error}` : ''}`);
}

await browser.close();
peerProcess?.kill();

const ran = lanes.length > 0;
const allPass = ran && lanes.every((lane) => lane.ok);
console.log(JSON.stringify({ verdict: allPass ? 'PASS' : 'FAIL', thresholdM: MOVE_THRESHOLD_M, lanes }, null, 2));
process.exit(allPass ? 0 : 1);
