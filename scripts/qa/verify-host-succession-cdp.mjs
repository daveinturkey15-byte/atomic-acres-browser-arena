#!/usr/bin/env node
// HF-325 / mp-core: end-to-end host-succession proof on INSTALLED Chrome.
//
// Green unit tests are not evidence a player sees the handover. This drives:
//   1. Host + TWO guests into a private lobby (MIN_SURVIVORS_FOR_MIGRATION is 2,
//      so a host+one-guest room can NEVER promote by design - the floor needs
//      two surviving guests).
//   2. Match start and active play long enough for the host's ~2 s checkpoint
//      cadence to ship the authority mirror to the elected successor.
//   3. The host page is CLOSED (real transport drop, not a simulated one).
//   4. The successor must transition unstable -> reconnecting -> host-lost,
//      then promote itself via the room-id claim and resume the SAME match.
//   5. The remaining follower must receive 'host-promoted' (its
//      highestObservedTerm must advance past the original term) WITHOUT ever
//      promoting itself.
//
// Evidence comes from window.__ATOMIC_ACRES_DEBUG__.sampleHostSuccession(),
// a read-only sampler over exactly the state authorizeSelfPromotion consumes.
//
// Usage:
//   node scripts/qa/verify-host-succession-cdp.mjs [--url http://127.0.0.1:42187] \
//        [--peer-port 9397] [--shot-dir artifacts/host-succession] \
//        [--expect-bundle legacy-main-XXXX.js]
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:42187');
const PEER_PORT = Number(arg('--peer-port', '9397'));
const SHOT_DIR = arg('--shot-dir', 'artifacts/host-succession');
const EXPECT_BUNDLE = arg('--expect-bundle', '');
const CONNECT_TIMEOUT = 180_000;
const MIRROR_WAIT_MS = 40_000;
const PROMOTION_POLL_MS = 2_000;
const PROMOTION_TIMEOUT_MS = 150_000; // 90 s reconnect window + margin

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
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    // Without these an occluded window is throttled and reads like a wedge.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

async function openPage(label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.errorsSeen = [];
  page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 200)}`));
  const session = await page.context().newCDPSession(page);
  // Guaranteed foreground ownership instead of hoping the WM grants it.
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', 'quality');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => Boolean(window.__ATOMIC_ACRES_DEBUG__?.sampleHostSuccession),
    undefined,
    { timeout: CONNECT_TIMEOUT },
  );
  await page.fill('#player-name', label);
  return page;
}

const successionOf = (page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleHostSuccession());
const phaseOf = (page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase);

mkdirSync(resolve(SHOT_DIR), { recursive: true });
const record = {
  ok: false,
  backend: null,
  servedBundle: null,
  roomCode: null,
  hostSample: null,
  guestSamples: null,
  mandateSeenOnGuests: [],
  mirrorHolder: null,
  mirrorAtDrop: null,
  linkStateTrace: [],
  promotion: null,
  follower: null,
  screenshots: [],
  errors: {},
};

let host = null;
let guestA = null;
let guestB = null;
try {
  host = await openPage('Host QA');
  record.backend = await host.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  guestA = await openPage('Guest Alpha');
  guestB = await openPage('Guest Bravo');

  // A wrong server behind this port measures the WRONG TREE. Pin the served
  // bundle identity: another worktree's preview on the same port once answered
  // HTTP 200 and silently invalidated a whole run.
  record.servedBundle = await host.evaluate(() => {
    const entry = performance.getEntriesByType('resource')
      .map((resource) => resource.name)
      .find((name) => name.includes('/legacy-main-'));
    return entry ? entry.slice(entry.lastIndexOf('/') + 1) : null;
  });
  if (EXPECT_BUNDLE && record.servedBundle !== EXPECT_BUNDLE) {
    throw new Error(`served bundle ${record.servedBundle} is not the pinned build ${EXPECT_BUNDLE}; refusing to measure`);
  }
  console.error(`[succession] served bundle ${record.servedBundle} backend ${record.backend}`);

  // --- Lobby: create, join x2, ready x3, start -----------------------------
  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(
    () => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0,
    undefined,
    { timeout: CONNECT_TIMEOUT },
  );
  const roomCode = (await host.textContent('#room-code')).trim();
  record.roomCode = roomCode;

  for (const [label, page] of [['alpha', guestA], ['bravo', guestB]]) {
    await page.fill('#room-input', roomCode);
    await page.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    console.error(`[succession] ${label} join sent`);
  }
  for (const [label, page] of [['host', host], ['alpha', guestA], ['bravo', guestB]]) {
    await page.waitForFunction(
      () => document.querySelectorAll('#lobby-roster .lobby-player').length === 3,
      undefined,
      { timeout: CONNECT_TIMEOUT },
    );
    console.error(`[succession] ${label} sees full roster`);
  }
  console.error('[succession] roster complete; readying all');

  for (const page of [host, guestA, guestB]) await page.click('#lobby-ready');
  for (let attempt = 0; attempt < 15 && await host.evaluate(() => document.querySelector('#lobby-start')?.disabled !== false); attempt += 1) {
    // A single click can land while the roster/ready state is still settling;
    // keep asserting readiness instead of failing the lane on one lost click.
    for (const page of [host, guestA, guestB]) {
      await page.evaluate(() => document.querySelector('#lobby-ready')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))).catch(() => {});
    }
    await new Promise((wait) => setTimeout(wait, 2_000));
  }
  await host.waitForFunction(
    () => document.querySelector('#lobby-start')?.disabled === false,
    undefined,
    { timeout: CONNECT_TIMEOUT },
  );

  // Sample BEFORE start too: the mandate should already exist in the lobby.
  record.preStartSamples = {
    host: await successionOf(host),
    alpha: await successionOf(guestA),
    bravo: await successionOf(guestB),
  };

  await host.click('#lobby-start');

  for (const [label, page] of [['host', host], ['alpha', guestA], ['bravo', guestB]]) {
    await page.waitForFunction(
      () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true
        && window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active',
      undefined,
      { timeout: CONNECT_TIMEOUT },
    );
    console.error(`[succession] ${label} in active match`);
  }

  // --- Wait for mandate broadcast + unicast mirror to reach the guests -----
  const mirrorDeadline = Date.now() + MIRROR_WAIT_MS;
  while (Date.now() < mirrorDeadline) {
    const sa = await successionOf(guestA);
    const sb = await successionOf(guestB);
    const sh = await successionOf(host);
    record.hostSample = sh;
    record.guestSamples = { alpha: sa, bravo: sb };
    if (sa.mandate && sb.mandate && (sa.mirror || sb.mirror)) {
      record.mandateSeenOnGuests = [
        { guest: 'alpha', mandateTerm: sa.mandate?.term ?? null, successorId: sa.mandate?.successorId ?? null, isSelf: sa.mandate?.successorId === sa.selfId },
        { guest: 'bravo', mandateTerm: sb.mandate?.term ?? null, successorId: sb.mandate?.successorId ?? null, isSelf: sb.mandate?.successorId === sb.selfId },
      ];
      const holderIsAlpha = Boolean(sa.mirror);
      const holderSample = holderIsAlpha ? sa : sb;
      record.mirrorHolder = holderIsAlpha ? 'alpha' : 'bravo';
      record.mirrorAtDrop = {
        holderSelfId: holderSample.selfId,
        mandateTerm: holderSample.mandate.term,
        mandatedSuccessorId: holderSample.mandate.successorId,
        mandateExpired: holderSample.mandate.expired,
        mirrorTerm: holderSample.mirror.mirrorTerm,
        mirrorFresh: holderSample.mirror.fresh,
        mirrorOffsetTrusted: holderSample.mirror.offsetTrusted,
        mirrorAgeMs: holderSample.mirror.ageMs,
        mirrorSuccessionTerm: holderSample.mirror.successionTerm,
        publisherTerm: holderSample.publisher?.term ?? null,
      };
      break;
    }
    await new Promise((wait) => setTimeout(wait, 1_000));
  }
  if (!record.mirrorAtDrop) throw new Error(`no guest held a fresh authority mirror within ${MIRROR_WAIT_MS} ms of match start`);
  console.error(`[succession] mirror held by ${record.mirrorHolder}: ${JSON.stringify(record.mirrorAtDrop)}`);

  // Give the checkpoint cadence one more refresh so the mirror is young.
  await new Promise((wait) => setTimeout(wait, 6_000));

  // --- Kill the host for real ----------------------------------------------
  const followerPage = record.mirrorHolder === 'alpha' ? guestB : guestA;
  const successorPage = record.mirrorHolder === 'alpha' ? guestA : guestB;
  await host.close();
  host = null;
  record.hostClosedAtEpochMs = Date.now();
  console.error('[succession] HOST PAGE CLOSED; polling successor');

  // --- Poll the successor until it promotes --------------------------------
  const pollDeadline = Date.now() + PROMOTION_TIMEOUT_MS;
  let promoted = false;
  while (Date.now() < pollDeadline) {
    const sample = await successionOf(successorPage);
    record.linkStateTrace.push({
      tMs: Date.now() - record.hostClosedAtEpochMs,
      state: sample.hostLinkState,
      role: sample.role,
      mandateExpired: sample.mandate ? sample.mandate.expired : null,
      mirrorFresh: sample.mirror ? sample.mirror.fresh : null,
    });
    if (!promoted && sample.role === 'host') {
      promoted = true;
      record.promotion = {
        promotedAfterMs: Date.now() - record.hostClosedAtEpochMs,
        term: sample.highestObservedTerm,
        mandateTerm: sample.mandate?.term ?? null,
        mirrorTerm: sample.mirror?.mirrorTerm ?? null,
        role: sample.role,
      };
      console.error(`[succession] PROMOTED after ${record.promotion.promotedAfterMs} ms`);
      break;
    }
    await new Promise((wait) => setTimeout(wait, PROMOTION_POLL_MS));
  }
  if (!promoted) {
    record.linkStateTail = await successionOf(successorPage);
    throw new Error(`successor never promoted within ${PROMOTION_TIMEOUT_MS} ms of host drop`);
  }

  // --- Post-promotion: match continues, follower accepts the new host ------
  await new Promise((wait) => setTimeout(wait, 8_000));
  record.promotion.matchPhaseAfterSettle = await phaseOf(successorPage);
  const followerDeadline = Date.now() + 60_000;
  while (Date.now() < followerDeadline) {
    const f = await successionOf(followerPage);
    record.follower = {
      role: f.role,
      highestObservedTerm: f.highestObservedTerm,
      hostLinkState: f.hostLinkState,
      lobbyHostId: f.lobbyHostId,
      matchPhase: await phaseOf(followerPage).catch(() => null),
    };
    if (f.highestObservedTerm >= 2) break;
    await new Promise((wait) => setTimeout(wait, PROMOTION_POLL_MS));
  }

  const shot = async (page, name) => {
    const path = resolve(SHOT_DIR, `${name}.png`);
    await page.screenshot({ path }).catch(() => {});
    record.screenshots.push(path);
  };
  await shot(successorPage, `${record.mirrorHolder}-promoted-host`);
  await shot(followerPage, 'follower-after-promotion');

  record.ok =
    record.mirrorAtDrop.mirrorFresh === true
    && record.mirrorAtDrop.mandateExpired === false
    && Number.isInteger(record.mirrorAtDrop.mirrorTerm)
    && record.mirrorAtDrop.mirrorTerm === record.mirrorAtDrop.mandateTerm + 1
    && record.mirrorAtDrop.mandatedSuccessorId === record.mirrorAtDrop.holderSelfId
    && record.promotion.role === 'host'
    && record.promotion.matchPhaseAfterSettle === 'active'
    && Boolean(record.follower)
    && record.follower.role === 'client'
    && record.follower.highestObservedTerm >= 2;
} catch (error) {
  record.error = String(error).slice(0, 400);
  record.pageErrors = {
    host: host?.errorsSeen.slice(0, 4) ?? [],
    alpha: guestA?.errorsSeen.slice(0, 4) ?? [],
    bravo: guestB?.errorsSeen.slice(0, 4) ?? [],
  };
} finally {
  await host?.close().catch(() => {});
  await guestA?.close().catch(() => {});
  await guestB?.close().catch(() => {});
  await browser.close();
  peerProcess?.kill();
}

writeFileSync(resolve(SHOT_DIR, 'verdict.json'), JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
process.exit(record.ok ? 0 : 1);
