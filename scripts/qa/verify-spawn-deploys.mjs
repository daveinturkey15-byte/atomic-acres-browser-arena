#!/usr/bin/env node
// HF-402: a REAL deploy on every selectable arena, headless installed Chrome
// over CDP, sampling where the player actually lands - after the first deploy
// and after one respawn - and where the bots stand, then asserting each landing
// matches a committed spawn that passes the layout gate.
//
// Owner 2026-09-02: "currently raid spawns me in outside". The offline gate
// says where the spawn TABLE puts a player; this says where the GAME does.
//
//   node scripts/qa/verify-spawn-deploys.mjs --label after \
//        [--dist dist] [--port 41944] [--arenas test2,...] \
//        [--layouts artifacts/qa/hf402/after-layouts.json] \
//        [--host-guest test2] [--bot-watch-ms 20000]
//
// Writes artifacts/qa/hf402/<label>/<arena>.json and one screenshot per
// landing from the player's own viewpoint. Exit 0 = every landing matched a
// committed spawn that passes the gate; 1 = a landing did not; 2 = environment.
//
// Machine rules (docs/pass84-lanes/LANE-D): headless only, --mute-audio, one
// browser, one build, never kill a process this script did not start, and at
// least 3000 MiB of GPU memory free before the browser launches (the owner's
// ComfyUI shares the card).
import { chromium } from '@playwright/test';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const LABEL = arg('--label', 'unlabeled');
const DIST = arg('--dist', 'dist');
const PORT = Number(arg('--port', '41944'));
const PEER_PORT = Number(arg('--peer-port', '9347'));
const LAYOUTS = arg('--layouts', `artifacts/qa/hf402/${LABEL}-layouts.json`);
const HOST_GUEST = (arg('--host-guest', '') || '').split(',').map((entry) => entry.trim()).filter(Boolean);
const BOT_WATCH_MS = Number(arg('--bot-watch-ms', '20000'));
const OUT_DIR = resolve(process.cwd(), arg('--out', `artifacts/qa/hf402/${LABEL}`));
const DEPLOY_TIMEOUT_MS = 180_000;
/** A landing within this XZ distance of a committed spawn is that spawn (physics settles the capsule by centimetres). */
const MATCH_RADIUS_M = 0.75;

mkdirSync(OUT_DIR, { recursive: true });

const layouts = JSON.parse(readFileSync(resolve(process.cwd(), LAYOUTS), 'utf8'));
const layoutById = new Map(layouts.reports.map((report) => [report.arenaId, report]));
// The roster comes from the committed layout record, which the measurement
// script derives from ARENA_SELECTIONS - never a list typed here.
const ARENAS = (arg('--arenas', null)?.split(',').map((entry) => entry.trim()).filter(Boolean))
  ?? layouts.reports.map((report) => report.arenaId);

function matchSpawn(arenaId, position) {
  const report = layoutById.get(arenaId);
  if (!report || !position) return null;
  let best = null;
  for (const point of report.points) {
    const distance = Math.hypot(point.x - position[0], point.z - position[2]);
    if (distance <= MATCH_RADIUS_M && (!best || distance < best.distance)) best = { point, distance };
  }
  if (!best) return null;
  return {
    team: best.point.team,
    index: best.point.index,
    x: best.point.x,
    z: best.point.z,
    distanceM: Number(best.distance.toFixed(3)),
    heightAboveAuthoredFeetM: Number((position[1] - (best.point.y - 1.7)).toFixed(3)),
    passesGate: best.point.failures.length === 0,
    failures: best.point.failures,
  };
}

async function gpuMemoryFreeMiB() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader']);
    const [used, total] = stdout.trim().split(',').map((value) => Number.parseInt(value, 10));
    return total - used;
  } catch {
    return null;
  }
}

async function waitForGpuHeadroom() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const free = await gpuMemoryFreeMiB();
    if (free === null || free >= 3000) return free;
    console.error(`[spawn-deploys] ${free} MiB GPU free (< 3000), waiting 60 s (${attempt + 1}/10)`);
    await new Promise((wait) => setTimeout(wait, 60_000));
  }
  throw new Error('GPU never had 3000 MiB free; not launching a browser beside the owner\'s work');
}

function httpUp(port, path = '/') {
  return new Promise((done) => {
    const probe = httpRequest({ host: '127.0.0.1', port, path, timeout: 500 }, (response) => { response.resume(); done(true); });
    probe.on('error', () => done(false));
    probe.on('timeout', () => { probe.destroy(); done(false); });
    probe.end();
  });
}

const children = [];
/** Listener pids this script brought up, by port - the only pids it is allowed to kill by port. */
const ownedListeners = new Map();
/**
 * Synchronous on purpose: this runs from the `finally` right before
 * `process.exit`, and an async `spawn('taskkill')` there was measured
 * (2026-09-02, twice) to leave the vite preview listening on :41944 after the
 * script had exited.
 */
function killPidTree(pid) {
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  }
}
function killTree(child) {
  if (!child || child.pid == null) return;
  if (process.platform === 'win32') killPidTree(child.pid);
  else child.kill('SIGTERM');
}

/** The pid listening on 127.0.0.1:port, or null. Windows only; elsewhere the child tree kill suffices. */
async function listenerPid(port) {
  if (process.platform !== 'win32') return null;
  const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp']).catch(() => ({ stdout: '' }));
  for (const line of stdout.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length >= 5 && columns[1] === `127.0.0.1:${port}` && columns[3] === 'LISTENING') return Number(columns[4]);
  }
  return null;
}

/**
 * `npx` on Windows is a cmd wrapper; `taskkill /T` on the wrapper has been
 * measured (2026-09-02) to leave the vite child listening on :41944 after
 * the wrapper exits, so the listener is also killed by the pid recorded when
 * this script brought it up - never a pid it did not start.
 */
function killOwnedListeners() {
  for (const [port, pid] of ownedListeners) {
    killPidTree(pid);
    ownedListeners.delete(port);
  }
}

async function serveDist() {
  if (await httpUp(PORT)) throw new Error(`port ${PORT} is already in use; refusing to reuse a server this script did not start`);
  const server = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', shell: process.platform === 'win32' });
  children.push(server);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await httpUp(PORT)) {
      const pid = await listenerPid(PORT);
      if (pid) ownedListeners.set(PORT, pid);
      return;
    }
    await new Promise((wait) => setTimeout(wait, 500));
  }
  throw new Error(`served ${DIST} never came up on :${PORT}`);
}

async function ensurePeerServer() {
  if (await httpUp(PEER_PORT, '/peerjs/id')) throw new Error(`peer port ${PEER_PORT} already in use; refusing to share it`);
  const child = spawn(process.execPath, [
    resolve('node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1', '--port', String(PEER_PORT), '--path', '/peerjs', '--no-allow_discovery',
  ], { stdio: 'ignore', windowsHide: true });
  children.push(child);
  // 30 s, not 10: on 2026-09-02 the peer server took longer than 10 s to bind
  // while three other lanes' builds and browsers shared the machine.
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await httpUp(PEER_PORT, '/peerjs/id')) return;
    if (child.exitCode !== null) throw new Error(`peer server exited with ${child.exitCode} before binding :${PEER_PORT}`);
    await new Promise((wait) => setTimeout(wait, 100));
  }
  throw new Error('peer server never ready');
}

function pageUrl(extra = {}) {
  const url = new URL(`http://127.0.0.1:${PORT}/`);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('render', 'quality');
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

function sample(page) {
  return page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug.snapshot();
    const player = snapshot.player ?? {};
    const bots = Array.isArray(snapshot.bots) ? snapshot.bots : [];
    return {
      matchPhase: snapshot.matchPhase ?? null,
      gameStarted: snapshot.gameStarted ?? null,
      arenaId: snapshot.arenaId ?? document.documentElement.dataset.arenaId ?? null,
      position: Array.isArray(snapshot.playerPosition) ? snapshot.playerPosition : (Array.isArray(player.position) ? player.position : null),
      team: player.team ?? null,
      alive: player.alive ?? null,
      hp: player.hp ?? null,
      spawnSelection: snapshot.spawnSelection ?? null,
      bots: bots.map((bot) => ({ id: bot.id ?? null, team: bot.team ?? null, alive: bot.alive ?? null, position: bot.position ?? (Number.isFinite(bot.x) ? [bot.x, bot.y, bot.z] : null) })),
      snapshotKeys: Object.keys(snapshot),
    };
  });
}

async function waitActive(page) {
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot && snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: DEPLOY_TIMEOUT_MS });
}

async function openPage(browser, label, extra = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errorsSeen = [];
  page.on('pageerror', (error) => page.errorsSeen.push(String(error).slice(0, 200)));
  page.on('console', (message) => { if (message.type() === 'error') page.errorsSeen.push(`console: ${message.text().slice(0, 160)}`); });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.goto(pageUrl(extra), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: DEPLOY_TIMEOUT_MS });
  if (label) await page.fill('#player-name', label).catch(() => {});
  return page;
}

async function landing(page, arenaId, name, record) {
  await page.waitForTimeout(1_500);
  const sampled = await sample(page);
  const shot = resolve(OUT_DIR, `${arenaId}-${name}.png`);
  await page.screenshot({ path: shot });
  const match = matchSpawn(arenaId, sampled.position);
  const entry = { name, position: sampled.position, team: sampled.team, alive: sampled.alive, hp: sampled.hp, spawnSelection: sampled.spawnSelection, match, screenshot: shot };
  record.landings.push(entry);
  console.error(`[spawn-deploys] ${arenaId.padEnd(16)} ${name.padEnd(14)} at ${sampled.position ? sampled.position.map((v) => v.toFixed(2)).join(', ') : 'null'}`
    + (match ? ` = committed team ${match.team} #${match.index} (${match.x}, ${match.z}) ${match.passesGate ? 'PASSES' : `FAILS ${match.failures.join(',')}`}` : ' = NO COMMITTED SPAWN within 0.75 m'));
  return sampled;
}

async function watchBots(page, arenaId, record) {
  if (BOT_WATCH_MS <= 0) return;
  const first = await sample(page);
  await page.waitForTimeout(BOT_WATCH_MS);
  const later = await sample(page);
  record.bots = {
    watchMs: BOT_WATCH_MS,
    atDeploy: first.bots,
    later: later.bots,
    movedM: later.bots.map((bot, index) => {
      const before = first.bots[index]?.position;
      return bot.position && before ? Number(Math.hypot(bot.position[0] - before[0], bot.position[2] - before[2]).toFixed(2)) : null;
    }),
  };
  for (const [index, bot] of first.bots.entries()) {
    const spawnMatch = matchSpawn(arenaId, bot.position);
    console.error(`[spawn-deploys] ${arenaId.padEnd(16)} bot ${String(bot.id).padEnd(10)} spawned at ${bot.position ? bot.position.map((v) => v.toFixed(1)).join(', ') : 'null'}`
      + (spawnMatch ? ` = team ${spawnMatch.team} #${spawnMatch.index}` : ' (no committed spawn within 0.75 m)')
      + `, moved ${record.bots.movedM[index]} m in ${BOT_WATCH_MS / 1000} s`);
  }
}

async function soloDeploy(browser, arenaId) {
  const record = { arenaId, mode: 'solo', ok: false, landings: [], errors: [] };
  const page = await openPage(browser, null);
  try {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await waitActive(page);
    await landing(page, arenaId, 'solo-deploy', record);
    await watchBots(page, arenaId, record);
    // One respawn through the same path a death takes.
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.respawn(); });
    await landing(page, arenaId, 'solo-respawn', record);
    record.ok = record.landings.every((entry) => entry.match && entry.match.passesGate);
  } catch (error) {
    record.error = String(error).slice(0, 240);
  } finally {
    record.errors = [...new Set(page.errorsSeen)].slice(0, 6);
    await page.close().catch(() => {});
  }
  return record;
}

async function hostGuestDeploy(browser, arenaId) {
  const record = { arenaId, mode: 'host-guest-tdm', ok: false, landings: [], errors: [] };
  const extra = { multiplayerQa: '1', peerQaPort: String(PEER_PORT) };
  const host = await openPage(browser, 'HF402 Host', extra);
  const guest = await openPage(browser, 'HF402 Guest', extra);
  try {
    for (const page of [host, guest]) {
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: DEPLOY_TIMEOUT_MS });
    }
    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: DEPLOY_TIMEOUT_MS });
    const code = (await host.textContent('#room-code')).trim();
    await guest.fill('#room-input', code);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    for (const page of [host, guest]) {
      await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: DEPLOY_TIMEOUT_MS });
    }
    await host.selectOption('#lobby-mode', 'tdm');
    await host.waitForTimeout(300);
    await host.selectOption('#lobby-arena', arenaId);
    for (const page of [host, guest]) {
      await page.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: DEPLOY_TIMEOUT_MS });
    }
    await host.click('#lobby-ready');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: DEPLOY_TIMEOUT_MS });
    await host.click('#lobby-start');
    for (const [name, page] of [['host', host], ['guest', guest]]) {
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: DEPLOY_TIMEOUT_MS });
      await landing(page, arenaId, `${name}-deploy`, record);
    }
    for (const [name, page] of [['host', host], ['guest', guest]]) {
      await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.respawn(); });
      await landing(page, arenaId, `${name}-respawn`, record);
    }
    record.ok = record.landings.every((entry) => entry.match && entry.match.passesGate);
  } catch (error) {
    record.error = String(error).slice(0, 240);
  } finally {
    record.errors = [...new Set([...host.errorsSeen, ...guest.errorsSeen])].slice(0, 6);
    await host.close().catch(() => {});
    await guest.close().catch(() => {});
  }
  return record;
}

let exitCode = 0;
let browser = null;
try {
  await serveDist();
  if (HOST_GUEST.length > 0) await ensurePeerServer();
  const gpuFree = await waitForGpuHeadroom();
  console.error(`[spawn-deploys] serving ${DIST} on :${PORT}; GPU free ${gpuFree} MiB; label ${LABEL}`);
  browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [...SILENT_ARGS,
      '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
      '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  const gitSha = await execFileAsync('git', ['rev-parse', 'HEAD']).then((result) => result.stdout.trim()).catch(() => null);
  const results = [];
  for (const arenaId of ARENAS) {
    const record = await soloDeploy(browser, arenaId);
    results.push(record);
    if (HOST_GUEST.includes(arenaId)) results.push(await hostGuestDeploy(browser, arenaId));
  }
  for (const record of results) {
    const path = resolve(OUT_DIR, `${record.arenaId}${record.mode === 'solo' ? '' : `-${record.mode}`}.json`);
    writeFileSync(path, JSON.stringify({ label: LABEL, gitSha, dist: DIST, generatedAt: new Date().toISOString(), ...record }, null, 2));
  }
  const failed = results.filter((record) => !record.ok);
  console.error(`[spawn-deploys] ${results.length - failed.length}/${results.length} deploy records matched a committed, gate-passing spawn`
    + (failed.length > 0 ? `; failed: ${failed.map((record) => `${record.arenaId}/${record.mode}${record.error ? ` (${record.error})` : ''}`).join(', ')}` : ''));
  exitCode = failed.length > 0 ? 1 : 0;
} catch (error) {
  console.error(`[spawn-deploys] environment error: ${String(error).slice(0, 300)}`);
  exitCode = 2;
} finally {
  await browser?.close().catch(() => {});
  for (const child of children) killTree(child);
  killOwnedListeners();
}
process.exit(exitCode);
