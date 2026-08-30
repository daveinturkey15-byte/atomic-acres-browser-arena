#!/usr/bin/env node
// Pass 79 multiplayer-hardening ATTRIBUTION v2: host owns an AI chopper,
// guest observes as the opposing team. Differences from v1:
//   - Drives the guest into open ground with REAL key input (hold W bursts)
//     until the chopper's autocannon visibly damages them = firing proof.
//   - Captures THREE observer CPU profiles: BASELINE (no support),
//     CHOPPER_LIVE (right after orbit), CHOPPER_LATER (~25 s in) and diffs
//     them, separating one-shot pipeline compile from persistent per-frame
//     cost.
// Diagnostic only - no gate. JSON on stdout, progress on stderr.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41933/');
const PEER_PORT = Number(arg('--peer-port', '9351'));
const CONNECT_TIMEOUT = 120_000;
const PROFILE_MS = Number(arg('--profile-ms', '10_000'));

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
  args: ['--mute-audio', 
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
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
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  page.cdp = session;
  page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 160)}`));
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('render', 'quality');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: CONNECT_TIMEOUT });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
  page.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  await page.fill('#player-name', label);
  return page;
}

async function captureProfile(page, ms) {
  await page.cdp.send('Profiler.enable');
  await page.cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await page.cdp.send('Profiler.start');
  await page.waitForTimeout(ms);
  const { profile } = await page.cdp.send('Profiler.stop');
  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const selfHits = new Map();
  for (const id of profile.samples) {
    const node = nodesById.get(id);
    if (!node) continue;
    const fn = node.callFrame;
    const label = `${fn.functionName || '(anonymous)'} @ ${(fn.url || '').split('/').pop()}:${fn.lineNumber + 1}`;
    selfHits.set(label, (selfHits.get(label) ?? 0) + 1);
  }
  const total = profile.samples.length;
  return {
    totalSamples: total,
    topSelfTime: [...selfHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
      .map(([label, hits]) => ({ label, hits, pct: Number(((hits / total) * 100).toFixed(1)) })),
  };
}

async function readState(page) {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const details = snapshot.killstreakPresentation?.entityDetails ?? [];
    return {
      hp: snapshot.player.hp,
      alive: snapshot.player.alive,
      pos: snapshot.player.position.map((v) => Number(v.toFixed(1))),
      chopper: details.find((entry) => String(entry.entityId || '').includes('chopper'))
        ? { visible: true, phase: null, pos: details.find((entry) => String(entry.entityId || '').includes('chopper')).worldPosition.map((v) => Number(v.toFixed(1))) }
        : null,
    };
  });
}

const host = await openPage('Host QA');
const guest = await openPage('Guest QA');
try {
  console.error(`[attribution2] backends ${host.backend}/${guest.backend}`);
  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.fill('#room-input', roomCode);
  await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  for (const page of [host, guest]) {
    await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: CONNECT_TIMEOUT });
  }
  await host.selectOption('#lobby-mode', 'tdm');
  await host.waitForTimeout(300);
  await host.selectOption('#lobby-arena', 'atomic-acres');
  await host.waitForTimeout(700);
  await host.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
  await guest.waitForFunction(() => document.querySelector('#lobby-ready')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
  await host.click('#lobby-start');
  for (const page of [host, guest]) {
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: CONNECT_TIMEOUT });
  }
  await guest.waitForTimeout(5_000);

  const baseline = await captureProfile(guest, PROFILE_MS);
  console.error('[attribution2] baseline captured');

  // Move the guest into open ground with real key input so the orbiting AI
  // gunner gets a clear LOS. Bursts of W, sampling HP between bursts.
  let fired = false;
  let hpTrace = [];
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
  const receipt = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('chopper'));
  console.error(`[attribution2] activation ${JSON.stringify(receipt)}`);
  for (let burst = 0; burst < 4 && !fired; burst += 1) {
    await guest.click('body');
    await guest.keyboard.down('KeyW');
    await guest.waitForTimeout(1_400);
    await guest.keyboard.up('KeyW');
    await guest.waitForTimeout(600);
    const state = await readState(guest);
    hpTrace.push(state.hp);
    if (state.alive && state.hp < 100) fired = true;
    console.error(`[attribution2] burst ${burst} hp=${state.hp} pos=[${state.pos}] chopper=${JSON.stringify(state.chopper)}`);
  }

  const chopperLive = await captureProfile(guest, PROFILE_MS);
  console.error('[attribution2] chopper-live captured');
  await guest.waitForTimeout(15_000);
  const stateLater = await readState(guest);
  if (stateLater.alive && stateLater.hp < 100) fired = true;
  hpTrace.push(stateLater.hp);
  const chopperLater = await captureProfile(guest, PROFILE_MS);
  console.error('[attribution2] chopper-later captured');

  const pctOf = (profile, needle) => profile.topSelfTime
    .filter((entry) => entry.label.includes(needle))
    .reduce((sum, entry) => sum + entry.pct, 0);
  const diff = {
    tslBuildPct: {
      baseline: Number(baseline.topSelfTime.filter((e) => /build|generate|analyze|getNodeType/.test(e.label)).reduce((s, e) => s + e.pct, 0).toFixed(1)),
      chopperLive: Number(chopperLive.topSelfTime.filter((e) => /build|generate|analyze|getNodeType/.test(e.label)).reduce((s, e) => s + e.pct, 0).toFixed(1)),
      chopperLater: Number(chopperLater.topSelfTime.filter((e) => /build|generate|analyze|getNodeType/.test(e.label)).reduce((s, e) => s + e.pct, 0).toFixed(1)),
    },
  };

  console.log(JSON.stringify({
    verdict: fired ? 'FIRED' : 'NO-FIRE-EVIDENCE',
    backend: [host.backend, guest.backend],
    hpTrace,
    baseline,
    chopperLive,
    chopperLater,
    diff,
    errors: [...host.errorsSeen.slice(0, 3), ...guest.errorsSeen.slice(0, 3)],
  }, null, 2));
} finally {
  await host.close().catch(() => {});
  await guest.close().catch(() => {});
  await browser.close().catch(() => {});
  peerProcess?.kill();
}
