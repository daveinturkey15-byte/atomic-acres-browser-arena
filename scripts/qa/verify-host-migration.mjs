#!/usr/bin/env node
// HF-325 close-out: the live host-migration matrix that has never been run.
//
// The succession path has been armed since ea932116/e0f707cb - mandate
// broadcast after every lobby-state, adoptable mirror unicast to the elected
// successor on the checkpoint tick, promoteToHost claiming the room-code peer
// id as the mutual-exclusion lock, and a superseded host standing down. All of
// it is covered by unit tests and NONE of it has ever been driven through a
// real browser. The ledger says so in as many words: "Still owed for DONE: the
// live two-browser matrix - host dc mid-match, successor promotes, follower
// lands on the promoted host, old host returns and stands down."
//
// This is that matrix, at three peers because MIN_SURVIVORS_FOR_MIGRATION is 2:
// with a single survivor the feature deliberately refuses to promote, so a
// two-peer test could only ever prove the refusal.
//
//   1. Host + two guests on a local PeerJS server, one match, all three active
//      and seeing each other.
//   2. A real kill between the guests, so the match ledger under test carries
//      non-zero scores and a live streak. A ledger of all zeroes would make
//      step 6 assert nothing.
//   3. Wait past a checkpoint tick, so the elected successor is actually
//      holding a mirror that includes those scores.
//   4. CLOSE THE HOST PAGE. Not a network fault injection, not network.close() -
//      the browser window goes away, which is what "host dc" means.
//   5. Wait out the loss window: 15 s of silence before the warning, then the
//      90 s RECONNECT_WINDOW_MS before the guest will call the host dead.
//   6. Assert: exactly one guest promoted, the room code is UNCHANGED, both
//      survivors are in an active match, both still MOVE under real key input,
//      both still see each other, and the ledger and streaks came across.
//   7. Reopen the old host in ITS OWN browser profile - which still holds the
//      host checkpoint in localStorage - and assert it stands down instead of
//      claiming the room a second time.
//
// Every page runs in its own persistent Chromium profile under a temp directory
// carrying this run's token. That is what makes step 7 possible (localStorage
// survives closing the page) and what makes cleanup safe: windows are killed by
// matching the profile token on the command line, never by the spawn pid.
//
// Usage:
//   node scripts/qa/verify-host-migration.mjs [--url http://127.0.0.1:41876/]
//     [--peer-port 9338] [--arena atomic-acres] [--mode ffa]
//     [--loss-timeout 210000] [--move-ms 1800] [--threshold 1.2]
//     [--skip-returning-host] [--out artifacts/qa/host-migration.json]
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876/');
const PEER_PORT = Number(arg('--peer-port', '9338'));
const ARENA = arg('--arena', 'atomic-acres');
const MODE = arg('--mode', 'ffa');
const MOVE_HOLD_MS = Number(arg('--move-ms', '1800'));
const MOVE_THRESHOLD_M = Number(arg('--threshold', '1.2'));
// 15 s host-silence warning + the 90 s RECONNECT_WINDOW_MS retry window, plus
// room for the promotion, the mirror adoption and the follower's rejoin.
const LOSS_TIMEOUT_MS = Number(arg('--loss-timeout', '210000'));
const REJOIN_TIMEOUT_MS = Number(arg('--rejoin-timeout', '150000'));
const STANDDOWN_TIMEOUT_MS = Number(arg('--standdown-timeout', '90000'));
const SKIP_RETURNING_HOST = argv.includes('--skip-returning-host');
const CONNECT_TIMEOUT = Number(arg('--connect-timeout', '180000'));
// Lobby convergence either happens in seconds or is broken; a long budget here
// only delays the diagnosis.
const LOBBY_TIMEOUT = Number(arg('--lobby-timeout', '60000'));
// Three peers streaming the same arena at once is the slowest honest step in
// the setup, so it gets its own budget rather than borrowing the lobby's.
const MATCH_START_TIMEOUT = Number(arg('--match-start-timeout', '240000'));
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/qa/host-migration.json'));

const RUN_TOKEN = `hostmig-${process.pid}-${Date.now().toString(36)}`;

// ---------------------------------------------------------------------------
// Local PeerJS signalling, lifted from verify-hf347-arena-movement-matrix.mjs.
// ---------------------------------------------------------------------------
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

/**
 * Kill only what this run opened. The spawn pid is the wrong handle on Windows -
 * for several browsers it is a launcher stub that exits and orphans the real
 * windows (documented in run-hf331-installed-browser-fps.mjs). The unique
 * profile token appears on every command line in the tree this run started and
 * on nothing else, so matching it can never touch a human's own session.
 */
function killRunWindows() {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${RUN_TOKEN}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' },
    );
  } catch { /* windows already gone */ }
}

const CHROMIUM_ARGS = [
  '--mute-audio',
  '--use-angle=d3d11',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--allow-loopback-in-peer-connection',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
  // Ignored by Chromium, but it lands on the command line of every process in
  // the tree - which is what the cleanup sweep matches on. Playwright owns the
  // temp profile path and does not expose it, so this is the token that plays
  // the role the profile path plays for the installed-browser runners.
  `--atomic-acres-qa-run=${RUN_TOKEN}`,
];

const contexts = [];
let browser = null;

/**
 * One BrowserContext per role inside ONE browser.
 *
 * Contexts, not separate browsers: three headless Chromium instances each
 * driving the full renderer starved this machine badly enough that lobby state
 * stopped converging inside four minutes, and the run failed on the harness
 * rather than on the product. Contexts still give each role its own
 * localStorage, and - decisively - a context OUTLIVES its page, so closing the
 * host page leaves the host checkpoint intact for the returning-host phase.
 */
async function openRole(role) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  // Another agent editing src/ mid-run makes the dev server broadcast a
  // full-reload, which would wipe the lobby out from under this test and read
  // as a migration failure. Neutralise only the reload; HMR is otherwise left
  // alone, and reloadsSeen below still reports any that get through.
  await context.route('**/@vite/client', async (route) => {
    try {
      const response = await route.fetch();
      const body = (await response.text()).replaceAll('location.reload()', 'console.warn("[qa] vite full-reload suppressed")');
      await route.fulfill({ response, body });
      report.viteFullReloadSuppressed = true;
    } catch {
      await route.continue();
    }
  });
  context.roleName = role;
  contexts.push(context);
  return context;
}

function probeUrl() {
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', 'compat');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  return url.toString();
}

async function openPage(context, label) {
  const page = await context.newPage();
  // A reload past the first destroys the lobby this test is built on, so it is
  // counted and reported rather than left to look like a product fault.
  page.loadsSeen = 0;
  page.on('load', () => { page.loadsSeen += 1; });
  // Playwright's 30 s default is far too short for a lane whose slowest step is
  // a 90 s loss window; a default timeout firing mid-migration would read as a
  // product failure.
  page.setDefaultTimeout(CONNECT_TIMEOUT);
  page.errorsSeen = [];
  page.on('pageerror', (error) => page.errorsSeen.push(`${label}: ${String(error).slice(0, 160)}`));
  await page.goto(probeUrl(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
  await page.fill('#player-name', label);
  return page;
}

/**
 * Real-input movement probe, identical in intent to the HF-347 matrix: hold W
 * and measure horizontal displacement. Teleports would prove nothing here -
 * the question after a migration is whether the input->physics path still runs
 * against an authority that just changed underneath it.
 */
async function measureMovement(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
    await page.click('body');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(MOVE_HOLD_MS);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
    const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
    if (moved >= MOVE_THRESHOLD_M || attempt === 1) return { movedM: Number(moved.toFixed(2)), before, after };
  }
  return { movedM: 0 };
}

/** Does `page` currently see `targetId` as a live, drawn remote player? */
function visibilityOf(page, targetId) {
  return page.evaluate((wantedId) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const remote = snapshot.remotePlayers?.find((entry) => entry.id === wantedId) ?? null;
    let visibleMeshes = 0;
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph?.();
    scene?.traverse((object) => {
      if (object.name !== 'remote-player-world') return;
      object.traverse((child) => {
        if (!child.isMesh || !child.visible) return;
        for (let parent = child.parent; parent; parent = parent.parent) {
          if (!parent.visible) return;
        }
        visibleMeshes += 1;
      });
    });
    return {
      remoteCount: snapshot.remotePlayers?.length ?? 0,
      found: Boolean(remote),
      hp: remote?.hp ?? null,
      visualPosition: remote?.visualPosition?.map((value) => Number(value.toFixed(1))) ?? null,
      visibleMeshes,
    };
  }, targetId);
}

const seesTarget = (visibility) => Boolean(visibility?.found) && visibility.hp > 0 && visibility.visibleMeshes > 0;

/** The authoritative ledger as this page currently understands it. */
function ledgerOf(page) {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      roomCode: (document.querySelector('#room-code')?.textContent ?? '').trim(),
      isHost: document.querySelector('#room-card')?.hidden === false,
      matchPhase: snapshot.matchPhase,
      gameStarted: snapshot.gameStarted,
      streak: snapshot.fieldSupport?.streak ?? null,
      scores: (snapshot.privateMatch?.scores ?? []).map((score) => ({
        id: score.id,
        kills: score.kills,
        deaths: score.deaths,
        damageDealt: score.damageDealt,
        damageTaken: score.damageTaken,
      })),
      members: (snapshot.privateMatch?.members ?? []).map((member) => ({ id: member.id, connected: member.connected })),
    };
  });
}

const totals = (ledger) => ledger.scores.reduce((sum, score) => sum
  + score.kills + score.deaths + score.damageDealt + score.damageTaken, 0);

/**
 * Everything needed to explain a stuck lobby without re-running it. The first
 * version of this script died on "#lobby-arena is not visible" and carried no
 * evidence of WHY, which cost a whole 5-minute run to learn nothing.
 */
function dumpLobbyState(page) {
  return page.evaluate(() => {
    const select = document.querySelector('#lobby-arena');
    const rect = select?.getBoundingClientRect() ?? null;
    const style = select ? getComputedStyle(select) : null;
    return {
      menuClass: document.querySelector('#menu')?.className ?? null,
      menuHidden: document.querySelector('#menu')?.hidden ?? null,
      privateLobbyHidden: document.querySelector('#private-lobby')?.hidden ?? null,
      roomCard: document.querySelector('#room-card')?.hidden ?? null,
      rosterCount: document.querySelectorAll('#lobby-roster .lobby-player').length,
      arenaSelect: select ? {
        disabled: select.disabled,
        value: select.value,
        size: rect ? [Math.round(rect.width), Math.round(rect.height)] : null,
        display: style?.display,
        visibility: style?.visibility,
        opacity: style?.opacity,
      } : null,
      status: (document.querySelector('#network-status')?.textContent ?? '').slice(0, 160),
      privateMatch: window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch ?? null,
    };
  });
}

/** What a page believes about the match it is trying to enter. */
function dumpMatchState(page) {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot() ?? null;
    return {
      gameStarted: snapshot?.gameStarted ?? null,
      matchPhase: snapshot?.matchPhase ?? null,
      bootstrap: snapshot?.bootstrap?.stage ?? null,
      bootstrapError: snapshot?.bootstrap?.error ?? null,
      lobbyPhase: snapshot?.privateMatch?.phase ?? null,
      members: (snapshot?.privateMatch?.members ?? []).map((member) => `${member.id.slice(0, 8)}:${member.connected ? 'on' : 'off'}:${member.ready ? 'ready' : 'idle'}`),
      admission: window.__ATOMIC_ACRES_DEBUG__?.admissionState?.() ?? null,
      status: (document.querySelector('#network-status')?.textContent ?? '').slice(0, 200),
      menuHidden: document.querySelector('#menu')?.classList.contains('hidden') ?? null,
    };
  });
}

/** Select a lobby control, attaching the lobby state to any failure. */
async function selectLobbyOption(page, selector, value) {
  try {
    await page.locator(selector).waitFor({ state: 'visible', timeout: LOBBY_TIMEOUT });
    await page.selectOption(selector, value, { timeout: LOBBY_TIMEOUT });
  } catch (error) {
    report.phases.lobbyStuck = { selector, value, state: await dumpLobbyState(page).catch(() => null) };
    throw error;
  }
}

/**
 * Put real, host-admitted damage on the match ledger before the host dies.
 *
 * A ledger of all zeroes would make the post-migration ledger assertion assert
 * nothing, so this is a precondition of the test rather than a nicety. A kill is
 * what fully exercises it (kills feed streaks); admitted damage alone still
 * proves the ledger crossed the migration, and the receipt says which was
 * achieved rather than quietly settling for the weaker one.
 *
 * The aim is computed from the shooter's own remote entry for the victim rather
 * than through __ATOMIC_ACRES_DEBUG__.aimAtRemote(), because that helper takes
 * the FIRST remote in the map and with three peers in the room "first" is not
 * the one under test. The +0.98 m offset is hitProxyZoneCentre('body','stand'),
 * the same centre the authoritative admission uses.
 *
 * Placement is retried along four fixed bearings, never a random one: a blocked
 * sightline must be retried the same way on every run or this stops being a
 * repeatable instrument.
 */
async function stageLedgerDamage(shooter, victimId) {
  const BEARINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const attempts = [];
  for (const bearing of BEARINGS) {
    // Move the SHOOTER to the victim rather than the victim to the shooter.
    // The victim is standing somewhere the host already accepted, so a spot
    // 2.5 m from it on flat ground is far likelier to have line of sight than
    // anywhere the shooter picks blind - and an earlier version that dragged
    // the victim to a fixed bearing from the shooter landed zero hits.
    const placed = await shooter.evaluate(([wantedId, yaw, range]) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const snapshot = debug.snapshot();
      const remote = snapshot.remotePlayers?.find((entry) => entry.id === wantedId);
      if (!remote) return null;
      const me = snapshot.player.position;
      const target = remote.position;
      const x = target[0] - Math.sin(yaw) * range;
      const z = target[2] - Math.cos(yaw) * range;
      // Keep the shooter's own eye height: it is a height the host already
      // accepted for this player, and the arena floor is level between them.
      debug.teleportPlayer(x, me[1], z, Math.atan2(-(target[0] - x), -(target[2] - z)), 0);
      return { from: me, to: [x, me[1], z], target };
    }, [victimId, bearing, 2.5]);
    if (!placed) { attempts.push({ bearing, error: 'victim-not-visible-to-shooter' }); continue; }
    // Let both poses replicate and spawn protection lapse before firing.
    await shooter.waitForTimeout(2_000);

    for (let shot = 0; shot < 30; shot += 1) {
      await shooter.evaluate((wantedId) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        const snapshot = debug.snapshot();
        const remote = snapshot.remotePlayers?.find((entry) => entry.id === wantedId);
        if (!remote) return;
        // Exactly the aim aimAtRemote() computes - the +0.98 m body centre from
        // hitProxyZoneCentre('body','stand') - but at a NAMED remote, because
        // aimAtRemote takes the first in the map and three peers make "first"
        // meaningless.
        const me = snapshot.player.position;
        const dx = remote.position[0] - me[0];
        const dy = (remote.position[1] + 0.98) - me[1];
        const dz = remote.position[2] - me[2];
        debug.teleportPlayer(me[0], me[1], me[2], Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
        debug.fireOnce();
      }, victimId);
      await shooter.waitForTimeout(160);
      if (shot % 6 !== 5) continue;
      const ledger = await ledgerOf(shooter);
      const kills = ledger.scores.reduce((sum, score) => sum + score.kills, 0);
      if (kills > 0) { attempts.push({ bearing, shots: shot + 1, kills }); return { landed: true, kill: true, attempts }; }
      if (totals(ledger) > 0) { attempts.push({ bearing, shots: shot + 1, damageOnly: true }); return { landed: true, kill: false, attempts }; }
    }
    // Nothing registered on this bearing: record what the shot protocol thinks
    // happened, so a dead aim is distinguishable from a blocked sightline.
    attempts.push({
      bearing,
      placed,
      shotProtocol: await shooter.evaluate(() => ({ ...(window.__ATOMIC_ACRES_DEBUG__.snapshot().networkSync?.shotProtocol ?? {}) })),
      ledger: await ledgerOf(shooter),
    });
  }
  return { landed: false, kill: false, attempts };
}

// ---------------------------------------------------------------------------

const report = {
  verdict: 'FAIL',
  lastStep: 'not-started',
  base: BASE,
  arena: ARENA,
  mode: MODE,
  runToken: RUN_TOKEN,
  startedAt: new Date().toISOString(),
  phases: {},
  failures: [],
};
const fail = (reason) => { report.failures.push(reason); };
// Every wait in this script can legitimately take a minute or more, so a bare
// "Timeout exceeded" names nothing. Each step announces itself and is recorded,
// so a stall is attributable from the receipt alone without a second run.
const step = (name) => { report.lastStep = name; console.error(`[hostmig] step: ${name}`); };

let peerProcess = null;
try {
  step('peer-server');
  peerProcess = await ensurePeerServer();

  step('launch-profiles');
  browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const hostContext = await openRole('host');
  const guestAContext = await openRole('guestA');
  const guestBContext = await openRole('guestB');

  step('boot-host-page');
  let host = await openPage(hostContext, 'Migration Host');
  step('boot-guestA-page');
  const guestA = await openPage(guestAContext, 'Migration Guest A');
  step('boot-guestB-page');
  const guestB = await openPage(guestBContext, 'Migration Guest B');

  // --- Phase 1: one room, three peers, one active match ---------------------
  step('open-room');
  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: CONNECT_TIMEOUT });
  const roomCode = (await host.textContent('#room-code')).trim();
  report.roomCode = roomCode;

  step('guests-join');
  for (const guest of [guestA, guestB]) {
    await guest.fill('#room-input', roomCode);
    await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await guest.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length >= 2, undefined, { timeout: CONNECT_TIMEOUT });
  }
  for (const page of [host, guestA, guestB]) {
    await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 3, undefined, { timeout: CONNECT_TIMEOUT });
  }

  step('lobby-config');
  await selectLobbyOption(host, '#lobby-mode', MODE);
  await host.waitForTimeout(300);
  await selectLobbyOption(host, '#lobby-arena', ARENA);
  await host.waitForTimeout(700);
  for (const guest of [guestA, guestB]) {
    try {
      // Same convergence condition the HF-347 matrix uses: the replicated
      // config OR the rendered control, because the two land in either order.
      await guest.waitForFunction(
        (arenaId) => window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.arenaId === arenaId
          || document.querySelector('#lobby-arena')?.value === arenaId,
        ARENA,
        { timeout: LOBBY_TIMEOUT },
      );
    } catch (error) {
      report.phases.lobbyStuck = {
        waiting: 'guest-arena-convergence',
        guest: await dumpLobbyState(guest).catch(() => null),
        host: await dumpLobbyState(host).catch(() => null),
        loadsSeen: { host: host.loadsSeen, guestA: guestA.loadsSeen, guestB: guestB.loadsSeen },
      };
      throw error;
    }
  }

  step('ready-up');
  for (const page of [host, guestA, guestB]) await page.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: CONNECT_TIMEOUT });
  await host.click('#lobby-start');
  step('await-match-start');
  for (const [name, page] of [['host', host], ['guestA', guestA], ['guestB', guestB]]) {
    try {
      await page.waitForFunction(
        () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true
          && window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active',
        undefined,
        { timeout: MATCH_START_TIMEOUT },
      );
      console.error(`[hostmig] ${name} reached an active match`);
    } catch (error) {
      // Name the peer and its own account of why it never deployed. A bare
      // timeout here sent two whole runs back to the start with no evidence.
      report.phases.matchStartStuck = {
        stuckPeer: name,
        host: await dumpMatchState(host).catch(() => null),
        guestA: await dumpMatchState(guestA).catch(() => null),
        guestB: await dumpMatchState(guestB).catch(() => null),
        loadsSeen: { host: host.loadsSeen, guestA: guestA.loadsSeen, guestB: guestB.loadsSeen },
        pageErrors: {
          host: host.errorsSeen.slice(0, 4), guestA: guestA.errorsSeen.slice(0, 4), guestB: guestB.errorsSeen.slice(0, 4),
        },
      };
      throw error;
    }
  }

  step('match-active');
  const idOf = (page) => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.id);
  const hostId = await idOf(host);
  const guestAId = await idOf(guestA);
  const guestBId = await idOf(guestB);
  report.playerIds = { hostId, guestAId, guestBId };

  // Everyone must actually be drawing everyone else before the host is removed,
  // otherwise a post-migration visibility failure could have predated it.
  await host.waitForTimeout(3_000);
  report.phases.beforeDrop = {
    hostSeesGuestA: await visibilityOf(host, guestAId),
    hostSeesGuestB: await visibilityOf(host, guestBId),
    guestASeesHost: await visibilityOf(guestA, hostId),
    guestASeesGuestB: await visibilityOf(guestA, guestBId),
    guestBSeesHost: await visibilityOf(guestB, hostId),
    guestBSeesGuestA: await visibilityOf(guestB, guestAId),
  };
  for (const [name, visibility] of Object.entries(report.phases.beforeDrop)) {
    if (!seesTarget(visibility)) fail(`pre-drop-visibility:${name}`);
  }

  // --- Phase 2: give the ledger something to lose ---------------------------
  step('stage-ledger-damage');
  report.phases.ledgerStaging = await stageLedgerDamage(guestA, guestBId);
  if (!report.phases.ledgerStaging.landed) fail('ledger-never-populated: no admitted damage between the guests');

  // The mirror ships on the checkpoint tick (2 s cadence), so the successor
  // cannot be holding these scores until at least one tick has passed.
  await host.waitForTimeout(8_000);
  const beforeA = await ledgerOf(guestA);
  const beforeB = await ledgerOf(guestB);
  report.phases.ledgerBefore = { guestA: beforeA, guestB: beforeB };
  if (totals(beforeA) <= 0) fail('ledger-before-drop-is-empty');

  // --- Phase 3: the host disconnects ---------------------------------------
  step('close-host-page');
  report.phases.hostClosedAt = new Date().toISOString();
  await host.close();
  host = null;

  // --- Phase 4: wait out the loss window ------------------------------------
  const survivors = [['guestA', guestA], ['guestB', guestB]];
  step('await-promotion');
  const promotionDeadline = Date.now() + LOSS_TIMEOUT_MS;
  let promoted = null;
  let promotedName = null;
  const waitTrace = [];
  while (Date.now() < promotionDeadline) {
    const states = [];
    for (const [name, page] of survivors) {
      const state = await page.evaluate(() => ({
        isHost: document.querySelector('#room-card')?.hidden === false,
        roomCode: (document.querySelector('#room-code')?.textContent ?? '').trim(),
        status: (document.querySelector('#network-status')?.textContent ?? '').slice(0, 110),
        matchPhase: window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase ?? null,
      }));
      states.push({ name, ...state });
    }
    waitTrace.push({ atMs: Date.now(), states });
    console.error(`[hostmig] ${states.map((state) => `${state.name}:${state.isHost ? 'HOST' : 'guest'}/${state.matchPhase}/"${state.status}"`).join('  ')}`);
    const claimants = states.filter((state) => state.isHost);
    if (claimants.length > 0) {
      // Give the loser a moment to be observably NOT hosting, so a split brain
      // shows up as two claimants rather than as a race this loop won.
      await new Promise((wait) => setTimeout(wait, 3_000));
      const settled = [];
      for (const [name, page] of survivors) {
        settled.push({ name, ...(await ledgerOf(page)) });
      }
      report.phases.promotion = settled;
      const hosts = settled.filter((entry) => entry.isHost);
      if (hosts.length !== 1) fail(`expected-exactly-one-promoted-host-got-${hosts.length}`);
      promotedName = hosts[0]?.name ?? null;
      promoted = survivors.find(([name]) => name === promotedName)?.[1] ?? null;
      break;
    }
    await new Promise((wait) => setTimeout(wait, 5_000));
  }
  report.phases.waitTrace = waitTrace.slice(-12);
  if (!promoted) fail('no-guest-promoted-within-loss-window');

  if (promoted) {
    const follower = survivors.find(([name]) => name !== promotedName)[1];
    const followerName = survivors.find(([name]) => name !== promotedName)[0];
    report.promotedRole = promotedName;

    // (b) the room code must be the SAME one - that is the whole point of
    // claiming the room-code peer id rather than opening a fresh room.
    const promotedLedger = await ledgerOf(promoted);
    report.phases.promotedLedger = promotedLedger;
    if (promotedLedger.roomCode !== roomCode) {
      fail(`room-code-changed: ${roomCode} -> ${promotedLedger.roomCode || '<empty>'}`);
    }

    // (c) the follower re-points through the ordinary reconnect loop - same
    // room-code id - so it should land back in an active match by itself.
    try {
      await follower.waitForFunction(
        () => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active'
          && window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true,
        undefined,
        { timeout: REJOIN_TIMEOUT_MS },
      );
    } catch {
      fail(`follower-${followerName}-never-returned-to-active-match`);
    }
    step('await-follower-rejoin');
    const promotedId = promotedName === 'guestA' ? guestAId : guestBId;
    const followerId = promotedName === 'guestA' ? guestBId : guestAId;
    try {
      await promoted.waitForFunction(
        (wantedId) => (window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers ?? []).some((entry) => entry.id === wantedId),
        followerId,
        { timeout: REJOIN_TIMEOUT_MS },
      );
    } catch {
      fail('promoted-host-never-saw-the-follower-again');
    }
    await promoted.waitForTimeout(3_000);

    step('post-migration-assertions');
    report.phases.afterMigration = {
      promoted: await ledgerOf(promoted),
      follower: await ledgerOf(follower),
      promotedSeesFollower: await visibilityOf(promoted, followerId),
      followerSeesPromoted: await visibilityOf(follower, promotedId),
      promotedMove: await measureMovement(promoted),
      followerMove: await measureMovement(follower),
    };
    const after = report.phases.afterMigration;
    if (after.promoted.matchPhase !== 'active' || after.promoted.gameStarted !== true) fail('promoted-host-not-in-active-match');
    if (after.follower.matchPhase !== 'active' || after.follower.gameStarted !== true) fail('follower-not-in-active-match');
    if (!seesTarget(after.promotedSeesFollower)) fail('promoted-host-cannot-see-the-follower');
    if (!seesTarget(after.followerSeesPromoted)) fail('follower-cannot-see-the-promoted-host');
    if (after.promotedMove.movedM < MOVE_THRESHOLD_M) fail(`promoted-host-cannot-move:${after.promotedMove.movedM}m`);
    if (after.followerMove.movedM < MOVE_THRESHOLD_M) fail(`follower-cannot-move:${after.followerMove.movedM}m`);

    // (d) the ledger. Nothing can be scored while the room has no host, so the
    // adopted numbers must be at least the pre-drop numbers, entry for entry.
    const beforeScores = new Map((promotedName === 'guestA' ? beforeA : beforeB).scores.map((score) => [score.id, score]));
    const afterScores = new Map(after.promoted.scores.map((score) => [score.id, score]));
    for (const id of [guestAId, guestBId]) {
      const was = beforeScores.get(id);
      const now = afterScores.get(id);
      if (!was) { fail(`pre-drop-ledger-missing-entry:${id}`); continue; }
      if (!now) { fail(`adopted-ledger-lost-entry:${id}`); continue; }
      for (const field of ['kills', 'deaths', 'damageDealt', 'damageTaken']) {
        if (now[field] < was[field]) fail(`ledger-regressed:${id}.${field} ${was[field]} -> ${now[field]}`);
      }
    }
    const streakBefore = { guestA: beforeA.streak, guestB: beforeB.streak };
    const streakAfter = { guestA: null, guestB: null };
    streakAfter[promotedName] = after.promoted.streak;
    streakAfter[followerName] = after.follower.streak;
    report.phases.streaks = { before: streakBefore, after: streakAfter };
    for (const role of ['guestA', 'guestB']) {
      if (Number(streakAfter[role] ?? -1) < Number(streakBefore[role] ?? 0)) {
        fail(`streak-regressed:${role} ${streakBefore[role]} -> ${streakAfter[role]}`);
      }
    }
    // Streaks only exist once a kill lands. When the staging phase only managed
    // damage, say so in the receipt instead of pretending the streak half of
    // requirement (d) was covered.
    report.phases.streaks.coverage = report.phases.ledgerStaging.kill ? 'kill-backed' : 'damage-only (streaks not exercised)';
    if (report.phases.ledgerStaging.kill && Number(streakBefore.guestA ?? 0) < 1) {
      fail('streak-never-registered-on-the-killer-before-the-drop');
    }

    // --- Phase 5: the old host comes back --------------------------------
    if (!SKIP_RETURNING_HOST) {
      step('returning-host');
      const returning = await hostContext.newPage();
      returning.errorsSeen = [];
      returning.on('pageerror', (error) => returning.errorsSeen.push(String(error).slice(0, 160)));
      await returning.goto(probeUrl(), { waitUntil: 'domcontentloaded' });
      await returning.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: CONNECT_TIMEOUT });
      await returning.fill('#player-name', 'Migration Host');
      // Its profile still holds the host checkpoint, so hosting from here takes
      // the recovery path and tries to reclaim the SAME room-code peer id.
      await returning.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      const standDownDeadline = Date.now() + STANDDOWN_TIMEOUT_MS;
      let returningState = null;
      while (Date.now() < standDownDeadline) {
        returningState = await ledgerOf(returning);
        if (returningState.isHost && returningState.roomCode === roomCode) break;
        await new Promise((wait) => setTimeout(wait, 3_000));
      }
      const promotedStillOwns = await ledgerOf(promoted);
      report.phases.returningHost = {
        returning: returningState,
        promotedStillOwns,
        status: await returning.evaluate(() => (document.querySelector('#network-status')?.textContent ?? '').slice(0, 160)),
      };
      // The stand-down contract: the old host must NOT end up owning the room
      // code a second time, and the promoted host must still own it.
      if (returningState?.isHost && returningState.roomCode === roomCode) {
        fail('old-host-reclaimed-the-live-room-code (split brain)');
      }
      if (!promotedStillOwns.isHost || promotedStillOwns.roomCode !== roomCode) {
        fail('promoted-host-lost-the-room-when-the-old-host-returned');
      }
      if (promotedStillOwns.matchPhase !== 'active') fail('promoted-host-match-ended-when-the-old-host-returned');
      await returning.close();
    } else {
      report.phases.returningHost = 'skipped';
    }

    report.pageErrors = {
      promoted: promoted.errorsSeen.slice(0, 4),
      follower: follower.errorsSeen.slice(0, 4),
    };
  }
} catch (error) {
  fail(`harness-error at step '${report.lastStep}': ${String(error).slice(0, 400)}`);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
  // Belt and braces after Playwright's own teardown: anything still carrying
  // this run's marker on its command line is ours and nobody else's.
  killRunWindows();
  peerProcess?.kill();
}

report.verdict = report.failures.length === 0 ? 'PASS' : 'FAIL';
report.finishedAt = new Date().toISOString();
mkdirSync(resolve(OUT, '..'), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.error(`[hostmig] verdict=${report.verdict}${report.failures.length ? ` failures=${report.failures.join(' | ')}` : ''}`);
process.exit(report.verdict === 'PASS' ? 0 : 1);
