import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4182/';
const peerPort = Number(process.env.QA_PEER_PORT ?? 9000);
const headed = process.env.QA_HEADED === '1';
const browser = await chromium.launch({
  headless: !headed,
  args: ['--mute-audio', 
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});
const context = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
const host = await context.newPage();
const guest = await context.newPage();
const errors = [];
let peerProcess = null;

function peerServerReady() {
  return new Promise((resolveReady) => {
    const request = http.get(`http://127.0.0.1:${peerPort}/peerjs`, (response) => {
      response.resume();
      resolveReady(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.once('error', () => resolveReady(false));
    request.setTimeout(500, () => {
      request.destroy();
      resolveReady(false);
    });
  });
}

async function ensurePeerServer() {
  if (peerPort <= 0 || await peerServerReady()) return null;
  const child = spawn(process.execPath, [
    resolve('node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1',
    '--port', String(peerPort),
    '--path', '/peerjs',
    '--no-allow_discovery',
  ], { cwd: process.cwd(), stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await peerServerReady()) return child;
    if (child.exitCode !== null) throw new Error(`Local PeerJS server exited with ${child.exitCode}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  child.kill();
  throw new Error('Local PeerJS server did not become ready');
}

function observe(label, page) {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(`${label}: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${label}: HTTP ${response.status()} ${response.url()}`);
  });
}

async function open(page, label) {
  console.error(`[focus-recovery] opening ${label}`);
  const url = new URL(baseUrl);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgl2');
  url.searchParams.set('render', 'compat');
  url.searchParams.set('seed', `focus-recovery-${label}`);
  url.searchParams.set('multiplayerQa', '1');
  if (peerPort > 0) url.searchParams.set('peerQaPort', String(peerPort));
  await page.goto(url.toString());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  await page.fill('#player-name', `${label} focus QA`);
  console.error(`[focus-recovery] ${label} ready`);
}

async function state(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('#menu');
    const lobby = document.querySelector('#private-lobby');
    const resume = document.querySelector('#resume');
    const mainMenu = document.querySelector('#main-menu');
    const canvas = document.querySelector('#game');
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const visible = (element) => Boolean(element)
      && !element.hidden
      && getComputedStyle(element).display !== 'none'
      && getComputedStyle(element).visibility !== 'hidden'
      && element.getClientRects().length > 0;
    return {
      visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(),
      pointerLock: document.pointerLockElement?.id ?? null,
      gameStarted: snapshot.gameStarted,
      gameMode: snapshot.gameMode,
      remotes: snapshot.remotes,
      frameCount: snapshot.frameCount,
      presentationScheduling: snapshot.presentationScheduling,
      menuVisible: !menu.classList.contains('hidden'),
      privateLobbyActive: menu.classList.contains('private-lobby-active'),
      privateLobbyVisible: visible(lobby),
      resumeVisible: visible(resume),
      mainMenuVisible: visible(mainMenu),
      canvasVisibility: getComputedStyle(canvas).visibility,
      canvasDisplay: getComputedStyle(canvas).display,
    };
  });
}

async function waitForLobby(page) {
  await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: 30_000 });
}

async function assertWaitingLobbySurvivesFocusSwitch(page, other, label) {
  console.error(`[focus-recovery] ${label} waiting-lobby focus switch`);
  await page.bringToFront();
  await other.bringToFront();
  await page.bringToFront();
  await page.waitForTimeout(100);
  const observed = await state(page);
  if (!observed.menuVisible || !observed.privateLobbyActive || !observed.privateLobbyVisible || observed.canvasVisibility !== 'hidden') {
    throw new Error(`${label} waiting lobby did not survive focus switch: ${JSON.stringify(observed)}`);
  }
  console.error(`[focus-recovery] ${label} waiting-lobby focus switch passed`);
  return observed;
}

async function assertActiveMatchRecovers(page, other, label) {
  console.error(`[focus-recovery] ${label} active-match focus recovery`);
  await page.bringToFront();
  await Promise.all([
    page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false)),
    other.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true)),
  ]);
  await page.evaluate(() => {
    const focusHarness = { focused: true };
    Object.defineProperty(window, '__PASS66_FOCUS_HARNESS__', { configurable: true, value: focusHarness });
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => focusHarness.focused,
    });
  });
  const beforeBlur = await state(page);
  if (beforeBlur.menuVisible || beforeBlur.canvasVisibility !== 'visible') {
    throw new Error(`${label} was not in playable rendering before focus-loss probe: ${JSON.stringify(beforeBlur)}`);
  }
  await other.bringToFront();
  await page.evaluate(() => {
    window.__PASS66_FOCUS_HARNESS__.focused = false;
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('pointerlockchange'));
  });
  await page.waitForTimeout(350);
  const background = await state(page);
  const expectedBackgroundMode = label === 'host' ? 'hosted-authority-network' : 'network-only';
  if (!background.gameStarted || background.remotes !== 1 || background.menuVisible
    || background.frameCount > beforeBlur.frameCount + 1
    || background.presentationScheduling.mode !== expectedBackgroundMode
    || (label === 'host' && background.presentationScheduling.hostedBackgroundNetworkHeartbeatCount
      <= beforeBlur.presentationScheduling.hostedBackgroundNetworkHeartbeatCount)) {
    throw new Error(`${label} ran presentation work or lost its bounded network lifecycle while unfocused: ${JSON.stringify({ beforeBlur, background })}`);
  }
  await page.bringToFront();
  await page.evaluate(() => {
    window.__PASS66_FOCUS_HARNESS__.focused = true;
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(100);
  const returned = await state(page);
  if (returned.presentationScheduling.recoveryCount !== beforeBlur.presentationScheduling.recoveryCount + 1) {
    throw new Error(`${label} did not coalesce focus recovery into one generation: ${JSON.stringify({ beforeBlur, returned })}`);
  }
  await mkdir('artifacts/focus-recovery', { recursive: true });
  try {
    await page.screenshot({ path: `artifacts/focus-recovery/${label}-focus-return.png`, fullPage: true, timeout: 15_000 });
  } catch (error) {
    console.error(`[focus-recovery] optional ${label} screenshot skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (returned.menuVisible || returned.privateLobbyActive || returned.privateLobbyVisible || returned.canvasVisibility !== 'visible') {
    throw new Error(`${label} focus return interrupted the active match: ${JSON.stringify(returned)}`);
  }
  await page.evaluate(() => {
    const game = document.querySelector('#game');
    let qaPointerLockElement = null;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => qaPointerLockElement,
    });
    game.requestPointerLock = () => {
      qaPointerLockElement = game;
      queueMicrotask(() => document.dispatchEvent(new Event('pointerlockchange')));
      return Promise.resolve();
    };
  });
  const canvasBounds = await page.locator('#game').boundingBox();
  if (!canvasBounds) throw new Error(`${label} canvas had no clickable bounds after focus return`);
  await page.mouse.click(canvasBounds.x + canvasBounds.width / 2, canvasBounds.y + canvasBounds.height / 2);
  let resumed = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = await state(page);
    if (
      candidate.pointerLock === 'game'
      && candidate.menuVisible === false
      && candidate.gameStarted
      && candidate.remotes === 1
      && candidate.canvasVisibility === 'visible'
      && candidate.canvasDisplay !== 'none'
    ) {
      resumed = candidate;
      break;
    }
    await page.waitForTimeout(100);
  }
  if (!resumed) {
    await page.screenshot({ path: `artifacts/focus-recovery/${label}-resume-stuck.png`, fullPage: true });
    throw new Error(`${label} canvas click did not reacquire pointer lock: ${JSON.stringify(await state(page))}`);
  }
  console.error(`[focus-recovery] ${label} active-match focus recovery passed`);
  return { beforeBlur, background, returned, resumed };
}

async function assertOptionsEscapeReturnsToPlay(page) {
  await page.bringToFront();
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
  await page.waitForSelector('#menu-tab-options', { state: 'visible' });
  await page.click('#menu-tab-options');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let writes = 0;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'atomic-acres.player-profile.v1') writes += 1;
      original.call(this, key, value);
    };
    Object.defineProperty(window, '__PASS66_SETTINGS_WRITES__', { configurable: true, get: () => writes });
  });
  const current = await page.inputValue('#graphics-profile');
  await page.selectOption('#graphics-profile', current === 'performance' ? 'high' : 'performance');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const menu = document.querySelector('#menu');
    const deployTab = document.querySelector('#menu-tab-deploy');
    return menu?.classList.contains('hidden')
      && document.pointerLockElement?.id === 'game'
      && deployTab?.getAttribute('aria-selected') === 'true';
  }, undefined, { timeout: 15_000 });
  const result = await page.evaluate(() => ({
    settingsWrites: window.__PASS66_SETTINGS_WRITES__,
    lifecycle: window.__ATOMIC_ACRES_DEBUG__.snapshot().menuLifecycle,
  }));
  if (result.settingsWrites !== 1 || result.lifecycle.surface !== 'hidden') {
    throw new Error(`Options Escape did not commit once and return directly to play: ${JSON.stringify(result)}`);
  }
  return result;
}

try {
  peerProcess = await ensurePeerServer();
  observe('host', host);
  observe('guest', guest);
  await open(host, 'host');
  await open(guest, 'guest');

  await host.bringToFront();
  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout: 45_000 });
  const roomCode = (await host.textContent('#room-code')).trim();

  await guest.bringToFront();
  await guest.evaluate((code) => {
    const team = document.querySelector('#team');
    const input = document.querySelector('#room-input');
    team.value = '1';
    team.dispatchEvent(new Event('change', { bubbles: true }));
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, roomCode);
  await Promise.all([waitForLobby(host), waitForLobby(guest)]);
  console.error('[focus-recovery] two-player waiting lobby joined');

  const waiting = {
    host: await assertWaitingLobbySurvivesFocusSwitch(host, guest, 'host'),
    guest: await assertWaitingLobbySurvivesFocusSwitch(guest, host, 'guest'),
  };

  await host.bringToFront();
  await host.evaluate(() => document.querySelector('#lobby-ready')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await guest.bringToFront();
  await guest.evaluate(() => document.querySelector('#lobby-ready')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.bringToFront();
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 30_000 });
  await host.evaluate(() => document.querySelector('#lobby-start')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await Promise.all([
    host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true && window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout: 30_000 }),
    guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().gameStarted === true && window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout: 30_000 }),
  ]);
  console.error('[focus-recovery] synchronized match started');
  await Promise.all([
    host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false)),
    guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false)),
  ]);

  const active = {
    host: await assertActiveMatchRecovers(host, guest, 'host'),
    guest: await assertActiveMatchRecovers(guest, host, 'guest'),
  };
  const optionsEscape = await assertOptionsEscapeReturnsToPlay(host);
  const report = {
    schema: 'atomic-acres/focus-recovery@2',
    resumeTransition: 'presentation pauses while unfocused; transport remains live and one foreground recovery resumes the existing match',
    roomCodeLength: roomCode.length,
    errors,
    waiting,
    active,
    optionsEscape,
  };
  await mkdir('artifacts/focus-recovery', { recursive: true });
  await writeFile('artifacts/focus-recovery/report.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  console.error('[focus-recovery] closing browser context');
  await context.close();
  await browser.close();
  if (peerProcess?.exitCode === null) peerProcess.kill();
  console.error('[focus-recovery] browser closed');
}
