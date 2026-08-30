#!/usr/bin/env node
// Diagnostic for the verify-hf-matrix-definitive run of 2026-08-25: from
// rustworks-1v1 onwards, every lane timed out because #lobby-ready stayed
// disabled. legacy-main.ts gates that button on lobbyArenaSynchronized
// (arenaSelectionReady && selectedArena.id === snapshot.config.arenaId), so
// the suspicion is a stalled/failing host-side arena transition after
// selecting the map in the private lobby.
//
// This probe answers ONE question per invocation:
//   is the deadlock arena-intrinsic, or does it only appear after several
//   earlier lanes have run in the same browser (cumulative GPU/memory)?
//
//   node scripts/qa/diagnose-lobby-ready-deadlock.mjs --arena rustworks-1v1 --mode tdm
//     -> fresh browser, single lane, full transition telemetry sampled 1/s.
//   node scripts/qa/diagnose-lobby-ready-deadlock.mjs --arena farcrysis --mode ffa --warmup 3
//     -> three throwaway atomic-acres lanes first, then the target lane,
//        mirroring the matrix's lane order.
//
// Exit 0 = lobby reached READY-enabled (synchronized); 2 = still deadlocked;
// 3 = environment error. Full telemetry JSON on stdout.
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41912/');
const PEER_PORT = Number(arg('--peer-port', '9341'));
const TARGET_ARENA = arg('--arena', 'rustworks-1v1');
const TARGET_MODE = arg('--mode', 'tdm');
const WARMUP_LANES = Number(arg('--warmup', '0'));
const SYNC_WAIT_MS = Number(arg('--sync-wait-ms', '45000'));
const CONNECT_TIMEOUT = 120_000;

function peerServerReady() {
  return new Promise((resolveReady) => {
    const probe = httpRequest({ host: '127.0.0.1', port: PEER_PORT, path: '/peerjs/id', timeout: 500 }, (r) => { r.resume(); resolveReady(true); });
    probe.on('error', () => resolveReady(false));
    probe.on('timeout', () => { probe.destroy(); resolveReady(false); });
    probe.end();
  });
}
async function ensurePeerServer() {
  if (await peerServerReady()) return null;
  const child = spawn(process.execPath, [
    resolve('node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1', '--port', String(PEER_PORT), '--path', '/peerjs', '--no-allow_discovery',
  ], { stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 100; i += 1) {
    if (await peerServerReady()) return child;
    await new Promise((w) => setTimeout(w, 100));
  }
  child.kill();
  throw new Error('peer server never ready');
}

async function openPage(browser, label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errorsSeen = [];
  page.on('pageerror', (e) => page.errorsSeen.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') page.errorsSeen.push(`console: ${m.text().slice(0, 160)}`); });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', 'quality');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
  await page.fill('#player-name', label);
  return page;
}

async function sampleHostState(page) {
  return page.evaluate(() => ({
    t: Math.round(performance.now()),
    backend: document.documentElement.dataset.renderBackend ?? null,
    gameplayArena: document.documentElement.dataset.gameplayArena ?? null,
    readyDisabled: document.querySelector('#lobby-ready')?.disabled ?? null,
    startDisabled: document.querySelector('#lobby-start')?.disabled ?? null,
    guidance: (document.getElementById('lobby-guidance')?.textContent ?? '').slice(0, 120),
    status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 120),
    roster: document.querySelectorAll('#lobby-roster .lobby-player').length,
    snapshot: (() => { try { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return { gameStarted: s.gameStarted, matchPhase: s.matchPhase, privateMatch: s.privateMatch ?? null }; } catch { return null; } })(),
  }));
}

// One lobby lane: host creates room, guest joins, host selects mode+arena,
// then we sample the HOST every second until #lobby-ready enables or the
// wait budget expires. Returns the samples plus the outcome.
async function runLane(browser, peerProcess, arena, mode, labelPrefix) {
  const host = await openPage(browser, `${labelPrefix} Host`);
  const guest = await openPage(browser, `${labelPrefix} Guest`);
  const result = { arena, mode, samples: [], outcome: '', errors: [] };
  try {
    await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
    const roomCode = (await host.textContent('#room-code')).trim();
    await guest.fill('#room-input', roomCode);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    for (const page of [host, guest]) {
      await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
    }
    if (mode === 'tdm' || mode === 'ffa') {
      await host.selectOption('#lobby-mode', mode);
      await host.waitForTimeout(300);
    }
    await host.selectOption('#lobby-arena', arena);
    await host.waitForTimeout(700);
    // Mirror the matrix: also confirm the guest sees the arena selection.
    await guest.waitForFunction(
      (id) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.arenaId === id
        || document.querySelector('#lobby-arena')?.value === id,
      arena, { timeout: CONNECT_TIMEOUT },
    ).catch((e) => { result.outcome = `guest-arena-sync-wait-failed: ${String(e).slice(0, 80)}`; });

    const deadline = Date.now() + SYNC_WAIT_MS;
    while (Date.now() < deadline) {
      result.samples.push(await sampleHostState(host));
      const last = result.samples[result.samples.length - 1];
      if (last.readyDisabled === false) { result.outcome ||= 'READY-ENABLED'; break; }
      if (!result.outcome && last.snapshot?.matchPhase !== 'waiting' && last.snapshot?.gameStarted) { result.outcome = 'MATCH-STARTED'; break; }
      await host.waitForTimeout(1000);
    }
    if (!result.outcome) result.outcome = 'STILL-DISABLED-AFTER-WAIT';
    result.guestGuidance = (await guest.evaluate(() => (document.getElementById('lobby-guidance')?.textContent ?? '').slice(0, 120)));
    result.guestReadyDisabled = await guest.evaluate(() => document.querySelector('#lobby-ready')?.disabled ?? null);
  } catch (error) {
    result.outcome ||= `lane-error: ${String(error).slice(0, 140)}`;
  }
  result.errors = [...new Set([...host.errorsSeen, ...guest.errorsSeen])].slice(0, 10);
  await host.close().catch(() => {});
  await guest.close().catch(() => {});
  return result;
}

const peerProcess = await ensurePeerServer();
let browser;
const report = { target: { arena: TARGET_ARENA, mode: TARGET_MODE }, warmupLanes: WARMUP_LANES, lanes: [] };
try {
  browser = await chromium.launch({
    headless: false, channel: 'chrome',
    args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
      '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  for (let w = 0; w < WARMUP_LANES; w += 1) {
    const warm = await runLane(browser, peerProcess, 'atomic-acres', w % 2 === 0 ? 'tdm' : 'ffa', `Warm${w}`);
    report.lanes.push({ kind: 'warmup', index: w, outcome: warm.outcome, errors: warm.errors.slice(0, 3) });
    console.error(`[diag] warmup ${w}: ${warm.outcome}`);
  }
  const target = await runLane(browser, peerProcess, TARGET_ARENA, TARGET_MODE, 'Target');
  report.lanes.push({ kind: 'target', ...target });
  console.error(`[diag] target ${TARGET_ARENA}/${TARGET_MODE}: ${target.outcome}`);
} catch (error) {
  report.environmentError = String(error).slice(0, 300);
  process.exitCode = 3;
} finally {
  await browser?.close().catch(() => {});
  peerProcess?.kill();
}
console.log(JSON.stringify(report, null, 2));
if (!report.environmentError) {
  const target = report.lanes.find((l) => l.kind === 'target');
  process.exit(target?.outcome === 'READY-ENABLED' ? 0 : 2);
}
