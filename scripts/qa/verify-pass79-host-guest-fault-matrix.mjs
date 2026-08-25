#!/usr/bin/env node
// Pass 79 gameplay-test lane: DEFINITIVE host+guest fault matrix.
//
// Owner-reported faults under test (verbatim):
//   F1 "cant move alot in host and guest lobby"
//   F2 "game starts before all people join"
//   F3 "cant type in lobby"
//   F4 "cant move when spawn into rustrig"
//   F5 "sometimes randomly cant shoot or reload"
//   F6 "very laggy when a chopper gunner is flying and I am not controlling it"
//
// Differences from verify-hf347-arena-movement-matrix.mjs (the copied pattern):
//   - REAL WebGPU: headless Chromium cannot create a WebGPU device on this
//     machine, so every historic multiplayer green was WebGL2 while the owner
//     plays WebGPU. This drives INSTALLED Chrome headed over CDP with focus
//     emulation (pattern from verify-arena-boot-cdp.mjs).
//   - Every arena x both TDM and FFA (+ gun-range's forced range mode).
//   - Per-fault probes beyond movement: start-gate attempts at two lobby
//     stages, real-keyboard typing checks, fire/reload cycles, chopper-activation
//     frame-cadence measurement on the NON-controlling peer.
//   - Served-bundle pin: this worktree is shared; if another agent rebuilds the
//     dist mid-run the measurement is INVALID, never a fault verdict.
//
// This harness REPORTS; it fixes nothing. Exit 0 when every fault has a verdict.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911/');
const PEER_PORT = Number(arg('--peer-port', '9337'));
const MOVE_HOLD_MS = Number(arg('--move-ms', '1500'));
const MOVE_THRESHOLD_M = Number(arg('--threshold', '1.2'));
const FIRE_BURSTS = Number(arg('--fire-bursts', '4'));
const CHOPPER_SAMPLE_MS = Number(arg('--chopper-sample-ms', '10000'));
const ONLY_LANES = arg('--lanes', '').split(',').map((entry) => entry.trim()).filter(Boolean);
const CONNECT_TIMEOUT = 180_000;
const SHOT_DIR = resolve('artifacts/qa/pass79-matrix');
mkdirSync(SHOT_DIR, { recursive: true });

// Every arena x {tdm, ffa}; gun-range forces its own range mode. Order puts
// rustworks-1v1 early so the F4 lane lands while the machine is freshest.
const LANES = [
  { arena: 'rustworks-1v1', mode: 'tdm', swaps: ['rustworks-1v1'] },
  { arena: 'rustworks-1v1', mode: 'ffa', swaps: ['rustworks-1v1'] },
  { arena: 'skyline-terminal', mode: 'tdm', swaps: ['skyline-terminal'] },
  { arena: 'skyline-terminal', mode: 'ffa', swaps: ['skyline-terminal'] },
  { arena: 'atomic-acres', mode: 'tdm', swaps: ['atomic-acres'] },
  { arena: 'atomic-acres', mode: 'ffa', swaps: ['atomic-acres'] },
  { arena: 'farcrysis', mode: 'tdm', swaps: ['farcrysis'] },
  { arena: 'farcrysis', mode: 'ffa', swaps: ['farcrysis'] },
  { arena: 'high-seas', mode: 'tdm', swaps: ['high-seas'] },
  { arena: 'high-seas', mode: 'ffa', swaps: ['high-seas'] },
  { arena: 'gun-range', mode: 'range', swaps: ['gun-range'] },
].filter((lane) => ONLY_LANES.length === 0 || ONLY_LANES.includes(`${lane.arena}:${lane.mode}`));

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

function pageUrl(label, seed) {
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('render', 'quality');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  url.searchParams.set('seed', seed);
  url.searchParams.set('qaLabel', label);
  return url.toString();
}

async function openPage(label, seed) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errorsSeen = [];
  page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 200)}`));
  const session = await page.context().newCDPSession(page);
  // Guaranteed foreground ownership instead of hoping the WM grants focus.
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.goto(pageUrl(label, seed), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: CONNECT_TIMEOUT });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
  page.servedBundle = await page.evaluate(() => {
    const entry = performance.getEntriesByType('resource')
      .map((resource) => resource.name)
      .find((name) => name.includes('/legacy-main-'));
    return entry ? entry.slice(entry.lastIndexOf('/')) : null;
  });
  page.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  await page.fill('#player-name', label === 'host' ? 'Host QA' : 'Guest QA');
  return page;
}

/** Real-input movement probe along one axis. Retries once (harness fault vs game fault). */
async function measureAxis(page, code, holdMs = MOVE_HOLD_MS) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
    await page.click('body');
    await page.keyboard.down(code);
    await page.waitForTimeout(holdMs);
    await page.keyboard.up(code);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
    const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
    if (moved >= 0.05 || attempt === 1) {
      return { axis: code, movedM: Number(moved.toFixed(2)), before, after };
    }
  }
  return { axis: code, movedM: 0 };
}

/**
 * Frame cadence via a page-side rAF counter. Deliberately does NOT call
 * __ATOMIC_ACRES_DEBUG__.snapshot() in a loop: that snapshot walks full
 * scene-graph telemetry and would contaminate the very cadence being measured.
 * The rAF counter measures compositor-presented animation frames.
 */
async function frameCadence(page, durationMs) {
  await page.evaluate(() => {
    window.__p79RafCount = 0;
    if (!window.__p79RafInstalled) {
      window.__p79RafInstalled = true;
      const tick = () => { window.__p79RafCount += 1; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
  });
  const start = await page.evaluate(() => ({ t: performance.now(), n: window.__p79RafCount }));
  await page.waitForTimeout(durationMs);
  const end = await page.evaluate(() => ({ t: performance.now(), n: window.__p79RafCount }));
  const dt = end.t - start.t;
  const fps = dt > 0 ? ((end.n - start.n) * 1000) / dt : 0;
  return { fpsMedian: Number(fps.toFixed(1)), fpsP05: Number(fps.toFixed(1)), fpsP95: Number(fps.toFixed(1)) };
}

/**
 * F5 probe: real trigger bursts + real reload key. Records ammo deltas and,
 * when nothing moves, the fire-admission diagnostics that say why.
 */
async function fireReloadProbe(page, record) {
  const trials = [];
  await page.click('body');
  for (let trial = 0; trial < FIRE_BURSTS; trial += 1) {
    const before = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { ammo: snapshot.player.ammo, reserve: snapshot.player.reserve, weapon: snapshot.player.weapon };
    });
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.up();
    await page.waitForTimeout(350);
    const mid = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { ammo: snapshot.player.ammo, pointerLock: document.pointerLockElement != null };
    });
    let reload = null;
    if (mid.ammo <= 3) {
      const pre = mid.ammo;
      await page.keyboard.press('KeyR');
      let restored = false;
      for (let poll = 0; poll < 16; poll += 1) {
        await page.waitForTimeout(300);
        const state = await page.evaluate(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return { ammo: snapshot.player.ammo, reloading: snapshot.player.reloading };
        });
        if (!state.reloading && state.ammo > pre) { restored = true; break; }
      }
      reload = { beforeAmmo: pre, restored };
    }
    trials.push({ trial, before, afterBurst: mid, reload });
  }
  record.fireTrials = trials;
  record.fireDiagnostics = await page.evaluate(() => ({
    admission: window.__ATOMIC_ACRES_DEBUG__.sampleFireAdmissionDiagnostics?.() ?? null,
  })).catch(() => null);
}

/** Chat-surface DOM state + real-keyboard typing attempt. Never throws. */
async function chatProbe(page, text) {
  const dom = await page.evaluate(() => {
    const root = document.getElementById('text-chat');
    const form = document.getElementById('text-chat-form');
    const input = document.getElementById('text-chat-input');
    const rect = input?.getBoundingClientRect();
    return {
      rootHidden: root?.hidden ?? null,
      open: root?.dataset.open ?? null,
      visible: root?.dataset.visible ?? null,
      context: root?.dataset.context ?? null,
      formDisplay: form ? getComputedStyle(form).display : null,
      inputDisabled: input?.disabled ?? null,
      inputReadOnly: input?.readOnly ?? null,
      inputRect: rect ? { w: Number(rect.width.toFixed(0)), h: Number(rect.height.toFixed(0)) } : null,
      offsetParentNull: input ? input.offsetParent === null : null,
    };
  }).catch(() => ({}));
  try {
    await page.click('#text-chat-input', { timeout: 5_000 });
  } catch {
    // Fall back to programmatic focus: a player can still Tab to the field
    // even when Playwright's actionability heuristics refuse the click.
    await page.evaluate(() => document.getElementById('text-chat-input')?.focus()).catch(() => {});
  }
  await page.keyboard.type(text, { delay: 30 }).catch(() => {});
  const typedValue = await page.inputValue('#text-chat-input').catch(() => null);
  await page.keyboard.press('Enter').catch(() => {});
  await page.waitForTimeout(400);
  const chatLog = await page.evaluate(() => (document.getElementById('text-chat-log')?.textContent ?? '').slice(-200)).catch(() => '');
  return {
    ...dom,
    typedValue,
    typeEchoed: typeof typedValue === 'string' && typedValue.length > 0,
    logAfterSend: chatLog,
    sentVisible: chatLog.includes(text),
  };
}

const peerProcess = await ensurePeerServer();

let browser = null;
try {
  browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--use-angle=d3d11',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      // Without these an occluded window is throttled and reads exactly like a
      // wedged arena or a dead input path.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      '--allow-loopback-in-peer-connection',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
} catch (error) {
  peerProcess?.kill();
  throw error;
}

async function createRoom(host, guest) {
  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
  if (guest) {
    const code = (await host.textContent('#room-code')).trim();
    await guest.fill('#room-input', code);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    for (const page of [host, guest]) {
      await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length >= 2, undefined, { timeout: CONNECT_TIMEOUT });
    }
  }
  return (await host.textContent('#room-code')).trim();
}

const lanes = [];
for (const [laneIndex, lane] of LANES.entries()) {
  const record = {
    arena: lane.arena, mode: lane.mode, ok: false,
    faults: {
      f1_moveRestricted: null, f2_earlyStart: null, f3_typing: null,
      f4_rustrigSpawnMove: null, f5_shootReload: null, f6_chopperLag: null,
    },
  };
  const tag = `${lane.arena}-${lane.mode}`;
  let host = null;
  let guest = null;
  try {
    host = await openPage('host', `p79-${laneIndex}-h`);
    guest = await openPage('guest', `p79-${laneIndex}-g`);
    record.backend = { host: host.backend, guest: guest.backend };
    if (host.backend !== 'webgpu' || guest.backend !== 'webgpu') {
      throw new Error(`expected webgpu backend, got ${JSON.stringify(record.backend)}`);
    }
    if (host.servedBundle !== guest.servedBundle) {
      throw new Error(`served bundle mismatch host=${host.servedBundle} guest=${guest.servedBundle}`);
    }

    // ---- Host creates the room -------------------------------------------
    await createRoom(host, null);
    const roomCode = (await host.textContent('#room-code')).trim();

    // ---- F2 stage A: host alone, zero guests joined ----------------------
    // Zero-guest start leaves the waiting room via privateLobbySnapshot
    // ('countdown') BEFORE matchPhase/gameStarted flip; poll for either.
    {
      const startDisabled = await host.evaluate(() => document.querySelector('#lobby-start')?.disabled ?? null);
      await host.evaluate(() => document.querySelector('#lobby-start')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      const startedAlone = await host.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return snapshot.gameStarted === true
          || snapshot.matchPhase === 'active'
          || snapshot.privateMatch?.phase === 'countdown';
      }, undefined, { timeout: 8_000 }).then(() => true).catch(() => false);
      const status = await host.evaluate(() => ({
        phase: window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase,
        started: window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted,
        lobbyPhase: window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.phase ?? null,
      }));
      record.f2_stageA_zeroGuests = { startDisabled, startedAlone, ...status };
      record.f2_stageA_startedAlone = startedAlone;
      // If it DID start, rebuild a clean waiting room for the rest of the lane.
      if (startedAlone) {
        await host.close().catch(() => {});
        await guest.close().catch(() => {});
        host = await openPage('host', `p79-${laneIndex}-h2`);
        guest = await openPage('guest', `p79-${laneIndex}-g2`);
        await createRoom(host, null);
      }
    }
    const roomCode2 = (await host.textContent('#room-code')).trim();

    // ---- F3 typing probe: room code field, REAL keystrokes ----------------
    await guest.click('#room-input');
    await guest.keyboard.type(roomCode2, { delay: 40 });
    const typedRoom = await guest.inputValue('#room-input');
    record.f3_roomInput = { expected: roomCode2, typed: typedRoom, match: typedRoom === roomCode2 };
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    // ---- F3 typing probe: chat, empty room then populated room ------------
    record.f3_chatEmptyRoom = await chatProbe(host, 'qa typing probe one');
    for (const page of [host, guest]) {
      await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length >= 2, undefined, { timeout: CONNECT_TIMEOUT });
    }
    record.f3_chatPopulated = await chatProbe(host, 'qa typing probe two');

    // ---- F2 stage B: guest connected but NOT ready ------------------------
    {
      const startDisabled = await host.evaluate(() => document.querySelector('#lobby-start')?.disabled ?? null);
      await host.evaluate(() => document.querySelector('#lobby-start')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      const startedEarly = await host.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return snapshot.gameStarted === true
          || snapshot.matchPhase === 'active'
          || snapshot.privateMatch?.phase === 'countdown';
      }, undefined, { timeout: 5_000 }).then(() => true).catch(() => false);
      const status = await host.evaluate(() => ({
        phase: window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase,
        started: window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted,
        lobbyPhase: window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.phase ?? null,
        statusText: (document.getElementById('network-status')?.textContent ?? '').slice(0, 140),
      }));
      record.f2_stageB_guestNotReady = { startDisabled, startedEarly, ...status };
      record.f2_startedBeforeReady = startedEarly;
      if (startedEarly) {
        // Recover the lane so later probes stay meaningful.
        for (const page of [host, guest]) { await page.close().catch(() => {}); }
        host = await openPage('host', `p79-${laneIndex}-h3`);
        guest = await openPage('guest', `p79-${laneIndex}-g3`);
        await createRoom(host, guest);
      }
    }

    // ---- Mode + map swap with the guest already in the room ---------------
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

    // ---- Start and admit ---------------------------------------------------
    // READY stays disabled until this peer's arena selection has synchronised;
    // clicking before that dead-ends the lane. Wait per role; record guidance.
    for (const [label, page] of [['host', host], ['guest', guest]]) {
      const enabled = await page.waitForFunction(
        () => document.querySelector('#lobby-ready')?.disabled === false,
        undefined, { timeout: CONNECT_TIMEOUT },
      ).then(() => true).catch(() => false);
      if (!enabled) {
        record.readyNeverEnabled = { role: label, guidance: await page.evaluate(() => document.getElementById('lobby-guidance')?.textContent?.slice(0, 120) ?? null) };
        throw new Error(`${label} #lobby-ready never enabled`);
      }
      await page.click('#lobby-ready');
    }
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    const startClickedAt = Date.now();
    await host.click('#lobby-start');
    for (const page of [host, guest]) {
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: CONNECT_TIMEOUT });
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
    }
    record.admitMs = Date.now() - startClickedAt;
    record.hostArenaId = await host.evaluate(() => document.documentElement.dataset.arenaId ?? null);
    record.guestArenaId = await guest.evaluate(() => document.documentElement.dataset.arenaId ?? null);

    // ---- Guest spawn trace (F4 evidence) ----------------------------------
    record.guestSpawnTrace = [];
    for (let tick = 0; tick < 5; tick += 1) {
      record.guestSpawnTrace.push(await guest.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          alive: snapshot.player.alive, hp: snapshot.player.hp, deaths: snapshot.player.deaths,
          pos: snapshot.player.position.map((value) => Number(value.toFixed(2))),
        };
      }));
      await guest.waitForTimeout(400);
    }

    // ---- F1/F4 movement: W then D, real keys, both roles ------------------
    record.hostMoveW = await measureAxis(host, 'KeyW');
    record.guestMoveW = await measureAxis(guest, 'KeyW');
    record.hostMoveD = await measureAxis(host, 'KeyD');
    record.guestMoveD = await measureAxis(guest, 'KeyD');
    const gateOf = (page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
    if (record.guestMoveW.movedM < MOVE_THRESHOLD_M || record.guestMoveD.movedM < MOVE_THRESHOLD_M) {
      record.guestGate = await gateOf(guest);
      record.guestStateAdmissionDrops = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().stateAdmissionDrops ?? null).catch(() => null);
    }
    if (record.hostMoveW.movedM < MOVE_THRESHOLD_M || record.hostMoveD.movedM < MOVE_THRESHOLD_M) {
      record.hostGate = await gateOf(host);
    }
    const movedOk = (probe) => probe && probe.movedM >= MOVE_THRESHOLD_M;

    // ---- F5 shoot/reload on the guest -------------------------------------
    await fireReloadProbe(guest, record);

    // ---- F6 chopper: baseline cadence, activate on host, measure GUEST ----
    record.chopperBaselineGuest = await frameCadence(guest, 4000);
    const activation = await host.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const position = debug.snapshot().player.position.map((value) => Math.round(value));
      // earnSupport() returns void (legacy-main.ts:29416): eligibility cannot be
      // read from its return value. Grant, activate, and let the liveness gate
      // below plus the admission receipt decide whether the streak came up.
      debug.earnSupport?.(12);
      const receipt = debug.activateKillstreakWithReceipt?.('chopper', position, [0, 0, -1]) ?? null;
      return { earned: true, receipt };
    }).catch((error) => ({ error: String(error).slice(0, 160) }));
    record.chopperActivation = activation;
    let chopperLive = false;
    if (activation.earned) {
      try {
        for (const page of [host, guest]) {
          await page.waitForFunction(() => {
            const entities = window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak?.entities ?? [];
            return entities.some((entity) => entity.kind === 'chopper' && entity.expiresInMs > 0);
          }, undefined, { timeout: 20_000 });
        }
        chopperLive = true;
      } catch { chopperLive = false; }
    }
    record.chopperLiveOnBoth = chopperLive;
    if (chopperLive) {
      // Nobody possesses the chopper here: AI-operated by default, which IS the
      // owner scenario ("flying and I am not controlling it").
      record.chopperCadenceGuest = await frameCadence(guest, CHOPPER_SAMPLE_MS);
      record.chopperPossessionGuest = await guest.evaluate(() => (
        window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak?.actors
          ?.some((actor) => actor.possession != null) ?? null));
      await guest.screenshot({ path: resolve(SHOT_DIR, `${tag}-guest-chopper.png`) });
      await host.screenshot({ path: resolve(SHOT_DIR, `${tag}-host-chopper.png`) });
    }

    // ---- Active-match screenshot for visual reading ------------------------
    await guest.screenshot({ path: resolve(SHOT_DIR, `${tag}-guest-active.png`) });

    record.ok = record.hostArenaId === lane.arena
      && record.guestArenaId === lane.arena
      && movedOk(record.hostMoveW) && movedOk(record.guestMoveW)
      && movedOk(record.hostMoveD) && movedOk(record.guestMoveD);

    // ---- Per-fault classification (facts first, criteria stated) ----------
    const restricted = (probe, gateState) => probe.movedM < MOVE_THRESHOLD_M
      && gateState && gateState.inputEnabled === true && gateState.simulationEnabled === true && gateState.alive === true;
    const anyRestricted = restricted(record.guestMoveW, record.guestGate) || restricted(record.hostMoveW, record.hostGate)
      || restricted(record.guestMoveD, record.guestGate) || restricted(record.hostMoveD, record.hostGate);
    record.faults.f1_moveRestricted = anyRestricted ? 'REPRODUCED' : 'NOT-REPRODUCED';
    // F2: a start while a guest was connected-but-not-ready is unambiguous.
    // Starting with ZERO guests is recorded as data (stage A); it may be an
    // intentional solo-host capability, so it alone does not set the verdict.
    record.faults.f2_earlyStart = record.f2_startedBeforeReady ? 'REPRODUCED' : 'NOT-REPRODUCED';
    // Typing fault = real keystrokes never reach a lobby text field. Chat SEND
    // visibility is recorded but not classified: delivery has gates of its own.
    const chatOk = (probe) => probe.typeEchoed === true;
    record.faults.f3_typing = (!record.f3_roomInput.match || !chatOk(record.f3_chatPopulated)) ? 'REPRODUCED' : 'NOT-REPRODUCED';
    if (lane.arena === 'rustworks-1v1') {
      record.faults.f4_rustrigSpawnMove = (record.guestMoveW.movedM < MOVE_THRESHOLD_M || record.hostMoveW.movedM < MOVE_THRESHOLD_M)
        ? 'REPRODUCED' : 'NOT-REPRODUCED';
    } else {
      record.faults.f4_rustrigSpawnMove = 'N/A-this-lane';
    }
    {
      const shotsDead = record.fireTrials?.every((trial) => trial.before.ammo === trial.afterBurst.ammo) ?? null;
      const reloadBroken = record.fireTrials?.some((trial) => trial.reload && !trial.reload.restored) ?? false;
      record.faults.f5_shootReload = (shotsDead || reloadBroken) ? 'REPRODUCED' : 'NOT-REPRODUCED';
    }
    if (record.chopperActivation.earned === false || record.chopperLiveOnBoth === false) {
      record.faults.f6_chopperLag = 'COULD-NOT-VERIFY';
    } else {
      const base = record.chopperBaselineGuest;
      const load = record.chopperCadenceGuest;
      const dropRatio = base.fpsMedian > 0 ? 1 - load.fpsMedian / base.fpsMedian : 0;
      // Criteria fixed BEFORE the run: laggy = median below 45 fps OR >35% drop.
      record.faults.f6_chopperLag = (load.fpsMedian < 45 || dropRatio > 0.35) ? 'REPRODUCED' : 'NOT-REPRODUCED';
      record.chopperDropRatio = Number(dropRatio.toFixed(2));
    }
  } catch (error) {
    record.error = String(error).slice(0, 300);
    record.faults.runFailed = true;
  } finally {
    await host?.close().catch(() => {});
    await guest?.close().catch(() => {});
  }
  lanes.push(record);
  console.error(`[p79-matrix] ${tag}: ok=${record.ok}`
    + ` moveW h=${record.hostMoveW?.movedM ?? '?'} g=${record.guestMoveW?.movedM ?? '?'}`
    + ` | ${JSON.stringify(record.faults)}${record.error ? ` | ERROR ${record.error}` : ''}`);
}

await browser.close();
peerProcess?.kill();

writeFileSync(resolve(SHOT_DIR, 'matrix-results.json'), `${JSON.stringify({ backend: 'webgpu', thresholdM: MOVE_THRESHOLD_M, lanes }, null, 2)}\n`);

// Aggregate verdict per fault across lanes.
const aggregate = {};
for (const key of ['f1_moveRestricted', 'f2_earlyStart', 'f3_typing', 'f5_shootReload', 'f6_chopperLag']) {
  aggregate[key] = lanes.some((lane) => lane.faults[key] === 'REPRODUCED') ? 'REPRODUCED'
    : lanes.every((lane) => lane.faults[key] != null) ? 'NOT-REPRODUCED' : 'INCOMPLETE';
}
aggregate.f4_rustrigSpawnMove = lanes
  .filter((lane) => lane.arena === 'rustworks-1v1')
  .some((lane) => lane.faults.f4_rustrigSpawnMove === 'REPRODUCED') ? 'REPRODUCED'
  : lanes.some((lane) => lane.arena === 'rustworks-1v1') ? 'NOT-REPRODUCED' : 'INCOMPLETE';

console.log(JSON.stringify({ verdict: aggregate, lanes }, null, 2));
process.exit(Object.values(aggregate).includes('INCOMPLETE') ? 2 : 0);
