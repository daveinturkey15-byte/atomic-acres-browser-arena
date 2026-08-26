#!/usr/bin/env node
// LANE J — multiplayer, lobby and input fault sweep (Pass 74+ owner notes).
//
// Reproduction-first harness: two (sometimes three) real browser windows on a
// local PeerJS server, real key events, per-check REPRODUCED / NOT-REPRODUCED
// verdicts with mechanical evidence. Owner items covered:
//   ffa-default        — "FFA should be the lobby default; TDM selectable" (HF-327)
//   lobby-typing       — "cant type in lobby" (HF-324)
//   tdm-prescription   — "prescribe teams ... keep colour names" (HF-328)
//   early-start        — "game starts before all people join? Sort?" (HF-323)
//   pickup-fire-reload — "pickup guns cant shoot cant reload" / "sometimes
//                        randomly cant shoot or reload" (HF-315)
//   killstreak-key3    — "cannot select killstreak 3 care package sometimes" (HF-316)
//   chopper-spectator  — "when chopper gunner is flying and I am ... not
//                        controlling it I am very laggy" (HF-336)
//
// RustRig/Terminal spawn movement stays owned by
// scripts/qa/verify-hf347-arena-movement-matrix.mjs (run it alongside this).
// Carpet tri-pass (HF-317) is asserted at unit level in killstreak-runtime
// tests — the pass structure is deterministic, not emergent in a browser.
//
// Exit 0 only when every check is NOT-REPRODUCED (i.e. the product behaves).
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
const PEER_PORT = Number(arg('--peer-port', '9339'));
// Patience for the product to reach a state, not a product threshold: this
// repo is a shared worktree and other lanes routinely pin the CPU at 100%,
// which stretches a two-window match start well past two minutes. Raise it
// with --connect-timeout rather than reading contention as a fault.
const CONNECT_TIMEOUT = Number(arg('--connect-timeout', '120000'));
const ONLY = arg('--only', null); // comma-separated check names to run

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

const snap = (page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());

/** stage() names the step so a timeout tells us WHERE the product wedged. */
async function stage(record, name, work) {
  record.stages = record.stages ?? [];
  const startedAt = Date.now();
  try {
    const value = await work();
    record.stages.push({ name, ms: Date.now() - startedAt, ok: true });
    return value;
  } catch (error) {
    record.stages.push({ name, ms: Date.now() - startedAt, ok: false, error: String(error).slice(0, 240) });
    throw new Error(`stage '${name}': ${String(error).slice(0, 240)}`);
  }
}

async function hostRoom(record, host) {
  await stage(record, 'host-create-room', async () => {
    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
  });
  return (await host.textContent('#room-code')).trim();
}

async function joinRoom(record, guest, roomCode, expectedRoster) {
  await stage(record, `guest-join-roster-${expectedRoster}`, async () => {
    await guest.fill('#room-input', roomCode);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await guest.waitForFunction((count) => document.querySelectorAll('#lobby-roster .lobby-player').length >= count, expectedRoster, { timeout: CONNECT_TIMEOUT });
  });
}

async function startMatch(record, host, pages) {
  await stage(record, 'ready-up-and-start', async () => {
    for (const page of pages) await page.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    await host.click('#lobby-start');
  });
  await stage(record, 'all-active', async () => {
    for (const page of pages) {
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: CONNECT_TIMEOUT });
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
    }
  });
}

const checks = [];
function report(record) {
  checks.push(record);
  console.error(`[lane-j] ${record.check}: ${record.reproduced === true ? 'REPRODUCED' : record.reproduced === false ? 'NOT-REPRODUCED' : 'INCONCLUSIVE'}${record.error ? ` error=${record.error}` : ''}`);
}

function wants(name) {
  return !ONLY || ONLY.split(',').includes(name);
}

// ---------------------------------------------------------------------------
// Check 1+2+3: ffa-default, lobby-typing, tdm-prescription (one lobby session)
// ---------------------------------------------------------------------------
if (wants('lobby')) {
  const ffaRecord = { check: 'ffa-default', owner: 'FFA should be the lobby default; TDM selectable', reproduced: null };
  const typingRecord = { check: 'lobby-typing', owner: 'cant type in lobby', reproduced: null };
  const tdmRecord = { check: 'tdm-prescription', owner: 'prescribe teams for people in team death match', reproduced: null };
  let host = null;
  let guest = null;
  try {
    host = await openPage('Host QA');
    guest = await openPage('Guest QA');
    const roomCode = await hostRoom(ffaRecord, host);

    // --- ffa-default: the freshly created lobby must sit on FFA.
    ffaRecord.hostModeOnCreate = await host.evaluate(() => document.querySelector('#lobby-mode')?.value ?? null);
    await joinRoom(ffaRecord, guest, roomCode, 2);
    ffaRecord.guestModeOnJoin = await guest.evaluate(() => document.querySelector('#lobby-mode')?.value ?? null);
    ffaRecord.reproduced = !(ffaRecord.hostModeOnCreate === 'ffa' && ffaRecord.guestModeOnJoin === 'ffa');
    report(ffaRecord);

    // --- lobby-typing: real keystrokes into the lobby chat on BOTH roles.
    for (const [label, page, other] of [['guest', guest, host], ['host', host, guest]]) {
      const sub = {};
      typingRecord[label] = sub;
      // The chat panel open affordance: click the panel, then type.
      await page.click('#text-chat');
      await page.waitForTimeout(150);
      sub.openAfterClick = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.open);
      const message = `sweep ${label} ${Date.now() % 100000}`;
      await page.keyboard.type(message, { delay: 15 });
      sub.inputValue = await page.evaluate(() => document.querySelector('#text-chat-input')?.value ?? null);
      sub.typedMatches = sub.inputValue === message;
      await page.keyboard.press('Enter');
      // The message must round-trip: sender AND the other window see it.
      try {
        await page.waitForFunction((text) => window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.entries.some((entry) => entry.text === text), message, { timeout: 10_000 });
        await other.waitForFunction((text) => window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.entries.some((entry) => entry.text === text), message, { timeout: 10_000 });
        sub.roundTripped = true;
      } catch {
        sub.roundTripped = false;
      }
      // Enter from an unfocused body must OPEN chat (HF-324 affordance).
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      await page.click('body', { position: { x: 640, y: 30 } });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      sub.enterOpensChat = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.open);
      await page.keyboard.press('Escape');
    }
    typingRecord.reproduced = !(
      typingRecord.guest.typedMatches && typingRecord.guest.roundTripped && typingRecord.guest.enterOpensChat
      && typingRecord.host.typedMatches && typingRecord.host.roundTripped && typingRecord.host.enterOpensChat
    );
    report(typingRecord);

    // --- tdm-prescription: switching to TDM must place the two players on
    // OPPOSITE teams with canonical colour identities, no free pick.
    await host.selectOption('#lobby-mode', 'tdm');
    await stage(tdmRecord, 'guest-sees-tdm', async () => {
      await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.mode === 'tdm', undefined, { timeout: 15_000 });
    });
    const membersOf = async (page) => (await snap(page)).privateMatch?.members ?? [];
    tdmRecord.hostMembers = (await membersOf(host)).map((m) => ({ name: m.name, team: m.team, squadName: m.squadName, squadColor: m.squadColor }));
    tdmRecord.guestMembers = (await membersOf(guest)).map((m) => ({ name: m.name, team: m.team, squadName: m.squadName, squadColor: m.squadColor }));
    const teams = tdmRecord.hostMembers.map((m) => m.team).sort();
    const canonicalSquads = tdmRecord.hostMembers.every((m) => (m.team === 0 ? m.squadName === 'AQUA' : m.squadName === 'CORAL'));
    // The lobby squad identity control must be a read-only label (no name/colour pick).
    tdmRecord.freeIdentityControls = await host.evaluate(() => ({
      squadNameInput: document.querySelector('#lobby-squad-name input, input#lobby-squad-name') !== null,
      colourPicker: document.querySelector('#lobby-squad-identity input[type="color"], #lobby-squad-identity select') !== null,
    }));
    tdmRecord.reproduced = !(teams.length === 2 && teams[0] === 0 && teams[1] === 1 && canonicalSquads
      && !tdmRecord.freeIdentityControls.squadNameInput && !tdmRecord.freeIdentityControls.colourPicker);
    report(tdmRecord);
  } catch (error) {
    const message = String(error).slice(0, 300);
    for (const record of [ffaRecord, typingRecord, tdmRecord]) {
      if (record.reproduced === null) {
        record.error = message;
        report(record);
      }
    }
  } finally {
    await host?.close().catch(() => {});
    await guest?.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Check 4: early-start — a guest whose join is in flight when the host starts
// must be admitted, not locked out, and the match must not go active without
// them being a connected member.
// ---------------------------------------------------------------------------
if (wants('early-start')) {
  const record = { check: 'early-start', owner: 'game starts before all people join? Sort?', reproduced: null };
  let host = null;
  let guest1 = null;
  let guest2 = null;
  try {
    host = await openPage('Host QA');
    guest1 = await openPage('Guest One');
    guest2 = await openPage('Guest Two');
    const roomCode = await hostRoom(record, host);
    await joinRoom(record, guest1, roomCode, 2);
    await host.click('#lobby-ready');
    await guest1.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
    // Fire the second join and the host start in the same breath — the exact
    // race the owner hit. No waits between them.
    await guest2.fill('#room-input', roomCode);
    await Promise.all([
      guest2.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))),
      host.evaluate(() => document.querySelector('#lobby-start')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))),
    ]);
    // Everyone who ends up in the match must reach active; guest2 must end up
    // a connected member of the SAME match (admitted pre-start, during the
    // countdown lead, or — least preferred but not the owner's fault — held in
    // the lobby until the next match; being dropped/errored is the fault).
    await stage(record, 'host-active', async () => {
      await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
    });
    await stage(record, 'guest2-outcome', async () => {
      await guest2.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return snapshot?.matchPhase === 'active' || (snapshot?.privateMatch?.members?.length ?? 0) >= 3;
      }, undefined, { timeout: CONNECT_TIMEOUT });
    });
    await host.waitForTimeout(2_000);
    const hostView = await snap(host);
    const guest2View = await snap(guest2);
    record.hostMembers = (hostView.privateMatch?.members ?? []).map((m) => ({ name: m.name, connected: m.connected }));
    record.guest2Phase = guest2View.matchPhase;
    record.guest2Members = (guest2View.privateMatch?.members ?? []).length;
    record.guest2Alive = guest2View.player?.alive ?? null;
    const guest2Admitted = record.hostMembers.length === 3 && record.hostMembers.every((m) => m.connected);
    record.reproduced = !(guest2Admitted && record.guest2Phase === 'active');
  } catch (error) {
    record.error = String(error).slice(0, 300);
    record.reproduced = record.reproduced ?? true;
  } finally {
    report(record);
    await host?.close().catch(() => {});
    await guest1?.close().catch(() => {});
    await guest2?.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Checks 5+6+7: in-match faults on one hosted session (atomic-acres FFA):
// pickup-fire-reload, killstreak-key3, chopper-spectator.
// ---------------------------------------------------------------------------
if (wants('match')) {
  const pickupRecord = { check: 'pickup-fire-reload', owner: 'pickup guns cant shoot cant reload / sometimes randomly cant shoot or reload', reproduced: null };
  const key3Record = { check: 'killstreak-key3', owner: 'cannot select killstreak 3 care package sometimes', reproduced: null };
  const chopperRecord = { check: 'chopper-spectator', owner: 'when chopper gunner is flying and I am not controlling it I am very laggy', reproduced: null };
  let host = null;
  let guest = null;
  try {
    host = await openPage('Host QA');
    guest = await openPage('Guest QA');
    const roomCode = await hostRoom(pickupRecord, host);
    await joinRoom(pickupRecord, guest, roomCode, 2);
    await startMatch(pickupRecord, host, [host, guest]);
    await host.waitForTimeout(1_500);

    // --- pickup-fire-reload: cycles of fire + reload through the guest's
    // host-admitted ammo path, then a real death-drop pickup, then more
    // cycles. Any cycle that leaves ammo unchanged is the owner's fault.
    const fireReloadCycle = async (page, label) => {
      const result = { label };
      const beforeSnapshot = await snap(page);
      const before = beforeSnapshot.player;
      result.weapon = before.weapon;
      result.ammoBefore = before.ammo;
      // Lane J: legacy-main records WHY the trigger refused (see refuseFire).
      // Reading it here is what turns "ammo did not move" into a named gate.
      const blockBefore = beforeSnapshot.fireBlock ?? null;
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
      await page.waitForTimeout(400);
      const afterSnapshot = await snap(page);
      const afterFire = afterSnapshot.player;
      result.ammoAfterFire = afterFire.ammo;
      result.fired = afterFire.ammo === before.ammo - 1;
      const blockAfter = afterSnapshot.fireBlock ?? null;
      result.fireBlockedBy = blockAfter && blockBefore && blockAfter.total > blockBefore.total ? blockAfter.last : null;
      result.reserve = before.reserve ?? null;
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.reload());
      try {
        await page.waitForFunction((mag) => {
          const player = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
          return !player.reloading && player.ammo > mag;
        }, result.ammoAfterFire, { timeout: 8_000 });
        result.reloaded = true;
      } catch {
        result.reloaded = false;
      }
      result.ammoAfterReload = (await snap(page)).player.ammo;
      return result;
    };

    pickupRecord.cycles = [];
    for (let round = 0; round < 3; round += 1) {
      pickupRecord.cycles.push(await fireReloadCycle(guest, `guest-preload-${round}`));
      pickupRecord.cycles.push(await fireReloadCycle(host, `host-preload-${round}`));
    }

    // Real replicated pickup: host kills the guest authoritatively, the death
    // drop replicates to both sides, the guest teleports onto it and picks it
    // up through the host-acknowledged pickup path.
    const guestId = (await snap(guest)).player.id;
    const deathPosition = (await snap(guest)).player.position;
    pickupRecord.forcedDeath = await host.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.forceRemoteDeathForReconnect(id), guestId);
    await stage(pickupRecord, 'guest-dies', async () => {
      await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.alive === false, undefined, { timeout: 15_000 });
    });
    await stage(pickupRecord, 'guest-respawns', async () => {
      await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.respawn());
      await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.alive === true, undefined, { timeout: 20_000 });
    });
    await guest.waitForTimeout(800);
    // Lane J: the guest must stay ALIVE across respawn -> reposition -> pickup.
    // A dead guest makes every later fire cycle report 'dead' and hides whether
    // the picked-up weapon itself is the fault, so trace liveness at each step.
    const livenessSample = async (label) => ({
      label,
      ...(await guest.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          alive: snapshot.player.alive,
          hp: snapshot.player.hp,
          continuity: snapshot.player.continuity,
          hostConfirmed: snapshot.player.hostConfirmedContinuity,
          status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 90),
        };
      })),
      hostSeesGuestHp: await host.evaluate((id) => {
        const remote = (window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers ?? []).find((entry) => entry.id === id);
        return remote ? { hp: remote.hp, continuity: remote.continuity ?? null } : null;
      }, guestId),
    });
    pickupRecord.liveness = [await livenessSample('after-respawn')];
    // Swap to the secondary so the drop (primary) is a WEAPON CHANGE pickup.
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.switchWeapon(1));
    await guest.evaluate((position) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(position[0], position[1], position[2]), deathPosition);
    await guest.waitForTimeout(600);
    pickupRecord.liveness.push(await livenessSample('after-teleport'));
    pickupRecord.pickupAccepted = await guest.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.interactDrop();
      return true;
    });
    await guest.waitForTimeout(1_500);
    pickupRecord.liveness.push(await livenessSample('after-pickup'));
    pickupRecord.weaponAfterPickup = (await snap(guest)).player.weapon;
    for (let round = 0; round < 3; round += 1) {
      pickupRecord.cycles.push(await fireReloadCycle(guest, `guest-post-pickup-${round}`));
    }
    const failedCycles = pickupRecord.cycles.filter((cycle) => !cycle.fired || !cycle.reloaded);
    pickupRecord.failedCycles = failedCycles;
    pickupRecord.reproduced = failedCycles.length > 0;
    report(pickupRecord);

    // --- killstreak-key3: the guest earns slot-1 authority, presses the REAL
    // key 3. Then dies and presses key 3 again — the HUD must SAY why it
    // refuses (HF-316 residual) instead of being a dead key.
    const actorCharges = (snapshot, actorId) => {
      const actor = (snapshot.killstreak?.actors ?? []).find((entry) => entry.actorId === actorId);
      return actor ? {
        streak: actor.streak,
        available: actor.available,
        charges: actor.availableCharges,
        possession: actor.possession,
        slot1: actor.loadout?.slots?.[0] ?? null,
      } : null;
    };
    await host.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.earnSupportForActor(id, 6), guestId);
    await stage(key3Record, 'guest-sees-slot1-charge', async () => {
      await guest.waitForFunction((id) => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        const actor = (snapshot.killstreak?.actors ?? []).find((entry) => entry.actorId === id);
        return actor && actor.available.includes(actor.loadout?.slots?.[0]);
      }, guestId, { timeout: 15_000 });
    });
    key3Record.chargesBefore = actorCharges(await snap(guest), guestId);
    await guest.click('body');
    await guest.keyboard.press('Digit3');
    await guest.waitForTimeout(1_500);
    const afterPress = await snap(guest);
    key3Record.afterPress = actorCharges(afterPress, guestId);
    key3Record.strikeMode = await guest.evaluate(() => ({
      mode: document.querySelector('#strike-target-mode')?.textContent ?? null,
      feed: [...document.querySelectorAll('#killfeed div')].map((row) => row.textContent).slice(0, 8),
    }));
    const slot1Id = key3Record.chargesBefore?.slot1;
    const chargeBefore = key3Record.chargesBefore?.charges?.find((entry) => entry.id === slot1Id)?.count ?? 0;
    const chargeAfter = key3Record.afterPress?.charges?.find((entry) => entry.id === slot1Id)?.count ?? 0;
    const aliveActivated = chargeAfter < chargeBefore
      || Boolean(key3Record.afterPress?.possession)
      || (afterPress.killstreak?.entities ?? []).some((entity) => entity.ownerId === guestId)
      || key3Record.strikeMode.feed.some((row) => /SCOUT|SWEEP|CARE|SUPPORT|INBOUND|CONFIRMED/i.test(row ?? ''));
    key3Record.aliveActivated = aliveActivated;
    // Cancel any open targeting so death-path feedback is clean.
    await guest.keyboard.press('Escape');
    await guest.waitForTimeout(400);
    // Dead press: must produce visible refusal feedback, not silence.
    await host.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.forceRemoteDeathForReconnect(id), guestId);
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.alive === false, undefined, { timeout: 15_000 });
    await guest.evaluate(() => [...document.querySelectorAll('#killfeed div')].forEach((row) => row.remove()));
    await guest.keyboard.press('Digit3');
    await guest.waitForTimeout(800);
    key3Record.deadPressFeed = await guest.evaluate(() => [...document.querySelectorAll('#killfeed div')].map((row) => row.textContent).slice(0, 6));
    const deadFeedback = key3Record.deadPressFeed.some((row) => (row ?? '').length > 0);
    key3Record.reproduced = !(aliveActivated && deadFeedback);
    report(key3Record);
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.respawn());
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.alive === true, undefined, { timeout: 20_000 });

    // --- chopper-spectator: measure the guest's presented frame cadence
    // before and during a host-piloted Chopper Gunner. The owner's machine
    // showed severe lag for every peer NOT controlling it.
    const measureFps = (page, ms) => page.evaluate(async (durationMs) => {
      const start = performance.now();
      let frames = 0;
      let worstDelta = 0;
      let last = start;
      await new Promise((done) => {
        const tick = (now) => {
          frames += 1;
          worstDelta = Math.max(worstDelta, now - last);
          last = now;
          if (now - start >= durationMs) done();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return {
        fps: Number((frames / ((performance.now() - start) / 1000)).toFixed(1)),
        worstFrameMs: Number(worstDelta.toFixed(1)),
      };
    }, ms);

    chopperRecord.guestBaseline = await measureFps(guest, 4_000);
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
    chopperRecord.activated = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper'));
    await host.waitForTimeout(1_000);
    chopperRecord.controlled = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl());
    await host.waitForTimeout(1_500);
    chopperRecord.guestDuringChopper = await measureFps(guest, 5_000);
    chopperRecord.hostDuringChopper = await measureFps(host, 2_000);
    const baseline = chopperRecord.guestBaseline.fps;
    const during = chopperRecord.guestDuringChopper.fps;
    // Severe lag = the owner's words. A >35% cadence collapse or sub-30 FPS on
    // a machine that just did better, or >250ms hitches, reproduces it.
    chopperRecord.reproduced = during < baseline * 0.65 || (during < 30 && baseline >= 45)
      || chopperRecord.guestDuringChopper.worstFrameMs > 250;
    report(chopperRecord);
  } catch (error) {
    const message = String(error).slice(0, 300);
    for (const record of [pickupRecord, key3Record, chopperRecord]) {
      if (record.reproduced === null) {
        record.error = message;
        report(record);
      }
    }
  } finally {
    await host?.close().catch(() => {});
    await guest?.close().catch(() => {});
  }
}

await browser.close();
peerProcess?.kill();

const reproducedAny = checks.some((check) => check.reproduced !== false);
console.log(JSON.stringify({ verdict: reproducedAny ? 'REPRODUCED' : 'CLEAN', checks }, null, 2));
process.exit(reproducedAny ? 1 : 0);
