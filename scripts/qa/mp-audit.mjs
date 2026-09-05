#!/usr/bin/env node
// HF-504 multiplayer systematic audit - host + TWO guests, one real lobby.
//
// Owner, 2026-09-04, verbatim: "ensure you are properly debugging multiplayer -
// some of the issues are the same we have had for months: in lobby, guest/host,
// desync, cannot reload or pick up guns, so many issues".
//
// Every existing multiplayer driver in this repo is TWO-sided (host + one
// guest). That is why a whole class of defect has survived for months: with one
// guest, "the host's view" and "the other player's view" are the same view, so
// guest-to-guest replication is never observed at all. This driver runs THREE
// peers and diffs every peer's view of every player against the host's, which
// is the authority.
//
// What it produces (artifacts/qa/mp-audit/audit.json + summary on stdout):
//   * a message trace per peer (type, bytes, direction, channel, subject),
//     read from network.qaMessageTrace() behind the qaTrace=1 QA fence;
//   * a state diff every second: for each peer, its view of each player's
//     position / weapon / ammo / health / score against the host's view;
//   * a scripted pass through the owner's named failures, per guest:
//     pick up a ground gun, reload, swap primary/secondary/back, fire at the
//     host, fire at the OTHER guest, take damage, die, respawn, leave and
//     rejoin, open the scoreboard.
//
// Ports: dist on 4198, PeerJS on 4199 (this lane's allocation; other lanes own
// 4187-4197). Browsers are headless with stock flags per
// scripts/qa/lib/browser-launch-flags.mjs - the owner works at this PC while QA
// runs and a window that steals his foreground is a harness defect.
//
// Exit code: 0 when the run COMPLETED (every scenario got a verdict), not when
// every scenario passed. Defects are data; a driver that cannot tell a real
// defect from a crashed run is worthless. A crash exits 1.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const PORT = Number(arg('--port', '4198'));
const PEER_PORT = Number(arg('--peer-port', '4199'));
const DIST = resolve(REPO_ROOT, arg('--dist', 'dist'));
const OUT_DIR = resolve(REPO_ROOT, arg('--out', 'artifacts/qa/mp-audit'));
const RENDERER = arg('--renderer', 'webgpu');
const RENDER_PROFILE = arg('--render', 'performance');
const TARGET_ARENA = arg('--arena', null);
const LABEL = arg('--label', 'baseline');
// 100 ms RTT / 1 % loss when asked. The build's own QA impairment hook
// (network.ts qaEventImpairment) delays the EVENT lane only, one way, so 50 ms
// each way is the 100 ms round trip the owner's brief names.
const LATENCY = flag('--latency');
const EVENT_DELAY_MS = Number(arg('--event-delay-ms', LATENCY ? '50' : '0'));
const EVENT_JITTER_MS = Number(arg('--event-jitter-ms', LATENCY ? '20' : '0'));
const QA_RTT_MS = Number(arg('--qa-rtt-ms', '0'));
const QA_LOSS_PCT = Number(arg('--qa-loss-pct', '0'));
const QA_SEED = arg('--qa-seed', `mp-audit-${LABEL}`);
const DIFF_SECONDS = Math.max(4, Number(arg('--diff-seconds', '12')));

const BOOT_TIMEOUT_MS = 180_000;
const ROOM_TIMEOUT_MS = 45_000;
const JOIN_TIMEOUT_MS = 60_000;
const SYNC_TIMEOUT_MS = 160_000;
// THREE peers compile effect shaders concurrently on one GPU, which the
// two-sided harnesses never had to budget for: a baseline run caught guestA at
// 95% "compiling effect shaders, ETA 7s" when the two-peer 120 s budget fired.
// This is a harness budget, not a product threshold - deploy correctness is
// still asserted, just given time proportional to the peer count.
const DEPLOY_TIMEOUT_MS = Number(arg('--deploy-timeout-ms', '300000'));
// One RTT plus scheduling slack. A host-authoritative acknowledgement that has
// not landed within this window is a defect, not slow networking: the impaired
// run adds at most EVENT_DELAY_MS + EVENT_JITTER_MS each way.
const ACK_BUDGET_MS = 1_500 + (EVENT_DELAY_MS + EVENT_JITTER_MS) * 2;

const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms));
const PEERS = ['host', 'guestA', 'guestB'];

// ---------------------------------------------------------------------------
// Local dist server + PeerJS signalling (this lane's ports only)
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.map': 'application/json',
};

function assertPortFree(port, what) {
  return new Promise((ok, fail) => {
    const probe = net.createServer();
    probe.once('error', () => fail(new Error(`${what} port ${port} is already in use - another lane may own it`)));
    probe.once('listening', () => probe.close(() => ok()));
    probe.listen(port, '127.0.0.1');
  });
}

async function serveDist(port) {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error(`${DIST}/index.html missing - run npm run build first`);
  await assertPortFree(port, 'dist');
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = resolve(DIST, `.${relative}`);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
      response.writeHead(404).end('not found');
      return;
    }
    const body = readFileSync(file);
    response.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    response.end(body);
  });
  return new Promise((ready) => server.listen(port, '127.0.0.1', () => ready(server)));
}

function peerServerReady(port) {
  return new Promise((settle) => {
    const probe = http.request({ host: '127.0.0.1', port, path: '/peerjs/id', timeout: 500 }, (response) => { response.resume(); settle(true); });
    probe.on('error', () => settle(false));
    probe.on('timeout', () => { probe.destroy(); settle(false); });
    probe.end();
  });
}

async function startPeerServer(port) {
  await assertPortFree(port, 'PeerJS');
  const child = spawn(process.execPath, [
    resolve(REPO_ROOT, 'node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1', '--port', String(port), '--path', '/peerjs', '--no-allow_discovery',
  ], { cwd: REPO_ROOT, stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await peerServerReady(port)) return child;
    if (child.exitCode !== null) throw new Error(`local PeerJS server exited with code ${child.exitCode}`);
    await sleep(100);
  }
  child.kill();
  throw new Error('local PeerJS server never became ready');
}

function multiplayerArenaRoster() {
  const tsxCli = resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
  const result = spawnSync(process.execPath, [tsxCli, resolve(SCRIPT_DIR, 'mp-lab/arena-roster.mts'), '--print'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`arena-roster.mts failed: ${result.stderr || result.stdout}`);
  const roster = JSON.parse(result.stdout.trim().split('\n').pop());
  if (!Array.isArray(roster) || roster.length === 0) throw new Error('arena-roster.mts produced no multiplayer arenas');
  return roster;
}

// ---------------------------------------------------------------------------
// Peers
// ---------------------------------------------------------------------------
function chromeArgs() {
  return [
    ...SILENT_ARGS,
    '--use-angle=d3d11', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    '--autoplay-policy=no-user-gesture-required',
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ];
}

function pageUrl(role, arenaId, options = {}) {
  const port = options.port ?? PORT;
  const peerPort = options.peerPort ?? PEER_PORT;
  const rttMs = options.qaRttMs ?? QA_RTT_MS;
  const lossPct = options.qaLossPct ?? QA_LOSS_PCT;
  const seed = options.qaSeed ?? QA_SEED;
  const url = new URL(`http://127.0.0.1:${port}/`);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', RENDERER);
  url.searchParams.set('render', RENDER_PROFILE);
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('qaTrace', '1');
  url.searchParams.set('peerQaPort', String(peerPort));
  url.searchParams.set('peerQaPath', '/peerjs');
  if (EVENT_DELAY_MS > 0) url.searchParams.set('eventDelayQaMs', String(EVENT_DELAY_MS));
  if (EVENT_JITTER_MS > 0) url.searchParams.set('eventJitterQaMs', String(EVENT_JITTER_MS));
  if (rttMs > 0) url.searchParams.set('qaRttMs', String(rttMs));
  if (lossPct > 0) url.searchParams.set('qaLossPct', String(lossPct));
  if (rttMs > 0 || lossPct > 0) url.searchParams.set('qaSeed', seed);
  url.searchParams.set('seed', options.seed ?? `mp-audit-${arenaId}-${role}`);
  return url.toString();
}

async function openPeer(browser, role, arenaId, name, options = {}) {
  // Fresh context per peer: a saved room code or sticky renderer-fallback record
  // in storage means the second guest is not a fresh join.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = { page: [], console: [] };
  page.on('pageerror', (error) => { if (errors.page.length < 40) errors.page.push(String(error?.message ?? error).slice(0, 300)); });
  page.on('console', (message) => {
    if (message.type() !== 'error' || errors.console.length >= 60) return;
    errors.console.push(message.text().slice(0, 300));
  });
  const cdp = await context.newCDPSession(page);
  // Headless documents never own the foreground and the renderer refuses to
  // present without it (browserOwnsForegroundPresentation).
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.goto(pageUrl(role, arenaId, options), { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.map-card[data-arena-id]')].some((button) => !button.disabled),
    undefined,
    { timeout: BOOT_TIMEOUT_MS },
  );
  await page.fill('#player-name', name);
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  return { role, name, page, context, browser, errors, backend, arenaId };
}

/** One peer's whole authoritative-relevant view, in the shape the diff needs. */
const viewOf = (page) => page.evaluate(() => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const snapshot = debug?.snapshot();
  if (!snapshot) return null;
  const round = (value) => (typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(2)) : null);
  const scores = snapshot.privateMatch?.scores ?? [];
  const scoreOf = (id) => {
    const row = scores.find((entry) => entry.id === id || entry.playerId === id);
    return row ? { kills: row.kills ?? null, deaths: row.deaths ?? null, score: row.score ?? null } : null;
  };
  // Self, then every remote this peer believes in. Keyed by player id so three
  // peers' views of the SAME player line up.
  const players = {};
  players[snapshot.player.id] = {
    self: true,
    hp: snapshot.player.hp,
    alive: snapshot.player.alive,
    weapon: snapshot.player.weapon,
    primary: snapshot.player.primaryWeapon,
    secondary: snapshot.player.secondaryWeapon,
    ammo: snapshot.player.ammo ?? null,
    reserve: snapshot.player.reserve ?? null,
    reloading: snapshot.player.reloading ?? null,
    kills: snapshot.player.kills,
    deaths: snapshot.player.deaths,
    position: (snapshot.player.position ?? []).map(round),
    seq: snapshot.player.seq ?? null,
    score: scoreOf(snapshot.player.id),
  };
  for (const remote of snapshot.remotePlayers ?? []) {
    players[remote.id] = {
      self: false,
      hp: remote.hp,
      alive: remote.hp > 0,
      weapon: remote.weapon,
      primary: remote.primary,
      secondary: remote.secondary,
      ammo: remote.combatInventory?.ammo?.[remote.weapon] ?? null,
      reserve: remote.combatInventory?.reserve?.[remote.weapon] ?? null,
      reloading: remote.reloading ?? null,
      kills: null,
      deaths: null,
      position: (remote.authoritativePosition ?? remote.position ?? []).map(round),
      seq: remote.seq ?? null,
      authoritativeReady: remote.authoritativeReady ?? true,
      snapshotAgeMs: round(remote.snapshotAgeMs),
      score: scoreOf(remote.id),
    };
  }
  return {
    atMs: Math.round(performance.now()),
    selfId: snapshot.player.id,
    role: snapshot.networkRole ?? null,
    gameStarted: snapshot.gameStarted,
    matchPhase: snapshot.matchPhase,
    arenaId: snapshot.arenaSelection?.id ?? null,
    lobby: snapshot.privateMatch ? {
      phase: snapshot.privateMatch.phase,
      revision: snapshot.privateMatch.revision,
      arenaId: snapshot.privateMatch.arenaId,
      members: (snapshot.privateMatch.members ?? []).map((member) => ({
        id: member.id, name: member.name, ready: member.ready ?? null, connected: member.connected ?? null, team: member.team ?? null, host: member.host ?? null,
      })),
      localPingMs: snapshot.privateMatch.localPingMs ?? null,
    } : null,
    remotes: snapshot.remotes,
    players,
    fireBlock: snapshot.fireBlock ? { total: snapshot.fireBlock.total, byReason: { ...snapshot.fireBlock.byReason }, last: snapshot.fireBlock.last } : null,
    stateAdmissionDrops: snapshot.stateAdmissionDrops ?? null,
    ui: {
      menuHidden: document.querySelector('#menu')?.classList.contains('hidden') ?? null,
      readyDisabled: document.querySelector('#lobby-ready')?.disabled ?? null,
      startDisabled: document.querySelector('#lobby-start')?.disabled ?? null,
      roster: document.querySelectorAll('#lobby-roster .lobby-player').length,
      guidance: document.querySelector('#lobby-guidance')?.textContent?.trim() ?? null,
    },
  };
});

const traceOf = (page) => page.evaluate(() => {
  const trace = window.__ATOMIC_ACRES_DEBUG__?.sampleMessageTrace?.();
  if (!trace) return { enabled: false, entries: [], recorded: 0, dropped: 0 };
  return trace;
});

/** Message types seen since a mark, in order - the ack evidence for a request. */
async function traceSince(peer, sinceMs) {
  const trace = await traceOf(peer.page);
  return trace.entries.filter((entry) => entry.atMs >= sinceMs);
}
const markOf = (peer) => peer.page.evaluate(() => performance.now());

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------
const findings = [];
function record(id, severity, symptom, detail) {
  findings.push({ id, severity, symptom, detail });
  console.log(`  [${severity}] ${id}: ${symptom}`);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const roster = multiplayerArenaRoster();
  const arena = TARGET_ARENA ? roster.find((entry) => entry.id === TARGET_ARENA) : roster[0];
  if (!arena) throw new Error(`arena ${TARGET_ARENA} is not a multiplayer arena; roster=${roster.map((entry) => entry.id).join(',')}`);

  const report = {
    contract: 'mp-audit-v1',
    label: LABEL,
    ledger: 'HF-504',
    measuredAt: new Date().toISOString(),
    arena: arena.id,
    renderer: RENDERER,
    renderProfile: RENDER_PROFILE,
    impairment: { eventDelayMs: EVENT_DELAY_MS, eventJitterMs: EVENT_JITTER_MS, qaRttMs: QA_RTT_MS, qaLossPct: QA_LOSS_PCT, qaSeed: QA_SEED, ackBudgetMs: ACK_BUDGET_MS },
    ports: { dist: PORT, peer: PEER_PORT },
    flow: [],
    scenarios: {},
    rowMeasures: {},
    stateDiff: { samples: [], divergences: [], samplesCompared: 0 },
    trace: {},
    findings,
    completed: false,
    failure: null,
  };
  const step = (name, extra = {}) => {
    report.flow.push({ name, atMs: Date.now(), ...extra });
    console.log(`[mp-audit] ${name}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`);
  };

  let server = null;
  let peerServer = null;
  const browsers = [];
  const peers = {};
  try {
    server = await serveDist(PORT);
    peerServer = await startPeerServer(PEER_PORT);
    step('servers-up', { dist: PORT, peer: PEER_PORT });

    for (const role of PEERS) browsers.push(await chromium.launch({ headless: true, channel: 'chrome', args: chromeArgs() }));
    step('browsers-up', { count: browsers.length });

    const [host, guestA, guestB] = await Promise.all(
      PEERS.map((role, index) => openPeer(browsers[index], role, arena.id, role === 'host' ? 'HOST' : role === 'guestA' ? 'GUESTA' : 'GUESTB')),
    );
    Object.assign(peers, { host, guestA, guestB });
    step('booted', { backends: PEERS.map((role) => peers[role].backend) });

    await runLobby(peers, arena, report, step);
    await runStateDiff(peers, report, step);
    await runScenarios(peers, report, step);

    for (const role of PEERS) report.trace[role] = await traceOf(peers[role].page).catch(() => null);
    await auditTrace(report);
    report.completed = true;
  } catch (error) {
    report.failure = String(error?.stack ?? error?.message ?? error).slice(0, 2_000);
    console.error(`[mp-audit] RUN FAILURE ${report.failure}`);
    for (const role of PEERS) {
      if (!peers[role]) continue;
      report.trace[role] = await traceOf(peers[role].page).catch(() => null);
      await peers[role].page.screenshot({ path: join(OUT_DIR, `${LABEL}-${role}-failure.png`) }).catch(() => {});
    }
  } finally {
    for (const role of PEERS) {
      if (!peers[role]) continue;
      report.scenarios[`${role}-errors`] = peers[role].errors;
    }
    // Evidence first. A page still compiling shaders can hang close() for
    // minutes, and the first baseline run was lost exactly that way: the
    // findings existed in memory and never reached disk.
    await writeFile(join(OUT_DIR, `${LABEL}-audit.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const closeWithin = (what, task) => Promise.race([
      task.catch(() => {}),
      sleep(15_000).then(() => console.log(`[mp-audit] ${what} did not close within 15 s; abandoning it`)),
    ]);
    for (const role of PEERS) {
      if (!peers[role]) continue;
      await closeWithin(`${role} context`, peers[role].context.close());
    }
    for (const [index, browser] of browsers.entries()) await closeWithin(`browser ${index}`, browser.close());
    peerServer?.kill();
    server?.close();
  }

  printSummary(report);
  return report.completed ? 0 : 1;
}

// --- lobby: create, join x2, ready, start ----------------------------------
async function runLobby(peers, arena, report, step) {
  const { host, guestA, guestB } = peers;
  const lobby = { ok: false };
  report.scenarios.lobby = lobby;
  const measure = (id, caseName, ok, detail = {}) => {
    report.rowMeasures[id] ??= [];
    report.rowMeasures[id].push({ case: caseName, ok, ...detail });
  };

  await host.page.click('#host');
  await host.page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: ROOM_TIMEOUT_MS });
  const roomCode = (await host.page.textContent('#room-code')).trim();
  lobby.roomCode = roomCode.length;
  const hostAlone = await host.page.evaluate(() => ({
    startDisabled: document.querySelector('#lobby-start')?.disabled ?? null,
    members: window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members ?? [],
  }));
  lobby.hostAlone = hostAlone;
  measure('L-1', 'host-alone', hostAlone.startDisabled === true, { result: hostAlone });
  step('room-open', { codeLength: roomCode.length });

  // Guests join one at a time so the second join is observed against a lobby
  // that already has a guest in it - the case a two-sided driver never sees.
  for (const guest of [guestA, guestB]) {
    await guest.page.fill('#room-input', roomCode);
    await guest.page.waitForFunction(() => document.querySelector('#join')?.disabled === false, undefined, { timeout: JOIN_TIMEOUT_MS });

    // OWNER ITEM "game starts before all people join": sample #lobby-start on
    // the host across the whole join, and flag any sample where START is
    // enabled while the roster is short or a member is not ready.
    const watch = { stop: false, violations: [] };
    const watching = (async () => {
      while (!watch.stop) {
        const sample = await host.page.evaluate(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
          const members = snapshot?.privateMatch?.members ?? [];
          return {
            startDisabled: document.querySelector('#lobby-start')?.disabled ?? null,
            connected: members.filter((member) => member.connected).length,
            ready: members.filter((member) => member.ready).length,
            members: members.length,
          };
        }).catch(() => null);
        if (sample && sample.startDisabled === false && sample.connected < 2) watch.violations.push(sample);
        await sleep(40);
      }
    })();

    await guest.page.click('#join');
    await guest.page.waitForFunction(
      () => (window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members ?? []).some((member) => member.connected),
      undefined,
      { timeout: JOIN_TIMEOUT_MS },
    );
    watch.stop = true;
    await watching;
    if (watch.violations.length > 0) {
      record('LOBBY-START-EARLY', 'high', 'host START enabled while the roster was incomplete',
        { guest: guest.role, samples: watch.violations.slice(0, 5), count: watch.violations.length });
    }
    step('guest-joined', { guest: guest.role });
  }

  // Every peer must agree the lobby holds three connected members.
  const rosterSettled = await Promise.allSettled(PEERS.map((role) => peers[role].page.waitForFunction(
    () => (window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members ?? []).filter((member) => member.connected).length === 3,
    undefined,
    { timeout: JOIN_TIMEOUT_MS },
  )));
  lobby.rosterAgreement = Object.fromEntries(PEERS.map((role, index) => [role, rosterSettled[index].status]));
  const disagreeing = PEERS.filter((role, index) => rosterSettled[index].status === 'rejected');
  if (disagreeing.length > 0) {
    const views = {};
    for (const role of PEERS) views[role] = (await viewOf(peers[role].page).catch(() => null))?.lobby ?? null;
    record('LOBBY-ROSTER-SPLIT', 'high', 'peers disagree about who is in the lobby',
      { disagreeing, views });
  }
  const lobbyViews = {};
  for (const role of PEERS) lobbyViews[role] = (await viewOf(peers[role].page).catch(() => null))?.lobby ?? null;
  const lobbyKeys = PEERS.map((role) => JSON.stringify(lobbyViews[role] && {
    phase: lobbyViews[role].phase,
    revision: lobbyViews[role].revision,
    arenaId: lobbyViews[role].arenaId,
    members: lobbyViews[role].members,
  }));
  measure('L-4', 'authoritative-snapshot-agreement', new Set(lobbyKeys).size === 1, { views: lobbyViews });

  // Host picks the arena; every peer must follow the authoritative choice.
  await host.page.selectOption('#lobby-arena', arena.id);
  const syncSettled = await Promise.allSettled(PEERS.map((role) => peers[role].page.waitForFunction(
    (arenaId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return snapshot?.arenaSelection?.id === arenaId && document.querySelector('#lobby-ready')?.disabled === false;
    },
    arena.id,
    { timeout: SYNC_TIMEOUT_MS },
  )));
  lobby.arenaSync = Object.fromEntries(PEERS.map((role, index) => [role, syncSettled[index].status]));
  const unsynced = PEERS.filter((role, index) => syncSettled[index].status === 'rejected');
  if (unsynced.length > 0) {
    record('LOBBY-ARENA-UNSYNCED', 'high', 'a peer never reached the host-selected arena or never got a usable READY',
      { unsynced, arena: arena.id });
  }
  step('arena-synced', lobby.arenaSync);

  // READY: host and guest A only. START must stay disabled while guest B is
  // unready, and the host's READY bit must be the same authority used by the
  // commit path (L-3).
  await host.page.click('#lobby-ready');
  await guestA.page.click('#lobby-ready');
  await sleep(ACK_BUDGET_MS);
  const partial = await host.page.evaluate(() => {
    const members = window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members ?? [];
    return { startDisabled: document.querySelector('#lobby-start')?.disabled ?? null, ready: members.filter((member) => member.ready).length, members: members.length };
  });
  lobby.partialReady = partial;
  if (partial.startDisabled === false && partial.ready < partial.members - 1) {
    record('LOBBY-START-UNREADY', 'high', 'host START enabled while a joined guest had not readied',
      partial);
  }
  measure('L-3', 'host-and-one-guest-ready', partial.startDisabled === true, { result: partial });

  // The host's own view of guest A's ready must match guest A's view of itself.
  const readyViews = {};
  for (const role of PEERS) {
    const view = await viewOf(peers[role].page).catch(() => null);
    readyViews[role] = (view?.lobby?.members ?? []).map((member) => ({ name: member.name, ready: member.ready }));
  }
  lobby.readyViews = readyViews;
  const readyKey = (rows) => JSON.stringify([...rows].sort((a, b) => String(a.name).localeCompare(String(b.name))));
  if (new Set(PEERS.map((role) => readyKey(readyViews[role] ?? []))).size > 1) {
    record('LOBBY-READY-SPLIT', 'high', 'peers disagree about who has readied', readyViews);
  }

  await guestB.page.click('#lobby-ready');
  await host.page.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: JOIN_TIMEOUT_MS });
  const steadyRevision = await host.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.revision ?? null);
  await sleep(2_300);
  const telemetryRevision = await host.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.revision ?? null);
  lobby.telemetryRevision = { before: steadyRevision, after: telemetryRevision };
  measure('L-9', 'telemetry-does-not-advance-revision', steadyRevision !== null && telemetryRevision === steadyRevision, { result: lobby.telemetryRevision });
  step('all-ready');

  const allReadyStart = await host.page.evaluate(() => {
    const members = window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members ?? [];
    return {
      startDisabled: document.querySelector('#lobby-start')?.disabled ?? null,
      ready: members.filter((member) => member.ready).length,
      members: members.length,
    };
  });
  const allReadyStartEnabled = allReadyStart.startDisabled === false;
  measure('L-3', 'all-ready-start-enabled', allReadyStartEnabled, { result: allReadyStart });
  await host.page.click('#lobby-start');
  await sleep(250);
  const countdownTitles = Object.fromEntries(await Promise.all(PEERS.map(async (role) => [
    role,
    await peers[role].page.textContent('#private-lobby-title').catch(() => null),
  ])));
  lobby.countdownTitles = countdownTitles;
  const countdownValues = Object.values(countdownTitles).filter((title) => /^DEPLOYING IN [0-5]$/.test(String(title).trim()));
  measure('L-7', 'host-time-countdown', countdownValues.length === PEERS.length, { result: countdownTitles });
  const deployed = await Promise.allSettled(PEERS.map((role) => peers[role].page.waitForFunction(
    (arenaId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return snapshot?.gameStarted === true && snapshot.matchPhase === 'active' && snapshot.arenaSelection?.id === arenaId
        && snapshot.remotes === 2 && document.querySelector('#menu')?.classList.contains('hidden') === true;
    },
    arena.id,
    { timeout: DEPLOY_TIMEOUT_MS },
  )));
  lobby.deploy = Object.fromEntries(PEERS.map((role, index) => [role, deployed[index].status]));
  const undeployed = PEERS.filter((role, index) => deployed[index].status === 'rejected');
  if (undeployed.length > 0) {
    const views = {};
    for (const role of PEERS) views[role] = await viewOf(peers[role].page).catch(() => null);
    record('DEPLOY-INCOMPLETE', 'critical', 'a peer never reached an active match with both other players present',
      { undeployed, views: Object.fromEntries(Object.entries(views).map(([role, view]) => [role, view && { matchPhase: view.matchPhase, remotes: view.remotes, gameStarted: view.gameStarted, guidance: view.ui.guidance }])) });
    throw new Error(`deploy incomplete: ${undeployed.join(',')}`);
  }
  lobby.ok = true;
  step('deployed');
}

// --- the every-second cross-peer state diff --------------------------------
async function runStateDiff(peers, report, step) {
  step('state-diff', { seconds: DIFF_SECONDS });
  const FIELDS = ['hp', 'weapon', 'ammo', 'reserve', 'kills', 'deaths'];
  for (let second = 0; second < DIFF_SECONDS; second += 1) {
    const views = {};
    for (const role of PEERS) views[role] = await viewOf(peers[role].page).catch(() => null);
    const hostView = views.host;
    if (!hostView) { await sleep(1_000); continue; }
    const sample = { second, players: {} };
    let sampleCompared = false;
    for (const [playerId, hostPlayer] of Object.entries(hostView.players)) {
      const row = { host: hostPlayer };
      for (const role of ['guestA', 'guestB']) {
        const guestPlayer = views[role]?.players?.[playerId] ?? null;
        row[role] = guestPlayer;
        if (!guestPlayer) {
          report.stateDiff.divergences.push({ second, playerId, peer: role, field: 'presence', host: 'present', peerValue: 'absent' });
          continue;
        }
        // A guest-side remote is not comparable until its first state-lane
        // admission. The object may exist from the join envelope, but its
        // seed pose is deliberately withheld from presentation.
        if (guestPlayer.authoritativeReady === false) continue;
        sampleCompared = true;
        for (const field of FIELDS) {
          // A guest's view of a REMOTE carries no kills/deaths (they are not in
          // the replicated snapshot), so only compare what the peer actually
          // claims to know. A null on the peer side is missing replication of a
          // field the host does publish, and that is itself the finding.
          const hostValue = hostPlayer[field];
          const peerValue = guestPlayer[field];
          if (peerValue === null || peerValue === undefined) continue;
          if (hostValue === null || hostValue === undefined) continue;
          if (hostValue !== peerValue) {
            report.stateDiff.divergences.push({ second, playerId, peer: role, field, host: hostValue, peerValue });
          }
        }
        const hostPos = hostPlayer.position ?? [];
        const peerPos = guestPlayer.position ?? [];
        if (hostPos.length === 3 && peerPos.length === 3) {
          const distance = Math.hypot(hostPos[0] - peerPos[0], hostPos[1] - peerPos[1], hostPos[2] - peerPos[2]);
          // 1.5 m is roughly a player's own width: beyond it, two peers are
          // shooting at different places.
          if (distance > 1.5) {
            report.stateDiff.divergences.push({ second, playerId, peer: role, field: 'position', host: hostPos, peerValue: peerPos, distanceM: Number(distance.toFixed(2)) });
          }
        }
      }
      sample.players[playerId] = row;
    }
    report.stateDiff.samples.push(sample);
    if (sampleCompared) report.stateDiff.samplesCompared += 1;
    await sleep(1_000);
  }
  const byField = {};
  for (const divergence of report.stateDiff.divergences) byField[divergence.field] = (byField[divergence.field] ?? 0) + 1;
  report.stateDiff.byField = byField;
  for (const [field, count] of Object.entries(byField)) {
    record(`DESYNC-${field.toUpperCase()}`, field === 'presence' ? 'critical' : 'high',
      `a guest's view of ${field} disagreed with the host in ${count} of ${DIFF_SECONDS} samples`,
      { field, count, samples: report.stateDiff.divergences.filter((row) => row.field === field).slice(0, 6) });
  }
  if (Object.keys(byField).length === 0) step('state-diff-clean');
  report.rowMeasures['X-2'] = [{
    case: 'post-deploy-state-diff',
    ok: report.stateDiff.samplesCompared > 0
      && !report.stateDiff.divergences.some((divergence) => divergence.field === 'position'),
    result: {
      divergencesByField: byField,
      samples: report.stateDiff.samples.length,
      samplesCompared: report.stateDiff.samplesCompared,
    },
  }];
}

// --- the owner's named scenarios, per guest --------------------------------
async function runScenarios(peers, report, step) {
  const { host } = peers;
  for (const role of ['guestA', 'guestB']) {
    const guest = peers[role];
    const results = {};
    report.scenarios[role] = results;
    step('scenarios', { peer: role });

    results.pickup = await scenarioPickup(guest, host, peers, role);
    results.autoScavenge = await scenarioAutoScavenge(guest, host, peers, role);
    results.reload = await scenarioReload(guest, host, peers, role);
    results.swap = await scenarioSwap(guest, peers, role);
    results.fireAtHost = await scenarioFire(guest, host, role, 'host');
    results.fireAtGuest = await scenarioFire(guest, peers[role === 'guestA' ? 'guestB' : 'guestA'], role, 'other-guest');
    results.damageAndDeath = await scenarioDamageDeath(guest, host, peers, role);
    results.respawn = await scenarioRespawn(guest, host, role);
    // HITL 6 extension: the owner reported that the first death can poison a
    // guest's reload action sequence, so exercise reload only after that death
    // and its real respawn. Keep this after the existing death/respawn pair so
    // the scenario is explicit in the evidence rather than inferred from a
    // pre-death reload.
    results.reloadAfterDeath = await scenarioReloadAfterDeath(guest, host, peers, role);
    // HITL 6 extension: exercise the W-1 cadence boundary with a real slow
    // shot, a production switch to the fast sidearm, and a shot after the
    // switch's authored presentation window.
    results.swapSlowThenFastThenFire = await scenarioSwapSlowThenFastThenFire(
      guest, host, role,
    );
    results.reloadAfterRespawn = await scenarioReload(guest, host, peers, role, 'post-respawn');
    results.pickupAuthority = await scenarioPickupAuthority(guest, host, peers, role);
    results.scoreboard = await scenarioScoreboard(guest, host, role);
    for (const [caseName, scenario] of [
      ['pickup-rejected-claim', results.pickup],
      ['auto-scavenge-rejected-claim', results.autoScavenge],
      ['pickup-accepted-claim', results.pickupAuthority],
      ['reload-after-respawn', results.reloadAfterRespawn],
    ]) {
      for (const rowId of scenario.measuredRows ?? []) {
        report.rowMeasures[rowId] ??= [];
        report.rowMeasures[rowId].push({ role, case: caseName, ok: scenario.ok, result: scenario });
      }
    }
  }
  // HF-509: the whole lobby must see, hear and be pointed at a live killstreak.
  report.scenarios.killstreakAwareness = await scenarioKillstreakAwareness(peers, report);
  // Rejoin last: it tears a peer's session down, so everything else has run.
  report.scenarios.rejoin = await scenarioRejoin(peers, report);
}

/** HF-509 owner brief: "the whole map should be aware if a killstreak ... is
 *  there". The HOST (controller) activates a Chopper Gunner. Both guests must
 *  (1) receive the host-broadcast `killstreak-announce` and show the banner,
 *  (2) replicate the chopper's position/phase every tick, within a bound of
 *  the host's authoritative view, and (3) when the chopper hits them, get a
 *  damage-source cue naming CHOPPER GUNNER. Guests never author any of it. */
async function scenarioKillstreakAwareness(peers, report) {
  const result = { ok: false, guests: {} };
  const host = peers.host;
  const hostId = (await viewOf(host.page)).selfId;
  const marks = {};
  for (const role of ['guestA', 'guestB']) marks[role] = await markOf(peers[role]);
  result.activated = await host.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (typeof debug?.earnSupport !== 'function' || typeof debug?.activateKillstreak !== 'function') return { ok: false, reason: 'killstreak QA hooks missing' };
    try {
      debug.earnSupport(15);
      const slots = debug.snapshot().killstreak?.actors?.find((actor) => actor.actorId === debug.snapshot().player.id)?.loadout?.slots ?? null;
      const accepted = debug.activateKillstreak('chopper');
      return { ok: accepted === true, slots };
    } catch (error) { return { ok: false, reason: String(error?.message ?? error) }; }
  });
  if (!result.activated.ok) {
    record('KILLSTREAK-ACTIVATE-FAILED-host', 'critical', 'the host could not activate a Chopper Gunner for the awareness scenario', result.activated);
    return result;
  }
  await sleep(ACK_BUDGET_MS);
  const hostAwareness = await host.page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { announcements: snapshot.killstreakAwareness?.announcements ?? null, entities: (snapshot.killstreak?.entities ?? []).map((entity) => ({ id: entity.id, kind: entity.kind, phase: entity.phase, ownerId: entity.ownerId, position: entity.position })) };
  });
  result.host = hostAwareness;
  const chopperId = hostAwareness.entities.find((entity) => entity.kind === 'chopper' && entity.ownerId === hostId)?.id ?? null;
  if (!chopperId) {
    record('KILLSTREAK-NO-HOST-ENTITY', 'critical', 'host accepted the activation but its own snapshot has no chopper entity', hostAwareness);
    return result;
  }
  const guestAwareness = (page) => page.evaluate((wantedId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const banner = document.querySelector('#killstreak-alert');
    const entity = (snapshot.killstreak?.entities ?? []).find((candidate) => candidate.id === wantedId) ?? null;
    return {
      atMs: Math.round(performance.now()),
      announcements: snapshot.killstreakAwareness?.announcements ?? null,
      damageSource: snapshot.killstreakAwareness?.damageSource ?? null,
      banner: banner ? { hidden: banner.hidden, text: banner.textContent?.replace(/\s+/g, ' ').trim() ?? '', tone: banner.dataset.tone ?? null } : null,
      entity: entity ? { id: entity.id, kind: entity.kind, phase: entity.phase, ownerId: entity.ownerId, position: entity.position } : null,
      hp: snapshot.player.hp,
    };
  }, chopperId);
  for (const role of ['guestA', 'guestB']) {
    const guest = peers[role];
    const row = { announced: false, bannerShown: false, replicated: false, positionSamples: [], damageSource: null };
    const trace = await traceSince(guest, marks[role]);
    row.trace = trace.map((entry) => `${entry.direction}:${entry.type}`).filter((entry) => /killstreak/.test(entry)).slice(0, 30);
    row.announced = trace.some((entry) => entry.direction === 'in' && entry.type === 'killstreak-announce');
    row.relayedByGuest = trace.some((entry) => entry.direction === 'out' && entry.type === 'killstreak-announce');
    const first = await guestAwareness(guest.page);
    row.announcements = first.announcements;
    row.banner = first.banner;
    row.bannerShown = Boolean(first.banner && !first.banner.hidden && /CHOPPER GUNNER/.test(first.banner.text))
      || Boolean(first.announcements?.some((entry) => entry.source === 'chopper' && entry.ownerId === hostId));
    // Position replication: three samples one tick-window apart, each compared to the host's authority at the same moment.
    for (let sample = 0; sample < 3; sample += 1) {
      const [guestView, hostView] = await Promise.all([
        guestAwareness(guest.page),
        host.page.evaluate((wantedId) => (window.__ATOMIC_ACRES_DEBUG__.snapshot().killstreak?.entities ?? []).find((entity) => entity.id === wantedId) ?? null, chopperId),
      ]);
      const distance = guestView.entity && hostView
        ? Number(Math.hypot(...guestView.entity.position.map((value, axis) => value - hostView.position[axis])).toFixed(2))
        : null;
      row.positionSamples.push({ guestPhase: guestView.entity?.phase ?? null, hostPhase: hostView?.phase ?? null, distanceFromHostM: distance });
      await sleep(400);
    }
    row.replicated = row.positionSamples.every((sample) => sample.distanceFromHostM !== null);
    if (!row.announced) record(`KILLSTREAK-ANNOUNCE-MISSING-${role}`, 'critical', 'guest never received the host killstreak-announce', { trace: row.trace });
    if (row.relayedByGuest) record(`KILLSTREAK-ANNOUNCE-RELAYED-${role}`, 'critical', 'a guest authored a killstreak-announce; only the host may', { trace: row.trace });
    if (!row.bannerShown) record(`KILLSTREAK-BANNER-MISSING-${role}`, 'major', 'guest shows no CHOPPER GUNNER banner after the host activation', { banner: row.banner, announcements: row.announcements });
    if (!row.replicated) record(`KILLSTREAK-ENTITY-MISSING-${role}`, 'critical', 'guest snapshot has no replica of the host chopper', { samples: row.positionSamples });
    result.guests[role] = row;
  }
  // Damage source: wait for the AI gunner to hit either guest (bounded; not forced).
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    for (const role of ['guestA', 'guestB']) {
      const view = await guestAwareness(peers[role].page);
      if (view.damageSource) result.guests[role].damageSource = view.damageSource;
    }
    if (Object.values(result.guests).some((row) => row.damageSource)) break;
    await sleep(1_000);
  }
  for (const role of ['guestA', 'guestB']) {
    const row = result.guests[role];
    row.damageSourceLabelled = Boolean(row.damageSource && row.damageSource.label === 'CHOPPER GUNNER' && Array.isArray(row.damageSource.position));
  }
  result.damageObserved = Object.values(result.guests).some((row) => row.damageSourceLabelled);
  if (!result.damageObserved) {
    record('KILLSTREAK-DAMAGE-SOURCE-UNOBSERVED', 'info', 'the AI chopper hit neither guest inside the 25 s window, so the damage-source cue row is OPEN in this run',
      { guests: Object.fromEntries(Object.entries(result.guests).map(([role, row]) => [role, row.damageSource])) });
  }
  result.ok = Object.values(result.guests).every((row) => row.announced && !row.relayedByGuest && row.bannerShown && row.replicated && row.damageSourceLabelled);
  return result;
}

/** P-3/P-4 negative path: a stale guest-local drop is a rejected claim. The
 *  request must reach only the host, and the host's correction must be visible
 *  to the claimant and the other guest. */
async function scenarioPickup(guest, host, peers, role) {
  const result = { ok: false, steps: [], measuredRows: ['P-3', 'P-4'] };
  const otherRole = role === 'guestA' ? 'guestB' : 'guestA';
  const other = peers[otherRole];
  const before = await viewOf(guest.page);
  const selfId = before.selfId;
  result.weaponBefore = before.players[selfId].weapon;
  const mark = await markOf(guest);

  // spawnDeathDrop stages a drop from `victim: player.id` - i.e. the guest's
  // OWN primary. Picking your own identical full-reserve weapon back up is a
  // no-op the game refuses on purpose (death-drops.ts consumeDeathDropWeapon),
  // so staging it naively measures the refusal, not the owner's defect. Give
  // the guest a different primary first, drop that, then equip something else,
  // so the F-press is a genuine cross-weapon pickup.
  const spawned = await guest.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (typeof debug?.spawnDeathDrop !== 'function') return { ok: false, reason: 'spawnDeathDrop missing' };
    if (typeof debug?.equipWeapon !== 'function') return { ok: false, reason: 'equipWeapon missing' };
    const held = debug.snapshot().player.primaryWeapon;
    const alternative = ['carbine', 'smg', 'ak-alpha', 'm14-ebr'].find((weapon) => weapon !== held);
    if (!alternative) return { ok: false, reason: 'no alternative primary in the probe list' };
    try {
      // Drop the ALTERNATIVE, then return to the original, so the ground weapon
      // differs from the one in hand and a real pickup can resolve.
      debug.equipWeapon(alternative);
      const dropId = debug.spawnDeathDrop(0);
      debug.equipWeapon(held);
      return { ok: Boolean(dropId), dropId: dropId ?? null, staged: alternative, holding: held };
    } catch (error) {
      return { ok: false, reason: String(error?.message ?? error) };
    }
  });
  result.spawned = spawned;
  if (!spawned.ok) {
    record(`PICKUP-NO-DROP-${role}`, 'medium', 'the harness could not stage a ground weapon drop', spawned);
    return result;
  }
  await sleep(250);

  const hostMark = await markOf(host);
  const otherMark = await markOf(other);

  const interact = await guest.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    try { return { ok: true, returned: debug.interactDrop() ?? null }; } catch (error) { return { ok: false, reason: String(error?.message ?? error) }; }
  });
  result.interact = interact;
  await sleep(ACK_BUDGET_MS);

  const after = await viewOf(guest.page);
  const hostAfter = await viewOf(host.page);
  result.weaponAfter = after.players[selfId].weapon;
  result.hostSeesWeapon = hostAfter.players[selfId]?.weapon ?? null;
  const trace = await traceSince(guest, mark);
  const hostTrace = await traceSince(host, hostMark);
  const otherTrace = await traceSince(other, otherMark);
  result.trace = trace.map((entry) => `${entry.direction}:${entry.type}`);
  result.hostTrace = hostTrace.map((entry) => `${entry.direction}:${entry.type}`);
  result.otherTrace = otherTrace.map((entry) => `${entry.direction}:${entry.type}`);

  const sentPickup = trace.some((entry) => entry.direction === 'out' && /pickup/i.test(entry.type));
  const gotResult = trace.some((entry) => entry.direction === 'in' && /pickup/i.test(entry.type));
  result.sentPickup = sentPickup;
  result.gotPickupResult = gotResult;
  result.hostRejected = gotResult && result.weaponBefore === result.weaponAfter;
  result.hostSawClaim = hostTrace.some((entry) => entry.direction === 'in' && entry.type === 'pickup');
  result.otherSawRawClaim = otherTrace.some((entry) => entry.direction === 'in' && entry.type === 'pickup');
  result.otherSawCorrection = otherTrace.some((entry) => entry.direction === 'in' && entry.type === 'pickup-result');

  if (!sentPickup) {
    record(`PICKUP-NOT-REQUESTED-${role}`, 'critical', 'guest-local stale pickup did not send a claim to the host',
      { weaponAfter: result.weaponAfter, trace: result.trace.slice(0, 20) });
  } else if (!gotResult) {
    record(`PICKUP-UNACKNOWLEDGED-${role}`, 'high', 'guest sent a pickup request and applied it without a host result inside the ack budget',
      { ackBudgetMs: ACK_BUDGET_MS, trace: result.trace.slice(0, 20) });
  }
  if (!result.hostSawClaim) {
    record(`PICKUP-HOST-MISSED-CLAIM-${role}`, 'high', 'the host never observed the guest pickup claim', result);
  }
  if (result.otherSawRawClaim) {
    record(`PICKUP-RAW-RELAY-${role}`, 'critical', 'the other guest received an unvalidated pickup claim', result);
  }
  if (!result.otherSawCorrection) {
    record(`PICKUP-CORRECTION-MISSED-${role}`, 'critical', 'the other guest did not receive the host pickup correction', result);
  }
  // The staged drop is intentionally unknown to the host, so restoration of
  // the original weapon is the expected rejected-claim outcome.
  result.restored = result.weaponBefore === result.weaponAfter;
  result.ok = sentPickup && gotResult && result.hostSawClaim && !result.otherSawRawClaim && result.otherSawCorrection && result.restored;
  return result;
}

/** P-5: auto-scavenge is optimistic too. A locally discovered drop must record
 * its prior ammo/grenade projection and restore it when the host rejects the
 * guest-only drop. */
async function scenarioAutoScavenge(guest, host, peers, role) {
  const result = { ok: false, measuredRows: ['P-5'] };
  const before = await viewOf(guest.page);
  const selfId = before.selfId;
  const mark = await markOf(guest);
  const staged = await guest.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const player = debug.snapshot().player;
    try {
      debug.setAmmo(player.weapon, 0, 0);
      const dropId = debug.spawnDeathDrop();
      return { ok: Boolean(dropId), dropId, weapon: player.weapon };
    } catch (error) {
      return { ok: false, reason: String(error?.message ?? error) };
    }
  });
  result.staged = staged;
  if (!staged.ok) return result;
  await sleep(ACK_BUDGET_MS + 250);
  const after = await viewOf(guest.page);
  const trace = await traceSince(guest, mark);
  result.trace = trace.map((entry) => `${entry.direction}:${entry.type}`);
  result.sentPickup = trace.some((entry) => entry.direction === 'out' && entry.type === 'pickup');
  result.gotResult = trace.some((entry) => entry.direction === 'in' && entry.type === 'pickup-result');
  result.ammoAfter = after.players[selfId]?.ammo ?? null;
  result.reserveAfter = after.players[selfId]?.reserve ?? null;
  // The host never saw this guest-local drop, so rejection must leave the
  // intentionally empty projection intact rather than silently crediting it.
  result.ok = result.sentPickup && result.gotResult && result.ammoAfter === 0 && result.reserveAfter === 0;
  if (!result.ok) record(`SCAVENGE-ROLLBACK-${role}`, 'high', 'auto-scavenge did not receive and apply a host correction', result);
  return result;
}

/** OWNER ITEM "cannot pick up guns". A real host-authored death drop is
 *  consumed after respawn; require the claimant and host to converge, while
 *  the other guest sees the same canonical post-transaction drop. */
async function scenarioPickupAuthority(guest, host, peers, role) {
  const result = { ok: false, measuredRows: ['P-6', 'P-8'] };
  const otherRole = role === 'guestA' ? 'guestB' : 'guestA';
  const other = peers[otherRole];
  const before = await viewOf(guest.page);
  const selfId = before.selfId;
  const staged = await guest.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const drop = debug.snapshot().deathDrops?.find((candidate) => candidate.weaponAvailable);
    if (!drop) return { ok: false, reason: 'no host-authored death drop available after respawn' };
    const current = debug.snapshot().player.primaryWeapon;
    const alternative = ['carbine', 'smg', 'ak-alpha', 'm14-ebr'].find((weapon) => weapon !== drop.weapon && weapon !== current);
    if (!alternative) return { ok: false, reason: 'no alternate primary available' };
    const position = drop.position;
    const currentPosition = debug.snapshot().player.position;
    if (Math.hypot(currentPosition[0] - position[0], currentPosition[2] - position[2]) > 2.5) {
      return { ok: false, reason: 'host-authored drop is not at the post-respawn position', position, currentPosition };
    }
    debug.equipWeapon(alternative);
    return { ok: true, dropId: drop.id, weapon: drop.weapon, holding: alternative, position: currentPosition };
  });
  result.staged = staged;
  if (!staged.ok) return result;
  await guest.page.waitForTimeout(250);
  await host.page.waitForFunction(
    ({ playerId, position }) => {
      const remote = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers?.find((candidate) => candidate.id === playerId);
      const hostPosition = remote?.authoritativePosition ?? [];
      return hostPosition.length === 3 && Math.hypot(hostPosition[0] - position[0], hostPosition[2] - position[2]) <= 1.5;
    },
    { playerId: selfId, position: staged.position },
    { timeout: ACK_BUDGET_MS },
  ).catch(() => {});
  const marks = { guest: await markOf(guest), host: await markOf(host), other: await markOf(other) };
  await guest.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop());
  await sleep(ACK_BUDGET_MS);
  const after = await viewOf(guest.page);
  const hostAfter = await viewOf(host.page);
  result.guestWeapon = after.players[selfId]?.weapon ?? null;
  result.hostWeapon = hostAfter.players[selfId]?.weapon ?? null;
  const guestTrace = await traceSince(guest, marks.guest);
  const hostTrace = await traceSince(host, marks.host);
  const otherTrace = await traceSince(other, marks.other);
  result.trace = guestTrace.map((entry) => `${entry.direction}:${entry.type}`);
  result.otherTrace = otherTrace.map((entry) => `${entry.direction}:${entry.type}`);
  result.sentPickup = guestTrace.some((entry) => entry.direction === 'out' && entry.type === 'pickup');
  result.gotResult = guestTrace.some((entry) => entry.direction === 'in' && entry.type === 'pickup-result');
  result.otherSawRawClaim = otherTrace.some((entry) => entry.direction === 'in' && entry.type === 'pickup');
  result.otherSawCanonicalResult = otherTrace.some((entry) => entry.direction === 'in' && entry.type === 'pickup-result');
  result.hostSawClaim = hostTrace.some((entry) => entry.direction === 'in' && entry.type === 'pickup');
  if (result.otherSawRawClaim) record(`PICKUP-RAW-RELAY-AUTH-${role}`, 'critical', 'the other guest received a raw pickup claim during a real pickup', result);
  if (!result.otherSawCanonicalResult) record(`PICKUP-CANONICAL-MISSED-${role}`, 'critical', 'the other guest missed the host canonical pickup result', result);
  result.ok = result.sentPickup && result.gotResult && result.hostSawClaim && !result.otherSawRawClaim
    && result.otherSawCanonicalResult && result.guestWeapon === result.hostWeapon;
  return result;
}

/** HITL 6 extension: reload after the guest has completed a death/respawn. */
async function scenarioReloadAfterDeath(guest, host, peers, role) {
  const result = await scenarioReload(guest, host, peers, role, 'post-death');
  return { ...result, afterDeath: true };
}

/** HITL 6 extension: slow primary shot -> fast sidearm -> shot. */
async function scenarioSwapSlowThenFastThenFire(guest, host, role) {
  const result = { ok: false, sequence: [] };
  const selfId = (await viewOf(guest.page)).selfId;
  const targetId = (await viewOf(host.page)).selfId;
  await guest.page.evaluate((wanted) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.equipWeapon('m14-ebr');
    debug.setAmmo('m14-ebr', 1, 90);
    debug.aimAtRemote('body');
    debug.fireOnce();
    return wanted;
  }, targetId);
  await sleep(ACK_BUDGET_MS);
  const beforeFast = await viewOf(guest.page);
  const fastWeaponBefore = beforeFast.players[selfId]?.weapon ?? null;
  await guest.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.switchWeapon(1));
  // switchWeapon owns a 360 ms presentation lock; allow that authored lock
  // to elapse, without changing the product timing or the audit budget.
  await sleep(400);
  const switched = await viewOf(guest.page);
  const fastWeapon = switched.players[selfId]?.weapon ?? null;
  await guest.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const weapon = debug.snapshot().player.weapon;
    debug.setAmmo(weapon, 30, 90);
  });
  const mark = await markOf(guest);
  const beforeFire = await viewOf(guest.page);
  result.fastAmmoBefore = beforeFire.players[selfId]?.ammo ?? null;
  await guest.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
  await sleep(ACK_BUDGET_MS);
  const afterFire = await viewOf(guest.page);
  result.fastAmmoAfter = afterFire.players[selfId]?.ammo ?? null;
  result.fastWeaponBefore = fastWeaponBefore;
  result.fastWeapon = fastWeapon;
  result.trace = (await traceSince(guest, mark)).map((entry) => `${entry.direction}:${entry.type}`);
  result.sentShot = result.trace.some((entry) => entry.startsWith('out:') && /shot|hit/i.test(entry));
  if (!(result.fastAmmoAfter < result.fastAmmoBefore) || !result.sentShot) {
    record(`SWAP-THEN-FIRE-NO-EFFECT-${role}`, 'high',
      'a fast weapon did not fire after switching from a slow weapon', {
        fastWeaponBefore,
        fastWeapon,
        ammoBefore: result.fastAmmoBefore,
        ammoAfter: result.fastAmmoAfter,
        trace: result.trace.slice(0, 20),
      });
  }
  result.sequence = ['slow-fire', 'switch-to-fast', 'fast-fire'];
  result.ok = result.fastWeapon !== fastWeaponBefore
    && result.fastAmmoAfter < result.fastAmmoBefore
    && result.sentShot;
  return result;
}

/** OWNER ITEM "cannot reload". Spend the magazine, reload, require both the
 *  local magazine AND the host's replica to refill. */
async function scenarioReload(guest, host, peers, role, phase = 'pre-respawn') {
  const result = { ok: false, phase, measuredRows: phase === 'post-respawn' ? ['R-1', 'R-2', 'R-5'] : ['R-5'] };
  const selfId = (await viewOf(guest.page)).selfId;
  // Drain the magazine to a known low value through the QA ammo hook so the
  // reload has something to do regardless of which weapon is held.
  await guest.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const weapon = debug.snapshot().player.weapon;
    debug.setAmmo(weapon, 1, 90);
  });
  await sleep(200);
  const before = await viewOf(guest.page);
  result.ammoBefore = before.players[selfId].ammo;
  const mark = await markOf(guest);

  await guest.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.reload());
  // Reload animations are seconds long; wait for completion, then the ack.
  await sleep(350);
  const otherRole = role === 'guestA' ? 'guestB' : 'guestA';
  const duringOther = await viewOf(peers[otherRole].page).catch(() => null);
  result.otherSeesReloading = duringOther?.players?.[selfId]?.reloading ?? null;
  if (result.otherSeesReloading !== true) {
    record(`RELOAD-NOT-VISIBLE-${role}-${phase}`, 'high', 'the other guest did not observe the host-authored reload state', {
      phase, otherRole, reloading: result.otherSeesReloading,
    });
  }
  await sleep(4_000 + ACK_BUDGET_MS);

  const after = await viewOf(guest.page);
  const hostAfter = await viewOf(host.page);
  result.ammoAfter = after.players[selfId].ammo;
  result.reloadingAfter = after.players[selfId].reloading;
  result.hostSeesAmmo = hostAfter.players[selfId]?.ammo ?? null;
  const trace = await traceSince(guest, mark);
  result.trace = trace.map((entry) => `${entry.direction}:${entry.type}`);
  result.sentIntent = trace.some((entry) => entry.direction === 'out' && /reload/i.test(entry.type));
  result.gotResult = trace.some((entry) => entry.direction === 'in' && /reload/i.test(entry.type));
  result.fireBlock = after.fireBlock;

  if (!(result.ammoAfter > result.ammoBefore)) {
    record(`RELOAD-NO-EFFECT-${role}`, 'critical', 'guest reload never refilled the magazine',
      { ammoBefore: result.ammoBefore, ammoAfter: result.ammoAfter, reloading: result.reloadingAfter, sentIntent: result.sentIntent, gotResult: result.gotResult, trace: result.trace.slice(0, 20) });
    return result;
  }
  if (!result.sentIntent) {
    record(`RELOAD-NOT-REQUESTED-${role}`, 'high', 'guest reloaded locally without sending a reload intent to the host',
      { trace: result.trace.slice(0, 20) });
  } else if (!result.gotResult) {
    record(`RELOAD-UNACKNOWLEDGED-${role}`, 'high', 'guest sent a reload intent and never received a host reload result',
      { ackBudgetMs: ACK_BUDGET_MS, trace: result.trace.slice(0, 20) });
  }
  if (result.hostSeesAmmo !== null && result.hostSeesAmmo !== result.ammoAfter) {
    record(`RELOAD-HOST-DISAGREES-${role}`, 'high', "the host's replica of the guest carries different ammo after a reload",
      { guestAmmo: result.ammoAfter, hostSeesAmmo: result.hostSeesAmmo });
  }
  result.ok = result.ammoAfter > result.ammoBefore
    && result.sentIntent
    && result.gotResult
    && result.otherSeesReloading === true
    && result.hostSeesAmmo === result.ammoAfter;
  return result;
}

/** Swap primary -> secondary -> back, and require every peer to see the change. */
async function scenarioSwap(guest, peers, role) {
  const result = { ok: false, sequence: [] };
  const selfId = (await viewOf(guest.page)).selfId;
  for (const [label, index] of [['secondary', 1], ['primary', 0], ['secondary-again', 1], ['primary-again', 0]]) {
    await guest.page.evaluate((slot) => window.__ATOMIC_ACRES_DEBUG__.switchWeapon(slot), index);
    await sleep(ACK_BUDGET_MS);
    const views = {};
    for (const peerRole of PEERS) views[peerRole] = await viewOf(peers[peerRole].page).catch(() => null);
    const local = views[role]?.players?.[selfId]?.weapon ?? null;
    const seenBy = Object.fromEntries(PEERS.filter((peerRole) => peerRole !== role).map((peerRole) => [peerRole, views[peerRole]?.players?.[selfId]?.weapon ?? null]));
    result.sequence.push({ label, index, local, seenBy });
    for (const [peerRole, weapon] of Object.entries(seenBy)) {
      if (weapon !== local) {
        record(`SWAP-NOT-REPLICATED-${role}-to-${peerRole}`, 'high', 'a weapon swap never reached another peer',
          { swap: label, localWeapon: local, peerSees: weapon, peer: peerRole });
      }
    }
  }
  const weapons = result.sequence.map((entry) => entry.local);
  if (new Set(weapons).size < 2) {
    record(`SWAP-NO-EFFECT-${role}`, 'high', 'switching weapon slots never changed the held weapon', { weapons });
  }
  result.ok = new Set(weapons).size >= 2;
  return result;
}

/** Fire at a named target and record whether the shot crossed the wire and
 *  whether the host arbitrated it. */
async function scenarioFire(guest, target, role, label) {
  const result = { ok: false, label };
  const selfId = (await viewOf(guest.page)).selfId;
  await guest.page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const weapon = debug.snapshot().player.weapon;
    debug.setAmmo(weapon, 30, 90);
  });
  const targetId = (await viewOf(target.page)).selfId;
  const aimed = await guest.page.evaluate((wanted) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    try { return { ok: true, returned: debug.aimAtRemote('body') ?? null, wanted }; } catch (error) { return { ok: false, reason: String(error?.message ?? error) }; }
  }, targetId);
  result.aimed = aimed;
  const before = await viewOf(guest.page);
  result.ammoBefore = before.players[selfId].ammo;
  const mark = await markOf(guest);
  await guest.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
  await sleep(ACK_BUDGET_MS);
  const after = await viewOf(guest.page);
  result.ammoAfter = after.players[selfId].ammo;
  result.fireBlock = after.fireBlock;
  const trace = await traceSince(guest, mark);
  result.trace = trace.map((entry) => `${entry.direction}:${entry.type}`);
  result.sentShot = trace.some((entry) => entry.direction === 'out' && /shot|hit/i.test(entry.type));
  result.gotResult = trace.some((entry) => entry.direction === 'in' && /shot-result|hit|death/i.test(entry.type));

  if (result.ammoAfter === result.ammoBefore) {
    const reason = after.fireBlock?.last ?? null;
    record(`FIRE-REFUSED-${role}-${label}`, 'critical', 'guest pulled the trigger and nothing was spent',
      { ammo: result.ammoBefore, fireBlockLast: reason, byReason: after.fireBlock?.byReason ?? null, trace: result.trace.slice(0, 20) });
    return result;
  }
  if (!result.sentShot) {
    record(`FIRE-NOT-SENT-${role}-${label}`, 'critical', 'guest fired and no shot message left the peer - the shot exists only locally',
      { trace: result.trace.slice(0, 20) });
  }
  result.ok = result.ammoAfter < result.ammoBefore && result.sentShot;
  return result;
}

/** Take authoritative damage until death; require every peer to agree. */
async function scenarioDamageDeath(guest, host, peers, role) {
  const result = { ok: false };
  const guestId = (await viewOf(guest.page)).selfId;
  const mark = await markOf(guest);
  // Host-side authoritative damage: this is the direction the protocol is
  // supposed to work in, so it is the fair test of the guest's replica.
  const applied = await host.page.evaluate((playerId) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (typeof debug?.damageRemoteAuthoritatively !== 'function') return { ok: false, reason: 'damageRemoteAuthoritatively missing' };
    try { return { ok: true, returned: debug.damageRemoteAuthoritatively(40, playerId) ?? null }; } catch (error) { return { ok: false, reason: String(error?.message ?? error) }; }
  }, guestId);
  result.applied = applied;
  await sleep(ACK_BUDGET_MS);

  const views = {};
  for (const peerRole of PEERS) views[peerRole] = await viewOf(peers[peerRole].page).catch(() => null);
  result.hpByPeer = Object.fromEntries(PEERS.map((peerRole) => [peerRole, views[peerRole]?.players?.[guestId]?.hp ?? null]));
  const distinct = new Set(Object.values(result.hpByPeer).filter((hp) => hp !== null));
  if (distinct.size > 1) {
    record(`DAMAGE-HP-SPLIT-${role}`, 'critical', 'peers disagree about a damaged player\'s health',
      { hpByPeer: result.hpByPeer, ackBudgetMs: ACK_BUDGET_MS });
  }

  // Now kill.
  await host.page.evaluate((playerId) => {
    try { window.__ATOMIC_ACRES_DEBUG__.damageRemoteAuthoritatively(500, playerId); } catch { /* recorded via state */ }
  }, guestId);
  await sleep(ACK_BUDGET_MS);
  const deadViews = {};
  for (const peerRole of PEERS) deadViews[peerRole] = await viewOf(peers[peerRole].page).catch(() => null);
  result.aliveByPeer = Object.fromEntries(PEERS.map((peerRole) => [peerRole, deadViews[peerRole]?.players?.[guestId]?.alive ?? null]));
  const aliveDistinct = new Set(Object.values(result.aliveByPeer).filter((alive) => alive !== null));
  if (aliveDistinct.size > 1) {
    record(`DEATH-SPLIT-${role}`, 'critical', 'peers disagree about whether a player is dead',
      { aliveByPeer: result.aliveByPeer });
  }
  result.trace = (await traceSince(guest, mark)).map((entry) => `${entry.direction}:${entry.type}`).slice(0, 30);
  result.ok = distinct.size <= 1 && aliveDistinct.size <= 1;
  return result;
}

async function scenarioRespawn(guest, host, role) {
  const result = { ok: false };
  const guestId = (await viewOf(guest.page)).selfId;
  const mark = await markOf(guest);
  await guest.page.evaluate(() => { try { window.__ATOMIC_ACRES_DEBUG__.respawn(); } catch { /* state carries the verdict */ } });
  await sleep(ACK_BUDGET_MS + 1_500);
  const after = await viewOf(guest.page);
  const hostAfter = await viewOf(host.page);
  result.self = after.players[guestId];
  result.hostSees = hostAfter.players[guestId] ?? null;
  result.trace = (await traceSince(guest, mark)).map((entry) => `${entry.direction}:${entry.type}`).slice(0, 30);
  if (result.self?.alive !== true) {
    record(`RESPAWN-STILL-DEAD-${role}`, 'critical', 'a guest that respawned is still dead on its own screen', { self: result.self });
    return result;
  }
  if (result.hostSees && result.hostSees.alive !== true) {
    record(`RESPAWN-HOST-DISAGREES-${role}`, 'critical', 'the host still believes a respawned guest is dead', { hostSees: result.hostSees });
  }
  if (result.hostSees && result.self && result.hostSees.hp !== result.self.hp) {
    record(`RESPAWN-HP-SPLIT-${role}`, 'high', 'host and guest disagree about health right after a respawn',
      { guestHp: result.self.hp, hostHp: result.hostSees.hp });
  }
  const hostPos = result.hostSees?.position ?? [];
  const selfPos = result.self?.position ?? [];
  if (hostPos.length === 3 && selfPos.length === 3) {
    const distance = Math.hypot(hostPos[0] - selfPos[0], hostPos[1] - selfPos[1], hostPos[2] - selfPos[2]);
    result.respawnPositionSplitM = Number(distance.toFixed(2));
    if (distance > 2) {
      record(`RESPAWN-POSITION-SPLIT-${role}`, 'high', 'host and guest place a respawned player in different spots',
        { guestPosition: selfPos, hostPosition: hostPos, distanceM: result.respawnPositionSplitM });
    }
  }
  result.ok = result.self?.alive === true && result.hostSees?.alive === true;
  return result;
}

async function scenarioScoreboard(guest, host, role) {
  const result = { ok: false };
  const opened = await guest.page.evaluate(() => {
    // The shipped scoreboard surface is #roster (legacy-main toggles .hidden on
    // it from the 'scoreboard' key binding), not a #scoreboard element.
    const board = document.querySelector('#roster');
    if (!board) return { ok: false, reason: 'no #roster element' };
    return { ok: true, hiddenBefore: board.hidden };
  });
  result.element = opened;
  // The real key, held.
  await guest.page.keyboard.down('Tab');
  await sleep(500);
  const shown = await guest.page.evaluate(() => {
    const board = document.querySelector('#roster');
    if (!board) return { visible: null, rows: 0 };
    const style = window.getComputedStyle(board);
    return {
      visible: !board.hidden && style.display !== 'none' && style.visibility !== 'hidden',
      rows: board.querySelectorAll('tr, .roster-row, .scoreboard-row, li').length,
      text: (board.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
    };
  });
  await guest.page.keyboard.up('Tab');
  result.shown = shown;
  const hostScores = (await viewOf(host.page)).players;
  result.hostPlayerCount = Object.keys(hostScores).length;
  if (shown.visible === false) {
    record(`SCOREBOARD-HIDDEN-${role}`, 'medium', 'holding the scoreboard key showed nothing', shown);
  } else if (shown.rows > 0 && shown.rows < result.hostPlayerCount) {
    record(`SCOREBOARD-INCOMPLETE-${role}`, 'medium', 'the scoreboard lists fewer players than the host knows about',
      { rows: shown.rows, hostPlayerCount: result.hostPlayerCount, text: shown.text });
  }
  result.ok = shown.visible !== false;
  return result;
}

/** Leave and rejoin: the guest closes its session and joins the same room
 *  again, then must be replicated in BOTH directions to BOTH other peers. */
async function scenarioRejoin(peers, report, rejoinRole = 'guestA') {
  const result = { ok: false };
  const { host } = peers;
  const guest = peers[rejoinRole];
  const observers = PEERS.filter((role) => role !== rejoinRole);
  const roomCode = (await host.page.textContent('#room-code'))?.trim() ?? '';
  result.roomCode = roomCode.length;
  result.role = rejoinRole;
  const beforeId = (await viewOf(guest.page)).selfId;
  result.identityBefore = beforeId;

  await guest.page.evaluate(() => {
    const leave = document.querySelector('#lobby-leave');
    if (leave) leave.click();
  });
  await sleep(2_000);
  const afterLeave = {};
  for (const role of observers) afterLeave[role] = (await viewOf(peers[role].page).catch(() => null))?.remotes ?? null;
  result.remotesAfterLeave = afterLeave;

  // Rejoin through the real menu.
  await guest.page.evaluate(() => {
    const menu = document.querySelector('#menu');
    if (menu) menu.classList.remove('hidden');
  }).catch(() => {});
  const rejoined = await guest.page.evaluate(async (code) => {
    const input = document.querySelector('#room-input');
    const join = document.querySelector('#join');
    if (!input || !join) return { ok: false, reason: 'join controls absent after leaving' };
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((settle) => setTimeout(settle, 400));
    if (join.disabled) return { ok: false, reason: 'JOIN stayed disabled with a valid room code' };
    join.click();
    return { ok: true };
  }, roomCode);
  result.rejoinClick = rejoined;
  if (!rejoined.ok) {
    record('REJOIN-BLOCKED', 'critical', 'a guest that left could not start a rejoin through the real menu', rejoined);
    return result;
  }

  const settledRoles = [rejoinRole, ...observers];
  const settled = await Promise.allSettled(settledRoles.map((role) => peers[role].page.waitForFunction(
    () => (window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members ?? []).filter((member) => member.connected).length === 3,
    undefined,
    { timeout: JOIN_TIMEOUT_MS },
  )));
  result.rosterAfterRejoin = Object.fromEntries(settledRoles.map((role, index) => [role, settled[index].status]));
  const missing = settledRoles.filter((role, index) => settled[index].status === 'rejected');
  if (missing.length > 0) {
    record('REJOIN-NOT-REGISTERED', 'critical', 'after a rejoin, a peer never saw the full roster again',
      { missing, rosterAfterRejoin: result.rosterAfterRejoin });
    return result;
  }

  const afterId = (await viewOf(guest.page)).selfId;
  result.identityAfter = afterId;
  // Two-way replication after a rejoin: the rejoined guest must see the others
  // AND the others must see it.
  const views = {};
  for (const role of PEERS) views[role] = await viewOf(peers[role].page).catch(() => null);
  result.remotesAfterRejoin = Object.fromEntries(PEERS.map((role) => [role, views[role]?.remotes ?? null]));
  const oneWay = PEERS.filter((role) => (views[role]?.remotes ?? 0) < 2);
  if (oneWay.length > 0) {
    record('REJOIN-ONE-WAY-REPLICATION', 'critical', 'after a rejoin a peer sees fewer players than the room holds',
      { remotesAfterRejoin: result.remotesAfterRejoin });
  }
  result.ok = missing.length === 0 && oneWay.length === 0;
  return result;
}

// --- trace-level audit ------------------------------------------------------
async function auditTrace(report) {
  const HOST_ARBITRATED_GUEST_TYPES = new Set(['pickup', 'reload-intent', 'shot-request']);
  const PRESENTATION_GUEST_TYPES = new Set(['trigger-state']);
  const summary = {};
  for (const role of PEERS) {
    const trace = report.trace[role];
    if (!trace) continue;
    if (!trace.enabled) {
      record('TRACE-DISABLED', 'medium', `the message trace never opened on ${role} - qaTrace fence closed`, { role });
      continue;
    }
    const byType = {};
    for (const entry of trace.entries) {
      const key = `${entry.direction}:${entry.type}`;
      byType[key] = (byType[key] ?? 0) + 1;
    }
    summary[role] = { recorded: trace.recorded, dropped: trace.dropped, byType };
  }
  report.traceSummary = summary;
  // Guest-to-guest: anything a guest sends that the OTHER guest never receives
  // has been dropped by the host relay. This is the check no two-sided driver
  // can make.
  const relayed = {};
  for (const from of ['guestA', 'guestB']) {
    const to = from === 'guestA' ? 'guestB' : 'guestA';
    const sent = new Set(Object.keys(summary[from]?.byType ?? {}).filter((key) => key.startsWith('out:')).map((key) => key.slice(4)));
    const received = new Set(Object.keys(summary[to]?.byType ?? {}).filter((key) => key.startsWith('in:')).map((key) => key.slice(3)));
    const hostReceived = new Set(Object.keys(summary.host?.byType ?? {}).filter((key) => key.startsWith('in:')).map((key) => key.slice(3)));
    const notRelayed = [...sent].filter((type) => PRESENTATION_GUEST_TYPES.has(type) && hostReceived.has(type) && !received.has(type));
    const hostArbitrated = [...sent].filter((type) => HOST_ARBITRATED_GUEST_TYPES.has(type) && hostReceived.has(type) && !received.has(type));
    relayed[`${from}->${to}`] = { sent: [...sent], notRelayed, hostArbitrated };
    if (notRelayed.length > 0) {
      record(`RELAY-GAP-${from}-to-${to}`, 'high', 'the host received a guest message type it never relayed to the other guest',
        { notRelayed, from, to });
    }
  }
  report.relay = relayed;
}

function printSummary(report) {
  const bySeverity = {};
  for (const finding of report.findings) bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  console.log('\n=== mp-audit summary ===');
  console.log(`label=${report.label} arena=${report.arena} impairment=${report.impairment.eventDelayMs}ms/${report.impairment.eventJitterMs}ms completed=${report.completed}`);
  console.log(`findings: ${report.findings.length} (${Object.entries(bySeverity).map(([key, value]) => `${key}=${value}`).join(' ') || 'none'})`);
  for (const finding of report.findings) console.log(`  - [${finding.severity}] ${finding.id}: ${finding.symptom}`);
  console.log(`state-diff divergences by field: ${JSON.stringify(report.stateDiff.byField ?? {})}`);
  const awareness = report.scenarios.killstreakAwareness;
  if (awareness) {
    console.log(`killstreak awareness (HF-509): ok=${awareness.ok} activated=${awareness.activated?.ok ?? null} damageObserved=${awareness.damageObserved ?? null}`);
    for (const [role, row] of Object.entries(awareness.guests ?? {})) {
      console.log(`  ${role}: announced=${row.announced} relayedByGuest=${row.relayedByGuest} banner=${row.bannerShown} replicated=${row.replicated} samples=${JSON.stringify(row.positionSamples)} damageSource=${row.damageSource ? `${row.damageSource.label}@${JSON.stringify(row.damageSource.position)}` : null}`);
    }
  }
  console.log(`artifact: ${join(OUT_DIR, `${report.label}-audit.json`)}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().then((code) => process.exit(code)).catch((error) => {
  console.error(error);
  process.exit(1);
});

export {
  ACK_BUDGET_MS,
  PEERS,
  chromeArgs,
  markOf,
  multiplayerArenaRoster,
  openPeer,
  serveDist,
  sleep,
  startPeerServer,
  traceOf,
  traceSince,
  viewOf,
  scenarioFire,
  scenarioPickup,
  scenarioReload,
  scenarioDamageDeath,
  scenarioKillstreakAwareness,
  scenarioRejoin,
  scenarioRespawn,
  scenarioScoreboard,
  scenarioSwap,
};
