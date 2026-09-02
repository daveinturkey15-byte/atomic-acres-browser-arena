#!/usr/bin/env node
// ===========================================================================
// MP-LAB: real two-client host+guest sweep over every multiplayer arena.
//
// Owner, 2026-09-02 07:08 BST: "i want the multiplayer and guest lobby
// experience to be great too, including no more freezing, frozen in spot,
// previous issues ... all maps should be playable and joinable in the same
// way". Ledger row HF-403.
//
// WHAT THIS IS
//   Two REAL headless Chromes (channel 'chrome', so a real WebGPU device), one
//   hosting and one joining through the REAL menu - #host, the room code,
//   #room-input, #join, #lobby-arena, #lobby-bots, #lobby-ready, #lobby-start -
//   over a local PeerJS signalling server. No debug teleport into a match. Per
//   arena it records, on BOTH pages: join success and duration, arena-sync
//   duration, deploy success and duration, presented-frame intervals (GPU
//   confirmed frames, not rAF ticks) with every gap over the stall floor,
//   movement deadlocks (alive, input applied, position unchanged for the
//   deadlock window), console and page errors, and a screenshot after deploy.
//
// WHAT IT REFUSES TO DO
//   - Guess the arena list. It is derived from src/map-selection.ts through
//     ./arena-roster.mts (tests/e2e/mp-lab-registry-contract.test.mjs pins it).
//   - Show a window, make a sound, or starve the owner's GPU: headless only,
//     --mute-audio, and each browser launch waits for >= 3 GB free VRAM.
//   - Soften a threshold to pass. The 250 ms stall floor and the 5 s deadlock
//     window are the ledger's falsifier, not tuning knobs.
//
// USAGE
//   npm run build            (once; the harness serves dist/ as-is)
//   npm run qa:mp-lab                       -> every arena, 2 humans, no bots
//   npm run qa:mp-lab -- --bots 4           -> every arena, 2 humans + 4 hosted bots
//   npm run qa:mp-lab -- --map test2        -> one arena
//   npm run qa:mp-lab -- --solo             -> one browser, solo deploy per arena (baseline)
//   options: --sample-seconds 30  --port 41946  --peer-port 9345
//            --out artifacts/qa/mp-lab  --label <name>  --unsafe-webgpu
//            --render quality|performance  --renderer webgpu|webgl2
//
// FLAGS. Stock Chrome flags by default: --enable-unsafe-webgpu changes Tint's
// lowering and masked the Chrome 153 swizzle failure for a week (gotcha
// 2026-08-31). Pass --unsafe-webgpu only to compare against the older probes.
//
// OUTPUT
//   artifacts/qa/mp-lab/<label>/<arena>.json   one record per arena
//   artifacts/qa/mp-lab/<label>/<arena>-host.png / -guest.png
//   artifacts/qa/mp-lab/<label>/summary.json + a markdown table on stdout
//   exit 1 when any arena fails the falsifier (join, deploy, stall, deadlock,
//   page error, or a join flow that differs from the other arenas).
// ===========================================================================

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from '../lib/browser-launch-flags.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

// --- The falsifier, verbatim from the ledger row. Not tunable from the CLI. ---
export const STALL_FLOOR_MS = 250;
export const DEADLOCK_WINDOW_MS = 5_000;
export const DEADLOCK_DISTANCE_M = 0.05;
export const MIN_FREE_VRAM_MIB = 3_000;

const SAMPLE_SECONDS = Math.max(5, Number(arg('--sample-seconds', '30')));
const TARGET_MAP = arg('--map', null);
const HOSTED_BOTS = Number(arg('--bots', '0'));
const PORT = Number(arg('--port', '41946'));
const PEER_PORT = Number(arg('--peer-port', '9345'));
const RENDERER = arg('--renderer', 'webgpu');
const RENDER_PROFILE = arg('--render', 'quality');
const UNSAFE_WEBGPU = flag('--unsafe-webgpu');
const CPU_PROFILE = flag('--cpu-profile');
// --solo: ONE browser, the real map card + #solo button, same probe. The
// baseline that says whether a stall is the map or the multiplayer path.
const SOLO = flag('--solo');
const LABEL = arg('--label', SOLO ? 'solo' : HOSTED_BOTS > 0 ? `2p-${HOSTED_BOTS}bots` : '2p');
const OUT_DIR = resolve(REPO_ROOT, arg('--out', 'artifacts/qa/mp-lab'), LABEL);
const DIST = resolve(REPO_ROOT, arg('--dist', 'dist'));

const BOOT_TIMEOUT_MS = 180_000;
const ROOM_TIMEOUT_MS = 45_000;
const JOIN_TIMEOUT_MS = 45_000;
// The game's own sync watchdog is 75 s + one retry (LOBBY_ARENA_SYNC_DEADLINE_MS
// in legacy-main). Waiting past it records the retry instead of hiding it.
const ARENA_SYNC_TIMEOUT_MS = 160_000;
const DEPLOY_TIMEOUT_MS = 120_000;

if (![0, 2, 4].includes(HOSTED_BOTS)) throw new Error(`--bots must be 0, 2 or 4 (the #lobby-bots options); got ${HOSTED_BOTS}`);

// ---------------------------------------------------------------------------
// Machine guards
// ---------------------------------------------------------------------------
function freeVramMiB() {
  const probe = spawnSync('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader'], { encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0 || !probe.stdout) return null;
  const [used, total] = probe.stdout.trim().split(',').map((part) => Number(part.replace(/[^0-9.]/g, '')));
  if (!Number.isFinite(used) || !Number.isFinite(total)) return null;
  return { used, total, free: total - used };
}

async function awaitGpuHeadroom(what) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const vram = freeVramMiB();
    if (vram === null) {
      console.log(`[mp-lab] nvidia-smi unavailable; proceeding with ${what} without a VRAM check`);
      return null;
    }
    if (vram.free >= MIN_FREE_VRAM_MIB) {
      console.log(`[mp-lab] VRAM ${vram.used}/${vram.total} MiB used, ${vram.free} MiB free - launching ${what}`);
      return vram;
    }
    console.log(`[mp-lab] VRAM ${vram.free} MiB free < ${MIN_FREE_VRAM_MIB} MiB; waiting 60 s before ${what} (attempt ${attempt}/10)`);
    await sleep(60_000);
  }
  throw new Error(`GPU never had ${MIN_FREE_VRAM_MIB} MiB free for ${what}; refusing to starve the owner's workloads`);
}

const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms));

// ---------------------------------------------------------------------------
// Servers: static dist on PORT, PeerJS signalling on PEER_PORT
// ---------------------------------------------------------------------------
async function assertPortFree(port, what) {
  await new Promise((ok, fail) => {
    const probe = net.createServer();
    probe.once('error', (error) => fail(new Error(`${what} port ${port} is unavailable (${error.code}); another lane may hold it`)));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(ok));
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.hdr': 'application/octet-stream', '.ktx2': 'image/ktx2', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain', '.map': 'application/json',
};

function serveDist(port) {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error(`${DIST}/index.html missing - run npm run build first`);
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

// ---------------------------------------------------------------------------
// Arena roster: the registry, through tsx, never a literal list.
// ---------------------------------------------------------------------------
export function multiplayerArenaRoster() {
  const tsxCli = resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
  const result = spawnSync(process.execPath, [tsxCli, resolve(SCRIPT_DIR, 'arena-roster.mts'), '--print'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`arena-roster.mts failed: ${result.stderr || result.stdout}`);
  const roster = JSON.parse(result.stdout.trim().split('\n').pop());
  if (!Array.isArray(roster) || roster.length === 0) throw new Error('arena-roster.mts produced no multiplayer arenas');
  return roster;
}

// ---------------------------------------------------------------------------
// Browser and page
// ---------------------------------------------------------------------------
function chromeArgs() {
  const args = [
    ...SILENT_ARGS,
    '--use-angle=d3d11', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    '--autoplay-policy=no-user-gesture-required',
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ];
  if (UNSAFE_WEBGPU) args.push('--enable-unsafe-webgpu');
  return args;
}

async function launchBrowser(role) {
  await awaitGpuHeadroom(`${role} browser`);
  return chromium.launch({ headless: true, channel: 'chrome', args: chromeArgs() });
}

function pageUrl(role, arenaId) {
  const url = new URL(`http://127.0.0.1:${PORT}/`);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', RENDERER);
  url.searchParams.set('render', RENDER_PROFILE);
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  url.searchParams.set('peerQaPath', '/peerjs');
  url.searchParams.set('seed', `mp-lab-${arenaId}-${role}`);
  return url.toString();
}

async function openPlayer(browser, role, arenaId, name) {
  // A fresh context per arena: sticky renderer-fallback records and the saved
  // room code live in storage, and a guest that inherits either is not a
  // fresh join.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = { page: [], console: [] };
  page.on('pageerror', (error) => { if (errors.page.length < 40) errors.page.push(String(error?.message ?? error).slice(0, 300)); });
  page.on('console', (message) => {
    if (message.type() !== 'error' || errors.console.length >= 60) return;
    errors.console.push(message.text().slice(0, 300));
  });
  const cdp = await context.newCDPSession(page);
  // Headless documents do not own the foreground; the renderer refuses to
  // present without it (browserOwnsForegroundPresentation), so emulate focus.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const startedAt = Date.now();
  await page.goto(pageUrl(role, arenaId), { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.map-card[data-arena-id]')].some((button) => !button.disabled),
    undefined,
    { timeout: BOOT_TIMEOUT_MS },
  );
  await page.fill('#player-name', name);
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  return { role, page, context, errors, backend, bootMs: Date.now() - startedAt };
}

const snapshotOf = (page) => page.evaluate(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
  if (!snapshot) return null;
  return {
    gameStarted: snapshot.gameStarted,
    matchPhase: snapshot.matchPhase,
    arenaId: snapshot.arenaSelection?.id ?? null,
    lobbyArenaId: snapshot.privateMatch?.arenaId ?? null,
    lobbyPhase: snapshot.privateMatch?.phase ?? null,
    members: snapshot.privateMatch?.members?.length ?? 0,
    hostedBotCount: snapshot.privateMatch?.hostedBotCount ?? null,
    remotes: snapshot.remotes,
    bots: Array.isArray(snapshot.bots) ? snapshot.bots.length : null,
    alive: snapshot.player?.alive ?? null,
    position: snapshot.player?.position ?? null,
    awaitingCanonicalGuestAuthority: snapshot.player?.awaitingCanonicalGuestAuthority ?? null,
    bootstrapStage: snapshot.bootstrap?.stage ?? null,
    bootstrapError: snapshot.bootstrap?.error ?? null,
    matchAdmissionCadence: snapshot.bootstrap?.matchAdmissionCadence ?? null,
    effectPrewarmProfile: snapshot.bootstrap?.effectPrewarmProfile
      ? { durationMs: snapshot.bootstrap.effectPrewarmProfile.durationMs, groups: (snapshot.bootstrap.effectPrewarmProfile.groups ?? []).map((group) => [group.name, Math.round(group.durationMs)]) }
      : null,
    stateAdmissionDrops: snapshot.stateAdmissionDrops ?? null,
    matchAdmissionPark: snapshot.matchAdmissionPark ?? null,
    clientWorldRepairFailures: snapshot.clientWorldRepairFailures ?? null,
    menuHidden: document.querySelector('#menu')?.classList.contains('hidden') ?? null,
    readyDisabled: document.querySelector('#lobby-ready')?.disabled ?? null,
    startDisabled: document.querySelector('#lobby-start')?.disabled ?? null,
    guidance: document.querySelector('#lobby-guidance')?.textContent?.trim() ?? null,
    roster: document.querySelectorAll('#lobby-roster .lobby-player').length,
  };
});

// ---------------------------------------------------------------------------
// In-page instrument: presented frames + rAF discriminator + movement driver
// ---------------------------------------------------------------------------
export { serveDist, startPeerServer, launchBrowser, chromeArgs, openPlayer, snapshotOf, installProbe, stopProbe, startCpuProfile, stopCpuProfile };

// ---------------------------------------------------------------------------
// Optional main-thread CPU profile over the sample window (--cpu-profile).
// Self time by function, so a 5 fps page names its hot path instead of just
// its frame rate. Raw .cpuprofile is written beside the record for DevTools.
// ---------------------------------------------------------------------------
async function startCpuProfile(side) {
  const cdp = await side.context.newCDPSession(side.page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  return { side, cdp };
}

async function stopCpuProfile({ side, cdp }, arenaId) {
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach().catch(() => {});
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${arenaId}-${side.role}.cpuprofile`), JSON.stringify(profile));
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfMicros = new Map();
  const deltas = profile.timeDeltas ?? [];
  for (let index = 0; index < profile.samples.length; index += 1) {
    const node = byId.get(profile.samples[index]);
    if (!node) continue;
    const frame = node.callFrame;
    const key = `${frame.functionName || '(anonymous)'} @ ${frame.url.split('/').pop() || frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
    selfMicros.set(key, (selfMicros.get(key) ?? 0) + (deltas[index] ?? 0));
  }
  const totalMicros = [...selfMicros.values()].reduce((sum, value) => sum + value, 0);
  const top = [...selfMicros.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
    .map(([key, micros]) => ({ frame: key, selfMs: Math.round(micros / 1000), percent: Math.round((micros / totalMicros) * 1000) / 10 }));
  return { totalMs: Math.round(totalMicros / 1000), top };
}

function installProbe(page, options) {
  return page.evaluate((cfg) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const backend = document.documentElement.dataset.renderBackend ?? null;
    const menuHidden = () => document.querySelector('#menu')?.classList.contains('hidden') ?? true;
    const playable = () => menuHidden() && document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());
    const startedAt = performance.now();
    const probe = {
      running: true,
      backend,
      startedAt,
      // Presented (GPU-confirmed) frames. WebGL presents inside the draw, so its
      // counters never move: fall back to rAF and say so.
      presentedSource: backend === 'webgpu' ? 'presented' : 'raf',
      presentedAt: [],
      presentedIntervalsMs: [],
      unplayableSamples: 0,
      rafAt: [],
      longTasks: [],
      stalls: [],
      positions: [],
      deadlocks: [],
      deaths: 0,
      respawns: 0,
      firstMoveMs: null,
      spawnPosition: null,
      maxDisplacementM: 0,
      driverErrors: [],
      menuInterruptions: 0,
      poseSource: 'samplePlayerPose',
    };
    window.__MP_LAB_PROBE__ = probe;

    // ---- presented frames ----
    // Read the counters on the page's own rAF tick plus a 16 ms timer, never a
    // 4 ms timer: measured 2026-09-02, a 4 ms setInterval sampler alone took a
    // solo page from 38 presented fps to 20. Presentation never outruns
    // submissions, so one read per tick sees every completion; the timer
    // covers completions that land while rAF is blocked. A read that finds
    // the sequence advanced by more than one records the advance so the
    // interval is reported honestly as spanning several frames.
    let lastCompleted = api.samplePresentationCounters?.()?.completedSequence ?? -1;
    let lastCompletedAt = api.samplePresentationCounters?.()?.lastCompletedAt ?? null;
    probe.coalescedReads = 0;
    const readCounters = () => {
      if (probe.presentedSource !== 'presented') return;
      let counters = null;
      try { counters = api.samplePresentationCounters(); } catch { return; }
      if (!counters || counters.completedSequence === lastCompleted) return;
      const at = counters.lastCompletedAt;
      const advance = counters.completedSequence - lastCompleted;
      if (typeof at === 'number' && typeof lastCompletedAt === 'number' && lastCompleted >= 0) {
        const interval = at - lastCompletedAt;
        const isPlayable = playable();
        if (!isPlayable) probe.unplayableSamples += 1;
        if (advance > 1) probe.coalescedReads += 1;
        probe.presentedAt.push(Math.round(at));
        probe.presentedIntervalsMs.push(Math.round(interval * 100) / 100);
        if (interval > cfg.stallFloorMs) probe.stalls.push({ atMs: Math.round(at - startedAt), durationMs: Math.round(interval), advance, playable: isPlayable });
      }
      lastCompleted = counters.completedSequence;
      lastCompletedAt = at;
    };
    const sampleTimer = window.setInterval(() => {
      if (!probe.running) { window.clearInterval(sampleTimer); return; }
      readCounters();
    }, 16);

    // ---- rAF discriminator (and the fallback series for webgl2) ----
    let lastRaf = null;
    const rafTick = (now) => {
      if (!probe.running) return;
      readCounters();
      if (lastRaf !== null) {
        probe.rafAt.push(Math.round(now));
        if (probe.presentedSource === 'raf') {
          const interval = now - lastRaf;
          probe.presentedIntervalsMs.push(Math.round(interval * 100) / 100);
          if (interval > cfg.stallFloorMs) probe.stalls.push({ atMs: Math.round(now - startedAt), durationMs: Math.round(interval), playable: playable() });
        }
      }
      lastRaf = now;
      window.requestAnimationFrame(rafTick);
    };
    window.requestAnimationFrame(rafTick);
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (probe.longTasks.length < 200) probe.longTasks.push({ atMs: Math.round(entry.startTime - startedAt), durationMs: Math.round(entry.duration) });
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* longtask unsupported */ }

    // ---- movement driver ----
    // No pointer lock in headless, so yaw comes from aimAtRemote (each player
    // turns toward the other every few seconds) and the walk pattern alternates
    // forward / strafe / backward so a player pinned against a wall still
    // moves; only a player that does not move at all under input is a deadlock.
    const key = (type, code) => {
      try { window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true })); } catch { /* ignore */ }
    };
    const held = new Set();
    const hold = (code, down) => {
      if (down && !held.has(code)) { held.add(code); key('keydown', code); }
      if (!down && held.has(code)) { held.delete(code); key('keyup', code); }
    };
    let step = 0;
    let inputSince = null;
    let window5 = [];
    let lastDeadlockAt = -Infinity;
    // MP-LAB: a detected deadlock is ambiguous - a player wedged in arena
    // geometry and a player frozen by the network look identical from a
    // position series. On every deadlock the driver turns the player through
    // eight headings while holding forward for 1.6 s. Escaping means the world
    // held it (an arena/collision report, not a netcode one); not escaping
    // under every heading is a real freeze. The verdict still fails on the
    // deadlock either way: this only says which team owns it.
    let escape = null;
    // cfg.driver === false: sampler only (used to prove the driver's own
    // snapshot() polling is not what a page is paying for).
    const driverTimer = cfg.driver === false ? 0 : window.setInterval(() => {
      if (!probe.running) {
        window.clearInterval(driverTimer);
        try { api.setMovement(false, false); api.setTriggerHeld?.(false); } catch { /* ignore */ }
        for (const code of [...held]) hold(code, false);
        return;
      }
      step += 1;
      const now = performance.now();
      try {
        if (!menuHidden()) {
          probe.menuInterruptions += 1;
          document.querySelector('#resume')?.click();
        }
        // samplePlayerPose is the MP-LAB accessor (cheap); a build without it
        // falls back to the full snapshot at 1 Hz and says so in the record.
        let pose = null;
        if (typeof api.samplePlayerPose === 'function') pose = api.samplePlayerPose();
        else if (step % 20 === 0) { const full = api.snapshot(); pose = { alive: full?.player?.alive ?? false, position: full?.player?.position, awaitingCanonicalGuestAuthority: full?.player?.awaitingCanonicalGuestAuthority ?? null }; probe.poseSource = 'snapshot-1hz'; }
        else return;
        const alive = pose?.alive ?? false;
        const raw = pose?.position;
        const pos = Array.isArray(raw) && raw.length >= 3 ? { x: raw[0], y: raw[1], z: raw[2] } : null;
        if (pos && probe.spawnPosition === null) probe.spawnPosition = { ...pos };
        if (!alive) {
          probe.deaths += 1;
          inputSince = null;
          window5 = [];
          api.setMovement(false, false);
          api.setTriggerHeld?.(false);
          if (step % 20 === 0) { try { api.respawn(); probe.respawns += 1; } catch { /* ignore */ } }
          return;
        }
        // MP-LAB: escape sweep owns the driver while it runs.
        if (escape) {
          const dx = pos ? pos.x - escape.from.x : 0;
          const dy = pos ? pos.y - escape.from.y : 0;
          const dz = pos ? pos.z - escape.from.z : 0;
          escape.movedM = Math.max(escape.movedM, Math.sqrt(dx * dx + dy * dy + dz * dz));
          // aimAtRemoteWithOffset is the only yaw control without pointer lock and
          // it no-ops when there is no remote (solo). Track the yaw actually
          // reached: a sweep that never turned the player proves nothing.
          if (typeof pose?.yaw === 'number') {
            if (escape.startYaw === null) escape.startYaw = pose.yaw;
            let delta = Math.abs(pose.yaw - escape.startYaw) % (Math.PI * 2);
            if (delta > Math.PI) delta = Math.PI * 2 - delta;
            escape.maxYawDeltaRad = Math.max(escape.maxYawDeltaRad, delta);
          }
          const elapsed = now - escape.startedAt;
          if (elapsed >= 1600 || typeof api.aimAtRemoteWithOffset !== 'function') {
            const record = probe.deadlocks[escape.index];
            if (record) {
              const turned = escape.maxYawDeltaRad > 0.5;
              record.escape = {
                headings: escape.headings,
                movedM: Math.round(escape.movedM * 1000) / 1000,
                maxYawDeltaRad: Math.round(escape.maxYawDeltaRad * 100) / 100,
                yawControl: turned,
                // 0.5 m in 1.6 s of sprint is a tenth of the distance a free
                // player covers: anything above it means the world let go.
                // Without real yaw control the sweep only re-walked the same
                // heading, so the answer is unknown, never 'frozen'.
                freed: turned ? escape.movedM > 0.5 : null,
              };
            }
            escape = null;
            inputSince = now;
            window5 = [];
          } else {
            const heading = Math.floor(elapsed / 200) % 8;
            if (heading !== escape.lastHeading) {
              escape.lastHeading = heading;
              escape.headings += 1;
              try { api.aimAtRemoteWithOffset(-Math.PI + (heading * Math.PI) / 4, 0); } catch { /* no remote */ }
            }
            api.setMovement(true, true);
            for (const code of [...held]) hold(code, false);
            return;
          }
        }
        // 12 s pattern: 3 s forward+sprint, 3 s forward+left, 3 s backward, 3 s forward+right.
        const phase = Math.floor(step / 60) % 4;
        api.setMovement(phase !== 2, phase === 0);
        hold('KeyS', phase === 2);
        hold('KeyA', phase === 1);
        hold('KeyD', phase === 3);
        if (step % 80 === 40) key('keydown', 'Space'), key('keyup', 'Space');
        if (step % 80 === 0 && typeof api.aimAtRemote === 'function') { try { api.aimAtRemote('body'); } catch { /* no remote yet */ } }
        if (typeof api.setTriggerHeld === 'function') api.setTriggerHeld(step % 40 < 8);
        if (inputSince === null) inputSince = now;
        if (!pos) return;
        probe.positions.push([Math.round(now - startedAt), Math.round(pos.x * 100) / 100, Math.round(pos.y * 100) / 100, Math.round(pos.z * 100) / 100]);
        if (probe.spawnPosition) {
          const dx = pos.x - probe.spawnPosition.x; const dy = pos.y - probe.spawnPosition.y; const dz = pos.z - probe.spawnPosition.z;
          const displacement = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (displacement > probe.maxDisplacementM) probe.maxDisplacementM = Math.round(displacement * 100) / 100;
          if (probe.firstMoveMs === null && displacement > 0.25) probe.firstMoveMs = Math.round(now - startedAt);
        }
        window5.push({ t: now, pos });
        window5 = window5.filter((entry) => entry.t >= now - cfg.deadlockWindowMs);
        const covered = window5.length > 0 ? now - window5[0].t : 0;
        if (covered >= cfg.deadlockWindowMs - 100 && inputSince !== null && now - inputSince >= cfg.deadlockWindowMs && now - lastDeadlockAt >= cfg.deadlockWindowMs) {
          let maxDist = 0;
          const first = window5[0].pos;
          for (const entry of window5) {
            const dx = entry.pos.x - first.x; const dy = entry.pos.y - first.y; const dz = entry.pos.z - first.z;
            maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dy * dy + dz * dz));
          }
          if (maxDist < cfg.deadlockDistanceM) {
            lastDeadlockAt = now;
            probe.deadlocks.push({
              atMs: Math.round(now - startedAt),
              windowMs: Math.round(covered),
              maxDistanceM: Math.round(maxDist * 1000) / 1000,
              position: [Math.round(first.x * 100) / 100, Math.round(first.y * 100) / 100, Math.round(first.z * 100) / 100],
              awaitingCanonicalGuestAuthority: pose?.awaitingCanonicalGuestAuthority ?? null,
              menuHidden: menuHidden(),
              escape: null,
            });
            escape = {
              startedAt: now,
              from: { ...first },
              index: probe.deadlocks.length - 1,
              movedM: 0,
              headings: 0,
              lastHeading: -1,
              startYaw: null,
              maxYawDeltaRad: 0,
            };
          }
        }
      } catch (error) {
        if (probe.driverErrors.length < 20) probe.driverErrors.push(String(error?.message ?? error).slice(0, 200));
      }
    }, 50);
    return { backend, presentedSource: probe.presentedSource };
  }, options);
}

function stopProbe(page) {
  return page.evaluate(() => {
    const probe = window.__MP_LAB_PROBE__;
    if (!probe) return null;
    probe.running = false;
    const intervals = probe.presentedIntervalsMs;
    const sorted = [...intervals].sort((a, b) => a - b);
    const pct = (p) => (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]);
    const mean = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
    // Classify each stall: a rAF gap of similar size inside the same window is
    // a main-thread block; a clean rAF cadence over a presented gap is
    // presentation-only (queue backpressure). Opposite fixes.
    const rafGapsAround = (atMs) => {
      const absolute = probe.startedAt + atMs;
      let worst = 0;
      for (let index = 1; index < probe.rafAt.length; index += 1) {
        const end = probe.rafAt[index];
        if (end < absolute - 600) continue;
        if (probe.rafAt[index - 1] > absolute + 100) break;
        worst = Math.max(worst, end - probe.rafAt[index - 1]);
      }
      return Math.round(worst);
    };
    const stalls = probe.stalls.map((stall) => {
      const worstRafGapMs = rafGapsAround(stall.atMs);
      return { ...stall, worstRafGapMs, kind: worstRafGapMs >= stall.durationMs * 0.5 ? 'main-thread' : 'presentation-only' };
    });
    const worstRafGapMs = probe.rafAt.reduce((worst, at, index) => (index === 0 ? worst : Math.max(worst, at - probe.rafAt[index - 1])), 0);
    return {
      backend: probe.backend,
      presentedSource: probe.presentedSource,
      sampledMs: Math.round(performance.now() - probe.startedAt),
      frames: intervals.length,
      meanIntervalMs: mean === null ? null : Math.round(mean * 100) / 100,
      meanFps: mean ? Math.round((1000 / mean) * 10) / 10 : null,
      p50Ms: pct(0.5), p95Ms: pct(0.95), p99Ms: pct(0.99), maxMs: sorted.length ? sorted[sorted.length - 1] : null,
      unplayableSamples: probe.unplayableSamples,
      worstStallMs: sorted.length ? sorted[sorted.length - 1] : null,
      stallCount: stalls.length,
      stalls: stalls.slice(0, 20),
      worstRafGapMs: Math.round(worstRafGapMs),
      longTasksOver100Ms: probe.longTasks.filter((task) => task.durationMs >= 100).length,
      longTasks: probe.longTasks.slice(0, 20),
      deadlockCount: probe.deadlocks.length,
      deadlocksFreedByTurning: probe.deadlocks.filter((entry) => entry.escape?.freed === true).length,
      deadlocksNotFreed: probe.deadlocks.filter((entry) => entry.escape?.freed === false).length,
      deadlocksUnclassified: probe.deadlocks.filter((entry) => !entry.escape || entry.escape.freed === null).length,
      deadlocks: probe.deadlocks.slice(0, 10),
      deaths: probe.deaths,
      respawns: probe.respawns,
      firstMoveMs: probe.firstMoveMs,
      spawnPosition: probe.spawnPosition,
      maxDisplacementM: probe.maxDisplacementM,
      positionSamples: probe.positions.length,
      positionTrail: probe.positions.filter((_, index) => index % 20 === 0).slice(0, 60),
      menuInterruptions: probe.menuInterruptions,
      poseSource: probe.poseSource,
      coalescedReads: probe.coalescedReads,
      driverErrors: probe.driverErrors,
    };
  });
}

// ---------------------------------------------------------------------------
// One arena, the whole flow, identical for every arena.
// ---------------------------------------------------------------------------
async function runArena(hostBrowser, guestBrowser, arena) {
  const record = {
    contract: 'mp-lab-host-guest-v1',
    label: LABEL,
    arenaId: arena.id,
    arenaName: arena.displayName,
    measuredAt: new Date().toISOString(),
    hostedBotsRequested: HOSTED_BOTS,
    renderer: RENDERER,
    renderProfile: RENDER_PROFILE,
    chromeFlags: UNSAFE_WEBGPU ? 'unsafe-webgpu' : 'stock',
    sampleSeconds: SAMPLE_SECONDS,
    flow: [],
    join: { ok: false, roomMs: null, joinMs: null },
    arenaSync: { ok: false, hostMs: null, guestMs: null, hostGuidance: null, guestGuidance: null },
    deploy: { ok: false, hostOk: false, guestOk: false, hostMs: null, guestMs: null, hostedBotsSeen: null },
    host: null,
    guest: null,
    errors: { host: { page: [], console: [] }, guest: { page: [], console: [] } },
    failure: null,
    finalState: null,
  };
  const step = (name, extra = {}) => {
    record.flow.push(name);
    console.log(`[mp-lab ${arena.id}] ${name}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`);
  };
  let host = null;
  let guest = null;
  try {
    step('boot');
    [host, guest] = await Promise.all([
      openPlayer(hostBrowser, 'host', arena.id, 'HOST'),
      openPlayer(guestBrowser, 'guest', arena.id, 'GUEST'),
    ]);
    step('booted', { hostBackend: host.backend, guestBackend: guest.backend, hostBootMs: host.bootMs, guestBootMs: guest.bootMs });
    if (RENDERER === 'webgpu' && (host.backend !== 'webgpu' || guest.backend !== 'webgpu')) {
      throw new Error(`renderer fell back: host=${host.backend} guest=${guest.backend}`);
    }

    // ---- host opens a room through the real button ----
    step('host-click');
    const roomStart = Date.now();
    await host.page.click('#host');
    await host.page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: ROOM_TIMEOUT_MS });
    const roomCode = (await host.page.textContent('#room-code')).trim();
    record.join.roomMs = Date.now() - roomStart;
    step('room-code', { roomMs: record.join.roomMs, codeLength: roomCode.length });

    // ---- guest joins through the real input + button ----
    const joinStart = Date.now();
    await guest.page.fill('#room-input', roomCode);
    await guest.page.waitForFunction(() => document.querySelector('#join')?.disabled === false, undefined, { timeout: JOIN_TIMEOUT_MS });
    await guest.page.click('#join');
    step('guest-join-click');
    await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
      () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members?.filter((member) => member.connected).length === 2
        && document.querySelectorAll('#lobby-roster .lobby-player').length >= 2,
      undefined,
      { timeout: JOIN_TIMEOUT_MS },
    )));
    record.join.joinMs = Date.now() - joinStart;
    record.join.ok = true;
    step('joined', { joinMs: record.join.joinMs });

    // ---- host picks the map (and bots) through the real selects ----
    const syncStart = Date.now();
    await host.page.selectOption('#lobby-arena', arena.id);
    if (HOSTED_BOTS > 0) {
      const botsDisabled = await host.page.evaluate(() => document.querySelector('#lobby-bots')?.disabled === true);
      // gun-range pins its practice round to zero bots (rangeLobby in
      // renderPrivateLobby); that is the arena's contract, not a join-flow
      // difference, so it goes in the record rather than the flow.
      if (!botsDisabled) await host.page.selectOption('#lobby-bots', String(HOSTED_BOTS));
      else record.deploy.botsSelectDisabled = true;
    }
    step('host-selected-arena');
    await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
      (arenaId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.arenaId === arenaId,
      arena.id,
      { timeout: JOIN_TIMEOUT_MS },
    )));
    // Sync timeline: guidance line + bootstrap stage per side while the lobby
    // synchronises the arena. The game's 75 s watchdog retries once and then
    // tells the player to LEAVE; this is where that shows up.
    record.arenaSync.timeline = { host: [], guest: [] };
    const syncStop = { done: false };
    const syncTimeline = (async () => {
      const last = { host: '', guest: '' };
      while (!syncStop.done) {
        for (const side of [host, guest]) {
          const state = await snapshotOf(side.page).catch(() => null);
          if (!state) continue;
          const key = `${state.bootstrapStage}|${state.guidance}|${state.arenaId}|${state.readyDisabled}`;
          if (key === last[side.role]) continue;
          last[side.role] = key;
          record.arenaSync.timeline[side.role].push({ atMs: Date.now() - syncStart, bootstrapStage: state.bootstrapStage, arenaId: state.arenaId, readyDisabled: state.readyDisabled, guidance: state.guidance });
        }
        await sleep(2000);
      }
    })();
    const syncSide = async (side) => {
      await side.page.waitForFunction(
        (arenaId) => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
          return snapshot?.arenaSelection?.id === arenaId && document.querySelector('#lobby-ready')?.disabled === false;
        },
        arena.id,
        { timeout: ARENA_SYNC_TIMEOUT_MS },
      );
      return Date.now() - syncStart;
    };
    const syncSettled = await Promise.allSettled([syncSide(host), syncSide(guest)]);
    syncStop.done = true;
    await syncTimeline;
    for (const settled of syncSettled) if (settled.status === 'rejected') throw settled.reason;
    const [hostSyncMs, guestSyncMs] = syncSettled.map((settled) => settled.value);
    record.arenaSync.hostMs = hostSyncMs;
    record.arenaSync.guestMs = guestSyncMs;
    record.arenaSync.ok = true;
    const [hostLobby, guestLobby] = await Promise.all([snapshotOf(host.page), snapshotOf(guest.page)]);
    record.arenaSync.hostGuidance = hostLobby?.guidance ?? null;
    record.arenaSync.guestGuidance = guestLobby?.guidance ?? null;
    record.deploy.hostedBotsSeen = hostLobby?.hostedBotCount ?? null;
    step('arena-synced', { hostMs: hostSyncMs, guestMs: guestSyncMs, hostedBots: record.deploy.hostedBotsSeen });

    // ---- guest readies, host starts (the host's START is its ready commit) ----
    await guest.page.click('#lobby-ready');
    await host.page.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: JOIN_TIMEOUT_MS });
    step('guest-ready');
    const deployStart = Date.now();
    await host.page.click('#lobby-start');
    step('host-start-click');
    // Deploy timeline: lobby phase / bootstrap stage / match phase per side,
    // sampled every 500 ms and kept only on change. This is the evidence for
    // "the lobby waits for all players, then counts 5-4-3-2-1": a host that
    // reaches 'active' long before its guest is playing alone.
    record.deploy.timeline = { host: [], guest: [] };
    const timelineStop = { done: false };
    const timeline = (async () => {
      const last = { host: '', guest: '' };
      while (!timelineStop.done) {
        for (const side of [host, guest]) {
          const state = await snapshotOf(side.page).catch(() => null);
          if (!state) continue;
          const key = `${state.lobbyPhase}|${state.bootstrapStage}|${state.matchPhase}|${state.gameStarted}|${state.menuHidden}`;
          if (key === last[side.role]) continue;
          last[side.role] = key;
          record.deploy.timeline[side.role].push({ atMs: Date.now() - deployStart, lobbyPhase: state.lobbyPhase, bootstrapStage: state.bootstrapStage, matchPhase: state.matchPhase, gameStarted: state.gameStarted, menuHidden: state.menuHidden });
        }
        await sleep(2000);
      }
    })();
    const deploySide = async (side) => {
      await side.page.waitForFunction(
        (arenaId) => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
          return snapshot?.gameStarted === true && snapshot.matchPhase === 'active' && snapshot.arenaSelection?.id === arenaId
            && snapshot.remotes === 1 && document.querySelector('#menu')?.classList.contains('hidden') === true;
        },
        arena.id,
        { timeout: DEPLOY_TIMEOUT_MS },
      );
      return Date.now() - deployStart;
    };
    const deployed = await Promise.allSettled([deploySide(host), deploySide(guest)]);
    timelineStop.done = true;
    await timeline;
    record.deploy.hostOk = deployed[0].status === 'fulfilled';
    record.deploy.guestOk = deployed[1].status === 'fulfilled';
    record.deploy.hostMs = record.deploy.hostOk ? deployed[0].value : null;
    record.deploy.guestMs = record.deploy.guestOk ? deployed[1].value : null;
    record.deploy.ok = record.deploy.hostOk && record.deploy.guestOk;
    step('deployed', { hostOk: record.deploy.hostOk, guestOk: record.deploy.guestOk, hostMs: record.deploy.hostMs, guestMs: record.deploy.guestMs });
    mkdirSync(OUT_DIR, { recursive: true });
    await Promise.all([
      host.page.screenshot({ path: join(OUT_DIR, `${arena.id}-host.png`) }).catch(() => {}),
      guest.page.screenshot({ path: join(OUT_DIR, `${arena.id}-guest.png`) }).catch(() => {}),
    ]);
    if (!record.deploy.ok) {
      const [hostState, guestState] = await Promise.all([snapshotOf(host.page), snapshotOf(guest.page)]);
      record.finalState = { host: hostState, guest: guestState };
      throw new Error(`deploy failed: host=${deployed[0].status === 'rejected' ? deployed[0].reason?.message : 'ok'} guest=${deployed[1].status === 'rejected' ? deployed[1].reason?.message : 'ok'}`);
    }

    // ---- both move and fight for the sample window ----
    const probeOptions = { stallFloorMs: STALL_FLOOR_MS, deadlockWindowMs: DEADLOCK_WINDOW_MS, deadlockDistanceM: DEADLOCK_DISTANCE_M };
    await Promise.all([installProbe(host.page, probeOptions), installProbe(guest.page, probeOptions)]);
    const profilers = CPU_PROFILE ? await Promise.all([startCpuProfile(host), startCpuProfile(guest)]) : null;
    step('sampling', { seconds: SAMPLE_SECONDS, cpuProfile: CPU_PROFILE });
    await sleep(SAMPLE_SECONDS * 1000);
    const [hostStats, guestStats] = await Promise.all([stopProbe(host.page), stopProbe(guest.page)]);
    record.host = hostStats;
    record.guest = guestStats;
    if (profilers) {
      const [hostProfile, guestProfile] = await Promise.all(profilers.map((profiler) => stopCpuProfile(profiler, arena.id)));
      record.host.cpuProfile = hostProfile;
      record.guest.cpuProfile = guestProfile;
    }
    const [hostState, guestState] = await Promise.all([snapshotOf(host.page), snapshotOf(guest.page)]);
    record.finalState = { host: hostState, guest: guestState };
    step('sampled', {
      hostFps: hostStats?.meanFps, guestFps: guestStats?.meanFps,
      hostWorstMs: hostStats?.worstStallMs, guestWorstMs: guestStats?.worstStallMs,
      hostDeadlocks: hostStats?.deadlockCount, guestDeadlocks: guestStats?.deadlockCount,
      guestFirstMoveMs: guestStats?.firstMoveMs,
    });
  } catch (error) {
    record.failure = String(error?.message ?? error).slice(0, 400);
    console.log(`[mp-lab ${arena.id}] FAILURE ${record.failure}`);
    if (host && guest && record.finalState === null) {
      record.finalState = { host: await snapshotOf(host.page).catch(() => null), guest: await snapshotOf(guest.page).catch(() => null) };
    }
    if (host && guest) {
      mkdirSync(OUT_DIR, { recursive: true });
      await Promise.all([
        host.page.screenshot({ path: join(OUT_DIR, `${arena.id}-host-failure.png`) }).catch(() => {}),
        guest.page.screenshot({ path: join(OUT_DIR, `${arena.id}-guest-failure.png`) }).catch(() => {}),
      ]);
    }
  } finally {
    if (host) record.errors.host = host.errors;
    if (guest) record.errors.guest = guest.errors;
    await guest?.context.close().catch(() => {});
    await host?.context.close().catch(() => {});
  }
  record.verdict = arenaVerdict(record);
  return record;
}

async function runSoloArena(browser, arena) {
  const record = {
    contract: 'mp-lab-solo-baseline-v1',
    label: LABEL,
    arenaId: arena.id,
    arenaName: arena.displayName,
    measuredAt: new Date().toISOString(),
    hostedBotsRequested: 0,
    renderer: RENDERER,
    renderProfile: RENDER_PROFILE,
    chromeFlags: UNSAFE_WEBGPU ? 'unsafe-webgpu' : 'stock',
    sampleSeconds: SAMPLE_SECONDS,
    flow: [],
    join: { ok: true, roomMs: null, joinMs: null, note: 'solo: no lobby' },
    arenaSync: { ok: false, hostMs: null, guestMs: null },
    deploy: { ok: false, hostOk: false, guestOk: true, hostMs: null, guestMs: null, hostedBotsSeen: null, timeline: { host: [], guest: [] } },
    host: null,
    guest: null,
    errors: { host: { page: [], console: [] }, guest: { page: [], console: [] } },
    failure: null,
    finalState: null,
  };
  const step = (name, extra = {}) => {
    record.flow.push(name);
    console.log(`[mp-lab solo ${arena.id}] ${name}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`);
  };
  let solo = null;
  try {
    step('boot');
    solo = await openPlayer(browser, 'solo', arena.id, 'SOLO');
    step('booted', { backend: solo.backend, bootMs: solo.bootMs });
    if (RENDERER === 'webgpu' && solo.backend !== 'webgpu') throw new Error(`renderer fell back: ${solo.backend}`);
    const syncStart = Date.now();
    await solo.page.click(`.map-card[data-arena-id="${arena.id}"]`);
    await solo.page.waitForFunction((arenaId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().arenaSelection?.id === arenaId, arena.id, { timeout: JOIN_TIMEOUT_MS });
    record.arenaSync.hostMs = Date.now() - syncStart;
    record.arenaSync.ok = true;
    step('map-card-selected', { ms: record.arenaSync.hostMs });
    const deployStart = Date.now();
    await solo.page.click('#solo');
    step('solo-click');
    const timelineStop = { done: false };
    const timeline = (async () => {
      let last = '';
      while (!timelineStop.done) {
        const state = await snapshotOf(solo.page).catch(() => null);
        if (state) {
          const key = `${state.bootstrapStage}|${state.matchPhase}|${state.gameStarted}|${state.menuHidden}`;
          if (key !== last) {
            last = key;
            record.deploy.timeline.host.push({ atMs: Date.now() - deployStart, lobbyPhase: null, bootstrapStage: state.bootstrapStage, matchPhase: state.matchPhase, gameStarted: state.gameStarted, menuHidden: state.menuHidden });
          }
        }
        await sleep(2000);
      }
    })();
    try {
      await solo.page.waitForFunction((arenaId) => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return snapshot?.gameStarted === true && snapshot.matchPhase === 'active' && snapshot.arenaSelection?.id === arenaId
          && document.querySelector('#menu')?.classList.contains('hidden') === true;
      }, arena.id, { timeout: DEPLOY_TIMEOUT_MS });
    } finally {
      timelineStop.done = true;
      await timeline;
    }
    record.deploy.hostMs = Date.now() - deployStart;
    record.deploy.hostOk = true;
    record.deploy.ok = true;
    step('deployed', { ms: record.deploy.hostMs });
    mkdirSync(OUT_DIR, { recursive: true });
    await solo.page.screenshot({ path: join(OUT_DIR, `${arena.id}-solo.png`) }).catch(() => {});
    const probeOptions = { stallFloorMs: STALL_FLOOR_MS, deadlockWindowMs: DEADLOCK_WINDOW_MS, deadlockDistanceM: DEADLOCK_DISTANCE_M };
    await installProbe(solo.page, probeOptions);
    const profiler = CPU_PROFILE ? await startCpuProfile(solo) : null;
    step('sampling', { seconds: SAMPLE_SECONDS, cpuProfile: CPU_PROFILE });
    await sleep(SAMPLE_SECONDS * 1000);
    record.host = await stopProbe(solo.page);
    if (profiler) record.host.cpuProfile = await stopCpuProfile(profiler, arena.id);
    record.finalState = { host: await snapshotOf(solo.page), guest: null };
    step('sampled', { fps: record.host?.meanFps, worstMs: record.host?.worstStallMs, deadlocks: record.host?.deadlockCount, bots: record.finalState.host?.bots });
  } catch (error) {
    record.failure = String(error?.message ?? error).slice(0, 400);
    console.log(`[mp-lab solo ${arena.id}] FAILURE ${record.failure}`);
    if (solo) {
      mkdirSync(OUT_DIR, { recursive: true });
      await solo.page.screenshot({ path: join(OUT_DIR, `${arena.id}-solo-failure.png`) }).catch(() => {});
    }
  } finally {
    if (solo) record.errors.host = solo.errors;
    await solo?.context.close().catch(() => {});
  }
  record.verdict = arenaVerdict(record);
  return record;
}

export function arenaVerdict(record) {
  const reasons = [];
  if (!record.join.ok) reasons.push('join failed');
  if (!record.arenaSync.ok) reasons.push('arena sync failed');
  if (!record.deploy.ok) reasons.push(`deploy failed (host ${record.deploy.hostOk ? 'ok' : 'no'}, guest ${record.deploy.guestOk ? 'ok' : 'no'})`);
  for (const side of ['host', 'guest']) {
    const stats = record[side];
    if (!stats) continue;
    if (stats.frames === 0) reasons.push(`${side} presented no frames`);
    const stallsWhilePlayable = stats.stalls.filter((stall) => stall.playable !== false).length;
    if (stallsWhilePlayable > 0) reasons.push(`${side} ${stallsWhilePlayable} stall(s) > ${STALL_FLOOR_MS} ms (worst ${stats.worstStallMs} ms)`);
    if (stats.deadlockCount > 0) reasons.push(`${side} ${stats.deadlockCount} movement deadlock(s)`);
    if (record.errors[side].page.length > 0) reasons.push(`${side} ${record.errors[side].page.length} page error(s)`);
  }
  if (record.failure) reasons.push(record.failure);
  return { pass: reasons.length === 0, reasons };
}

export function flowsIdentical(records) {
  const flows = records.filter((record) => record.verdict?.pass).map((record) => record.flow.join('>'));
  return new Set(flows).size <= 1;
}

function summaryTable(records) {
  const fmt = (value, suffix = '') => (value === null || value === undefined ? '-' : `${value}${suffix}`);
  const lines = [
    `| arena | join | arena sync h/g | deploy h/g | fps h/g | worst stall h/g | stalls>${STALL_FLOOR_MS} h/g | deadlocks h/g | guest first move | errors h/g | verdict |`,
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const record of records) {
    const h = record.host; const g = record.guest;
    lines.push(`| ${record.arenaId} | ${record.join.ok ? `ok ${record.join.joinMs} ms` : 'FAIL'} | ${fmt(record.arenaSync.hostMs, ' ms')} / ${fmt(record.arenaSync.guestMs, ' ms')} | ${record.deploy.hostOk ? `${record.deploy.hostMs} ms` : 'FAIL'} / ${record.deploy.guestOk ? `${record.deploy.guestMs} ms` : 'FAIL'} | ${fmt(h?.meanFps)} / ${fmt(g?.meanFps)} | ${fmt(h?.worstStallMs, ' ms')} / ${fmt(g?.worstStallMs, ' ms')} | ${fmt(h?.stallCount)} / ${fmt(g?.stallCount)} | ${fmt(h?.deadlockCount)} / ${fmt(g?.deadlockCount)} | ${fmt(g?.firstMoveMs, ' ms')} | ${record.errors.host.page.length}+${record.errors.host.console.length} / ${record.errors.guest.page.length}+${record.errors.guest.console.length} | ${record.verdict.pass ? 'PASS' : `FAIL: ${record.verdict.reasons.join('; ')}`} |`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
async function main() {
  const roster = multiplayerArenaRoster();
  const arenas = TARGET_MAP ? roster.filter((arena) => arena.id === TARGET_MAP) : roster;
  if (arenas.length === 0) throw new Error(`--map ${TARGET_MAP} is not a multiplayer-enabled selectable arena; roster: ${roster.map((arena) => arena.id).join(', ')}`);
  console.log(`[mp-lab] label=${LABEL} mode=${SOLO ? 'solo' : 'host-guest'} bots=${HOSTED_BOTS} sample=${SAMPLE_SECONDS}s flags=${UNSAFE_WEBGPU ? 'unsafe-webgpu' : 'stock'} arenas=${arenas.map((arena) => arena.id).join(', ')}`);
  mkdirSync(OUT_DIR, { recursive: true });

  await assertPortFree(PORT, 'static');
  const server = await serveDist(PORT);
  const peer = await startPeerServer(PEER_PORT);
  console.log(`[mp-lab] dist on http://127.0.0.1:${PORT}/  peerjs on 127.0.0.1:${PEER_PORT}/peerjs`);

  let hostBrowser = null;
  let guestBrowser = null;
  const records = [];
  try {
    hostBrowser = await launchBrowser(SOLO ? 'solo' : 'host');
    if (!SOLO) guestBrowser = await launchBrowser('guest');
    for (const arena of arenas) {
      const record = SOLO ? await runSoloArena(hostBrowser, arena) : await runArena(hostBrowser, guestBrowser, arena);
      records.push(record);
      writeFileSync(join(OUT_DIR, `${arena.id}.json`), JSON.stringify(record, null, 2));
    }
  } finally {
    await guestBrowser?.close().catch(() => {});
    await hostBrowser?.close().catch(() => {});
    // Only what this process started: the static server and its own PeerJS child.
    await new Promise((closed) => { server.closeAllConnections?.(); server.close(() => closed()); });
    if (peer.exitCode === null) peer.kill();
  }

  const identical = flowsIdentical(records);
  const summary = {
    contract: 'mp-lab-host-guest-summary-v1',
    label: LABEL,
    measuredAt: new Date().toISOString(),
    mode: SOLO ? 'solo' : 'host-guest',
    hostedBots: HOSTED_BOTS,
    sampleSeconds: SAMPLE_SECONDS,
    chromeFlags: UNSAFE_WEBGPU ? 'unsafe-webgpu' : 'stock',
    stallFloorMs: STALL_FLOOR_MS,
    deadlockWindowMs: DEADLOCK_WINDOW_MS,
    roster: roster.map((arena) => arena.id),
    joinFlowIdentical: identical,
    arenas: records.map((record) => ({
      arenaId: record.arenaId,
      pass: record.verdict.pass,
      reasons: record.verdict.reasons,
      join: record.join,
      arenaSync: { hostMs: record.arenaSync.hostMs, guestMs: record.arenaSync.guestMs },
      deploy: record.deploy,
      host: record.host && { fps: record.host.meanFps, worstStallMs: record.host.worstStallMs, stalls: record.host.stallCount, deadlocks: record.host.deadlockCount, frames: record.host.frames, source: record.host.presentedSource },
      guest: record.guest && { fps: record.guest.meanFps, worstStallMs: record.guest.worstStallMs, stalls: record.guest.stallCount, deadlocks: record.guest.deadlockCount, frames: record.guest.frames, firstMoveMs: record.guest.firstMoveMs, source: record.guest.presentedSource },
      errors: { hostPage: record.errors.host.page.length, hostConsole: record.errors.host.console.length, guestPage: record.errors.guest.page.length, guestConsole: record.errors.guest.console.length },
      flow: record.flow,
    })),
    pass: identical && records.length === arenas.length && records.every((record) => record.verdict.pass),
  };
  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\n[mp-lab] ${LABEL}: ${records.filter((record) => record.verdict.pass).length}/${records.length} arenas pass; join flow identical: ${identical}`);
  console.log(summaryTable(records));
  if (!identical) console.log('[mp-lab] join flow differed between arenas:', records.map((record) => `${record.arenaId}=${record.flow.join('>')}`).join(' | '));
  console.log(`[mp-lab] verdict ${summary.pass ? 'PASS' : 'FAIL'} - ${join(OUT_DIR, 'summary.json')}`);
  process.exitCode = summary.pass ? 0 : 1;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error('[mp-lab] fatal', error);
    process.exitCode = 2;
  });
}
