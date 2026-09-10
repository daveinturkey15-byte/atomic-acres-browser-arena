#!/usr/bin/env node
// HF-499: three-peer multiplayer soak gate.
// The browser setup and gameplay probes are intentionally routed through the
// HF-504 audit driver's engine; this file owns only the finite soak schedule,
// evidence bundle, and release-blocking assertions.

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  ACK_BUDGET_MS,
  PEERS,
  auditFindings,
  chromeArgs,
  multiplayerArenaRoster,
  openPeer,
  scenarioFire,
  scenarioPickup,
  scenarioReload,
  scenarioScoreboard,
  scenarioSwap,
  serveDist,
  sleep,
  startPeerServer,
  traceOf,
  viewOf,
} from './mp-audit.mjs';
import { formatMpSoakTable, MP_SOAK_THRESHOLDS } from './mp-soak-assertions.mjs';
import { inspectConnectedSample } from './mp-soak-v2-contract.mjs';
import { rejoinV2, damageBoundaryV2, verifyLiveArtifact } from './mp-soak-v2-scenarios.mjs';
import { evaluateMpSoakV21, naturalDeathRespawnMapped, SOAK_CONTRACT } from './mp-soak-v21-life.mjs';
import { boundedStep, waitOrStop } from './mp-soak-v2-runtime.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PORTS = Object.freeze({
  dist: Number(process.env.MP_SOAK_DIST_PORT ?? '4233'),
  peer: Number(process.env.MP_SOAK_PEER_PORT ?? '4234'),
});
const ALLOWED_QA_PORTS = new Set([4233, 4234, 4235]);
const OUT_DIR = resolve(REPO_ROOT, 'artifacts/qa/mp-soak-gate-v21');
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
const sourceSha = arg('--sha', null);
const distPath = resolve(REPO_ROOT, arg('--dist', 'dist'));
if(!/^[0-9a-f]{40}$/.test(sourceSha??''))throw Error('Exact immutable source --sha required');
if(existsSync(join(outDir, `${label}-bundle.json`)))throw Error('Never overwrite prior MP evidence');
const TSX_CLI = resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
const ARENA_ROSTER_SCRIPT = resolve(REPO_ROOT, 'scripts/qa/mp-lab/arena-roster.mts');

for (const port of Object.values(PORTS)) {
  if (!Number.isInteger(port) || !ALLOWED_QA_PORTS.has(port)) throw new Error(`invalid QA port ${port}`);
}

const startedAtEpochMs = Date.now();
const bundle = {
  contract: SOAK_CONTRACT,
  sourceSha,
  productBase: '966dffb75b13ae35e2f29c44aee454ab18c87ca0',
  diagnosticBase: '566cad49238e6661d18fe69fbed4ba34ea21d401',
  scope: 'same-machine impaired three-peer QA, not WAN acceptance; v1 FAIL preserved',
  identities: {},
  lifecycle: { active:false, transition:null, samples:[] },
  liveArtifact: {},
  ledger: 'HF-499',
  measuredAt: new Date(startedAtEpochMs).toISOString(),
  arena: null,
  renderer,
  renderProfile,
  completed: false,
  failure: null,
  config: {
    playDurationMs: PLAY_DURATION_MS,
    hardTimeoutMs: HARD_TIMEOUT_MS,
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
  replication: { samples: [], divergences: [], classificationCounts: {}, pairDirections: Object.fromEntries(
    PEERS.flatMap((from) => PEERS.filter((to) => to !== from).map((to) => [`${from}->${to}`, false])),
  ) },
  rejoin: {
    role: 'guestB', leaveObserved: false, rejoinObserved: false, seenByEveryoneAfter: false,
    damage: { triggered: false, credited: false, maxLatencyMs: null, byPeer: {} },
  },
  admissionDropTimeline: [],
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
let hardKillTimer = null;
let stopping = false;
const cancellation = new AbortController();
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
  return { selfId: view.selfId, role: view.role, matchPhase: view.matchPhase, gameStarted: view.gameStarted, remotes: view.remotes, players: view.players, lobby:{revision:view.lobby?.revision,members:view.lobby?.members?.map(({id,connected})=>({id,connected}))}, stateAdmissionDrops: view.stateAdmissionDrops ?? null, matchAdmissionPark: view.matchAdmissionPark ?? null, clientWorldRepair: view.clientWorldRepair ?? null, clientWorldRepairFailures: view.clientWorldRepairFailures ?? null };
}


const prevAdmissionByReason = {};

function admissionDeltaFor(role, drops) {
  const byReason = drops?.byReason ?? {};
  const prev = prevAdmissionByReason[role] ?? {};
  const delta = {};
  for (const [reason, count] of Object.entries(byReason)) {
    const before = Number(prev[reason] ?? 0);
    if (Number(count) > before) delta[reason] = Number(count) - before;
  }
  prevAdmissionByReason[role] = { ...byReason };
  return delta;
}

async function sampleReplication(playStart) {
  let second = 0;
  let nextSample = playStart;
  while (!cancellation.signal.aborted && (bundle.replication.samples.length < 180 || Date.now()-playStart < PLAY_DURATION_MS)) {
    if(!await waitOrStop(nextSample-Date.now(),cancellation.signal))return;
    const atEpochMs=Date.now();
    // Capture the transition state before reads; if it changes during reads,
    // retain this as a lifecycle sample instead of claiming connected coverage.
    const wasTransition=bundle.lifecycle.active;
    const views = await peerViews();
    if(cancellation.signal.aborted)return;
    const readEndedAt=Date.now();
    const transitioning=wasTransition||bundle.lifecycle.active
      ||(bundle.lifecycle.transition?.intentAt>=atEpochMs&&bundle.lifecycle.transition.intentAt<=readEndedAt);
    const sample={second,atEpochMs,readEndedAt,identities:{...bundle.identities},peers:Object.fromEntries(PEERS.map(role=>[role,evidenceView(views[role])]))};
    const inspected=inspectConnectedSample(views,bundle.identities,transitioning?['host','guestA']:PEERS);
    for(const direction of inspected.directions)bundle.replication.pairDirections[direction]=true;
    bundle.replication.divergences.push(...inspected.failures.map(f=>({...f,second,atEpochMs,transitioning})));
    if(transitioning)bundle.lifecycle.samples.push(sample);else bundle.replication.samples.push(sample);
    const deltas = {};
    const last = {};
    for (const role of PEERS) {
      deltas[role] = admissionDeltaFor(role, views[role]?.stateAdmissionDrops);
      if (Object.keys(deltas[role]).length > 0) last[role] = views[role]?.stateAdmissionDrops?.last ?? null;
    }
    bundle.admissionDropTimeline.push({ second, atEpochMs: Date.now(), deltas, last });
    second += 1;
    // No catch-up bursts: every retained sample starts at least1000ms after
    // the previous one, including after a delayed CDP read or lifecycle step.
    nextSample=atEpochMs+MP_SOAK_THRESHOLDS.sampleIntervalMs;
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
  const stair = arenaStairGeometry(bundle.arena ?? arenaId, team);
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
  }, { bodyPosition, uphill: stair.uphill });
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
  const life=await naturalDeathRespawnMapped(peers,role,viewOf);
  // Numeric lifecycle proof is retained without the old depth truncation.
  bundle.scenarios.guests[role].naturalLife=life;
  bundle.scenarios.guests[role].respawnLoadoutReset=life.ok;
  const reloadAfterDeath = await runScenario(role, 'reloadAfterDeath', () => scenarioReload(guest, host, peers, role, 'post-death'));
  // HF-535 (evidence only, no assertion change): this line used to OVERWRITE the
  // full scenario result recordScenario had just stored with a bare boolean, so
  // the five-conjunct reload result (ammoAfter > ammoBefore, sentIntent,
  // gotResult, otherSeesReloading, hostSeesAmmo === ammoAfter) was discarded and
  // a RED row could not be attributed to a conjunct. Keep both, on the same
  // `<name>Result` + `<name>` shape the stair probe already uses; the boolean the
  // gate reads is byte-identical.
  bundle.scenarios.guests[role].reloadAfterDeathResult = summarizeScenario(reloadAfterDeath);
  bundle.scenarios.guests[role].reloadAfterDeath = reloadAfterDeath?.ok === true;
}

async function runStairScenarios() {
  // The authored stair probe deliberately teleports the local player. Running
  // both probes at once makes their host-authoritative poses race on the same
  // staircase, so the second guest can never prove its own pose was accepted.
  // Keep the probes serialized; this is setup evidence before the timed soak.
  for (const role of PEERS.filter((candidate) => candidate !== 'host')) {
    const stair = await runScenario(role, 'stairFire', () => scenarioStairFire(role));
    bundle.scenarios.guests[role].stairFireResult = summarizeScenario(stair);
    bundle.scenarios.guests[role].stairFire = stair?.ok === true;
  }
}

async function damageAfterRejoin() {
  const {report,measurement}=await damageBoundaryV2(peers,bundle.identities.guestB,viewOf);
  const applied=report.trigger?.applied;
  bundle.rejoin.damage={triggered:Boolean(applied),credited:Boolean(applied?.storedAfter<applied?.storedBefore),report,measurement,
    maxLatencyMs:measurement.verdict==='PASS'?Math.max(...Object.values(measurement.peers).map(p=>p.upperMs)):null};
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
  // Fire/death probes share authoritative targets. Do not let one guest's
  // probe kill or advance the other guest while its baseline is being read.
  for(const role of ['guestA','guestB']) {
    if(cancellation.signal.aborted)return;
    await runGuestScenarios(role);
  }
  let rejoined = false;
  let lastPulse = Date.now();
  let pulse = 0;
  while (!cancellation.signal.aborted && (bundle.replication.samples.length < 180 || Date.now()-playStart < PLAY_DURATION_MS)) {
    const elapsed = Date.now() - playStart;
    if (!rejoined && elapsed >= 90_000) {
      const rejoin=await rejoinV2(peers,bundle,viewOf);
      bundle.rejoin.leaveObserved=Object.keys(bundle.lifecycle.transition.leave).length===2;
      bundle.rejoin.rejoinObserved=rejoin.ok===true;
      bundle.rejoin.seenByEveryoneAfter=Object.values(bundle.lifecycle.transition.settled).every(s=>s.remotes===2);
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
    if(!await waitOrStop(250,cancellation.signal))return;
  }
}

function terminateOwnedRun(code) {
  // This dedicated Node driver owns the server and every browser descendant.
  // Playwright Browser has no public process() API. Never enumerate/kill by
  // executable name or affect an owner's unrelated Chrome processes.
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(process.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout:1000 });
  }
  process.exit(code);
}

async function closeOwnedBrowsers() {
  await boundedStep(()=>Promise.all(browsers.map(browser=>browser.close())),3000,'owned browser cleanup');
}

async function captureFailureDiagnostics() {
  for(const role of PEERS)bundle.consoleErrors[role]=[...(peers[role]?.errors?.page??[]),...(peers[role]?.errors?.console??[])];
  await Promise.all(PEERS.map(async role=>{
    bundle.trace[role]=await boundedStep(()=>traceOf(peers[role]?.page),1000,`${role} failure trace`).catch(()=>null);
  }));
}

function formatAdmissionSection() {
  const lines = ['## admission drops (informational — not a gate row)', ''];
  let events = 0;
  for (const entry of bundle.admissionDropTimeline) {
    for (const role of Object.keys(entry.deltas ?? {})) {
      const delta = entry.deltas[role];
      if (!delta || Object.keys(delta).length === 0) continue;
      events += 1;
      const last = entry.last?.[role];
      lines.push(`- s${entry.second} ${role} ${JSON.stringify(delta)}${last ? ` last=${JSON.stringify(last)}` : ''}`);
    }
  }
  if (events === 0) lines.push('- no state admission drops sampled on any peer');
  return lines.join('\n');
}

async function writeEvidence() {
  // HF-535 (evidence only): mp-audit keeps its own findings array and the soak
  // gate kept a different one appended only by noteFailure, so every
  // RELOAD-UNACKNOWLEDGED / DESYNC-* / PICKUP-* detail the driver recorded was
  // dropped and bundle.findings shipped as []. Merge, de-duplicated by id.
  const seenFindingIds = new Set(bundle.findings.map((finding) => finding.id ?? finding.scope));
  for (const finding of auditFindings) {
    const key = finding.id ?? JSON.stringify(finding).slice(0, 120);
    if (seenFindingIds.has(key)) continue;
    seenFindingIds.add(key);
    bundle.findings.push(summarizeScenario(finding));
  }
  bundle.timing.endedAtEpochMs ??= Date.now();
  bundle.timing.playDurationMs = bundle.timing.playDurationMs || Math.max(0, bundle.timing.endedAtEpochMs - bundle.timing.startedAtEpochMs);
  bundle.gate = evaluateMpSoakV21(bundle);
  mkdirSync(outDir, { recursive: true });
  await writeFile(join(outDir, `${label}-bundle.json`), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, `${label}-table.md`), `${formatMpSoakTable(bundle.gate.rows)}\n\n${formatAdmissionSection()}\n`, 'utf8');
  console.log(`\n=== mp-soak-gate table ===\n${formatMpSoakTable(bundle.gate.rows)}`);
  console.log(`\n=== admission drops (informational) ===\n${formatAdmissionSection()}`);
  console.log(`artifact: ${join(outDir, `${label}-bundle.json`)}`);
  return bundle.gate;
}

async function hardStop() {
  if (stopping) return;
  stopping = true;
  cancellation.abort();
  bundle.failure = `run incomplete; finalization reserve before hard ${HARD_TIMEOUT_MS}ms browser ceiling`;
  bundle.completed = false;
  await boundedStep(writeEvidence,2000,'timeout evidence').catch(error=>console.error(error.message));
  terminateOwnedRun(124);
}

async function main() {
  const roster = multiplayerArenaRoster();
  const arena = arenaId ? roster.find((entry) => entry.id === arenaId) : roster[0];
  if (!arena) throw new Error(`arena ${arenaId} is not a multiplayer arena`);
  bundle.arena = arena.id;
  server = await serveDist(PORTS.dist);
  peerServer = await startPeerServer(PORTS.peer);
  // Keep protection alive through failure diagnostics and finalization. The
  // last five seconds are reserved for evidence/cleanup, not extra gameplay.
  hardKillTimer=setTimeout(()=>terminateOwnedRun(124),HARD_TIMEOUT_MS);
  hardStopTimer=setTimeout(()=>{void hardStop();},HARD_TIMEOUT_MS-5000);
  const launches=await Promise.allSettled(PEERS.map(async()=>{
    const browser=await chromium.launch({headless:true,channel:'chrome',args:chromeArgs()});
    browsers.push(browser);
  }));
  const launchFailure=launches.find(result=>result.status==='rejected');
  if(launchFailure)throw launchFailure.reason;
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
  bundle.liveArtifact=await verifyLiveArtifact(peers,PORTS.dist,distPath);
  for(const role of PEERS)bundle.identities[role]=(await viewOf(peers[role].page)).selfId;
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
  cancellation.abort();
  bundle.failure = String(error?.stack ?? error?.message ?? error).slice(0, 2_000);
  noteFailure('run', error);
  await captureFailureDiagnostics();
  await boundedStep(writeEvidence,2000,'failure evidence').catch((writeError) => console.error(`[mp-soak] evidence write failed: ${writeError.message}`));
  process.exitCode = 1;
} finally {
  cancellation.abort();
  if (!stopping) {
    try { await closeOwnedBrowsers(); }
    catch(error) { console.error(error.message); terminateOwnedRun(process.exitCode||1); }
    peerServer?.kill();
    server?.close();
    if (hardStopTimer) clearTimeout(hardStopTimer);
    if (hardKillTimer) clearTimeout(hardKillTimer);
  }
}

if (bundle.gate && !bundle.gate.pass) process.exitCode = 1;
