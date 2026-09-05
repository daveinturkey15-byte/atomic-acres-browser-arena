#!/usr/bin/env node
// HF-499: three-peer multiplayer soak gate.
// The browser setup and gameplay probes are intentionally routed through the
// HF-504 audit driver's engine; this file owns only the finite soak schedule,
// evidence bundle, and release-blocking assertions.

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  ACK_BUDGET_MS,
  PEERS,
  chromeArgs,
  multiplayerArenaRoster,
  openPeer,
  scenarioDamageDeath,
  scenarioFire,
  scenarioPickup,
  scenarioRejoin,
  scenarioReload,
  scenarioRespawn,
  scenarioScoreboard,
  scenarioSwap,
  serveDist,
  sleep,
  startPeerServer,
  traceOf,
  viewOf,
} from './mp-audit.mjs';
import { evaluateMpSoakBundle, formatMpSoakTable, MP_SOAK_THRESHOLDS } from './mp-soak-assertions.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PORTS = Object.freeze({
  dist: Number(process.env.MP_SOAK_DIST_PORT ?? '4194'),
  peer: Number(process.env.MP_SOAK_PEER_PORT ?? '4195'),
});
const ALLOWED_QA_PORTS = new Set([4189, 4193, 4194, 4195]);
const OUT_DIR = resolve(REPO_ROOT, 'artifacts/qa/mp-soak-gate');
const PLAY_DURATION_MS = MP_SOAK_THRESHOLDS.playDurationMs;
// Keep the browser lifetime below the five-minute owner fence while allowing
// the already-installed Chrome/WebGPU stack to finish a cold boot and the
// full 180-second play clock.
const HARD_TIMEOUT_MS = 299_000;
const DAMAGE_RTT_MS = MP_SOAK_THRESHOLDS.rttMs;
const positionBoundM = MP_SOAK_THRESHOLDS.positionBoundM;
const QA_SEED = 'hf499-mp-soak-20260904';
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const arenaId = arg('--arena', null);
const label = arg('--label', 'hf499');
const outDir = resolve(REPO_ROOT, arg('--out', OUT_DIR));
const renderer = arg('--renderer', 'webgpu');
const renderProfile = arg('--render', 'performance');
const TSX_CLI = resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
const ARENA_ROSTER_SCRIPT = resolve(REPO_ROOT, 'scripts/qa/mp-lab/arena-roster.mts');

for (const port of Object.values(PORTS)) {
  if (!Number.isInteger(port) || !ALLOWED_QA_PORTS.has(port)) throw new Error(`invalid QA port ${port}`);
}

const startedAtEpochMs = Date.now();
const bundle = {
  contract: 'mp-soak-gate-v1',
  ledger: 'HF-499',
  measuredAt: new Date(startedAtEpochMs).toISOString(),
  arena: null,
  renderer,
  renderProfile,
  completed: false,
  failure: null,
  config: {
    playDurationMs: PLAY_DURATION_MS,
    sampleIntervalMs: MP_SOAK_THRESHOLDS.sampleIntervalMs,
    positionBoundM,
    rttMs: DAMAGE_RTT_MS,
    packetLossPct: 1,
    oneWayDelayMs: DAMAGE_RTT_MS / 2,
    seed: QA_SEED,
    ports: PORTS,
    browserPolicy: 'headless Chrome, stock flags, mute-audio, max three peers',
  },
  timing: { startedAtEpochMs, endedAtEpochMs: null, playDurationMs: 0 },
  replication: { samples: [], divergences: [], pairDirections: Object.fromEntries(
    PEERS.flatMap((from) => PEERS.filter((to) => to !== from).map((to) => [`${from}->${to}`, false])),
  ) },
  rejoin: {
    role: 'guestB', leaveObserved: false, rejoinObserved: false, seenByEveryoneAfter: false,
    damage: { triggered: false, credited: false, maxLatencyMs: null, byPeer: {} },
  },
  scenarios: { guests: { guestA: {}, guestB: {} } },
  consoleErrors: { host: [], guestA: [], guestB: [] },
  scoreboard: { agreement: false },
  trace: {},
  findings: [],
  gate: null,
};

let server = null;
let peerServer = null;
let browsers = [];
let peers = {};
let hardStopTimer = null;
let stopping = false;
const stairGeometryCache = new Map();

function arenaStairGeometry(arena, team) {
  const key = `${arena}:${team}`;
  if (stairGeometryCache.has(key)) return stairGeometryCache.get(key);
  const result = spawnSync(process.execPath, [TSX_CLI, ARENA_ROSTER_SCRIPT, '--stair', arena, String(team)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`arena stair geometry failed: ${result.stderr || result.stdout}`);
  const geometry = JSON.parse(result.stdout.trim().split('\n').pop());
  stairGeometryCache.set(key, geometry);
  return geometry;
}

function noteFailure(scope, error) {
  const text = String(error?.stack ?? error?.message ?? error).slice(0, 1_000);
  bundle.findings.push({ scope, detail: text });
  console.error(`[mp-soak] ${scope}: ${text}`);
}

function recordScenario(role, name, result) {
  const target = bundle.scenarios.guests[role];
  target[name] = summarizeScenario(result);
  return result;
}

function summarizeScenario(result, depth = 0) {
  if (result === null || typeof result !== 'object') return result ?? null;
  if (depth >= 4) return '[evidence-depth-limit]';
  if (Array.isArray(result)) return result.slice(0, 40).map((value) => summarizeScenario(value, depth + 1));
  return Object.fromEntries(Object.entries(result).slice(0, 80).map(([key, value]) => [key, summarizeScenario(value, depth + 1)]));
}

async function runScenario(role, name, task) {
  try {
    return recordScenario(role, name, await task());
  } catch (error) {
    noteFailure(`${role}-${name}`, error);
    recordScenario(role, name, { ok: false, failure: String(error?.message ?? error) });
    return { ok: false, failure: String(error?.message ?? error) };
  }
}

async function peerViews() {
  const views = {};
  for (const role of PEERS) views[role] = await viewOf(peers[role].page).catch(() => null);
  return views;
}

function evidenceView(view) {
  if (!view) return null;
  return { selfId: view.selfId, role: view.role, matchPhase: view.matchPhase, gameStarted: view.gameStarted, remotes: view.remotes, players: view.players };
}

function addReplicationDivergences(views, second) {
  const ids = new Set(PEERS.flatMap((role) => Object.keys(views[role]?.players ?? {})));
  for (const playerId of ids) {
    for (const from of PEERS) {
      for (const to of PEERS) {
        if (from === to) continue;
        const fromPlayer = views[from]?.players?.[playerId] ?? null;
        const toPlayer = views[to]?.players?.[playerId] ?? null;
        if (fromPlayer) bundle.replication.pairDirections[`${to}->${from}`] = true;
        if (!fromPlayer || !toPlayer) {
          bundle.replication.divergences.push({ second, playerId, peer: to, field: 'presence', from, expected: 'present', actual: toPlayer ? 'present' : 'absent' });
          continue;
        }
        const fromPosition = fromPlayer.position ?? [];
        const toPosition = toPlayer.position ?? [];
        if (fromPosition.length !== 3 || toPosition.length !== 3) {
          bundle.replication.divergences.push({ second, playerId, peer: to, field: 'position-shape', from, fromPosition, toPosition });
          continue;
        }
        const distanceM = Math.hypot(fromPosition[0] - toPosition[0], fromPosition[1] - toPosition[1], fromPosition[2] - toPosition[2]);
        if (distanceM > positionBoundM) {
          bundle.replication.divergences.push({ second, playerId, peer: to, field: 'position', from, distanceM: Number(distanceM.toFixed(3)), fromPosition, toPosition });
        }
      }
    }
  }
}

async function sampleReplication(playStart) {
  let second = 0;
  while (Date.now() - playStart < PLAY_DURATION_MS) {
    await sleep(Math.max(0, playStart + (second + 1) * MP_SOAK_THRESHOLDS.sampleIntervalMs - Date.now()));
    if (Date.now() - playStart >= PLAY_DURATION_MS) break;
    const views = await peerViews();
    bundle.replication.samples.push({ second, atEpochMs: Date.now(), peers: Object.fromEntries(PEERS.map((role) => [role, evidenceView(views[role])])) });
    addReplicationDivergences(views, second);
    second += 1;
  }
}

async function scenarioStairFire(role) {
  const peer = peers[role];
  const before = await viewOf(peer.page);
  const team = await peer.page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    const value = snapshot?.player?.team ?? snapshot?.privateMatch?.members?.find((member) => member.id === snapshot?.player?.id)?.team;
    return value === 1 ? 1 : 0;
  });
  const stair = arenaStairGeometry(arenaId, team);
  if (!stair) return { ok: false, staged: false, reason: `no authored stair geometry for ${arenaId}` };
  const eyeOffset = Number(before?.players?.[before.selfId]?.position?.[1]) - stair.foot[1];
  const bodyPosition = stair.foot.map((value, index) => value + ((stair.top[index] - value) * 0.5));
  bodyPosition[1] += eyeOffset;
  const placed = await peer.page.evaluate(({ bodyPosition, uphill }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (typeof debug?.teleportPlayer !== 'function') return { ok: false, reason: 'debug teleport unavailable' };
    const yaw = Math.atan2(-uphill[0], -uphill[2]);
    debug.teleportPlayer(bodyPosition[0], bodyPosition[1], bodyPosition[2], yaw, 0);
    return { ok: true, yaw };
  }, { bodyPosition, uphill: staged.uphill });
  if (!placed.ok) return { ok: false, staged: true, placed, reason: placed.reason };

  const targetId = before.selfId;
  const convergenceStartedAt = Date.now();
  let hostPosition = null;
  let hostPositionErrorM = null;
  while (Date.now() - convergenceStartedAt <= ACK_BUDGET_MS) {
    const hostView = await viewOf(peers.host.page);
    hostPosition = hostView?.players?.[targetId]?.position ?? null;
    if (Array.isArray(hostPosition) && hostPosition.length === 3) {
      hostPositionErrorM = Math.hypot(...hostPosition.map((value, index) => value - bodyPosition[index]));
      if (hostPositionErrorM <= positionBoundM) break;
    }
    await sleep(20);
  }
  if (hostPositionErrorM === null || hostPositionErrorM > positionBoundM) {
    return {
      ok: false,
      staged: true,
      placed,
      reason: 'host did not observe the arena stair body position',
      stairAnchors: { foot: stair.foot, top: stair.top, uphill: stair.uphill },
      bodyPosition,
      hostPosition,
      hostPositionErrorM,
    };
  }

  const fireStartedAt = await peer.page.evaluate(() => performance.now());
  await peer.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const weapon = debug.snapshot().player.weapon;
    debug.setAmmo(weapon, 30, 90);
    debug.fireOnce();
  });
  await sleep(ACK_BUDGET_MS);
  const after = await viewOf(peer.page);
  const fired = Number(after?.players?.[after.selfId]?.ammo) < Number(before?.players?.[before.selfId]?.ammo);
  const trace = (await traceOf(peer.page)).entries.filter((entry) => entry.atMs >= fireStartedAt).slice(0, 40);
  return {
    ok: fired,
    staged: true,
    placed,
    fired,
    stairAnchors: { foot: stair.foot, top: stair.top, uphill: stair.uphill },
    bodyPosition,
    team,
    houseId: stair.houseId,
    hostPosition,
    hostPositionErrorM,
    weapon: after?.players?.[after.selfId]?.weapon ?? null,
    ammoBefore: before?.players?.[before.selfId]?.ammo ?? null,
    ammoAfter: after?.players?.[after.selfId]?.ammo ?? null,
    fireBlock: after?.players?.[after.selfId]?.fireBlock ?? null,
    trace,
  };
}

async function runGuestScenarios(role) {
  const guest = peers[role];
  const other = role === 'guestA' ? peers.guestB : peers.guestA;
  const host = peers.host;
  await runScenario(role, 'pickup', () => scenarioPickup(guest, host, peers, role));
  await runScenario(role, 'reloadBeforeDeath', () => scenarioReload(guest, host, peers, role));
  await runScenario(role, 'swap', () => scenarioSwap(guest, peers, role));
  await runScenario(role, 'fireAtHost', () => scenarioFire(guest, host, role, 'host'));
  await runScenario(role, 'fireAtOtherGuest', () => scenarioFire(guest, other, role, 'other-guest'));
  await guest.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const weapon = debug.snapshot().player.weapon;
    debug.setAmmo(weapon, 1, 90);
  });
  await sleep(200);
  await runScenario(role, 'damageAndDeath', () => scenarioDamageDeath(guest, host, peers, role));
  const dead = await viewOf(guest.page);
  const respawn = await runScenario(role, 'respawn', () => scenarioRespawn(guest, host, role));
  const current = await viewOf(guest.page);
  const loadoutReset = current?.players?.[current.selfId]?.alive === true
    && current.players[current.selfId].weapon === current.players[current.selfId].primary
    && current.players[current.selfId].ammo > 0
    && current.players[current.selfId].reserve > 0;
  bundle.scenarios.guests[role].respawnLoadoutReset = loadoutReset;
  bundle.scenarios.guests[role].respawnCheckpoint = summarizeScenario({ dead: dead?.players?.[dead.selfId] ?? null, after: current?.players?.[current.selfId] ?? null, result: respawn });
  const reloadAfterDeath = await runScenario(role, 'reloadAfterDeath', () => scenarioReload(guest, host, peers, role, 'post-death'));
  bundle.scenarios.guests[role].reloadAfterDeath = reloadAfterDeath?.ok === true;
}

async function runStairScenarios() {
  await Promise.all(PEERS.filter((role) => role !== 'host').map(async (role) => {
    const stair = await runScenario(role, 'stairFire', () => scenarioStairFire(role));
    bundle.scenarios.guests[role].stairFireResult = summarizeScenario(stair);
    bundle.scenarios.guests[role].stairFire = stair?.ok === true;
  }));
}

async function damageAfterRejoin() {
  const target = peers.guestB;
  const targetId = (await viewOf(target.page)).selfId;
  const before = await peerViews();
  const beforeHp = before.host?.players?.[targetId]?.hp ?? null;
  const triggeredAt = Date.now();
  const applied = await peers.host.page.evaluate((playerId) => window.__ATOMIC_ACRES_DEBUG__.damageRemoteAuthoritatively(20, playerId), targetId).catch(() => null);
  bundle.rejoin.damage.triggered = Boolean(applied);
  bundle.rejoin.damage.credited = Boolean(applied?.storedAfter < applied?.storedBefore);
  const firstSeen = Object.fromEntries(PEERS.map((role) => [role, null]));
  const byPeer = {};
  while (Date.now() - triggeredAt <= DAMAGE_RTT_MS) {
    const views = await peerViews();
    for (const role of PEERS) {
      const hp = views[role]?.players?.[targetId]?.hp ?? null;
      byPeer[role] = hp;
      if (firstSeen[role] === null && beforeHp !== null && hp !== null && hp < beforeHp) firstSeen[role] = Date.now() - triggeredAt;
    }
    if (Object.values(firstSeen).every((value) => value !== null)) break;
    await sleep(20);
  }
  bundle.rejoin.damage.byPeer = byPeer;
  bundle.rejoin.damage.firstSeenMs = firstSeen;
  const latencies = Object.values(firstSeen).filter((value) => value !== null);
  bundle.rejoin.damage.maxLatencyMs = latencies.length === PEERS.length ? Math.max(...latencies) : null;
}

async function scoreboardAtEnd() {
  const canonical = async (role) => peers[role].page.evaluate(() => {
    const scores = window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.scores ?? [];
    return scores.map((score) => [score.id, {
      kills: score.kills,
      deaths: score.deaths,
      damageDealt: score.damageDealt,
      damageTaken: score.damageTaken,
      ...(score.rangeScore === undefined ? {} : { rangeScore: score.rangeScore }),
      ...(score.rangeHits === undefined ? {} : { rangeHits: score.rangeHits }),
      ...(score.rangeShots === undefined ? {} : { rangeShots: score.rangeShots }),
    }]).sort(([a], [b]) => a.localeCompare(b));
  });
  for (const role of PEERS) bundle.scoreboard[role] = await canonical(role).catch(() => []);
  const encoded = PEERS.map((role) => JSON.stringify(bundle.scoreboard[role]));
  bundle.scoreboard.agreement = encoded.every((value) => value === encoded[0]) && encoded[0] !== '[]' && !encoded.some((value) => value.includes('null'));
}

async function scriptedPlay(playStart) {
  await Promise.all([runGuestScenarios('guestA'), runGuestScenarios('guestB')]);
  let rejoined = false;
  let lastPulse = Date.now();
  let pulse = 0;
  while (Date.now() - playStart < PLAY_DURATION_MS) {
    const elapsed = Date.now() - playStart;
    if (!rejoined && elapsed >= 90_000) {
      const rejoin = await scenarioRejoin(peers, { scenarios: {} }, 'guestB');
      bundle.rejoin.leaveObserved = Object.values(rejoin.remotesAfterLeave ?? {}).some((count) => count === 1);
      bundle.rejoin.rejoinObserved = rejoin.ok === true || Object.values(rejoin.rosterAfterRejoin ?? {}).every((status) => status === 'fulfilled');
      bundle.rejoin.seenByEveryoneAfter = Object.values(rejoin.remotesAfterRejoin ?? {}).every((count) => count === 2);
      bundle.rejoin.details = summarizeScenario(rejoin);
      await damageAfterRejoin();
      rejoined = true;
      continue;
    }
    if (Date.now() - lastPulse >= 15_000) {
      const role = pulse % 2 === 0 ? 'guestA' : 'guestB';
      await runScenario(role, `pulse${pulse}`, () => scenarioSwap(peers[role], peers, role));
      lastPulse = Date.now();
      pulse += 1;
    }
    await sleep(250);
  }
}

function killBrowserTree(browser) {
  const pid = browser?.process?.()?.pid;
  if (process.platform === 'win32' && Number.isInteger(pid) && pid > 0) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
}

async function closeOwnedBrowsers(force = false) {
  for (const peer of Object.values(peers)) {
    if (force) killBrowserTree(peer.browser);
    else await peer.context.close().catch(() => {});
  }
  for (const browser of browsers) {
    if (force) killBrowserTree(browser);
    else await browser.close().catch(() => {});
  }
}

async function writeEvidence() {
  bundle.timing.endedAtEpochMs ??= Date.now();
  bundle.timing.playDurationMs = bundle.timing.playDurationMs || Math.max(0, bundle.timing.endedAtEpochMs - bundle.timing.startedAtEpochMs);
  bundle.gate = evaluateMpSoakBundle(bundle);
  mkdirSync(outDir, { recursive: true });
  await writeFile(join(outDir, `${label}-bundle.json`), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, `${label}-table.md`), `${formatMpSoakTable(bundle.gate.rows)}\n`, 'utf8');
  console.log(`\n=== mp-soak-gate table ===\n${formatMpSoakTable(bundle.gate.rows)}`);
  console.log(`artifact: ${join(outDir, `${label}-bundle.json`)}`);
  return bundle.gate;
}

async function hardStop() {
  if (stopping) return;
  stopping = true;
  bundle.failure = `hard browser-run timeout after ${HARD_TIMEOUT_MS} ms`;
  bundle.completed = false;
  for (const role of PEERS) bundle.consoleErrors[role] = [...(peers[role]?.errors?.page ?? []), ...(peers[role]?.errors?.console ?? [])];
  for (const role of PEERS) bundle.trace[role] = await traceOf(peers[role]?.page).catch(() => null);
  await writeEvidence().catch((error) => console.error(`[mp-soak] evidence write failed: ${error.message}`));
  await closeOwnedBrowsers(true);
  peerServer?.kill();
  server?.close();
  process.exit(124);
}

async function main() {
  const roster = multiplayerArenaRoster();
  const arena = arenaId ? roster.find((entry) => entry.id === arenaId) : roster[0];
  if (!arena) throw new Error(`arena ${arenaId} is not a multiplayer arena`);
  bundle.arena = arena.id;
  server = await serveDist(PORTS.dist);
  peerServer = await startPeerServer(PORTS.peer);
  browsers = await Promise.all(PEERS.map(() => chromium.launch({ headless: true, channel: 'chrome', args: chromeArgs() })));
  hardStopTimer = setTimeout(() => { void hardStop(); }, HARD_TIMEOUT_MS);
  peers = Object.fromEntries(await Promise.all(PEERS.map(async (role, index) => {
    const browser = browsers[index];
    const peer = await openPeer(browser, role, arena.id, role === 'host' ? 'HOST' : role === 'guestA' ? 'GUESTA' : 'GUESTB', {
      port: PORTS.dist,
      peerPort: PORTS.peer,
      qaRttMs: DAMAGE_RTT_MS,
      qaLossPct: 1,
      qaSeed: QA_SEED,
      seed: `mp-soak-${arena.id}-${role}`,
    });
    return [role, peer];
  })));
  // Reuse the audit driver's real lobby engine through its public entry point.
  // The soak runs the equivalent finite lobby flow inline to keep the three
  // minute play clock separate from shader/lobby setup time.
  await peers.host.page.click('#host');
  await peers.host.page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: 45_000 });
  const roomCode = (await peers.host.page.textContent('#room-code')).trim();
  for (const role of ['guestA', 'guestB']) {
    await peers[role].page.fill('#room-input', roomCode);
    await peers[role].page.click('#join');
    await peers[role].page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members ?? []).some((member) => member.connected), undefined, { timeout: 60_000 });
  }
  await peers.host.page.selectOption('#lobby-arena', arena.id);
  await Promise.all(PEERS.map((role) => peers[role].page.waitForFunction((id) => document.querySelector('#lobby-ready')?.disabled === false && window.__ATOMIC_ACRES_DEBUG__?.snapshot().arenaSelection?.id === id, arena.id, { timeout: 160_000 })));
  await peers.host.page.click('#lobby-ready');
  await peers.guestA.page.click('#lobby-ready');
  await peers.guestB.page.click('#lobby-ready');
  await peers.host.page.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 60_000 });
  await peers.host.page.click('#lobby-start');
  await Promise.all(PEERS.map((role) => peers[role].page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true && window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active' && window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 2, undefined, { timeout: 180_000 })));

  // All three arenas are active before this point. Run the geometry probe once
  // before the timed sampling window so its deliberate local teleport cannot be
  // misclassified as a replication failure.
  bundle.timing.activeAtEpochMs = Date.now();
  await runStairScenarios();
  const playStart = Date.now();
  bundle.timing.startedAtEpochMs = playStart;
  await Promise.all([sampleReplication(playStart), scriptedPlay(playStart)]);
  bundle.timing.playDurationMs = Date.now() - playStart;
  bundle.completed = true;
  // The final kill may have been acknowledged locally before its score message
  // reaches every peer. Give the host-authoritative scoreboard one measured RTT.
  await sleep(DAMAGE_RTT_MS);
  await scoreboardAtEnd();
  for (const role of PEERS) {
    bundle.consoleErrors[role] = [...peers[role].errors.page, ...peers[role].errors.console];
    bundle.trace[role] = await traceOf(peers[role].page);
  }
  await writeEvidence();
}

try {
  await main();
} catch (error) {
  bundle.failure = String(error?.stack ?? error?.message ?? error).slice(0, 2_000);
  noteFailure('run', error);
  for (const role of PEERS) {
    bundle.consoleErrors[role] = [...(peers[role]?.errors?.page ?? []), ...(peers[role]?.errors?.console ?? [])];
    bundle.trace[role] = await traceOf(peers[role]?.page).catch(() => null);
  }
  await writeEvidence().catch((writeError) => console.error(`[mp-soak] evidence write failed: ${writeError.message}`));
  process.exitCode = 1;
} finally {
  if (hardStopTimer) clearTimeout(hardStopTimer);
  if (!stopping) {
    await closeOwnedBrowsers(false);
    peerServer?.kill();
    server?.close();
  }
}

if (bundle.gate && !bundle.gate.pass) process.exitCode = 1;
