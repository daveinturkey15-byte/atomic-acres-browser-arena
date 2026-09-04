/**
 * PASS 95 - HF-504 headless race: one host, two guests, one dropped gun.
 *
 * The unit suite (src/weapon-pickup-authority.test.ts) proves the host's
 * DECISIONS. This proves the wire: three real clients, the real menu, the real
 * PeerJS join, the real F-interaction path, and two guests pressing F on the
 * same host-owned ground weapon in the same frame. Exactly one may end up
 * holding it, the loser must keep what it had, and the winner must be able to
 * reload - which is the owner-reported symptom.
 *
 * Ports: 4204 (dist) and 4205 (PeerJS signalling) only. Headless installed
 * Chrome, stock flags, muted, off-screen.
 *
 *   node scripts/qa/verify-hf504-pickup-race.mjs --map nuketown2
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : fallback;
};
const PORT = Number(arg('--port', '4204'));
const PEER_PORT = Number(arg('--peer-port', '4205'));
const ARENA = arg('--map', 'nuketown2');
const DROP_WEAPON = arg('--drop-weapon', 'ak-47');
const DIST = resolve(REPO_ROOT, 'dist');
const OUT = resolve(REPO_ROOT, arg('--out', 'artifacts/qa/pass95/mp-weapon-pickup'));
const BOOT_TIMEOUT_MS = 180_000;
const JOIN_TIMEOUT_MS = 60_000;
const SYNC_TIMEOUT_MS = 180_000;
const DEPLOY_TIMEOUT_MS = 150_000;

const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms));
const log = (message, extra) => console.log(`[hf504] ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}`);

// --------------------------------------------------------------------------
// Servers
// --------------------------------------------------------------------------
function assertPortFree(port, what) {
  return new Promise((ok, fail) => {
    const probe = net.createServer();
    probe.once('error', (error) => fail(new Error(`${what} port ${port} unavailable (${error.code}); another lane may hold it`)));
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => probe.close(ok));
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

async function serveDist(port) {
  await assertPortFree(port, 'dist');
  if (!existsSync(join(DIST, 'index.html'))) throw new Error(`no build at ${DIST}; run npm run build first`);
  const server = http.createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    let file = join(DIST, path === '/' ? 'index.html' : path.replace(/^\/+/, ''));
    if (!file.startsWith(DIST)) { response.writeHead(403).end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((ready) => server.listen(port, '127.0.0.1', () => ready(server)));
}

function peerReady(port) {
  return new Promise((settle) => {
    const probe = http.request({ host: '127.0.0.1', port, path: '/peerjs/id', timeout: 500 },
      (response) => { response.resume(); settle(true); });
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await peerReady(port)) return child;
    await sleep(500);
  }
  child.kill();
  throw new Error('PeerJS signalling server did not become ready');
}

// --------------------------------------------------------------------------
// Clients
// --------------------------------------------------------------------------
const chromeArgs = () => [
  ...SILENT_ARGS,
  '--use-angle=d3d11', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  '--autoplay-policy=no-user-gesture-required',
  '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns',
];

function pageUrl(role) {
  const url = new URL(`http://127.0.0.1:${PORT}/`);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('render', 'performance');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  url.searchParams.set('peerQaPath', '/peerjs');
  url.searchParams.set('seed', `hf504-${role}`);
  return url.toString();
}

async function openPlayer(browser, role, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => { if (errors.length < 30) errors.push(String(error?.message ?? error).slice(0, 240)); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.goto(pageUrl(role), { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.map-card[data-arena-id]')].some((button) => !button.disabled),
    undefined, { timeout: BOOT_TIMEOUT_MS },
  );
  await page.fill('#player-name', name);
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  return { role, name, page, context, errors, backend };
}

const loadoutOf = (page) => page.evaluate(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const player = snapshot.player ?? {};
  return {
    id: player.id ?? null,
    primary: player.primaryWeapon ?? null,
    weapon: player.weapon ?? null,
    alive: player.alive ?? null,
    ammo: player.ammo ?? null,
    reserve: player.reserve ?? null,
    drops: (snapshot.deathDrops ?? []).map((drop) => ({ id: drop.id, weapon: drop.weapon, weaponAvailable: drop.weaponAvailable })),
    prompt: document.querySelector('#pickup-prompt')?.textContent?.trim() ?? '',
  };
});

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------
const record = {
  contract: 'hf504-pickup-race-v1',
  measuredAt: new Date().toISOString(),
  arenaId: ARENA, dropWeapon: DROP_WEAPON, port: PORT, peerPort: PEER_PORT,
  backends: {}, steps: [], assertions: {}, before: null, after: null, failure: null,
};
const step = (name, extra) => { record.steps.push(name); log(name, extra); };

let distServer = null; let peerChild = null; const browsers = [];
try {
  distServer = await serveDist(PORT);
  peerChild = await startPeerServer(PEER_PORT);
  step('servers-up', { port: PORT, peerPort: PEER_PORT });

  for (let index = 0; index < 3; index += 1) browsers.push(await chromium.launch({ headless: true, channel: 'chrome', args: chromeArgs() }));
  const [host, guestA, guestB] = await Promise.all([
    openPlayer(browsers[0], 'host', 'HOST'),
    openPlayer(browsers[1], 'guest-a', 'GUESTA'),
    openPlayer(browsers[2], 'guest-b', 'GUESTB'),
  ]);
  const sides = [host, guestA, guestB];
  for (const side of sides) record.backends[side.role] = side.backend;
  step('booted', record.backends);
  for (const side of sides) if (side.backend !== 'webgpu') throw new Error(`${side.role} fell back to ${side.backend}`);

  await host.page.click('#host');
  await host.page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: JOIN_TIMEOUT_MS });
  const roomCode = (await host.page.textContent('#room-code')).trim();
  step('room-open', { codeLength: roomCode.length });

  for (const guest of [guestA, guestB]) {
    await guest.page.fill('#room-input', roomCode);
    await guest.page.waitForFunction(() => document.querySelector('#join')?.disabled === false, undefined, { timeout: JOIN_TIMEOUT_MS });
    await guest.page.click('#join');
  }
  await Promise.all(sides.map(({ page }) => page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members?.filter((member) => member.connected).length === 3,
    undefined, { timeout: JOIN_TIMEOUT_MS },
  )));
  step('three-joined');

  await host.page.selectOption('#lobby-arena', ARENA);
  await Promise.all(sides.map(({ page }) => page.waitForFunction(
    (arenaId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return snapshot?.arenaSelection?.id === arenaId && document.querySelector('#lobby-ready')?.disabled === false;
    },
    ARENA, { timeout: SYNC_TIMEOUT_MS },
  )));
  step('arena-synced');

  for (const guest of [guestA, guestB]) await guest.page.click('#lobby-ready');
  await host.page.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: JOIN_TIMEOUT_MS });
  await host.page.click('#lobby-start');
  await Promise.all(sides.map(({ page }) => page.waitForFunction(
    () => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return snapshot?.gameStarted === true && snapshot.matchPhase === 'active' && snapshot.remotes === 2
        && document.querySelector('#menu')?.classList.contains('hidden') === true;
    },
    undefined, { timeout: DEPLOY_TIMEOUT_MS },
  )));
  step('deployed');

  // The host carries the contested gun so its own death drop is that weapon,
  // and both guests keep their default primary so a successful pickup is a
  // visible swap rather than a replenish.
  await host.page.evaluate((weapon) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon(weapon), DROP_WEAPON);
  await sleep(1_000);
  const hostPose = await host.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  const dropId = await host.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.spawnDeathDrop(0));
  if (!dropId) throw new Error('host did not spawn a ground weapon');
  step('drop-spawned', { dropId, hostPose });

  // Both guests walk to the gun. The pickup itself goes through the real
  // interaction path; only the approach is staged.
  for (const guest of [guestA, guestB]) {
    await guest.page.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y + 0.0, z), hostPose);
  }
  await sleep(1_500);

  const before = {
    host: await loadoutOf(host.page),
    guestA: await loadoutOf(guestA.page),
    guestB: await loadoutOf(guestB.page),
  };
  record.before = before;
  record.assertions.bothGuestsSeeTheDrop =
    before.guestA.drops.some((drop) => drop.id === dropId && drop.weapon === DROP_WEAPON)
    && before.guestB.drops.some((drop) => drop.id === dropId && drop.weapon === DROP_WEAPON);
  record.assertions.promptOfferedToBoth =
    /pick up/i.test(before.guestA.prompt) && /pick up/i.test(before.guestB.prompt);
  step('staged', {
    seen: record.assertions.bothGuestsSeeTheDrop,
    prompts: [before.guestA.prompt, before.guestB.prompt],
  });

  // THE RACE.
  await Promise.all([guestA, guestB].map(({ page }) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop())));
  await sleep(2_500);

  const after = {
    host: await loadoutOf(host.page),
    guestA: await loadoutOf(guestA.page),
    guestB: await loadoutOf(guestB.page),
  };
  record.after = after;
  const winners = [['guestA', after.guestA], ['guestB', after.guestB]]
    .filter(([, state]) => state.primary === DROP_WEAPON).map(([label]) => label);
  record.assertions.exactlyOneWinner = winners.length === 1;
  record.assertions.winner = winners[0] ?? null;
  const loserLabel = winners[0] === 'guestA' ? 'guestB' : 'guestA';
  record.assertions.loserKeptItsWeapon = after[loserLabel]?.primary === before[loserLabel]?.primary;
  // The host is the authority on how many of the contested gun exist.
  const groundCopies = after.host.drops.filter((drop) => drop.weapon === DROP_WEAPON && drop.weaponAvailable).length;
  const carriedCopies = [after.guestA, after.guestB, after.host].filter((state) => state.primary === DROP_WEAPON).length;
  record.assertions.hostGroundCopies = groundCopies;
  record.assertions.hostCarriedCopies = carriedCopies;
  record.assertions.noWeaponMinted = groundCopies + carriedCopies <= 1 + (after.host.primary === DROP_WEAPON ? 1 : 0);

  // HF-504's headline symptom: the winner must be able to reload.
  if (winners.length === 1) {
    const winner = winners[0] === 'guestA' ? guestA : guestB;
    const beforeReload = await loadoutOf(winner.page);
    await winner.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAmmo(
      window.__ATOMIC_ACRES_DEBUG__.snapshot().player.primaryWeapon, 1,
      window.__ATOMIC_ACRES_DEBUG__.snapshot().player.reserve[window.__ATOMIC_ACRES_DEBUG__.snapshot().player.primaryWeapon],
    ));
    await winner.page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.reload());
    await sleep(3_500);
    const afterReload = await loadoutOf(winner.page);
    record.assertions.reserveTransferred = (beforeReload.reserve?.[DROP_WEAPON] ?? 0) > 0;
    record.assertions.reloadAfterPickup = (afterReload.ammo?.[DROP_WEAPON] ?? 0) > 1;
    record.assertions.reloadReadout = {
      reserveAtPickup: beforeReload.reserve?.[DROP_WEAPON] ?? null,
      magAfterReload: afterReload.ammo?.[DROP_WEAPON] ?? null,
      reserveAfterReload: afterReload.reserve?.[DROP_WEAPON] ?? null,
    };
  }
  record.assertions.noPageErrors = sides.every((side) => side.errors.length === 0);
  record.pageErrors = Object.fromEntries(sides.map((side) => [side.role, side.errors]));
  step('raced', record.assertions);
} catch (error) {
  record.failure = String(error?.message ?? error).slice(0, 800);
  log('FAILED', { failure: record.failure });
} finally {
  for (const browser of browsers) await browser.close().catch(() => {});
  peerChild?.kill();
  distServer?.close();
}

const required = ['bothGuestsSeeTheDrop', 'promptOfferedToBoth', 'exactlyOneWinner', 'loserKeptItsWeapon',
  'noWeaponMinted', 'reserveTransferred', 'reloadAfterPickup', 'noPageErrors'];
record.ok = !record.failure && required.every((key) => record.assertions[key] === true);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'race.json'), `${JSON.stringify(record, null, 2)}\n`);
log(record.ok ? 'PASS' : 'FAIL', { out: join(OUT, 'race.json') });
process.exit(record.ok ? 0 : 1);
