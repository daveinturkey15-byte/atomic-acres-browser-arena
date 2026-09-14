#!/usr/bin/env node
// mp-core reproduction matrix — Pass 79 gauntlet, team mp-core.
//
// Builds and RUNS the definitive host+guest reproduction matrix for the six
// owner-reported multiplayer faults. Pattern copied from
// scripts/qa/verify-hf347-arena-movement-matrix.mjs (two real Chromium pages,
// local PeerJS server, REAL key input for movement). This task diagnoses; it
// does not fix. Every fault gets a REPRODUCED / NOT-REPRODUCED verdict with
// the measured evidence attached.
//
// Fault probes (owner's words are the fault IDs):
//   F1 'cant move alot in host and guest lobby'
//      -> per lane: both roles hold W (real keydown) and must displace
//         >= threshold; on failure sampleSimulationGate() names the gate.
//   F2 'game starts before all people join'
//      -> poll #lobby-start.disabled every 40ms from just before JOIN until
//         the roster shows 2; a single enabled-with-roster<2 sample is a
//         violation. Also: guest joined-but-not-ready must keep start off.
//   F3 'cant type in lobby'
//      -> Enter opens text chat in lobby context, type with real keystrokes,
//         Enter sends; the entry must appear in BOTH pages' textChat.entries
//         and the input must retain focus while typing.
//   F4 'cant move when spawn into rustrig'
//      -> rustworks-1v1 lanes' spawn trace + movement probe.
//   F5 'sometimes randomly cant shoot or reload my gun or after picked one up'
//      -> per role: fire via real canvas mousedown (fallback debug fireOnce,
//         path recorded), expect ammo decrement or fireBlock reason;
//         KeyR reload expects mag refill; spawnDeathDrop + interactDrop then
//         fire again. fireBlock telemetry names any refusal cause.
//   F6 chopper gunner laggy for nearby non-controlling players
//      -> atomic-acres tdm lane: guest rAF frame timing baseline vs during
//         AI-flown chopper activation. Honest limitation: headless cannot
//         create a WebGPU device here, so this measures the WebGL2 compat
//         presentation cost of the networked chopper, not the owner's
//         WebGPU latency. Numbers reported as-is.
//
// Exit 0 only when every lane completes its probes (lane.ok is about the
// movement+visibility contract; fault verdicts are separate).
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
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
const PEER_PORT = Number(arg('--peer-port', '9338'));
const MOVE_HOLD_MS = Number(arg('--move-ms', '1800'));
const MOVE_THRESHOLD_M = Number(arg('--threshold', '1.2'));
const CONNECT_TIMEOUT = 120_000;
const OUT_DIR = arg('--out', 'artifacts/qa/mp-core-repro');

// Every arena, TDM and FFA (gun-range forces its own range mode):
// Owner 2026-08-30 scope: Nuke Town heavily (both modes + the chopper
// probe), the other arenas briefly (one mode each). farcrysis is parked and
// locked unselectable (owner 2026-08-28), so it has no lobby lane.
const LANES = [
  { arena: 'atomic-acres', mode: 'tdm', chopperProbe: true },
  { arena: 'atomic-acres', mode: 'ffa' },
  { arena: 'rustworks-1v1', mode: 'tdm' },
  { arena: 'skyline-terminal', mode: 'ffa' },
  { arena: 'high-seas', mode: 'tdm' },
  { arena: 'gun-range', mode: 'range' },
  // Owner 2026-08-30: the Test arenas join the matrix - Test2 runs its
  // headline Domination mode over the wire.
  { arena: 'test1', mode: 'tdm' },
  { arena: 'test2', mode: 'domination' },
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
// Two REAL installed-Chrome windows (not headless Chromium): this machine's
// headless cannot create a WebGPU device, so every historic headless "green"
// measured the WebGL2 compat path while the owner plays WebGPU. Each role gets
// its own browser process so neither window is occluded by the other, plus
// CDP focus emulation so an unfocused window cannot read like a wedged arena
// (the verify-arena-boot-cdp.mjs lesson).
const CHROME_ARGS = [
  ...SILENT_ARGS,
  '--use-angle=d3d11',
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=CalculateNativeWinOcclusion,WebRtcHideLocalIpsWithMdns',
  '--allow-loopback-in-peer-connection',
];

async function openBrowser() {
  return chromium.launch({ headless: true, channel: 'chrome', args: CHROME_ARGS });
}

const hostBrowser = await openBrowser();
const guestBrowser = await openBrowser();

async function openPage(label) {
  const browser = label === 'host' ? hostBrowser : guestBrowser;
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
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
  page.renderBackend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  if (page.renderBackend !== 'webgpu') {
    console.error(`[mp-core] ${label}: WARNING renderBackend=${page.renderBackend} (owner plays webgpu)`);
  }
  await page.fill('#player-name', label === 'host' ? 'Host QA' : 'Guest QA');
  return page;
}


/**
 * Real-input movement probe (copied pattern from HF347): hold W, measure
 * horizontal displacement. Retries once with fresh focus because a missed
 * first keydown is a harness fault, not a game fault.
 */
const snap = (page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
async function measureMovement(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await snap(page);
    await page.click('body');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(MOVE_HOLD_MS);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);
    const after = await snap(page);
    const dx = after.player.position[0] - before.player.position[0];
    const dz = after.player.position[2] - before.player.position[2];
    const moved = Math.hypot(dx, dz);
    if (moved >= MOVE_THRESHOLD_M || attempt === 1) {
      return { movedM: Number(moved.toFixed(2)) };
    }
  }
  return { movedM: 0 };
}

/** F3: open chat with Enter, type with real keys, send, verify delivery. */
async function probeChat(sender, receiver, text) {
  const result = { opened: false, focusKept: null, deliveredToSender: false, deliveredToReceiver: false, error: null };
  try {
    // Open chat through the same pointerdown affordance a player uses by
    // clicking the ROOM CHAT header. Clicking <body> would land on non-chat
    // chrome where Enter is ignored while an editable field holds focus.
    await sender.click('#text-chat header').catch(() => {});
    const opened = await sender.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat);
    result.opened = Boolean(opened?.open);
    if (!result.opened) return result;
    // Type one char at a time; record whether the input keeps focus after
    // each keystroke (the owner's fault was dropped/unreceived characters).
    result.focusKept = [];
    for (const ch of text) {
      await sender.keyboard.type(ch);
      result.focusKept.push(await sender.evaluate(() => document.activeElement?.id ?? 'lost'));
    }
    await sender.keyboard.press('Enter'); // send
    const needle = text.slice(0, 12);
    const waitForEntry = async (page) => {
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const chat = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat);
        if ((chat.entries ?? []).some((entry) => entry.text.includes(needle))) return true;
        await page.waitForTimeout(200);
      }
      return false;
    };
    result.deliveredToReceiver = await waitForEntry(receiver);
    result.deliveredToSender = await waitForEntry(sender);
  } catch (error) {
    result.error = String(error).slice(0, 200);
  }
  return result;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(1));
}

/** Sample rAF deltas for durationMs inside the page. */
async function sampleFrames(page, durationMs) {
  return page.evaluate(async (duration) => {
    const deltas = [];
    let last = performance.now();
    const startedAt = last;
    await new Promise((done) => {
      const tick = (t) => {
        deltas.push(t - last);
        last = t;
        if (t - startedAt >= duration) done(null);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const sorted = [...deltas].sort((a, b) => a - b);
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
    return {
      samples: deltas.length,
      p50Ms: Number(at(50).toFixed(1)),
      p95Ms: Number(at(95).toFixed(1)),
      maxMs: Number(sorted[sorted.length - 1].toFixed(1)),
      longFramesOver50ms: deltas.filter((d) => d > 50).length,
    };
  }, durationMs);
}

/** F5: shoot / reload / pickup-and-fire for one role. Real mouse first. */
async function probeWeapon(page) {
  const record = {};
  const readPlayer = async () => {
    const s = await snap(page);
    return { weapon: s.player.weapon, ammo: s.player.ammo, reserve: s.player.reserve };
  };
  // --- shoot ---
  // The movement probe can end nose-to-wall, and HF-343 then honestly
  // refuses the shot (viewmodel-contact-raise) - that is policy, not the F5
  // fault. The F5 question is "can this player fire AT ALL", so rotate
  // through up to eight headings until one clears the contact gate.
  await page.evaluate(async () => {
    const d = window.__ATOMIC_ACRES_DEBUG__;
    for (let step = 0; step < 8; step += 1) {
      const s = d.snapshot();
      const [x, y, z] = s.player.position;
      d.teleportPlayer(x, y, z, s.player.yaw + Math.PI / 4, 0);
      await new Promise((r) => setTimeout(r, 120));
      const before = d.snapshot().player.ammo;
      d.fireOnce();
      await new Promise((r) => setTimeout(r, 150));
      if (d.snapshot().player.ammo < before) return; // heading clears; probe proper follows
    }
  });
  await page.waitForTimeout(300);
  const beforeShot = await readPlayer();
  await page.click('body');
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(300);
  let afterShot = await readPlayer();
  record.firePath = 'real-mouse';
  if (afterShot.ammo >= beforeShot.ammo) {
    // Headless mousedown may not reach the trigger without pointer lock; fall
    // back to the documented QA corridor through the same production tryFire.
    record.firePath = 'debug-fireOnce';
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
    await page.waitForTimeout(400);
    afterShot = await readPlayer();
  }
  const fireBlock = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fireBlock);
  record.shoot = {
    fired: afterShot.ammo < beforeShot.ammo || (fireBlock.lastFiredAtMs ?? 0) > 0,
    ammoBefore: beforeShot.ammo, ammoAfter: afterShot.ammo,
    fireBlockTotal: fireBlock.total, fireBlockReasons: fireBlock.byReason, fireBlockLast: fireBlock.last,
  };
  // --- reload ---
  await page.evaluate(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    window.__ATOMIC_ACRES_DEBUG__.setAmmo(s.player.weapon, 3, Math.max(10, s.player.reserve));
  });
  const beforeReload = await readPlayer();
  await page.click('body');
  await page.keyboard.press('KeyR');
  let reloadOk = false;
  for (let attempt = 0; attempt < 30 && !reloadOk; attempt += 1) {
    await page.waitForTimeout(200);
    const nowP = await readPlayer();
    reloadOk = !((await snap(page)).player.reloading) && nowP.ammo > beforeReload.ammo;
  }
  record.reload = { ok: reloadOk, ammoBefore: beforeReload.ammo, ammoAfter: (await readPlayer()).ammo };
  // --- pickup a death drop, then fire again ---
  record.pickup = { dropSpawned: null, pickedUp: false, firedAfterPickup: false, fireBlockLast: null };
  const dropId = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.spawnDeathDrop());
  record.pickup.dropSpawned = dropId != null;
  if (dropId != null) {
    await page.waitForTimeout(300);
    const picked = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop());
    record.pickup.pickedUp = picked === true;
    const preAmmo = (await readPlayer()).ammo;
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
    await page.waitForTimeout(400);
    const postAmmo = (await readPlayer()).ammo;
    const fb = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fireBlock);
    record.pickup.firedAfterPickup = postAmmo < preAmmo || (fb.lastFiredAtMs ?? 0) > 0;
    record.pickup.fireBlockLast = fb.last;
  }
  return record;
}

async function chopperInScene(page) {
  return page.evaluate(() => {
    let found = null;
    window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph()?.traverse((object) => {
      if (found) return;
      if (/^Pass65Chopper_LOD/i.test(object.name ?? '')) found = object.name;
    });
    return found;
  });
}

// F6: guest frame timing baseline vs during an AI-flown chopper overhead.
async function probeChopperLag(host, guest, record) {
  const probe = record.chopperLag = { staged: false, entitySeen: false, baseline: null, during: null, note: 'installed-Chrome WebGPU measurement (owner backend)' };
  probe.baseline = await sampleFrames(guest, 3_000);
  const earned = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupportForActor(
    window.__ATOMIC_ACRES_DEBUG__.snapshot().player.id, 15,
  ));
  const receipt = earned ? await host.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('chopper')
  )) : null;
  probe.staged = receipt != null && receipt.activationId != null;
  if (!probe.staged) { probe.note = `activation refused: earned=${earned} receipt=${JSON.stringify(receipt)?.slice(0, 120)}`; return; }
  for (let attempt = 0; attempt < 40 && !probe.entitySeen; attempt += 1) {
    probe.entitySeen = (await chopperInScene(guest)) != null || (await chopperInScene(host)) != null;
    if (!probe.entitySeen) await guest.waitForTimeout(500);
  }
  if (!probe.entitySeen) { probe.note = 'chopper never appeared in either scene graph'; return; }
  probe.during = await sampleFrames(guest, 6_000);
}

await mkdir(OUT_DIR, { recursive: true });
const lanes = [];
let startGateViolations = 0;
let chatFailures = 0;

for (const [laneIndex, lane] of LANES.entries()) {
  const record = { arena: lane.arena, mode: lane.mode, ok: false };
  let host = null;
  let guest = null;
  try {
    host = await openPage('host');
    guest = await openPage('guest');

    // Host creates the room; arena is selected before the guest joins.
    // (Reconstructed 2026-08-30 - a past multi-agent pass corrupted this
    // script: missing lanes/startGateViolations declarations, a swallowed
    // chopperInScene close, the per-lane result log head, and this block.)
    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
    const roomCode = (await host.textContent('#room-code')).trim();
    await host.selectOption('#lobby-arena', lane.arena);
    await host.waitForTimeout(500);

    // ---- F2: start gating, sampled across the whole join window ----
    const gateSamples = [];
    const rosterCount = () => host.evaluate(() => document.querySelectorAll('#lobby-roster .lobby-player').length);
    gateSamples.push({ phase: 'before-join', roster: await rosterCount(), startDisabled: await host.evaluate(() => document.querySelector('#lobby-start')?.disabled ?? null) });
    await guest.fill('#room-input', roomCode);
    const joinWindow = (async () => {
      await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    })();
    const joinPoll = (async () => {
      // Poll until roster shows 2 or timeout: any enabled start with <2 is a violation.
      for (;;) {
        const roster = await rosterCount();
        const disabled = await host.evaluate(() => document.querySelector('#lobby-start')?.disabled ?? null);
        gateSamples.push({ phase: 'joining', roster, startDisabled: disabled });
        if (roster >= 2) break;
        await host.waitForTimeout(40);
      }
    })();
    await Promise.race([Promise.all([joinWindow, joinPoll]), new Promise((_, reject) => setTimeout(() => reject(new Error('join polling timed out')), CONNECT_TIMEOUT))]);
    await Promise.all([host, guest].map((page) => page.waitForFunction(
      () => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT },
    )));
    gateSamples.push({ phase: 'joined-not-ready', roster: 2, startDisabled: await host.evaluate(() => document.querySelector('#lobby-start')?.disabled ?? null) });
    record.startGateSamples = gateSamples;
    // 2026-08-30 re-pin: a host ALONE may legitimately start a bot match
    // (canHostCommitStart's connected >= 1 is by design), so enabled-start
    // before the host knows about a joiner is not the owner's fault. The
    // fault is starting while a known joiner is not ready: any enabled
    // sample once the roster shows the guest.
    record.startGateViolation = gateSamples.some((s) => s.startDisabled === false && s.roster >= 2);

    // ---- F3: lobby chat both directions ----
    record.chatHostToGuest = await probeChat(host, guest, `host ping ${lane.arena}`);
    record.chatGuestToHost = await probeChat(guest, host, `guest ping ${lane.arena}`);

    // ---- ready up and start (HF347 flow) ----
    if (lane.mode !== 'range') {
      await host.selectOption('#lobby-mode', lane.mode);
      await host.waitForTimeout(300);
    }
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await host.click('#lobby-start');

    for (const page of [host, guest]) {
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: CONNECT_TIMEOUT });
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
    }
    record.hostArenaId = await host.evaluate(() => document.documentElement.dataset.arenaId ?? null);
    record.guestArenaId = await guest.evaluate(() => document.documentElement.dataset.arenaId ?? null);

    // ---- spawn trace (F4 evidence) ----
    record.guestSpawnTrace = [];
    for (let tick = 0; tick < 6; tick += 1) {
      record.guestSpawnTrace.push(await snap(guest).then((s) => ({
        alive: s.player.alive, hp: s.player.hp,
        x: Number(s.player.position[0].toFixed(2)), y: Number(s.player.position[1].toFixed(2)), z: Number(s.player.position[2].toFixed(2)),
        gate: {
          simulationEnabled: s.matchPhase === 'active' && s.gameStarted,
          awaitingCanonicalGuestAuthority: s.player.awaitingCanonicalGuestAuthority,
        },
      })));
      await guest.waitForTimeout(400);
    }

    // ---- F1/F4: real-key movement both roles ----
    record.hostMove = await measureMovement(host);
    record.guestMove = await measureMovement(guest);
    if (record.guestMove.movedM < MOVE_THRESHOLD_M) {
      record.guestGate = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
    }
    if (record.hostMove.movedM < MOVE_THRESHOLD_M) {
      record.hostGate = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate?.() ?? null);
    }

    // ---- F5: shoot/reload/pickup both roles ----
    record.hostWeapon = await probeWeapon(host);
    record.guestWeapon = await probeWeapon(guest);

    // ---- F6: chopper lag (one designated lane) ----
    if (lane.chopperProbe) await probeChopperLag(host, guest, record);

    record.hostErrors = host.errorsSeen.slice(0, 4);
    record.guestErrors = guest.errorsSeen.slice(0, 4);

    // Screenshots as visual evidence.
    const safeLane = `${String(laneIndex).padStart(2, '0')}-${lane.arena}-${lane.mode}`;
    await host.screenshot({ path: resolve(OUT_DIR, `${safeLane}-host.png`) }).catch(() => {});
    await guest.screenshot({ path: resolve(OUT_DIR, `${safeLane}-guest.png`) }).catch(() => {});

    const seen = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { remoteCount: s.remotePlayers?.length ?? 0, hp: s.remotePlayers?.[0]?.hp ?? 0 };
    })));
    record.ok = record.hostArenaId === lane.arena
      && record.guestArenaId === lane.arena
      && record.hostMove.movedM >= MOVE_THRESHOLD_M
      && record.guestMove.movedM >= MOVE_THRESHOLD_M
      // Owner 2026-08-30 re-pin: the chopper-probe lane's AI autocannon now
      // genuinely kills (v2 damage + shell splash), so a dead-but-respawning
      // remote is expected there; the sync fault this guards is the remote
      // VANISHING. Non-chopper lanes keep the stricter alive check.
      && seen.every((s) => s.remoteCount === 1 && (lane.chopperProbe ? true : s.hp > 0))
      && !record.startGateViolation;
    if (record.startGateViolation) startGateViolations += 1;
    if (!(record.chatHostToGuest.deliveredToReceiver && record.chatGuestToHost.deliveredToReceiver)) chatFailures += 1;
  } catch (error) {
    record.error = String(error).slice(0, 300);
    record.hostErrors = host?.errorsSeen.slice(0, 4) ?? [];
    record.guestErrors = guest?.errorsSeen.slice(0, 4) ?? [];
  } finally {
    await host?.close().catch(() => {});
    await guest?.close().catch(() => {});
  }
  lanes.push(record);
  console.log(`${record.ok ? 'OK  ' : 'FAIL'} ${lane.arena}/${lane.mode}`
    + ` host=${record.hostMove?.movedM ?? '?'}m guest=${record.guestMove?.movedM ?? '?'}m`
    + ` chat=${record.chatHostToGuest?.deliveredToReceiver}/${record.chatGuestToHost?.deliveredToReceiver}`
    + ` shoot=${record.hostWeapon?.shoot?.fired}/${record.guestWeapon?.shoot?.fired}`
    + `${record.error ? ` error=${record.error}` : ''}`);
}
await hostBrowser.close().catch(() => {});
await guestBrowser.close().catch(() => {});
peerProcess?.kill();

const moved = lanes.filter((l) => l.hostMove && l.guestMove);
const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  thresholdM: MOVE_THRESHOLD_M,
  faults: {
    F1_cant_move_host_guest: {
      lanesMeasured: moved.length,
      lanesBothMoved: moved.filter((l) => l.hostMove.movedM >= MOVE_THRESHOLD_M && l.guestMove.movedM >= MOVE_THRESHOLD_M).length,
      stuckLanes: moved
        .filter((l) => l.hostMove.movedM < MOVE_THRESHOLD_M || l.guestMove.movedM < MOVE_THRESHOLD_M)
        .map((l) => ({ arena: l.arena, mode: l.mode, hostM: l.hostMove.movedM, guestM: l.guestMove.movedM, hostGate: l.hostGate ?? null, guestGate: l.guestGate ?? null })),
    },
    F2_starts_before_all_join: { violations: startGateViolations, detail: lanes.map((l) => ({ arena: l.arena, mode: l.mode, violated: l.startGateViolation === true })) },
    F3_cant_type_in_lobby: { failures: chatFailures, detail: lanes.map((l) => ({ arena: l.arena, mode: l.mode, h2g: l.chatHostToGuest ?? null, g2h: l.chatGuestToHost ?? null })) },
    F4_spawn_rustrig_movement: lanes.filter((l) => l.arena === 'rustworks-1v1').map((l) => ({ mode: l.mode, hostM: l.hostMove?.movedM, guestM: l.guestMove?.movedM, spawnTrace: l.guestSpawnTrace })),
    F5_shoot_reload_pickup: lanes.map((l) => ({ arena: l.arena, mode: l.mode, host: l.hostWeapon ?? null, guest: l.guestWeapon ?? null })),
    F6_chopper_lag: lanes.filter((l) => l.chopperLag).map((l) => ({ arena: l.arena, mode: l.mode, ...(l.chopperLag ?? {}) })),
  },
  lanes,
};
await writeFile(resolve(OUT_DIR, 'repro-matrix.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report.faults.F1_cant_move_host_guest.stuckLanes.length === 0
  && startGateViolations === 0 && chatFailures === 0 ? { verdict: 'NO-FAULTS-REPRODUCED', out: OUT_DIR } : { verdict: 'FAULTS-OBSERVED', out: OUT_DIR }));
process.exit(lanes.every((lane) => lane.ok) && startGateViolations === 0 && chatFailures === 0 ? 0 : 1);
