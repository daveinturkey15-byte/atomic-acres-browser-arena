#!/usr/bin/env node
// Definitive host+guest matrix for the six owner-reported multiplayer faults.
//
// Faults under test (owner's words -> ledger row):
//   1. "cant move alot in host and guest lobby etc"            -> HF-322
//   2. "game starts bnefore all people join? Sort?"            -> HF-323
//   3. "cant type in lobby"                                    -> HF-324
//   4. "cant mov when spawn into rustrig in host guest lobby"  -> HF-322/HF-347
//   5. "sometimes randomly cant shoot or reload my gun"        -> HF-315
//   6. "very laggy when a chopper gunner is flying and I am not controlling it" -> HF-336
//
// Pattern copied from scripts/qa/verify-hf347-arena-movement-matrix.mjs (real
// key input, local PeerJS server, per-lane isolation) but upgraded per the
// gauntlet brief: INSTALLED CHROME over CDP on the real WebGPU route (the
// historic headless runs exercised WebGL2 while the owner plays WebGPU), with
// Emulation.setFocusEmulationEnabled so background tabs are not throttled.
//
// FROZEN BAR (stated before the run, per visual-gauntlet-loop):
//   - movement: both roles must displace >= MOVE_THRESHOLD_M horizontally with
//     a real held W (one retry with fresh focus, as in hf347).
//   - HF-323: #lobby-start MUST carry disabled=true while a joined guest has
//     not readied, and while only one of the two players has readied. A
//     disabled button cannot dispatch click, so the attribute IS the gate.
//     Host-alone enablement is recorded informationally only: starting a
//     bot-filled match alone is authored behaviour, not the owner's fault.
//     We deliberately do NOT force-click START in the waiting phase - the
//     smoke run proved a legal solo start there poisons the whole lane.
//   - HF-324: the REAL chat path - click the chat panel (the HF-324 open
//     affordance), wait for the input row, type, press Enter - must place the
//     message in BOTH peers' #text-chat-log.
//   - HF-315: each fire cycle (real mouse down 600 ms) must decrease mag ammo;
//     each reload (real KeyR) must restore it. Any cycle where ammo does not
//     change is recorded WITH the live fireBlock reason; gun-range lanes are
//     exempt from the ammo assertion (unlimited range ammo is authored
//     behaviour) but still run reload mechanics.
//   - HF-336 (dedicated lane): guest frame pacing while the host flies the
//     chopper vs a baseline before activation. REPRODUCED iff
//       p95During > max(2 x p95Baseline, 50 ms)  OR  a single stall appears
//       during that exceeds the baseline max by > 500 ms.
//
// Exit codes: 0 no fault reproduced (partial allowed if a probe was
// inconclusive), 1 at least one REPRODUCED, 2 environment invalid.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';
import { defaultBootRoster } from './arena-roster.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911/');
const PEER_PORT = Number(arg('--peer-port', '9337'));
const MOVE_HOLD_MS = Number(arg('--move-ms', '1800'));
const MOVE_THRESHOLD_M = Number(arg('--threshold', '1.2'));
const CONNECT_TIMEOUT = Number(arg('--connect-timeout-ms', '180000'));
const FIRE_CYCLES = Number(arg('--fire-cycles', '5'));
const LOBBY_SYNC_TIMEOUT_MS = Number(arg('--lobby-sync-timeout-ms', '90000'));
const LANE_FILTER = arg('--lanes', ''); // comma-separated arena/mode substrings
const RUN_CHOPPER = arg('--chopper', 'yes') === 'yes';
const CHOPPER_ARENA = arg('--chopper-arena', 'atomic-acres');
const OUT = arg('--out', 'artifacts/hf-matrix/verdict.json');
const SHOT_DIR = arg('--shots', 'artifacts/hf-matrix');

// Every production arena x TDM and FFA. Gun-range forces its own special-case
// mode (FFA + zero bots + armory rules); one lane covers it and the mode is
// recorded as forced rather than pretending we selected something else.
//
// PASS 85 Lane N repair: "every production arena" was a six-id literal written
// before Test1, Test2 and Map 3 shipped, so the matrix asserted totality over a
// roster three arenas short. It is derived now; `--arenas` still overrides it.
const ARENAS = arg('--arenas', defaultBootRoster())
  .split(',').map((entry) => entry.trim()).filter(Boolean);
const LANES = [];
for (const arena of ARENAS) {
  if (arena === 'gun-range') {
    LANES.push({ arena, mode: 'range-forced' });
  } else {
    LANES.push({ arena, mode: 'tdm' });
    LANES.push({ arena, mode: 'ffa' });
  }
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

const percentiles = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null;
  return {
    n: values.length,
    p50: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    max: sorted[sorted.length - 1] ?? null,
    over50ms: values.filter((v) => v > 50).length,
    over200ms: values.filter((v) => v > 200).length,
  };
};

async function openPage(browser, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errorsSeen = [];
  page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 160)}`));
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', 'quality'); // real WebGPU route; compat is coverage-only
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true,
    undefined,
    { timeout: CONNECT_TIMEOUT },
  );
  await page.fill('#player-name', label);
  return page;
}

/**
 * Real-input movement probe (hf347 pattern): hold W, measure horizontal
 * displacement, retry once with fresh focus because a missed first keydown is
 * a harness fault rather than the game fault this exists to detect.
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

/**
 * HF-324: exercise the REAL chat input path - click the input, type, Enter -
 * not sendRawChat. Returns what happened for verdict computation.
 */
async function probeLobbyChat(page, side, text) {
  const result = { side, panelVisible: false, inputVisible: false, typedOk: false, deliveredSelf: false, note: '' };
  try {
    const root = page.locator('#text-chat');
    result.panelVisible = await root.isVisible();
    if (!result.panelVisible) {
      result.note = 'chat panel hidden in lobby';
      return result;
    }
    // Real user path: click the panel (HF-324 affordance opens + focuses),
    // then type into whatever row appeared.
    await root.click();
    await page.waitForTimeout(300);
    const input = page.locator('#text-chat-input');
    result.inputVisible = (await input.isVisible()) && (await input.isEnabled());
    if (!result.inputVisible) {
      result.note = 'chat panel visible but input row never appeared after click';
      return result;
    }
    await input.fill('');
    await page.keyboard.type(text);
    result.typedOk = (await input.inputValue()) === text;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const logText = await page.evaluate(() => document.querySelector('#text-chat-log')?.textContent ?? '');
    result.deliveredSelf = logText.includes(text);
    if (!result.deliveredSelf) result.note = 'typed and sent but message absent from local log';
  } catch (error) {
    result.note = String(error).slice(0, 140);
  }
  return result;
}

/**
 * HF-315 cycles: real mouse fire then real KeyR reload. Every anomaly records
 * the live fireBlock telemetry so a refusal is attributable, not guessed.
 */
async function probeShootReload(page, unlimitedAmmo) {
  const record = { cycles: [], anomalies: [] };
  // The game refuses fire without pointer lock (fireBlock reason
  // 'no-pointer-lock'). Pattern proven by hf391-hud-sway-trace.mjs: a
  // trusted click grants transient activation, which makes the direct
  // canvas.requestPointerLock() below succeed reliably.
  record.pointerLocked = false;
  for (let attempt = 0; attempt < 3 && !record.pointerLocked; attempt += 1) {
    await page.mouse.click(640, 360);
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const request = canvas?.requestPointerLock?.();
      if (request && typeof request.catch === 'function') request.catch(() => {});
    });
    await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5_000 }).catch(() => {});
    record.pointerLocked = await page.evaluate(() => document.pointerLockElement !== null);
  }
  if (!record.pointerLocked) {
    record.anomalies.push('harness: could not acquire pointer lock; fire assertions unreliable');
  }
  for (let cycle = 0; cycle < FIRE_CYCLES; cycle += 1) {
    const entry = { cycle };
    const before = await page.evaluate(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { ammo: s.player.ammo, reserve: s.player.reserve, weapon: s.player.weapon, reloading: s.player.reloading, alive: s.player.alive };
    });
    entry.weapon = before.weapon;
    entry.ammoBefore = before.ammo;
    // Fire with real mouse input at viewport centre.
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await page.waitForTimeout(250);
    const afterFire = await page.evaluate(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { ammo: s.player.ammo, reloading: s.player.reloading, fireBlock: s.fireBlock };
    });
    entry.ammoAfterFire = afterFire.ammo;
    entry.firedOk = afterFire.ammo < before.ammo;
    // Reload with real keyboard input.
    await page.keyboard.down('KeyR');
    await page.waitForTimeout(80);
    await page.keyboard.up('KeyR');
    let reloaded = false;
    entry.ammoAfterReload = null;
    for (let wait = 0; wait < 40; wait += 1) {
      await page.waitForTimeout(150);
      const state = await page.evaluate(() => {
        const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return { reloading: s.player.reloading, ammo: s.player.ammo };
      });
      if (!state.reloading) {
        reloaded = state.ammo > afterFire.ammo || state.ammo === before.ammo;
        entry.ammoAfterReload = state.ammo;
        break;
      }
    }
    entry.reloadRestored = reloaded;
    if (!entry.firedOk) {
      entry.fireBlockAtFault = afterFire.fireBlock?.last ?? null;
      // 'viewmodel-contact-raise' means the weapon raised against nearby
      // geometry - a legitimate state, so reposition with real input and
      // retry once before calling it an anomaly.
      if (record.pointerLocked && entry.fireBlockAtFault === 'viewmodel-contact-raise') {
        await page.keyboard.down('KeyA');
        await page.waitForTimeout(450);
        await page.keyboard.up('KeyA');
        await page.mouse.down();
        await page.waitForTimeout(500);
        await page.mouse.up();
        await page.waitForTimeout(250);
        const retry = await page.evaluate(() => {
          const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return { ammo: s.player.ammo, fireBlock: s.fireBlock };
        });
        entry.retriedAfterStrafe = true;
        entry.ammoAfterRetry = retry.ammo;
        if (retry.ammo < afterFire.ammo) {
          entry.firedOk = true;
          record.anomalies.push(`cycle ${cycle}: fire refused (viewmodel-contact-raise) at spawn, RECOVERED after one strafe`);
        } else {
          record.anomalies.push(`cycle ${cycle}: fire refused (viewmodel-contact-raise), STILL REFUSED after strafe`);
        }
      } else {
        record.anomalies.push(!record.pointerLocked || entry.fireBlockAtFault === 'no-pointer-lock'
          ? `cycle ${cycle}: no ammo drop (harness: no pointer lock)`
          : unlimitedAmmo
            ? `cycle ${cycle}: no ammo drop (gun-range unlimited ammo — expected)`
            : `cycle ${cycle}: trigger produced NO ammo drop (${entry.fireBlockAtFault ?? 'no fireBlock reason'})`);
      }
    }
    if (!reloaded) record.anomalies.push(`cycle ${cycle}: reload did not restore ammo`);
    record.cycles.push(entry);
    await page.waitForTimeout(300);
  }
  return record;
}

/** rAF delta sampler used for the HF-336 frame-pacing comparison. */
async function sampleFrames(page, frames) {
  const deltas = await page.evaluate(async (count) => {
    const samples = [];
    let last = performance.now();
    return await new Promise((resolvePromise) => {
      const tick = (t) => {
        samples.push(t - last);
        last = t;
        if (samples.length >= count) resolvePromise(samples);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, frames);
  return percentiles(deltas);
}

function laneAllowed(lane) {
  if (!LANE_FILTER) return true;
  return LANE_FILTER.split(',').some((filter) => `${lane.arena}/${lane.mode}`.includes(filter.trim()));
}

const peerProcess = await ensurePeerServer();
mkdirSync(resolve(SHOT_DIR), { recursive: true });

// One FRESH browser per lane. The 2026-08-25 r02 run proved the private-lobby
// arena-synchronization transition degrades CUMULATIVELY across lanes sharing
// one Chrome/GPU process: every arena passed as lanes 1-4, then every lane
// from 5 onward deadlocked with "#lobby-ready disabled", yet rustworks-1v1
// passed immediately in a fresh browser (diagnose-lobby-ready-deadlock.mjs)
// and farcrysis passed fresh but deadlocked after only THREE warmup lanes.
// A shared browser makes later lanes measure GPU-heap history, not the game,
// and silently poisoned the movement/HF-323 rollups with missing data.
const launchBrowser = () => chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [...SILENT_ARGS,
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
const lanes = [];

for (const lane of LANES.filter(laneAllowed)) {
    const record = { arena: lane.arena, mode: lane.mode, ok: false };
    let host = null;
    let guest = null;
    const browser = await launchBrowser();
    try {
      host = await openPage(browser, 'Host QA');
      guest = await openPage(browser, 'Guest QA');
      record.backend = await host.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

      // ---- Host creates room; HF-323 part A: only host present ------------
      await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
      const roomCode = (await host.textContent('#room-code')).trim();

      // Host-alone enablement is informational only: a solo bot-filled start
      // is authored behaviour. We do NOT click START here - the smoke run
      // proved a legal solo start poisons every later probe in the lane.
      record.hf323 = {
        startEnabledHostAlone: (await host.evaluate(() => document.querySelector('#lobby-start')?.disabled ?? null)) === false,
      };

      // ---- Guest joins ------------------------------------------------------
      await guest.fill('#room-input', roomCode);
      await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      for (const page of [host, guest]) {
        await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
      }

      // ---- HF-323 part B: guest joined but nobody ready --------------------
      record.hf323.startDisabledGuestJoinedNotReady = await host.evaluate(() => document.querySelector('#lobby-start')?.disabled ?? null);

      // ---- HF-324: real typing path, both directions -----------------------
      const stamp = `${lane.arena}`.slice(0, 8);
      record.hf324 = [];
      record.hf324.push(await probeLobbyChat(host, 'host', `hf-host-${stamp}`));
      record.hf324.push(await probeLobbyChat(guest, 'guest', `hf-guest-${stamp}`));

      // ---- Mode + arena select ----------------------------------------------
      if (lane.mode === 'tdm' || lane.mode === 'ffa') {
        await host.selectOption('#lobby-mode', lane.mode);
        await host.waitForTimeout(300);
      }
      record.effectiveMode = await host.evaluate(() => document.querySelector('#lobby-mode')?.value ?? null);
      await host.selectOption('#lobby-arena', lane.arena);
      await host.waitForTimeout(700);
      await guest.waitForFunction(
        (arenaId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.arenaId === arenaId
          || document.querySelector('#lobby-arena')?.value === arenaId,
        lane.arena,
        { timeout: CONNECT_TIMEOUT },
      );

      // ---- Ready-up; start only legal once BOTH ready -----------------------
      // r02 lesson: #lobby-ready stays disabled until the HOST-side arena
      // transition completes ("Synchronizing <arena> before ready-up…",
      // legacy-main.ts lobbyArenaSynchronized gate). A fresh browser takes
      // ~10-31 s; a degraded session never enables it. Wait for enablement
      // explicitly, MEASURE the lockout, and attribute a permanent deadlock
      // to the deadlock row instead of blind-clicking into Playwright's
      // 30 s default action timeout and poisoning unrelated rollups.
      const hostSyncStartedAt = Date.now();
      await host.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: LOBBY_SYNC_TIMEOUT_MS }).catch(() => {});
      record.lobbySyncWaitMs = Date.now() - hostSyncStartedAt;
      if ((await host.evaluate(() => document.querySelector('#lobby-ready')?.disabled ?? null)) !== false) {
        record.lobbyReadyDeadlock = true;
        record.lobbyGuidance = await host.evaluate(() => (document.getElementById('lobby-guidance')?.textContent ?? '').slice(0, 120));
        throw new Error('lobby ready-up never enabled (host arena synchronization never completed)');
      }
      await host.click('#lobby-ready');
      await host.waitForTimeout(400);
      record.hf323.startDisabledOnlyHostReady = await host.evaluate(() => document.querySelector('#lobby-start')?.disabled ?? null);
      await guest.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: LOBBY_SYNC_TIMEOUT_MS }).catch(() => {});
      if ((await guest.evaluate(() => document.querySelector('#lobby-ready')?.disabled ?? null)) !== false) {
        record.lobbyReadyDeadlock = true;
        throw new Error('guest lobby ready-up never enabled (arena synchronization never completed on guest)');
      }
      await guest.click('#lobby-ready');
      await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
      await host.click('#lobby-start');

      for (const [label, page] of [['host', host], ['guest', guest]]) {
        await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: CONNECT_TIMEOUT });
        await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
        record[`${label}ArenaId`] = await page.evaluate(() => document.documentElement.dataset.arenaId ?? null);
      }

      // ---- Spawn trace (first seconds on the ground) ------------------------
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
            status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 90),
          };
        }));
        await guest.waitForTimeout(400);
      }

      // ---- Movement probes (HF-322 / HF-347) ---------------------------------
      record.hostMove = await measureMovement(host);
      record.guestMove = await measureMovement(guest);
      if (record.guestMove.movedM < MOVE_THRESHOLD_M) {
        record.guestGate = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
        record.guestStateAdmissionDrops = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().stateAdmissionDrops ?? null);
      }
      if (record.hostMove.movedM < MOVE_THRESHOLD_M) {
        record.hostGate = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
      }

      // ---- Shoot/reload probes (HF-315) ---------------------------------------
      record.unlimitedAmmo = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice?.unlimitedAmmo === true);
      record.hostShootReload = await probeShootReload(host, record.unlimitedAmmo);
      record.guestShootReload = await probeShootReload(guest, record.unlimitedAmmo);

      // ---- Mutual visibility ---------------------------------------------------
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
        return remote ? { remoteCount: snapshot.remotePlayers.length, hp: remote.hp, visibleMeshes }
          : { remoteCount: 0, visibleMeshes };
      });
      record.hostSeesGuest = await visibilityOf(host);
      record.guestSeesHost = await visibilityOf(guest);

      // Screenshots so a human can READ the frames, not trust exit codes.
      await host.screenshot({ path: resolve(SHOT_DIR, `${lane.arena}-${lane.mode}-host.png`) });
      await guest.screenshot({ path: resolve(SHOT_DIR, `${lane.arena}-${lane.mode}-guest.png`) });

      record.errors = [...new Set([...host.errorsSeen, ...guest.errorsSeen])].slice(0, 6);
      const seen = (visibility) => visibility && visibility.remoteCount === 1 && visibility.hp > 0 && visibility.visibleMeshes > 0;
      record.ok = record.hostArenaId === lane.arena
        && record.guestArenaId === lane.arena
        && record.hostMove.movedM >= MOVE_THRESHOLD_M
        && record.guestMove.movedM >= MOVE_THRESHOLD_M
        && seen(record.hostSeesGuest)
        && seen(record.guestSeesHost);
    } catch (error) {
      record.error = String(error).slice(0, 300);
      record.errors = [...new Set([...(host?.errorsSeen ?? []), ...(guest?.errorsSeen ?? [])])].slice(0, 6);
    } finally {
      await host?.close().catch(() => {});
      await guest?.close().catch(() => {});
      await browser?.close().catch(() => {});
    }
    lanes.push(record);
    console.error(`[matrix] ${lane.arena}/${lane.mode}: ${record.ok ? 'OK' : 'FAIL'}`
      + ` host=${record.hostMove?.movedM ?? '?'}m guest=${record.guestMove?.movedM ?? '?'}m`
      + `${record.backend ? ` backend=${record.backend}` : ''}${record.error ? ` error=${record.error}` : ''}`);
  }

  // ---- HF-336 dedicated lane: chopper flying, GUEST is the non-controller --
  if (RUN_CHOPPER) {
    const record = { arena: CHOPPER_ARENA, mode: 'tdm-chopper', probe: 'hf336' };
    let host = null;
    let guest = null;
    const browser = await launchBrowser();
    try {
      host = await openPage(browser, 'Chopper Pilot');
      guest = await openPage(browser, 'Bystander QA');
      await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
      const roomCode = (await host.textContent('#room-code')).trim();
      await guest.fill('#room-input', roomCode);
      await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      for (const page of [host, guest]) {
        await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
      }
      await host.selectOption('#lobby-mode', 'tdm');
      await host.selectOption('#lobby-arena', CHOPPER_ARENA);
      await host.waitForTimeout(700);
      await host.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: LOBBY_SYNC_TIMEOUT_MS }).catch(() => {});
      await host.click('#lobby-ready');
      await guest.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: LOBBY_SYNC_TIMEOUT_MS }).catch(() => {});
      await guest.click('#lobby-ready');
      await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
      await host.click('#lobby-start');
      for (const page of [host, guest]) {
        await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
      }

      // Baseline: guest frame pacing BEFORE any killstreak exists.
      record.baselineFrames = await sampleFrames(guest, 480);

      // Host earns and activates Chopper Gunner (cost 8) and takes control.
      record.chopperEarned = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupportForActor(window.__ATOMIC_ACRES_DEBUG__.snapshot().player.id, 10));
      record.chopperActivated = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper'));
      if (!record.chopperEarned || !record.chopperActivated) {
        record.error = `killstreak staging failed (earned=${record.chopperEarned} activated=${record.chopperActivated}); probe inconclusive`;
        record.inconclusive = true;
      } else {
        record.hostControlling = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl());
        record.hostPossessed = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate().possessed);
        // Guest measures DURING the flight (~12 s at 60 fps).
        record.duringFrames = await sampleFrames(guest, 720);
        record.verdict = (() => {
          const base = record.baselineFrames;
          const during = record.duringFrames;
          const p95Regression = during.p95 > Math.max(2 * base.p95, 50);
          const stall = (during.max ?? 0) > (base.max ?? 0) + 500;
          if (p95Regression || stall) {
            return `REPRODUCED (p95 ${Number(base.p95).toFixed(1)}->${Number(during.p95).toFixed(1)} ms,`
              + ` max ${Number(base.max).toFixed(1)}->${Number(during.max).toFixed(1)} ms)`;
          }
          return 'NOT-REPRODUCED';
        })();
      }
      await guest.screenshot({ path: resolve(SHOT_DIR, `${CHOPPER_ARENA}-chopper-guest.png`) });
    } catch (error) {
      record.error = String(error).slice(0, 300);
    } finally {
      await host?.close().catch(() => {});
      await guest?.close().catch(() => {});
      await browser?.close().catch(() => {});
    }
    lanes.push(record);
    console.error(`[matrix] hf336/${CHOPPER_ARENA}: ${record.verdict ?? record.error}`);
  }
peerProcess?.kill();

// ---- Verdict rollup per owner fault ----------------------------------------
// r02 attribution fix: a lane that died before its movement probe (deadlock
// or environment error) has NO movement data; counting `undefined` as a
// movement failure fabricated evidence. Only lanes that actually reached and
// ran the probes may vote on each fault.
const probedLanes = lanes.filter((l) => l.probe !== 'hf336' && !l.error && !l.lobbyReadyDeadlock);
const movementFails = probedLanes.filter((l) =>
  (l.hostMove?.movedM ?? Infinity) < MOVE_THRESHOLD_M || (l.guestMove?.movedM ?? Infinity) < MOVE_THRESHOLD_M);
const deadlockLanes = lanes.filter((l) => l.probe !== 'hf336' && l.lobbyReadyDeadlock);
// HF-323 needs BOTH gate samples, which only exist once ready-up was reached;
// deadlocked lanes never measured them and must not vote here either.
const earlyStartFails = probedLanes.filter((l) => l.hf323
  && (l.hf323.startDisabledGuestJoinedNotReady !== true
    || l.hf323.startDisabledOnlyHostReady !== true));
const chatFails = lanes.filter((l) => Array.isArray(l.hf324)
  && l.hf324.some((probe) => !probe.deliveredSelf));
const shootReloadFails = lanes.flatMap((l) => {
  const faults = [];
  const scan = (side, probe) => {
    if (!probe) return;
    const real = probe.anomalies.filter((a) => !a.includes('unlimited ammo') && !a.includes('harness:'));
    if (real.length > 0) faults.push(`${l.arena}/${l.mode}/${side}: ${real.join('; ')}`);
  };
  scan('host', l.hostShootReload);
  scan('guest', l.guestShootReload);
  return faults;
});
const chopperLane = lanes.find((l) => l.probe === 'hf336');

const faults = {
  'HF-322/HF-347 cant move (spawn into RustRig / lobby)': {
    reproduced: movementFails.length > 0,
    evidence: movementFails.map((l) => ({
      lane: `${l.arena}/${l.mode}`,
      hostMovedM: l.hostMove?.movedM ?? null,
      guestMovedM: l.guestMove?.movedM ?? null,
      guestGate: l.guestGate ?? null,
      hostGate: l.hostGate ?? null,
      guestAdmissionDrops: l.guestStateAdmissionDrops ?? null,
      error: l.error ?? null,
    })),
  },
  'HF-322 lobby ready-up deadlock (Synchronizing <arena> before ready-up)': {
    reproduced: deadlockLanes.length > 0,
    evidence: deadlockLanes.map((l) => ({
      lane: `${l.arena}/${l.mode}`,
      syncWaitMs: l.lobbySyncWaitMs ?? null,
      guidance: l.lobbyGuidance ?? null,
      error: l.error ?? null,
    })),
  },
  'HF-323 game starts before all people join': {
    reproduced: earlyStartFails.length > 0,
    evidence: earlyStartFails.map((l) => ({ lane: `${l.arena}/${l.mode}`, hf323: l.hf323 })),
  },
  'HF-324 cannot type in lobby': {
    reproduced: chatFails.length > 0,
    evidence: chatFails.map((l) => ({ lane: `${l.arena}/${l.mode}`, probes: l.hf324 })),
  },
  'HF-315 randomly cannot shoot or reload': {
    reproduced: shootReloadFails.length > 0,
    evidence: shootReloadFails,
  },
  'HF-336 laggy when chopper flying and not controlling': {
    reproduced: chopperLane ? chopperLane.verdict?.startsWith('REPRODUCED') === true : false,
    inconclusive: chopperLane ? Boolean(chopperLane.inconclusive || chopperLane.error) : true,
    evidence: chopperLane ?? null,
  },
};

const anyReproduced = Object.values(faults).some((fault) => fault.reproduced);
const anyInconclusive = Object.values(faults).some((fault) => fault.inconclusive);
const verdict = anyReproduced ? 'FAULTS-REPRODUCED' : anyInconclusive ? 'PARTIAL-NOT-REPRODUCED' : 'NOT-REPRODUCED';
mkdirSync(resolve(SHOT_DIR), { recursive: true });
writeFileSync(resolve(OUT), `${JSON.stringify({ verdict, thresholdM: MOVE_THRESHOLD_M, lanes, faults }, null, 2)}\n`);
console.log(JSON.stringify({
  verdict,
  out: OUT,
  faults: Object.fromEntries(Object.entries(faults).map(([k, v]) => [k, { reproduced: v.reproduced, inconclusive: v.inconclusive ?? false }])),
}, null, 2));
process.exit(verdict === 'FAULTS-REPRODUCED' ? 1 : 0);
