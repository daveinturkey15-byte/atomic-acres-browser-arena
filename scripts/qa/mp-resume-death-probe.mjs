#!/usr/bin/env node
// NIGHT lane mp-lobby: resume-death trigger distinction probe.
//
// The open blocker (lanes/mp/FINAL.json, base b5b06e0f): "resume-death trigger
// undistinguished (stale-dead authority projection vs resume-deadline timeout)".
//
// This driver runs REAL host+guest matches through the real menu leave/rejoin
// path and samples the guest's own debug snapshot at 10 Hz across every resume,
// classifying each in-window death by its trigger signature, derived from
// src/legacy-main.ts on THIS head (004f4739):
//
//   PROJECTION-DEAD   applyGuestResumeAuthority applied a fresh authority whose
//                     canonical hp was 0 (stale-dead retained health): guest
//                     flips !awaitingCanonicalGuestAuthority with a fresh
//                     lastAppliedGuestResumeAuthority.hp === 0 at the death.
//   TIMEOUT-LOCAL     handleGuestResumeTimeout fired: hp 0 / alive false while
//                     awaitingCanonicalGuestAuthority is STILL true, status
//                     text "resume authority timed out", no fresh authority.
//   HOST-FAILURE      acceptGuestResumeFailure: status "Canonical rejoin
//                     failed", awaiting false, no fresh applied authority.
//   COMBAT-DEATH      died after a fresh apply that carried hp > 0 — in-match
//                     damage (bots), not a resume-path defect.
//
// Both trigger families are only distinguishable because
// window.__ATOMIC_ACRES_DEBUG__.snapshot() already exposes
// player.awaitingCanonicalGuestAuthority and
// player.lastAppliedGuestResumeAuthority (with appliedAtMonoMs and the applied
// hp). No product file is modified by this probe.
//
// Exit code 0 = the run COMPLETED and every cycle got a verdict (defects are
// data). A crash exits 1. --dist is honoured by the imported mp-audit module
// (same argv contract as mp-soak-gate.mjs).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  chromeArgs,
  multiplayerArenaRoster,
  openPeer,
  serveDist,
  sleep,
  startPeerServer,
  viewOf,
} from './mp-audit.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const CYCLES = Math.max(1, Number(arg('--cycles', '8')));
const PORT = Number(arg('--port', '4240'));
const PEER_PORT = Number(arg('--peer-port', '4241'));
const OUT_DIR = resolve(REPO_ROOT, arg('--out', 'artifacts/qa/mp-resume-death-probe'));
const LABEL = arg('--label', 'night-distinction');
const RTT_MS = Number(arg('--qa-rtt-ms', '120'));
const LOSS_PCT = Number(arg('--qa-loss-pct', '1'));
const POLL_MS = 100;
const CYCLE_WINDOW_MS = 30_000;
const JOIN_TIMEOUT_MS = 60_000;
const RUN_CAP_MS = Number(arg('--run-cap-ms', '270000'));

const run = {
  label: LABEL,
  startedAtEpochMs: Date.now(),
  config: { cycles: CYCLES, port: PORT, peerPort: PEER_PORT, pollMs: POLL_MS, cycleWindowMs: CYCLE_WINDOW_MS, rttMs: RTT_MS, lossPct: LOSS_PCT },
  cycles: [],
  anomalies: [],
  completed: false,
};

const runStarted = Date.now();
let server = null;
let peerServer = null;
let browsers = [];

async function sampleGuest(page, windowStartMs) {
  return page.evaluate((windowStart) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    if (!snapshot) return null;
    const applied = snapshot.player.lastAppliedGuestResumeAuthority;
    const respawnEl = document.querySelector('#respawn');
    return {
      t: Math.round(performance.now()),
      gameStarted: snapshot.gameStarted === true,
      matchPhase: snapshot.matchPhase ?? null,
      matchFinished: snapshot.matchFinished === true,
      alive: snapshot.player.alive === true,
      hp: snapshot.player.hp,
      awaiting: snapshot.player.awaitingCanonicalGuestAuthority === true,
      applied: applied ? {
        nonce: applied.authorityNonce,
        appliedAtMonoMs: Math.round(applied.appliedAtMonoMs),
        hp: applied.hp,
        continuity: applied.continuity ?? null,
      } : null,
      respawnHidden: respawnEl ? respawnEl.hidden === true : null,
      status: (document.querySelector('#network-status')?.textContent ?? '').trim(),
      deaths: snapshot.player.deaths,
      remotes: snapshot.remotes ?? null,
      windowStart,
    };
  }, windowStartMs).catch(() => null);
}

function classifyCycle(cycle) {
  const death = cycle.deathSample;
  if (!death) return cycle.stalled ? 'NO-AUTHORITY-HANG' : 'RESUMED-OK';
  const freshApply = death.applied !== null && cycle.rejoinClickAtMs !== null
    && death.applied.appliedAtMonoMs >= cycle.rejoinClickAtMs - 50;
  // handleGuestResumeTimeout (the only writer of the 'timed out' status text)
  // also CLEARS awaitingCanonicalGuestAuthority, so the status text - not the
  // awaiting flag - is the timeout-family discriminator (night-soak-1 cycles
  // 10-14: death with awaiting=false and the timeout status live).
  const statusLower = death.status.toLowerCase();
  if (!freshApply) {
    if (statusLower.includes('timed out')) return 'TIMEOUT-LOCAL';
    if (statusLower.includes('canonical rejoin failed')) return 'HOST-FAILURE';
    if (death.awaiting) return 'TIMEOUT-UNCONFIRMED';
  }
  if (!death.awaiting && freshApply) return death.applied.hp === 0 ? 'PROJECTION-DEAD' : 'COMBAT-DEATH';
  if (death.awaiting && freshApply) return 'PROJECTION-THEN-RELATCH';
  return 'UNCLASSIFIED';
}

async function runCycle(peers, index, hostView) {
  const guest = peers.guestA;
  const cycle = {
    index,
    variant: null,
    hostHpBeforeLeave: null,
    rejoinClickAtMs: null,
    deathSample: null,
    deathIndex: null,
    recoveredAtMs: null,
    stuckDeadAtWindowEnd: false,
    matchFinished: false,
    endState: null,
    samples: [],
    hostSamples: {},
    verdict: null,
  };
  const before = await viewOf(guest.page);
  const guestId = before.selfId;
  const aliveBefore = before.players[guestId]?.alive === true;

  // Variant: alternate for a live guest; a guest that is already dead (e.g.
  // after a TIMEOUT death) can only run a dead-leave cycle.
  cycle.variant = aliveBefore ? (index % 2 === 0 ? 'alive-leave' : 'dead-leave') : 'already-dead-leave';

  const hostBefore = await viewOf(peers.host.page);
  cycle.hostHpBeforeLeave = hostBefore.players[guestId]?.hp ?? null;

  if (cycle.variant === 'dead-leave') {
    const killed = await peers.host.page.evaluate((playerId) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      if (typeof debug?.damageRemoteAuthoritatively !== 'function') return { ok: false, reason: 'hook missing' };
      try { return { ok: true, returned: debug.damageRemoteAuthoritatively(500, playerId) ?? null }; } catch (error) { return { ok: false, reason: String(error?.message ?? error) }; }
    }, guestId);
    if (!killed.ok) run.anomalies.push({ cycle: index, note: 'host kill hook failed', detail: killed });
    await sleep(1_500);
    const deadView = await viewOf(guest.page);
    if (deadView.players[guestId]?.alive !== false) {
      run.anomalies.push({ cycle: index, note: 'guest did not die from authoritative 500 damage; cycle ran as alive-leave' });
      cycle.variant = 'alive-leave';
    }
  }

  // LEAVE through the real menu, then rejoin through the real menu — the same
  // surface the owner uses. This is the resume path: an active-match rejoin
  // arms awaitingCanonicalGuestAuthority and waits for guest-resume-authority.
  await guest.page.evaluate(() => document.querySelector('#lobby-leave')?.click());
  await sleep(2_000);
  await guest.page.evaluate(() => document.querySelector('#menu')?.classList.remove('hidden')).catch(() => {});
  cycle.rejoinClickAtMs = await guest.page.evaluate(() => performance.now());
  const clicked = await guest.page.evaluate(async (code) => {
    const input = document.querySelector('#room-input');
    const join = document.querySelector('#join');
    if (!input || !join) return { ok: false, reason: 'join controls absent' };
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((settle) => setTimeout(settle, 400));
    if (join.disabled) return { ok: false, reason: 'JOIN disabled' };
    join.click();
    return { ok: true };
  }, hostView.roomCode);
  if (!clicked.ok) {
    cycle.verdict = 'REJOIN-BLOCKED';
    cycle.endState = clicked;
    run.anomalies.push({ cycle: index, note: 'rejoin click failed', detail: clicked });
    return cycle;
  }

  // 10 Hz sampling for the cycle window.
  const windowStartEpoch = Date.now();
  let prevAlive = true;
  let confirmAlive = 0;
  while (Date.now() - windowStartEpoch < CYCLE_WINDOW_MS) {
    const sample = await sampleGuest(guest.page, cycle.rejoinClickAtMs);
    if (sample) {
      cycle.samples.push(sample);
      if (sample.matchFinished) cycle.matchFinished = true;
      const inMatch = sample.gameStarted && !prevAliveEmptyGuard(sample);
      if (inMatch && prevAlive && sample.alive === false && cycle.deathIndex === null) {
        cycle.deathIndex = cycle.samples.length - 1;
        cycle.deathSample = sample;
      }
      prevAlive = sample.alive;
      const settled = sample.gameStarted && sample.alive && sample.hp > 0 && !sample.awaiting && sample.respawnHidden === true;
      confirmAlive = settled ? confirmAlive + 1 : 0;
      if (cycle.deathSample && cycle.deathIndex !== null && cycle.samples.length - 1 > cycle.deathIndex
        && sample.alive && sample.hp > 0) {
        cycle.recoveredAtMs = sample.t - cycle.rejoinClickAtMs;
        break;
      }
      if (!cycle.deathSample && confirmAlive >= 3) {
        cycle.recoveredAtMs = sample.t - cycle.rejoinClickAtMs;
        break;
      }
      if (cycle.deathSample && !sample.alive && sample.awaiting && sample.status.toLowerCase().includes('timed out')
        && cycle.samples.length - 1 - cycle.deathIndex > 30) {
        // Terminal local timeout: no respawn will come; stop burning the window.
        cycle.stuckDeadAtWindowEnd = true;
        break;
      }
    }
    await sleep(POLL_MS);
  }
  if (cycle.deathSample && cycle.recoveredAtMs === null) cycle.stuckDeadAtWindowEnd = true;
  const last = cycle.samples[cycle.samples.length - 1] ?? null;
  cycle.endState = last ? { alive: last.alive, hp: last.hp, awaiting: last.awaiting, status: last.status } : null;
  cycle.verdict = classifyCycle(cycle);
  return cycle;
}

function prevAliveEmptyGuard(_sample) {
  // A sample only counts as a death transition when the guest document is in
  // the match (gameStarted). Menu-side dead-looking HUD values are not deaths.
  return false;
}

async function main() {
  const roster = multiplayerArenaRoster();
  const arena = roster[0];
  run.arena = arena.id;
  server = await serveDist(PORT);
  peerServer = await startPeerServer(PEER_PORT);
  browsers = await Promise.all(['host', 'guestA'].map(() => chromium.launch({ headless: true, channel: 'chrome', args: chromeArgs() })));
  const roles = ['host', 'guestA'];
  const opened = await Promise.all(roles.map(async (role, index) => openPeer(browsers[index], role, arena.id, role === 'host' ? 'HOST' : 'GUESTA', {
    port: PORT,
    peerPort: PEER_PORT,
    qaRttMs: RTT_MS,
    qaLossPct: LOSS_PCT,
    qaSeed: `mp-resume-death-${LABEL}`,
    seed: `mp-resume-death-${arena.id}-${role}`,
  })));
  const peers = Object.fromEntries(opened.map((peer) => [peer.role, peer]));

  // Real lobby: host, join, ready, start — identical surface to the soak gate.
  await peers.host.page.click('#host');
  await peers.host.page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: 45_000 });
  const roomCode = (await peers.host.page.textContent('#room-code')).trim();
  await peers.guestA.page.fill('#room-input', roomCode);
  await peers.guestA.page.click('#join');
  await peers.guestA.page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members ?? []).some((member) => member.connected), undefined, { timeout: JOIN_TIMEOUT_MS });
  await peers.host.page.selectOption('#lobby-arena', arena.id);
  await Promise.all(roles.map((role) => peers[role].page.waitForFunction((id) => document.querySelector('#lobby-ready')?.disabled === false && window.__ATOMIC_ACRES_DEBUG__?.snapshot().arenaSelection?.id === id, arena.id, { timeout: 160_000 })));
  await peers.host.page.click('#lobby-ready');
  await peers.guestA.page.click('#lobby-ready');
  await peers.host.page.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: JOIN_TIMEOUT_MS });
  await peers.host.page.click('#lobby-start');
  await Promise.all(roles.map((role) => peers[role].page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true && window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 180_000 })));

  const hostView = { roomCode };
  for (let index = 1; index <= CYCLES; index += 1) {
    if (Date.now() - runStarted > RUN_CAP_MS) {
      run.anomalies.push({ note: `run cap reached before cycle ${index}` });
      break;
    }
    const cycle = await runCycle(peers, index, hostView);
    // Downsample: keep every sample while dead/awaiting or within 1 s of the
    // death index, else every 5th (500 ms), so artifacts stay readable.
    const deathIdx = cycle.deathIndex ?? Number.MAX_SAFE_INTEGER;
    cycle.samples = cycle.samples.filter((sample, position) => position >= deathIdx - 10
      || position % 5 === 0
      || !sample.alive
      || sample.awaiting
      || !sample.respawnHidden);
    const hostAfter = await viewOf(peers.host.page).catch(() => null);
    const guestIdNow = (await viewOf(peers.guestA.page).catch(() => null))?.selfId ?? null;
    cycle.hostSamples.afterCycle = hostAfter && guestIdNow ? (hostAfter.players[guestIdNow] ?? null) : null;
    run.cycles.push(cycle);
    console.log(`[probe] cycle ${index} (${cycle.variant}): ${cycle.verdict}`
      + `${cycle.deathSample ? ` death@${cycle.deathSample.t}ms hp=${cycle.deathSample.hp} awaiting=${cycle.deathSample.awaiting} status="${cycle.deathSample.status}"` : ''}`
      + `${cycle.recoveredAtMs !== null ? ` recovered+${cycle.recoveredAtMs}ms` : ''}`);
    if (cycle.matchFinished) {
      run.anomalies.push({ note: `match finished after cycle ${index}; stopping` });
      break;
    }
    if (cycle.verdict === 'REJOIN-BLOCKED') break;
    // Give the resume transaction and replication a settle beat between cycles.
    await sleep(2_000);
  }

  // A guest stuck dead by TIMEOUT-LOCAL needs a QA revive so the lane can keep
  // running; record every revive — needing it at all is evidence.
  run.completed = true;
  const summary = {};
  for (const cycle of run.cycles) summary[cycle.verdict] = (summary[cycle.verdict] ?? 0) + 1;
  run.summary = summary;
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = resolve(OUT_DIR, `probe-${LABEL}.json`);
  writeFileSync(outPath, JSON.stringify(run, null, 1));
  console.log(`[probe] summary: ${JSON.stringify(summary)}`);
  console.log(`[probe] artifact: ${outPath}`);
  console.log(`[probe] completed=${run.completed} anomalies=${run.anomalies.length}`);
}

try {
  await main();
} catch (error) {
  run.failure = String(error?.stack ?? error?.message ?? error).slice(0, 2_000);
  run.completed = false;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `probe-${LABEL}.json`), JSON.stringify(run, null, 1));
  console.error(`[probe] FAILED: ${run.failure}`);
  process.exitCode = 1;
} finally {
  for (const browser of browsers) {
    await browser.close().catch(() => {});
  }
  peerServer?.kill();
  await server?.close();
}
