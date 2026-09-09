#!/usr/bin/env node
// HF-498: one bounded, real-menu host+guest reproduction for reload retries and
// host-authoritative respawn loadout reset. The event delay is deliberately
// short and fixed so the reload request is retransmitted before its commit; the
// host cache-hit is the idempotency evidence, not a synthetic in-page mock.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchBrowser,
  openPlayer,
  serveDist,
  startPeerServer,
} from './run-host-guest.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const OUT = resolve(ROOT, 'artifacts/qa/mp-bugs/hf498-host-guest');
const STATIC_PORT = 4191;
const PEER_PORT = 4192;
const ARENA = 'nuketown2';
let currentPhase = 'initializing';

const snapshot = (page) => page.evaluate(() => {
  const value = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
  if (!value) return null;
  return {
    gameStarted: value.gameStarted,
    matchPhase: value.matchPhase,
    arenaId: value.arenaSelection?.id ?? null,
    privateMatch: value.privateMatch ?? null,
    bootstrap: value.bootstrap ?? null,
    alive: value.player?.alive ?? null,
    hp: value.player?.hp ?? null,
    weapon: value.player?.weapon ?? null,
    primaryWeapon: value.player?.primaryWeapon ?? null,
    secondaryWeapon: value.player?.secondaryWeapon ?? null,
    ammo: value.player?.ammo ?? null,
    combatInventory: value.player?.combatInventory ?? null,
    continuity: value.player?.continuity ?? null,
    remotes: value.remotes ?? null,
    remotePlayers: value.remotePlayers ?? [],
    reloadAuthority: value.reloadAuthority ?? null,
    fireAdmission: value.fireAdmission ?? null,
    networkLifecycle: value.networkLifecycle ?? null,
  };
});

const wait = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function setEventDelay(page, delayMs) {
  await page.evaluate((value) => {
    const url = new URL(window.location.href);
    if (value > 0) url.searchParams.set('eventDelayQaMs', String(value));
    else url.searchParams.delete('eventDelayQaMs');
    window.history.replaceState(null, '', url);
  }, delayMs);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const staticServer = await serveDist(STATIC_PORT);
  const peer = await startPeerServer(PEER_PORT);
  let hostBrowser = null;
  let guestBrowser = null;
  let host = null;
  let guest = null;
  const trace = [];
  const errors = { host: [], guest: [] };
  const record = async (label) => {
    const [hostState, guestState] = await Promise.all([snapshot(host.page), snapshot(guest.page)]);
    trace.push({ atMs: Date.now(), label, host: hostState, guest: guestState });
    return { host: hostState, guest: guestState };
  };
  try {
    hostBrowser = await launchBrowser('hf498-host');
    guestBrowser = await launchBrowser('hf498-guest');
    currentPhase = 'open-player';
    [host, guest] = await Promise.all([
      openPlayer(hostBrowser, 'host', ARENA, 'HF498 HOST'),
      openPlayer(guestBrowser, 'guest', ARENA, 'HF498 GUEST'),
    ]);
    host.page.on('pageerror', (error) => errors.host.push(String(error?.message ?? error).slice(0, 300)));
    guest.page.on('pageerror', (error) => errors.guest.push(String(error?.message ?? error).slice(0, 300)));
    currentPhase = 'host-room';
    await host.page.click('#host');
    await host.page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: 45_000 });
    const roomCode = (await host.page.textContent('#room-code')).trim();
    currentPhase = 'guest-join';
    await guest.page.fill('#room-input', roomCode);
    await guest.page.waitForFunction(() => document.querySelector('#join')?.disabled === false, undefined, { timeout: 45_000 });
    await guest.page.click('#join');
    currentPhase = 'lobby-members';
    await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
      () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members?.filter((member) => member.connected).length === 2,
      undefined,
      { timeout: 45_000 },
    )));
    currentPhase = 'lobby-arena';
    await host.page.selectOption('#lobby-arena', ARENA);
    await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
      (arenaId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().arenaSelection?.id === arenaId
        && document.querySelector('#lobby-ready')?.disabled === false,
      ARENA,
      { timeout: 160_000 },
    )));
    currentPhase = 'lobby-ready-start';
    await guest.page.click('#lobby-ready');
    await host.page.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 45_000 });
    currentPhase = 'deploy';
    // The real UI can render START one frame before the host's pending
    // admission diagnostics settle. Retry the same host-authorized button a
    // bounded number of times; no guest message or authority check is bypassed.
    let startAccepted = false;
    for (let attempt = 0; attempt < 3 && !startAccepted; attempt += 1) {
      await host.page.click('#lobby-start');
      try {
        await host.page.waitForFunction(
          () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.phase === 'countdown'
            || window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true,
          undefined,
          { timeout: 5_000 },
        );
        startAccepted = true;
      } catch (error) {
        if (attempt === 2) throw error;
        await wait(1_000);
      }
    }
    const progressTimer = setInterval(() => {
      void Promise.all([snapshot(host.page), snapshot(guest.page)]).then(([hostState, guestState]) => {
        writeFileSync(join(OUT, 'progress.json'), JSON.stringify({
          measuredAt: new Date().toISOString(), phase: currentPhase, host: hostState, guest: guestState,
        }, null, 2));
      }).catch(() => {});
    }, 2_000);
    await Promise.all([host, guest].map(({ page }) => page.waitForFunction(
      (arenaId) => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return state?.gameStarted === true && state.matchPhase === 'active'
          && state.arenaSelection?.id === arenaId && state.remotes === 1;
      },
      ARENA,
      { timeout: 120_000 },
    )));
    clearInterval(progressTimer);
    await record('deployed');
    // Keep the real lobby/deploy handshake on the normal local path. Turn on
    // the bounded event delay only after both clients are active so the fault
    // injection targets the reload request rather than admission traffic.
    await Promise.all([setEventDelay(host.page, 250), setEventDelay(guest.page, 250)]);
    await wait(100);

    currentPhase = 'reload-inject';
    await guest.page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.equipWeapon('carbine');
      api.setAmmo('carbine', 0, 60);
    });
    const staged = await host.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.setRemoteAmmoAuthoritatively('carbine', 0, 60));
    if (staged !== true) throw new Error('host could not stage canonical depleted guest magazine');
    await guest.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.reload());
    currentPhase = 'reload-pending';
    await guest.page.waitForFunction(() => {
      const authority = window.__ATOMIC_ACRES_DEBUG__?.snapshot().reloadAuthority;
      return authority?.localPending?.requestId != null;
    }, undefined, { timeout: 10_000 });
    currentPhase = 'reload-committed';
    await guest.page.waitForFunction(() => {
      const authority = window.__ATOMIC_ACRES_DEBUG__?.snapshot().reloadAuthority;
      return authority?.localPending === null
        && authority.protocolTrace.some((entry) => entry.direction === 'receive' && entry.status === 'committed');
    }, undefined, { timeout: 15_000 });
    currentPhase = 'reload-cache-hit';
    await host.page.waitForFunction(() => {
      const authority = window.__ATOMIC_ACRES_DEBUG__?.snapshot().reloadAuthority;
      return authority?.cachedResults > 0
        && authority.protocolTrace.some((entry) => entry.direction === 'cache-hit');
    }, undefined, { timeout: 15_000 });
    await record('reload-committed-after-retry-cache-hit');

    // Put the guest into the exact stale-special state reported by the owner,
    // then let the host own the lethal transition. The local respawn reset and
    // the host's snapshot canonicalization must agree on the authored class.
    currentPhase = 'respawn-inject';
    await guest.page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.equipWeapon('railgun');
      api.setAmmo('railgun', 0, 0);
    });
    currentPhase = 'host-kill';
    await host.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.damageRemoteAuthoritatively(100));
    currentPhase = 'guest-dead';
    await guest.page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player?.alive === false, undefined, { timeout: 15_000 });
    await record('guest-dead-host-authoritative');
    currentPhase = 'respawn-apply';
    await guest.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.respawn());
    currentPhase = 'respawn-verify';
    await Promise.all([
      guest.page.waitForFunction(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return state?.player?.alive === true && state.player.weapon === state.player.primaryWeapon;
      }, undefined, { timeout: 15_000 }),
      host.page.waitForFunction(() => {
        const remote = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers?.[0];
        return remote?.hp > 0 && remote.weapon === remote.primary && remote.primary === 'carbine' && remote.secondary === 'pistol';
      }, undefined, { timeout: 15_000 }),
    ]);
    await record('respawn-canonical-loadout');
    const [finalHost, finalGuest] = await Promise.all([snapshot(host.page), snapshot(guest.page)]);
    const reloadTrace = finalGuest.reloadAuthority?.protocolTrace ?? [];
    const hostReloadTrace = finalHost.reloadAuthority?.protocolTrace ?? [];
    const result = {
      contract: 'hf498-multiplayer-bugs-host-guest-v1',
      measuredAt: new Date().toISOString(),
      arena: ARENA,
      renderer: { host: host.backend, guest: guest.backend },
      flags: { headless: true, nativeWebGpuEnv: process.env.PASS73_NATIVE_WEBGPU === '1', muteAudio: true, eventDelayQaMs: 250 },
      ports: { static: STATIC_PORT, peer: PEER_PORT },
      assertions: {
        reloadRetrySent: reloadTrace.filter((entry) => entry.direction === 'send' && entry.action === 'start').length >= 2,
        hostCacheHit: hostReloadTrace.some((entry) => entry.direction === 'cache-hit'),
        reloadCommitted: reloadTrace.some((entry) => entry.direction === 'receive' && entry.status === 'committed'),
        guestRespawnedWithPrimary: finalGuest.weapon === finalGuest.primaryWeapon,
        hostCanonicalRespawnLoadout: finalHost.remotePlayers?.[0]?.weapon === finalHost.remotePlayers?.[0]?.primary
          && finalHost.remotePlayers?.[0]?.primary === 'carbine'
          && finalHost.remotePlayers?.[0]?.secondary === 'pistol',
      },
      trace,
      final: { host: finalHost, guest: finalGuest },
      errors,
    };
    // Keep the output mechanical and complete; no credentials or raw transport
    // payloads are written, only the bounded reload trace and client state.
    writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      ...result.assertions,
      renderer: result.renderer,
      resultPath: join(OUT, 'result.json'),
    }));
    if (!Object.values(result.assertions).every(Boolean)) process.exitCode = 1;
  } catch (error) {
    const safeSnapshot = async (page) => {
      try { return page ? await snapshot(page) : null; } catch { return null; }
    };
    writeFileSync(join(OUT, 'failure.json'), JSON.stringify({
      contract: 'hf498-multiplayer-bugs-host-guest-failure-v1',
      measuredAt: new Date().toISOString(),
      phase: currentPhase,
      error: String(error?.message ?? error).slice(0, 500),
      trace,
      host: await safeSnapshot(host?.page),
      guest: await safeSnapshot(guest?.page),
      errors,
    }, null, 2));
    throw error;
  } finally {
    await guest?.context.close().catch(() => {});
    await host?.context.close().catch(() => {});
    await guestBrowser?.close().catch(() => {});
    await hostBrowser?.close().catch(() => {});
    await new Promise((closed) => { staticServer.closeAllConnections?.(); staticServer.close(() => closed()); });
    if (peer.exitCode === null) peer.kill();
  }
}

main().catch((error) => {
  console.error('[hf498-mp-bugs] fatal', `phase=${currentPhase}`, String(error?.message ?? error).slice(0, 500));
  process.exitCode = 2;
});
