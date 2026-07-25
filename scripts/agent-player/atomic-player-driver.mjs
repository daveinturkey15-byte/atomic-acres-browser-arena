#!/usr/bin/env node

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCoralTargets } from './vision.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

async function withTimeout(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const [name, inline] = token.slice(2).split('=', 2);
    if (inline !== undefined) values[name] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) values[name] = argv[++index];
    else values[name] = true;
  }
  return values;
}

function integerArg(value, fallback, minimum, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function scrubUrl(value) {
  const url = new URL(value);
  if (url.searchParams.has('room')) url.searchParams.set('room', '[redacted]');
  return url.toString();
}

function localHost(url) {
  return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
}

function currentSourceSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function debugSnapshot(page) {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot?.() ?? null);
}

async function releaseAll(page, pressedKeys) {
  for (const key of [...pressedKeys]) {
    try { await page.keyboard.up(key); } catch { /* Browser may already be closed. */ }
    pressedKeys.delete(key);
  }
  // Gameplay mouse presses are dispatched in-page, not held through
  // Playwright's CDP mouse state. Unconditional page.mouse.up() calls can
  // deadlock under pointer lock on SwiftShader, so release only via the same
  // event channel that acquired the state.
  try {
    await page.evaluate(() => {
      window.__ATOMIC_PLAYER_BOUNDED_INPUT__?.releaseAll?.();
      const canvas = document.querySelector('#game');
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0 }));
      canvas?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 }));
      canvas?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0 }));
    });
  } catch { /* Browser may already be closed. */ }
}

async function boundedMovement(page, desiredCodes, holdMs) {
  await page.evaluate(({ codes, duration }) => {
    window.__ATOMIC_PLAYER_BOUNDED_INPUT__?.press?.(codes, duration);
  }, { codes: [...desiredCodes], duration: holdMs });
}

async function moveAim(page, movementX, movementY) {
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      movementX: x,
      movementY: y,
    }));
  }, { x: movementX, y: movementY });
}

async function firePulse(page, ads) {
  await page.evaluate(({ useAds }) => {
    const canvas = document.querySelector('#game');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    if (useAds) canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2, buttons: 2 }));
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: useAds ? 3 : 1 }));
  }, { useAds: ads });
  await sleep(72);
  await page.evaluate(({ useAds }) => {
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: useAds ? 2 : 0 }));
    if (useAds) window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 2, buttons: 0 }));
  }, { useAds: ads });
}

async function createVisionCapture(context, page) {
  const cdp = await context.newCDPSession(page);
  const state = {
    receivedFrames: 0,
    decodedFrames: 0,
    failedFrames: 0,
    firstReceivedAt: null,
    latestReceivedAt: null,
    captureDurationsMs: [],
    decodeDurationsMs: [],
    latest: null,
    stopped: false,
  };
  return {
    state,
    async capture() {
      if (state.stopped) throw new Error('Vision capture is stopped');
      const captureStartedAt = performance.now();
      const result = await withTimeout(cdp.send('Page.captureScreenshot', {
        format: 'jpeg', quality: 25, fromSurface: true,
      }), 8_000, 'visual capture');
      const receivedAt = performance.now();
      state.receivedFrames += 1;
      state.firstReceivedAt ??= receivedAt;
      state.latestReceivedAt = receivedAt;
      state.captureDurationsMs.push(receivedAt - captureStartedAt);
      const decodeStartedAt = performance.now();
      const jpeg = Buffer.from(result.data, 'base64');
      const { data, info } = await sharp(jpeg)
        .resize({ width: 320, height: 180, fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const targets = findCoralTargets(data, info.width, info.height, info.channels);
      const decodeMs = performance.now() - decodeStartedAt;
      state.decodeDurationsMs.push(decodeMs);
      state.decodedFrames += 1;
      state.latest = {
        sequence: state.decodedFrames,
        receivedAt,
        jpeg,
        targets,
        width: info.width,
        height: info.height,
        captureMs: receivedAt - captureStartedAt,
        decodeMs,
      };
      return state.latest;
    },
    async stop() {
      state.stopped = true;
    },
  };
}

async function prepareLobby(page, args, mode, headed) {
  await page.locator('#player-name').fill(String(args.callsign ?? 'Jigglyclaw'));
  await page.locator('#team').selectOption(String(args.team ?? '0'));
  if (mode === 'solo') {
    await page.waitForFunction(() => !document.querySelector('#solo')?.disabled);
    if (headed) {
      // A headed player session uses the real deployment button. Playwright's
      // locator click can wait forever after a successful pointer-lock request,
      // so invoke the same normal button handler without waiting for click ACK.
      await page.locator('#solo').evaluate((button) => button.click());
      return 'ordinary-deploy-button';
    }
    // Chromium's headless pointer-lock handshake can deadlock the normal click
    // action. The existing localhost QA start calls the same startGame('solo')
    // path with pointer-lock acquisition disabled. It is bootstrap-only: no
    // hidden world state is supplied to the controller.
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    return 'headless-localhost-qa-bootstrap';
  }
  if (mode === 'host') {
    await page.waitForFunction(() => !document.querySelector('#host')?.disabled);
    await page.locator('#host').click();
  } else {
    const room = String(args.room ?? '').trim();
    if (!room) throw new Error('Join mode requires --room <code>');
    await page.locator('#room-input').fill(room);
    await page.waitForFunction(() => !document.querySelector('#join')?.disabled);
    await page.locator('#join').click();
  }
  await page.locator('#private-lobby').waitFor({ state: 'visible', timeout: 20_000 });
  if (mode === 'host' && args['host-bots'] !== undefined) {
    await page.locator('#lobby-bots').selectOption(String(args['host-bots']));
  }
  if (args.chat) {
    await page.keyboard.press('Enter');
    await page.locator('#text-chat-input').fill(String(args.chat));
    await page.locator('#text-chat-input').press('Enter');
  }
  if (args.ready !== 'false') await page.locator('#lobby-ready').click();
  if (mode === 'host' && args.start) {
    await page.waitForFunction(() => !document.querySelector('#lobby-start')?.disabled, null, { timeout: 20_000 });
    // Invoke the ordinary Start handler without Playwright waiting on the
    // pointer-lock click acknowledgement; the first gameplay canvas press
    // acquires lock immediately afterwards.
    await page.locator('#lobby-start').evaluate((button) => button.click());
  }
  return 'ordinary-private-lobby-controls';
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const mode = String(args.mode ?? 'solo');
  if (!['solo', 'host', 'join'].includes(mode)) throw new Error('--mode must be solo, host, or join');
  const durationSeconds = integerArg(args.duration, 20, 3, 600);
  const tickMs = integerArg(args.tick, 140, 80, 500);
  const maxHoldMs = integerArg(args['max-hold'], 2000, tickMs, 5000);
  const viewportWidth = integerArg(args.width, 640, 480, 1280);
  const viewportHeight = integerArg(args.height, 360, 270, 720);
  const headed = Boolean(args.headed);
  const allowLive = Boolean(args['allow-live']);
  const baseUrl = String(args.url ?? 'http://127.0.0.1:4173/');
  const targetUrl = new URL(baseUrl);
  targetUrl.searchParams.set('render', 'performance');
  if (localHost(targetUrl)) targetUrl.searchParams.set('multiplayerQa', '1');
  if (mode === 'join' && args.room) targetUrl.searchParams.set('room', String(args.room));
  if (!localHost(targetUrl) && mode !== 'join' && !allowLive) {
    throw new Error('Non-local solo/host runs require --allow-live to prevent accidental leaderboard pollution');
  }

  const startedAt = new Date();
  const artifactDirectory = resolve(repositoryRoot, String(args.output ?? `artifacts/agent-player/${startedAt.toISOString().replaceAll(/[:.]/g, '-')}`));
  await mkdir(artifactDirectory, { recursive: true });
  const browserMessages = [];
  const errors = [];
  const pressedKeys = new Set();
  const actions = [];
  let browser;
  let page;
  let visionStream;
  let safetyReleased = false;
  let pointerLock = false;
  let initialSnapshot = null;
  let finalSnapshot = null;
  let firstTargetCaptured = false;
  let targetFrames = 0;
  let visionFrames = 0;
  let shotPulses = 0;
  let aimMoves = 0;
  let maximumObservedHoldMs = 0;
  let bootstrapKind = null;
  let startScreenshotCaptured = false;
  let finalScreenshotCaptured = false;
  let lobbyReceipt = null;
  const visionDurationsMs = [];

  try {
    console.error('[atomic-player] phase=browser-launch');
    browser = await chromium.launch({
      headless: !headed,
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    });
    const context = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error') browserMessages.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(({ callsign }) => {
      localStorage.setItem('atomic-acres-render-profile', 'performance');
      localStorage.setItem('atomic-acres:player-name:v1', callsign);
      localStorage.setItem('atomic-acres-sensitivity', '1');
      localStorage.setItem('atomic-acres-fov', '82');
      const held = new Map();
      const stats = { maximumObservedHoldMs: 0, releases: 0 };
      const keyName = (code) => ({
        KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ShiftLeft: 'Shift', ShiftRight: 'Shift',
      })[code] ?? code;
      const release = (code) => {
        const entry = held.get(code);
        if (!entry) return;
        clearTimeout(entry.timer);
        held.delete(code);
        stats.maximumObservedHoldMs = Math.max(stats.maximumObservedHoldMs, performance.now() - entry.startedAt);
        stats.releases += 1;
        window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code, key: keyName(code) }));
      };
      const releaseAll = () => {
        for (const code of [...held.keys()]) release(code);
      };
      window.__ATOMIC_PLAYER_BOUNDED_INPUT__ = {
        press(codes, duration) {
          releaseAll();
          for (const code of codes) {
            window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code, key: keyName(code) }));
            const startedAt = performance.now();
            const timer = setTimeout(() => release(code), duration);
            held.set(code, { startedAt, timer });
          }
        },
        releaseAll,
        snapshot: () => ({ ...stats, held: [...held.keys()] }),
      };
    }, { callsign: String(args.callsign ?? 'Jigglyclaw') });
    console.error('[atomic-player] phase=navigate');
    await page.goto(targetUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.locator('#player-name').waitFor({ state: 'visible', timeout: 45_000 });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot, null, { timeout: 45_000 });
    console.error('[atomic-player] phase=deploy');
    bootstrapKind = await prepareLobby(page, args, mode, headed);

    const gameplayExpectedNow = mode === 'solo' || Boolean(args.start);
    if (gameplayExpectedNow || await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot?.().gameStarted)) {
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot?.().gameStarted, null, { timeout: 45_000 });
    }
    initialSnapshot = await debugSnapshot(page);
    const passText = await page.locator('#menu .eyebrow').textContent().catch(() => '');
    const pass = passText?.match(/PASS\s+\d+/i)?.[0]?.toUpperCase() ?? 'UNKNOWN';
    if (initialSnapshot?.render?.profile !== 'performance') {
      throw new Error(`Performance profile invariant failed: ${initialSnapshot?.render?.profile ?? 'unknown'}`);
    }

    if (!initialSnapshot?.gameStarted) {
      lobbyReceipt = await page.evaluate(({ expectedChat }) => {
        const lobby = document.querySelector('#private-lobby');
        const readyButton = document.querySelector('#lobby-ready');
        const chatText = document.querySelector('#text-chat-log')?.textContent ?? '';
        const readyText = readyButton?.textContent?.trim() ?? '';
        return {
          visible: Boolean(lobby && !lobby.classList.contains('hidden')),
          ready: /ready\s*✓/i.test(readyText)
            || /unready/i.test(readyText)
            || readyButton?.getAttribute('aria-pressed') === 'true'
            || readyButton?.classList.contains('ready'),
          chatObserved: expectedChat ? chatText.includes(expectedChat) : null,
          memberRows: document.querySelector('#lobby-members')?.children.length ?? null,
        };
      }, { expectedChat: args.chat ? String(args.chat) : '' });
    }

    if (initialSnapshot?.gameStarted && args['lifecycle-only']) {
      actions.push({ atMs: Date.now() - startedAt.getTime(), kind: 'hosted-lifecycle-only' });
      finalSnapshot = initialSnapshot;
    } else if (initialSnapshot?.gameStarted) {
      console.error('[atomic-player] phase=control-loop');
      if (headed) {
        await page.mouse.click(viewportWidth / 2, viewportHeight / 2);
      } else {
        // First-click semantics: the game requests pointer lock on the first
        // canvas press and deliberately does not fire that click.
        await page.locator('#game').dispatchEvent('mousedown', { button: 0, buttons: 1 });
        await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 })));
      }
      await sleep(120);
      pointerLock = await page.evaluate(() => document.pointerLockElement?.id === 'game');
      visionStream = await createVisionCapture(context, page);
      await visionStream.capture();
      await writeFile(resolve(artifactDirectory, 'start.jpg'), visionStream.state.latest.jpeg);
      startScreenshotCaptured = true;
      const deadline = Date.now() + durationSeconds * 1000;
      let movementCycle = 0;
      let lastVisionSequence = 0;
      let currentTarget = null;
      while (Date.now() < deadline) {
        const tickStarted = performance.now();
        const vision = await visionStream.capture().catch((error) => {
          visionStream.state.failedFrames += 1;
          browserMessages.push({ type: 'warning', text: error.message });
          return null;
        });
        if (!vision) break;
        const desiredKeys = new Set();
        lastVisionSequence = vision.sequence;
        visionFrames += 1;
        visionDurationsMs.push(vision.decodeMs);
        currentTarget = vision.targets[0] ?? null;
        if (currentTarget) {
          targetFrames += 1;
          const horizontal = currentTarget.x - vision.width / 2;
          const vertical = currentTarget.y - vision.height / 2;
          const movementX = Math.max(-55, Math.min(55, Math.round(horizontal * 0.82)));
          const movementY = Math.max(-38, Math.min(38, Math.round(vertical * 0.72)));
          await moveAim(page, movementX, movementY);
          aimMoves += 1;
          const alignment = Math.hypot(horizontal / vision.width, vertical / vision.height);
          if (alignment < 0.16) {
            await firePulse(page, alignment < 0.09);
            shotPulses += 1;
          }
          if (!firstTargetCaptured) {
            await writeFile(resolve(artifactDirectory, 'first-target.jpg'), vision.jpeg);
            firstTargetCaptured = true;
          }
          actions.push({ atMs: Date.now() - startedAt.getTime(), kind: 'track', alignment, pixels: currentTarget.pixels, candidates: vision.targets.length });
        } else {
          await moveAim(page, movementCycle % 7 < 4 ? 34 : -46, 0);
          aimMoves += 1;
          actions.push({ atMs: Date.now() - startedAt.getTime(), kind: 'scan', candidates: 0 });
        }
        if (mode === 'solo' && movementCycle === 2 && shotPulses === 0 && args['fire-check']) {
          await firePulse(page, false);
          shotPulses += 1;
          actions.push({ atMs: Date.now() - startedAt.getTime(), kind: 'mechanical-fire-check' });
        }
        if (currentTarget) {
          const alignment = Math.hypot((currentTarget.x - 160) / 320, (currentTarget.y - 90) / 180);
          desiredKeys.add(alignment < 0.11 ? (movementCycle % 2 === 0 ? 'KeyA' : 'KeyD') : 'KeyW');
        } else {
          desiredKeys.add('KeyW');
          if (movementCycle % 4 === 1) desiredKeys.add('KeyA');
          if (movementCycle % 4 === 3) desiredKeys.add('KeyD');
        }
        if (movementCycle % 9 < 2) desiredKeys.add('ShiftLeft');
        // SwiftShader can sample gameplay near 1 Hz on this host. A 120 ms
        // pulse may never intersect a game frame, so use a longer deadline-
        // bounded pulse while retaining an unconditional local release timer.
        const boundedHoldMs = Math.min(maxHoldMs, 350);
        await boundedMovement(page, desiredKeys, boundedHoldMs);
        movementCycle += 1;
        console.error(`[atomic-player] frame=${vision.sequence} targets=${vision.targets.length} shots=${shotPulses}`);
        const elapsed = performance.now() - tickStarted;
        // Leave a readback-free window for simulation and the local key-up
        // deadline before requesting the next frame.
        await sleep(Math.max(700, tickMs - elapsed));
      }
      console.error('[atomic-player] phase=finalize');
      if (visionStream.state.latest?.jpeg) {
        await writeFile(resolve(artifactDirectory, 'final.jpg'), visionStream.state.latest.jpeg);
        finalScreenshotCaptured = true;
      }
      console.error('[atomic-player] finalize=stop-vision');
      await withTimeout(visionStream.stop(), 5_000, 'vision stream stop').catch((error) => {
        browserMessages.push({ type: 'warning', text: error.message });
      });
      // ReadPixels on SwiftShader can starve tiny input/state RPCs. Stop the
      // screencast before release verification and the final debug snapshot.
      await sleep(250);
      console.error('[atomic-player] finalize=release-input');
      const releaseConfirmed = await withTimeout(releaseAll(page, pressedKeys), 5_000, 'input release').then(() => true).catch((error) => {
        browserMessages.push({ type: 'warning', text: error.message });
        return false;
      });
      safetyReleased = releaseConfirmed;
      console.error('[atomic-player] finalize=snapshot');
      finalSnapshot = await withTimeout(debugSnapshot(page), 5_000, 'final debug snapshot').catch((error) => {
        browserMessages.push({ type: 'warning', text: error.message });
        return initialSnapshot;
      });
    } else {
      finalSnapshot = initialSnapshot;
    }

    const finalReleaseConfirmed = await withTimeout(releaseAll(page, pressedKeys), 5_000, 'final input release').then(() => true).catch((error) => {
      browserMessages.push({ type: 'warning', text: error.message });
      return false;
    });
    safetyReleased = safetyReleased || finalReleaseConfirmed;
    const boundedInputStats = await withTimeout(
      page.evaluate(() => window.__ATOMIC_PLAYER_BOUNDED_INPUT__?.snapshot?.() ?? null),
      5_000,
      'bounded input snapshot',
    ).catch((error) => {
      browserMessages.push({ type: 'warning', text: error.message });
      return null;
    });
    maximumObservedHoldMs = Number(boundedInputStats?.maximumObservedHoldMs ?? 0);
    const holdWatchdogExceeded = maximumObservedHoldMs > maxHoldMs;
    const releaseVerified = Boolean(safetyReleased && boundedInputStats && boundedInputStats.held?.length === 0);
    const sortedVisionDurations = [...visionDurationsMs].sort((left, right) => left - right);
    const percentile = (ratio) => sortedVisionDurations.length === 0
      ? null
      : sortedVisionDurations[Math.min(sortedVisionDurations.length - 1, Math.floor(sortedVisionDurations.length * ratio))];
    const report = {
      schemaVersion: 1,
      kind: 'atomic-player-benchmark',
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      source: {
        url: scrubUrl(targetUrl.toString()),
        pass,
        gitSha: localHost(targetUrl) ? currentSourceSha() : null,
        channel: targetUrl.searchParams.get('release') ?? 'direct-latest-source',
      },
      session: {
        mode,
        callsign: String(args.callsign ?? 'Jigglyclaw'),
        roomCodeStored: false,
        headed,
        pointerLock,
        bootstrap: bootstrapKind,
        lobbyReceipt,
      },
      fairness: {
        perception: args['lifecycle-only'] ? 'none-lifecycle-only' : 'rendered-pixels-coral-mask-v1',
        decisionInputs: args['lifecycle-only']
          ? ['ordinary lobby controls and post-action lifecycle receipt']
          : ['rendered canvas pixels', 'visible HUD state through ordinary controls'],
        forbiddenInputsUsed: [],
        debugSnapshotUse: 'post-action verification and aggregate benchmark only',
      },
      performance: {
        requestedRenderProfile: 'performance',
        observedRenderProfile: finalSnapshot?.render?.profile ?? initialSnapshot?.render?.profile ?? null,
        fpsCounter: finalSnapshot?.render?.fpsCounter ?? null,
        framePacing: finalSnapshot?.render?.framePacing ?? null,
        adaptive: finalSnapshot?.render?.adaptive ?? null,
        visionFrames,
        targetFrames,
        targetFrameRatio: visionFrames > 0 ? targetFrames / visionFrames : 0,
        tickMs,
        viewport: { width: viewportWidth, height: viewportHeight },
        visionLoopMs: {
          minimum: sortedVisionDurations[0] ?? null,
          median: percentile(0.5),
          p95: percentile(0.95),
          maximum: sortedVisionDurations.at(-1) ?? null,
        },
        visionStream: visionStream ? {
          mode: 'on-demand-cdp-jpeg',
          receivedFrames: visionStream.state.receivedFrames,
          decodedFrames: visionStream.state.decodedFrames,
          failedFrames: visionStream.state.failedFrames,
          captureMs: {
            minimum: Math.min(...visionStream.state.captureDurationsMs),
            maximum: Math.max(...visionStream.state.captureDurationsMs),
          },
          sourceFps: visionStream.state.firstReceivedAt !== null && visionStream.state.latestReceivedAt > visionStream.state.firstReceivedAt
            ? visionStream.state.receivedFrames / ((visionStream.state.latestReceivedAt - visionStream.state.firstReceivedAt) / 1000)
            : null,
        } : null,
      },
      input: {
        aimMoves,
        shotPulses,
        requestedHoldMs: 350,
        maximumObservedHoldMs,
        configuredMaxHoldMs: maxHoldMs,
        holdWatchdogExceeded,
        releasedAtEnd: releaseVerified,
        boundedInput: boundedInputStats,
      },
      outcome: {
        gameStarted: Boolean(finalSnapshot?.gameStarted),
        gameMode: finalSnapshot?.gameMode ?? null,
        arena: finalSnapshot?.arenaSelection?.id ?? null,
        player: finalSnapshot?.player ? {
          hp: finalSnapshot.player.hp,
          alive: finalSnapshot.player.alive,
          kills: finalSnapshot.player.kills,
          deaths: finalSnapshot.player.deaths,
          weapon: finalSnapshot.player.weapon,
          ammo: finalSnapshot.player.ammo,
          position: finalSnapshot.player.position,
        } : null,
        bots: Array.isArray(finalSnapshot?.bots) ? {
          active: finalSnapshot.bots.length,
          alive: finalSnapshot.bots.filter((bot) => bot.alive).length,
          totalKills: finalSnapshot.bots.reduce((sum, bot) => sum + Number(bot.kills ?? 0), 0),
        } : null,
      },
      browser: {
        pageErrors: errors,
        warningOrErrorCount: browserMessages.length,
        messages: browserMessages.slice(0, 50),
      },
      actions: actions.slice(-250),
      artifacts: [startScreenshotCaptured ? 'start.jpg' : null, firstTargetCaptured ? 'first-target.jpg' : null, finalScreenshotCaptured ? 'final.jpg' : null].filter(Boolean),
    };
    const reportPath = resolve(artifactDirectory, 'report.json');
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const expectsGameplay = mode === 'solo' || Boolean(args.start);
    const sessionSucceeded = expectsGameplay
      ? report.outcome.gameStarted
      : Boolean(report.session.lobbyReceipt?.visible)
        && (!args.ready || report.session.lobbyReceipt.ready)
        && (!args.chat || report.session.lobbyReceipt.chatObserved);
    const ok = sessionSucceeded
      && report.performance.observedRenderProfile === 'performance'
      && report.input.releasedAtEnd
      && !report.input.holdWatchdogExceeded
      && report.browser.pageErrors.length === 0;
    console.log(JSON.stringify({
      ok,
      reportPath,
      pass: report.source.pass,
      renderProfile: report.performance.observedRenderProfile,
      pointerLock,
      visionFrames,
      targetFrames,
      shotPulses,
      outcome: report.outcome,
      pageErrors: errors.length,
    }, null, 2));
    if (!ok) process.exitCode = 2;
  } finally {
    if (visionStream && !visionStream.state.stopped) await withTimeout(visionStream.stop(), 3_000, 'cleanup vision stop').catch(() => undefined);
    if (page && !safetyReleased) await withTimeout(releaseAll(page, pressedKeys), 3_000, 'cleanup input release').catch(() => undefined);
    if (browser) await withTimeout(browser.close(), 5_000, 'browser close').catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
