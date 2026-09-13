#!/usr/bin/env node
// MP-LAB: the lobby must never wedge silently while an arena synchronises.
//
// Observed (2026-09-02, artifacts/qa/mp-lab/2p-4bots-after/test1.json): both
// pages logged "WebSocket connection to 'ws://127.0.0.1:9345/peerjs/...'
// failed" during arena synchronisation and then sat on
// "Synchronizing Firing Range before ready-up..." with #lobby-ready disabled
// for the whole 160 s timeout. The HF-347 watchdog
// (LOBBY_ARENA_SYNC_DEADLINE_MS 75 s, one retry, then a LEAVE instruction)
// never spoke. UNPROVEN hypothesis for why, recorded so the next reader does
// not have to re-derive it: its guard is
// `if (!privateLobbySnapshot || gameStarted) return`, and losing the peer
// link is one of the things that clears privateLobbySnapshot - which would
// mean the watchdog for a wedged lobby is switched off by a thing that wedges
// it. Not verified, and NOT fixed on that guess.
//
// Killing the signalling server mid-sync was the first suspect and it is NOT
// the trigger: measured 2026-09-02, the WebRTC data channels outlive the
// PeerJS socket and the lobby synchronised normally (host READY enabled at
// 46.6 s, guest at 57.2 s) with the watchdog rightly silent. So this file is
// not a repro of that hang - it is the contract the hang violated, and it
// passes today:
//
//   losing the signalling server while an arena is synchronising must leave
//   the lobby in a state the player can act on - either the sync completes
//   and #lobby-ready enables, or the HF-347 watchdog names a recovery within
//   its own 2 x 75 s budget. Sitting on "Synchronizing ... before ready-up"
//   with READY disabled and nothing said is the failure.
//
//   node scripts/qa/mp-lab/probe-lobby-sync-watchdog.mjs [--map test1] [--window-seconds 170]
//
// Exit 0 = actionable lobby (synced, or told); 1 = silently wedged; 2 = harness fault.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist, startPeerServer, launchBrowser, openPlayer } from './run-host-guest.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const index = argv.indexOf(name); return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback; };
const MAP = arg('--map', 'test1');
const WINDOW_SECONDS = Number(arg('--window-seconds', '170'));
const PORT = Number(arg('--port', '41946'));
const PEER_PORT = Number(arg('--peer-port', '9345'));
const LABEL = arg('--label', 'lobby-watchdog');
const OUT = resolve(REPO_ROOT, 'artifacts/qa/mp-lab', LABEL);
const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms));

const lobbyView = (page) => page.evaluate(() => ({
  guidance: (document.querySelector('#lobby-guidance')?.textContent ?? '').trim(),
  readyDisabled: document.querySelector('#lobby-ready')?.disabled ?? null,
  feed: [...document.querySelectorAll('#feed *')].map((node) => (node.textContent ?? '').trim()).filter(Boolean).slice(-6),
}));

const server = await serveDist(PORT);
let peer = await startPeerServer(PEER_PORT);
let hostBrowser = null;
let guestBrowser = null;
let exitCode = 2;
try {
  hostBrowser = await launchBrowser('host');
  guestBrowser = await launchBrowser('guest');
  const [host, guest] = await Promise.all([openPlayer(hostBrowser, 'host', MAP, 'HOST'), openPlayer(guestBrowser, 'guest', MAP, 'GUEST')]);
  await host.page.click('#host');
  await host.page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: 45_000 });
  const roomCode = (await host.page.textContent('#room-code')).trim();
  await guest.page.fill('#room-input', roomCode);
  await guest.page.waitForFunction(() => document.querySelector('#join')?.disabled === false, undefined, { timeout: 45_000 });
  await guest.page.click('#join');
  await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members?.filter((member) => member.connected).length === 2,
    undefined,
    { timeout: 45_000 },
  )));
  console.log(`[lobby-watchdog ${MAP}] two members connected`);

  // Select a different arena so a real synchronisation is in flight, then pull
  // the signalling server out from under it.
  await host.page.selectOption('#lobby-arena', MAP);
  await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
    () => (document.querySelector('#lobby-guidance')?.textContent ?? '').includes('Synchronizing'),
    undefined,
    { timeout: 60_000 },
  )));
  const startedAt = Date.now();
  if (peer.exitCode === null) peer.kill();
  console.log(`[lobby-watchdog ${MAP}] signalling server killed while synchronising`);

  const timeline = { host: [], guest: [] };
  const seen = { host: '', guest: '' };
  let toldAtMs = null;
  const syncedAtMs = { host: null, guest: null };
  while (Date.now() - startedAt < WINDOW_SECONDS * 1000) {
    for (const side of [host, guest]) {
      const view = await lobbyView(side.page).catch(() => null);
      if (!view) continue;
      const key = `${view.guidance}|${view.readyDisabled}`;
      if (key === seen[side.role]) continue;
      seen[side.role] = key;
      const atMs = Date.now() - startedAt;
      timeline[side.role].push({ atMs, ...view });
      console.log(`[lobby-watchdog ${MAP}] ${side.role} @${atMs}ms ready=${view.readyDisabled} "${view.guidance}"`);
      // The watchdog's own words: a retry feed line, or the LEAVE instruction.
      const told = /LEAVE/i.test(view.guidance) || view.feed.some((line) => /ARENA SYNC (STALLED|FAILED)/i.test(line));
      if (told && toldAtMs === null) toldAtMs = atMs;
      // Recovered: the arena finished synchronising and READY came back.
      if (view.readyDisabled === false && !/Synchronizing/i.test(view.guidance)) {
        if (syncedAtMs[side.role] === null) syncedAtMs[side.role] = atMs;
      }
    }
    if (toldAtMs !== null) break;
    if (syncedAtMs.host !== null && syncedAtMs.guest !== null) break;
    await sleep(2000);
  }

  const result = {
    contract: 'mp-lab-lobby-sync-watchdog-v1',
    measuredAt: new Date().toISOString(),
    arenaId: MAP,
    windowSeconds: WINDOW_SECONDS,
    // HF-347's own budget: one 75 s deadline, one retry, one more 75 s.
    watchdogBudgetMs: 75_000 * 2,
    toldAtMs,
    syncedAtMs,
    timeline,
    // Either outcome is actionable for the player; neither is the wedge.
    recovered: syncedAtMs.host !== null && syncedAtMs.guest !== null,
    told: toldAtMs !== null && toldAtMs <= 75_000 * 2 + 15_000,
    pass: (syncedAtMs.host !== null && syncedAtMs.guest !== null)
      || (toldAtMs !== null && toldAtMs <= 75_000 * 2 + 15_000),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${MAP}.json`), JSON.stringify(result, null, 2));
  console.log(`[lobby-watchdog ${MAP}] ${result.pass ? 'PASS' : 'FAIL'} recovered=${result.recovered} toldAtMs=${toldAtMs} - ${join(OUT, `${MAP}.json`)}`);
  exitCode = result.pass ? 0 : 1;
  await guest.context.close().catch(() => {});
  await host.context.close().catch(() => {});
} catch (error) {
  console.error('[lobby-watchdog] fault', error);
  exitCode = 2;
} finally {
  await guestBrowser?.close().catch(() => {});
  await hostBrowser?.close().catch(() => {});
  await new Promise((closed) => { server.closeAllConnections?.(); server.close(() => closed()); });
  if (peer.exitCode === null) peer.kill();
}
process.exitCode = exitCode;
