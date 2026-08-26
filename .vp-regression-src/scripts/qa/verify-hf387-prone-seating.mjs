#!/usr/bin/env node
// HF-387 close-out: the seated prone rig, measured in the LIVE game.
//
// Owner fault: "clipping still happens if I go prone or near walls I still
// clip through them". Archaeology: HF-345's clearance solver was wired into
// the remotes presentation loop, but (a) it measured along its own yaw
// convention while the game moves along (-sin(yaw), -cos(yaw)) and (b) its
// probes stop at the pose envelope, so the slide lever never had fuel and
// slideM was always 0 - the seated body could only prop up, never move away
// from a wall.
//
// This harness drives a real host+guest match on atomic-acres over real key
// input: the guest walks into a wall until contact, goes prone, and keeps
// pushing. The HOST page then reads the guest operator's published clearance
// and the applied stance-pivot slide from the live scene graph:
//
//   PASS requires, on the host side:
//     - remote present with visible meshes;
//     - clearance published (proneClearance !== null) and clipped === true;
//     - head-side blocked: forwardM < PRONE envelope forwardM;
//     - the body actually SEATED: stancePivot z-slide > SLIDE_MIN_M.
//
// A pre-fix build fails the last two rows (slideM was always 0); that is the
// reproduction this fix answers. Renderer note: the discriminator is numeric
// scene-graph state, so this sweep runs on the compatibility renderer; the
// visual WebGPU camera check for this lane lives in a headed capture.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910/');
const PEER_PORT = Number(arg('--peer-port', '9338'));
const ARENA = arg('--arena', 'atomic-acres');
const CONNECT_TIMEOUT = 120_000;
const CONTACT_EPSILON_M = 0.004;
const SLIDE_MIN_M = 0.05;

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

const record = { ok: false };
let host = null;
let guest = null;
const peerProcess = await ensurePeerServer();
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-angle=d3d11',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});

try {
  async function openPage(label) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.errorsSeen = [];
    page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 160)}`));
    const url = new URL(BASE);
    url.searchParams.set('release', 'latest');
    url.searchParams.set('render', 'compat');
    url.searchParams.set('multiplayerQa', '1');
    url.searchParams.set('peerQaPort', String(PEER_PORT));
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
    await page.fill('#player-name', label);
    return page;
  }

  host = await openPage('Host QA');
  guest = await openPage('Guest QA');
  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
  const roomCode = (await host.textContent('#room-code')).trim();

  await guest.fill('#room-input', roomCode);
  await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  for (const page of [host, guest]) {
    await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
  }
  await host.selectOption('#lobby-arena', ARENA);
  await guest.waitForFunction((arenaId) =>
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.arenaId === arenaId
    || document.querySelector('#lobby-arena')?.value === arenaId, ARENA, { timeout: CONNECT_TIMEOUT });
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
  await host.click('#lobby-start');
  for (const page of [host, guest]) {
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true, undefined, { timeout: CONNECT_TIMEOUT });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
  }

  // Guest walks forward with REAL input until displacement stalls against a
  // wall (two consecutive samples within epsilon). Bounded, so an open field
  // still terminates and the harness reports contact=false instead of hanging.
  await guest.click('body');
  let contact = false;
  let previous = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  await guest.keyboard.down('KeyW');
  try {
    for (let tick = 0; tick < 120 && !contact; tick += 1) {
      await guest.waitForTimeout(250);
      const current = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
      const moved = Math.hypot(current[0] - previous[0], current[2] - previous[2]);
      if (moved < CONTACT_EPSILON_M) contact = true;
      previous = current;
    }
  } finally {
    await guest.keyboard.up('KeyW');
  }
  record.guestContact = contact;
  record.guestAtWall = previous.map((value) => Number(value.toFixed(2)));

  // Go prone and keep pushing into the wall so the seating solve has to act.
  await guest.keyboard.press('KeyZ');
  await guest.waitForTimeout(400);
  record.guestStance = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.stance);
  if (record.guestStance !== 'prone') {
    await guest.keyboard.press('ControlLeft');
    await guest.waitForTimeout(400);
    record.guestStance = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.stance);
  }
  await guest.click('body');
  await guest.keyboard.down('KeyW');
  await guest.waitForTimeout(1500);
  await guest.keyboard.up('KeyW');

  // Let the presentation lerp converge (alpha = 1-exp(-dt*12)).
  await host.waitForTimeout(1200);

  // Host reads the guest operator's clearance and the applied pivot slide.
  record.hostView = await host.evaluate(({ envFwd, envBack }) => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    let found = null;
    scene?.traverse((object) => {
      if (found || object.name !== 'remote-player-world') return;
      const operator = object.userData?.operator;
      if (!operator) return;
      const runtimePivot = operator.getObjectByName('operator-stance-pivot');
      found = {
        rootPosition: object.position.toArray().map((value) => Number(value.toFixed(2))),
        clearance: operator.userData?.proneClearance ?? null,
        pivotZ: runtimePivot ? Number(runtimePivot.position.z.toFixed(3)) : null,
        visibleMeshes: (() => {
          let count = 0;
          object.traverse((child) => {
            if (!child.isMesh || !child.visible) return;
            for (let parent = child.parent; parent; parent = parent.parent) {
              if (!parent.visible) return;
            }
            count += 1;
          });
          return count;
        })(),
      };
    });
    return { found, envelope: { forwardM: envFwd, backwardM: envBack } };
  }, { envFwd: 0.85, envBack: 0.88 });

  const view = record.hostView.found;
  const clearance = view?.clearance ?? null;
  record.clearance = clearance;
  record.pivotSlideM = view?.pivotZ ?? null;
  record.ok = Boolean(
    contact
    && record.guestStance === 'prone'
    && view
    && view.visibleMeshes > 0
    && clearance
    && clearance.clipped === true
    && clearance.forwardM < record.hostView.envelope.forwardM
    && (view.pivotZ ?? 0) > SLIDE_MIN_M,
  );
  record.hostErrors = host.errorsSeen.slice(0, 4);
  record.guestErrors = guest.errorsSeen.slice(0, 4);
} catch (error) {
  record.error = String(error).slice(0, 300);
  record.hostErrors = host?.errorsSeen.slice(0, 4) ?? [];
  record.guestErrors = guest?.errorsSeen.slice(0, 4) ?? [];
} finally {
  await host?.close().catch(() => {});
  await guest?.close().catch(() => {});
  await browser.close();
  peerProcess?.kill();
}

console.log(JSON.stringify(record, null, 2));
process.exit(record.ok ? 0 : 1);
