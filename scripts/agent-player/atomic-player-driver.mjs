#!/usr/bin/env node

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  associatePurpleOperator,
  createPurpleTargetTracker,
  findCoralTargets,
  findMinimapThreats,
  findPurpleOperatorCandidates,
  frameSignature,
  operatorCrosshairAlignment,
  signatureDifference,
} from './vision.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPostInputVision(visionStream, sourceSequence, inputCompletedAt, timeoutMs = 300) {
  return visionStream.captureAfter({
    sourceSequence,
    notBefore: inputCompletedAt + 40,
    timeoutMs,
  });
}

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

async function fireBurst(page, shots, ads) {
  for (let shot = 0; shot < shots; shot += 1) {
    await firePulse(page, ads);
    if (shot + 1 < shots) await sleep(42);
  }
}

async function annotatedVisionJpeg(vision, tracking) {
  const metadata = await sharp(vision.jpeg).metadata();
  const outputWidth = Number(metadata.width ?? vision.width);
  const outputHeight = Number(metadata.height ?? vision.height);
  const scaleX = outputWidth / vision.width;
  const scaleY = outputHeight / vision.height;
  const boxes = vision.operatorTargets.map((candidate, index) => {
    const bounds = candidate.bounds;
    const x = bounds.minX * scaleX;
    const y = bounds.minY * scaleY;
    const width = Math.max(2, bounds.width * scaleX);
    const height = Math.max(2, bounds.height * scaleY);
    const selected = candidate === tracking.rawTarget;
    const color = tracking.fireAuthorized && selected ? '#22c55e' : selected ? '#facc15' : '#f97316';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="none" stroke="${color}" stroke-width="3"/><text x="${x.toFixed(1)}" y="${Math.max(12, y - 4).toFixed(1)}" fill="${color}" font-size="12">op${index} px${candidate.pixels}</text>`;
  }).join('');
  const crosshairX = outputWidth / 2;
  const crosshairY = outputHeight / 2;
  const overlay = Buffer.from(`<svg width="${outputWidth}" height="${outputHeight}" xmlns="http://www.w3.org/2000/svg">${boxes}<path d="M ${crosshairX - 8} ${crosshairY} H ${crosshairX + 8} M ${crosshairX} ${crosshairY - 8} V ${crosshairY + 8}" stroke="#22d3ee" stroke-width="2"/></svg>`);
  return sharp(vision.jpeg).composite([{ input: overlay }]).jpeg({ quality: 86 }).toBuffer();
}

async function createVisionCapture(context, page, options = {}) {
  const cdp = await context.newCDPSession(page);
  const mode = options.mode ?? 'on-demand';
  const state = {
    mode,
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
  let latestPacket = null;
  let packetSequence = 0;
  let consumedPacketSequence = 0;
  const frameWaiters = new Set();

  const recordPacket = (encodedData, receivedAt) => {
    state.receivedFrames += 1;
    state.firstReceivedAt ??= receivedAt;
    state.latestReceivedAt = receivedAt;
    packetSequence += 1;
    latestPacket = { encodedData, receivedAt, sequence: packetSequence };
    for (const resolveWaiter of frameWaiters) resolveWaiter();
    frameWaiters.clear();
  };

  if (mode === 'screencast') {
    cdp.on('Page.screencastFrame', (event) => {
      const receivedAt = performance.now();
      void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => undefined);
      recordPacket(event.data, receivedAt);
    });
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 28,
      maxWidth: Number(options.maxWidth ?? 640),
      maxHeight: Number(options.maxHeight ?? 360),
      everyNthFrame: 1,
    });
  }

  const decodePacket = async (packet, captureStartedAt) => {
    const decodeStartedAt = performance.now();
    const jpeg = Buffer.from(packet.encodedData, 'base64');
    const { data, info } = await sharp(jpeg)
      .resize({ width: 320, height: 180, fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const targets = findCoralTargets(data, info.width, info.height, info.channels);
    const operatorTargets = findPurpleOperatorCandidates(data, info.width, info.height, info.channels);
    const minimapThreats = findMinimapThreats(data, info.width, info.height, info.channels);
    const decodeMs = performance.now() - decodeStartedAt;
    const captureMs = Math.max(0, packet.receivedAt - captureStartedAt);
    state.captureDurationsMs.push(captureMs);
    state.decodeDurationsMs.push(decodeMs);
    state.decodedFrames += 1;
    state.latest = {
      sequence: state.decodedFrames,
      sourceSequence: packet.sequence,
      receivedAt: packet.receivedAt,
      jpeg,
      targets,
      operatorTargets,
      minimapThreats,
      operatorPaletteRatio: Number(operatorTargets.paletteRatio ?? 0),
      operatorRejectedReason: operatorTargets.rejectedReason ?? null,
      signature: frameSignature(data, info.width, info.height, info.channels),
      width: info.width,
      height: info.height,
      captureMs,
      decodeMs,
    };
    return state.latest;
  };

  return {
    state,
    async captureAfter({ sourceSequence = 0, notBefore = 0, timeoutMs = 300 } = {}) {
      if (state.stopped) throw new Error('Vision capture is stopped');
      if (mode !== 'screencast') {
        const captured = await this.capture();
        return captured.receivedAt >= notBefore ? captured : null;
      }
      const captureStartedAt = performance.now();
      const deadline = performance.now() + timeoutMs;
      while (performance.now() < deadline) {
        if (latestPacket && latestPacket.sequence > sourceSequence && latestPacket.receivedAt >= notBefore) {
          consumedPacketSequence = latestPacket.sequence;
          return decodePacket(latestPacket, captureStartedAt);
        }
        const remaining = Math.max(1, deadline - performance.now());
        const woke = await new Promise((resolveFrame) => {
          let timer;
          const wake = () => {
            clearTimeout(timer);
            frameWaiters.delete(wake);
            resolveFrame(true);
          };
          timer = setTimeout(() => {
            frameWaiters.delete(wake);
            resolveFrame(false);
          }, remaining);
          frameWaiters.add(wake);
        });
        if (!woke) break;
      }
      return null;
    },
    async capture() {
      if (state.stopped) throw new Error('Vision capture is stopped');
      const captureStartedAt = performance.now();
      if (mode === 'screencast') {
        if (!latestPacket || latestPacket.sequence <= consumedPacketSequence) {
          await withTimeout(new Promise((resolveFrame) => frameWaiters.add(resolveFrame)), 3_000, 'screencast frame');
        }
        if (!latestPacket) throw new Error('Screencast produced no frame');
        consumedPacketSequence = latestPacket.sequence;
        return decodePacket(latestPacket, captureStartedAt);
      }
      const result = await withTimeout(cdp.send('Page.captureScreenshot', {
        format: 'jpeg', quality: 25, fromSurface: true,
      }), 8_000, 'visual capture');
      const receivedAt = performance.now();
      recordPacket(result.data, receivedAt);
      consumedPacketSequence = packetSequence;
      return decodePacket(latestPacket, captureStartedAt);
    },
    async stop() {
      if (state.stopped) return;
      state.stopped = true;
      for (const resolveWaiter of frameWaiters) resolveWaiter();
      frameWaiters.clear();
      if (mode === 'screencast') await cdp.send('Page.stopScreencast').catch(() => undefined);
    },
  };
}

async function visibleHudSnapshot(page) {
  return page.evaluate(() => {
    const numericText = (selector) => {
      const value = Number.parseInt(document.querySelector(selector)?.textContent?.trim() ?? '', 10);
      return Number.isFinite(value) ? value : null;
    };
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement) || element.hidden) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    const timer = document.querySelector('#timer')?.textContent?.trim() ?? null;
    const countdownVisible = visible('#countdown');
    const bannerVisible = visible('#banner');
    const respawnVisible = visible('#respawn');
    const matchSummaryVisible = Boolean(document.querySelector('#download-match-summary'));
    return {
      health: numericText('#health'),
      ammo: numericText('#ammo'),
      reserve: numericText('#reserve'),
      damageDealt: numericText('#damage-dealt'),
      damageTaken: numericText('#damage-taken'),
      timer,
      countdownVisible,
      bannerVisible,
      respawnVisible,
      reloadState: document.querySelector('#reload-state')?.textContent?.trim() ?? '',
      reloadActive: document.querySelector('#reload-state')?.classList?.contains('active') ?? false,
      matchSummaryVisible,
      activeMatch: !countdownVisible && !bannerVisible && !respawnVisible && !matchSummaryVisible && Boolean(timer && timer !== '00:00'),
    };
  });
}

async function downloadVisibleMatchReport(page, selector, outputPath) {
  const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
  await page.locator(selector).click({ timeout: 20_000 });
  const download = await downloadPromise;
  await download.saveAs(outputPath);
  const parsed = JSON.parse(await readFile(outputPath, 'utf8'));
  return { suggestedFilename: download.suggestedFilename(), outputPath, parsed };
}

async function webGlRendererInfo(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#game');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return null;
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
    };
  });
}

async function trustedElementClick(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Visible click target is unavailable: ${selector}`);
  await page.bringToFront();
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

async function prepareLobby(page, args, mode, headed) {
  await page.locator('#player-name').fill(String(args.callsign ?? 'Jigglyclaw'));
  await page.locator('#team').selectOption(String(args.team ?? '0'));
  if (mode === 'solo') {
    await page.waitForFunction(() => !document.querySelector('#solo')?.disabled, null, { timeout: 180_000 });
    if (headed) {
      // Use a real CDP mouse event so the visible Deploy button carries the
      // trusted user gesture required by Chromium pointer lock. Locator.click()
      // can wait forever after the page successfully captures the pointer.
      await trustedElementClick(page, '#solo');
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
  const realtimeProfile = String(args['realtime-profile'] ?? 'single-rate');
  if (!['single-rate', 'tri-lane'].includes(realtimeProfile)) throw new Error('--realtime-profile must be single-rate or tri-lane');
  const triLane = realtimeProfile === 'tri-lane';
  const durationSeconds = integerArg(args.duration, 20, 3, 600);
  const tickMs = integerArg(args.tick, triLane ? 80 : 140, 60, 500);
  const maxHoldMs = integerArg(args['max-hold'], 2000, tickMs, 5000);
  const viewportWidth = integerArg(args.width, 640, 480, 1280);
  const viewportHeight = integerArg(args.height, 360, 270, 720);
  const cdpUrl = args['cdp-url'] ? String(args['cdp-url']) : null;
  const headed = Boolean(args.headed) || Boolean(cdpUrl);
  const waitForMatchEnd = Boolean(args['wait-for-match-end']);
  const controlSleepMs = integerArg(args['control-sleep'], triLane ? 35 : (cdpUrl ? 80 : 700), 20, 1000);
  const navigationLaneStride = triLane ? 3 : 1;
  const requestedCaptureMode = String(args['capture-mode'] ?? (cdpUrl ? 'screencast' : 'on-demand'));
  if (!['screencast', 'on-demand'].includes(requestedCaptureMode)) throw new Error('--capture-mode must be screencast or on-demand');
  const candidateImageLimit = integerArg(args['candidate-images'], 12, 0, 40);
  const burstShots = integerArg(args['burst-shots'], 3, 1, 5);
  const fireCooldownMs = integerArg(args['fire-cooldown'], 420, 180, 2000);
  const allowCombatFire = Boolean(args['allow-combat-fire']);
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
  let context;
  let page;
  let visionStream;
  let safetyReleased = false;
  let pointerLock = false;
  let initialSnapshot = null;
  let finalSnapshot = null;
  let firstRawTargetCaptured = false;
  let firstTargetCaptured = false;
  let firstTwoFrameAlignedCaptured = false;
  let firstFireCaptured = false;
  let rawTargetFrames = 0;
  let warmupRawTargetFrames = 0;
  let operatorCandidateFrames = 0;
  let operatorRedFlashFrames = 0;
  let minimapThreatFrames = 0;
  let confirmedTargetFrames = 0;
  let staticGeometryRejects = 0;
  let fireAuthorizedFrames = 0;
  let rejectedScreenLockedFrames = 0;
  let visionFrames = 0;
  let activeVisionFrames = 0;
  let shotPulses = 0;
  let bursts = 0;
  let warmupShotPulses = 0;
  let unconfirmedShotPulses = 0;
  let reloadRequests = 0;
  let stuckRecoveries = 0;
  let damageReactions = 0;
  let candidateImagesSaved = 0;
  let firstRawTargetAnnotatedCaptured = false;
  let firstTargetAnnotatedCaptured = false;
  const annotatedCandidateArtifacts = [];
  let aimMoves = 0;
  let aimServoMoves = 0;
  let maximumObservedHoldMs = 0;
  let bootstrapKind = null;
  let startScreenshotCaptured = false;
  let finalScreenshotCaptured = false;
  let lobbyReceipt = null;
  let matchEndedObserved = false;
  let matchSummaryDownload = null;
  let matchTechnicalDownload = null;
  let rendererInfo = null;
  let controlStartedAtMs = null;
  let controlEndedAtMs = null;
  const visionDurationsMs = [];

  try {
    console.error('[atomic-player] phase=browser-launch');
    if (cdpUrl) {
      browser = await chromium.connectOverCDP(cdpUrl, { timeout: 30_000 });
      context = browser.contexts()[0];
      if (!context) throw new Error(`No browser context exposed by CDP endpoint ${cdpUrl}`);
      page = context.pages().find((candidate) => candidate.url() === 'about:blank') ?? context.pages()[0] ?? await context.newPage();
      await page.setViewportSize({ width: viewportWidth, height: viewportHeight }).catch(() => undefined);
    } else {
      browser = await chromium.launch({
        headless: !headed,
        args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
      });
      context = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 1 });
      page = await context.newPage();
    }
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
    rendererInfo = await webGlRendererInfo(page).catch(() => null);
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
        const alreadyLocked = await page.evaluate(() => document.pointerLockElement?.id === 'game');
        if (!alreadyLocked) await trustedElementClick(page, '#game');
      } else {
        // First-click semantics: the game requests pointer lock on the first
        // canvas press and deliberately does not fire that click.
        await page.locator('#game').dispatchEvent('mousedown', { button: 0, buttons: 1 });
        await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, buttons: 0 })));
      }
      await sleep(120);
      pointerLock = await page.evaluate(() => document.pointerLockElement?.id === 'game');
      if (headed && !pointerLock) throw new Error('Trusted canvas click did not acquire pointer lock');
      visionStream = await createVisionCapture(context, page, { mode: requestedCaptureMode });
      try {
        await visionStream.capture();
      } catch (error) {
        if (requestedCaptureMode !== 'screencast') throw error;
        browserMessages.push({ type: 'warning', text: `screencast fallback: ${error.message}` });
        await visionStream.stop().catch(() => undefined);
        visionStream = await createVisionCapture(context, page, { mode: 'on-demand' });
        await visionStream.capture();
      }
      await writeFile(resolve(artifactDirectory, 'start.jpg'), visionStream.state.latest.jpeg);
      startScreenshotCaptured = true;
      controlStartedAtMs = Date.now();
      const deadline = controlStartedAtMs + durationSeconds * 1000;
      const targetTracker = createPurpleTargetTracker({ confirmationFrames: 2, maxSizeRatio: 8 });
      let movementCycle = 0;
      let currentTarget = null;
      let previousSignature = visionStream.state.latest.signature;
      let previousDamageTaken = null;
      let lowMotionFrames = 0;
      let previousMovementForward = false;
      let previousMovementMoved = false;
      let cameraMovedLastFrame = false;
      let lastReloadRequestAt = Number.NEGATIVE_INFINITY;
      let reloadSuppressedUntil = 0;
      let lastBurstAt = Number.NEGATIVE_INFINITY;
      let lastCandidateImageAt = Number.NEGATIVE_INFINITY;
      let damageReactionUntil = 0;
      let reactionDirection = 1;
      let fireCheckDone = false;
      while (Date.now() < deadline) {
        const tickStarted = performance.now();
        if (waitForMatchEnd && await page.locator('#download-match-summary').isVisible().catch(() => false)) {
          matchEndedObserved = true;
          actions.push({ atMs: Date.now() - startedAt.getTime(), kind: 'match-end-visible' });
          break;
        }
        const vision = await visionStream.capture().catch((error) => {
          visionStream.state.failedFrames += 1;
          browserMessages.push({ type: 'warning', text: error.message });
          return null;
        });
        if (!vision) break;
        const now = Date.now();
        const atMs = now - startedAt.getTime();
        const desiredKeys = new Set();
        visionFrames += 1;
        visionDurationsMs.push(vision.decodeMs);
        const hud = await visibleHudSnapshot(page).catch(() => null);
        if (hud?.matchSummaryVisible) {
          matchEndedObserved = true;
          actions.push({ atMs, kind: 'match-end-visible' });
          break;
        }
        const activeMatch = Boolean(hud?.activeMatch);
        if (activeMatch) activeVisionFrames += 1;
        const visualDifference = signatureDifference(previousSignature, vision.signature);
        if (previousMovementForward && !cameraMovedLastFrame && visualDifference !== null && visualDifference < 2.2) lowMotionFrames += 1;
        else if (!previousMovementForward || cameraMovedLastFrame || (visualDifference !== null && visualDifference >= 2.2)) lowMotionFrames = 0;
        previousSignature = vision.signature;

        if (previousDamageTaken !== null && Number(hud?.damageTaken ?? previousDamageTaken) > previousDamageTaken) {
          damageReactionUntil = now + 1_100;
          reactionDirection *= -1;
          damageReactions += 1;
          actions.push({ atMs, kind: 'damage-reaction', damageTaken: hud.damageTaken, health: hud.health });
          if (damageReactions <= 3) await writeFile(resolve(artifactDirectory, `damage-contact-${String(damageReactions).padStart(2, '0')}.jpg`), vision.jpeg);
        }
        if (hud?.damageTaken !== null && hud?.damageTaken !== undefined) previousDamageTaken = Number(hud.damageTaken);

        const reloadingVisible = Boolean(hud?.reloadActive) || now < reloadSuppressedUntil;
        if (activeMatch && hud?.ammo !== null && hud.ammo <= 3 && Number(hud.reserve ?? 0) > 0
          && !reloadingVisible && now - lastReloadRequestAt >= 2_200) {
          await page.keyboard.press('KeyR');
          lastReloadRequestAt = now;
          reloadSuppressedUntil = now + 1_500;
          reloadRequests += 1;
          actions.push({ atMs, kind: 'reload-visible-hud', ammo: hud.ammo, reserve: hud.reserve });
        }

        if (vision.targets.length > 0) {
          if (activeMatch) rawTargetFrames += 1;
          else warmupRawTargetFrames += 1;
        }
        if (activeMatch && vision.operatorRejectedReason === 'global-red-flash') operatorRedFlashFrames += 1;
        const tracking = targetTracker.update(vision.operatorTargets, {
          width: vision.width,
          height: vision.height,
          active: activeMatch,
          cameraMoved: cameraMovedLastFrame,
          movementMoved: previousMovementMoved,
        });
        const rawTarget = tracking.rawTarget;
        const minimapThreat = vision.minimapThreats[0] ?? null;
        if (activeMatch && minimapThreat) minimapThreatFrames += 1;
        currentTarget = tracking.confirmedTarget;
        let cameraMovedThisFrame = false;
        if (activeMatch && rawTarget) operatorCandidateFrames += 1;
        if (tracking.reason === 'static-geometry-rejected') staticGeometryRejects += 1;
        if (tracking.fireAuthorized) fireAuthorizedFrames += 1;

        if (rawTarget) {
          if (activeMatch && !firstRawTargetCaptured) {
            await writeFile(resolve(artifactDirectory, 'first-raw-target.jpg'), vision.jpeg);
            await writeFile(resolve(artifactDirectory, 'first-raw-target-annotated.jpg'), await annotatedVisionJpeg(vision, tracking));
            firstRawTargetCaptured = true;
            firstRawTargetAnnotatedCaptured = true;
          }
          if (activeMatch && candidateImagesSaved < candidateImageLimit && atMs - lastCandidateImageAt >= 2_000) {
            candidateImagesSaved += 1;
            lastCandidateImageAt = atMs;
            const candidateName = `candidate-${String(candidateImagesSaved).padStart(2, '0')}`;
            await writeFile(resolve(artifactDirectory, `${candidateName}.jpg`), vision.jpeg);
            await writeFile(resolve(artifactDirectory, `${candidateName}-annotated.jpg`), await annotatedVisionJpeg(vision, tracking));
            annotatedCandidateArtifacts.push(`${candidateName}-annotated.jpg`);
          }
        }

        if (currentTarget) {
          confirmedTargetFrames += 1;
          let aimedVision = vision;
          let aimedTarget = currentTarget;
          let aimAlignment = operatorCrosshairAlignment(aimedTarget, aimedVision.width, aimedVision.height);
          let { horizontal, vertical, normalized: alignment } = aimAlignment;
          let postInputReacquired = true;
          let twoFrameAligned = false;
          let associationReason = 'initial-confirmed-track';
          const aimTrace = [{
            step: 0,
            phase: 'initial',
            sourceSequence: aimedVision.sourceSequence,
            x: aimedTarget.x,
            y: aimedTarget.y,
            horizontal,
            vertical,
            alignment,
            aligned: aimAlignment.aligned,
            bounds: aimedTarget.bounds,
            pixels: aimedTarget.pixels,
          }];
          for (let aimStep = 0; aimStep < 8 && postInputReacquired && !twoFrameAligned; aimStep += 1) {
            if (aimAlignment.aligned) {
              const verificationStartedAt = performance.now();
              const verificationVision = await waitForPostInputVision(
                visionStream,
                aimedVision.sourceSequence,
                verificationStartedAt,
              );
              if (!verificationVision) {
                postInputReacquired = false;
                alignment = Number.POSITIVE_INFINITY;
                associationReason = 'verification-frame-timeout';
                break;
              }
              const verificationAssociation = associatePurpleOperator(aimedTarget, verificationVision.operatorTargets);
              associationReason = verificationAssociation.reason;
              if (!verificationAssociation.target) {
                postInputReacquired = false;
                alignment = Number.POSITIVE_INFINITY;
                break;
              }
              aimedVision = verificationVision;
              aimedTarget = verificationAssociation.target;
              aimAlignment = operatorCrosshairAlignment(aimedTarget, aimedVision.width, aimedVision.height);
              ({ horizontal, vertical, normalized: alignment } = aimAlignment);
              twoFrameAligned = aimAlignment.aligned;
              aimTrace.push({
                step: aimTrace.length,
                phase: 'causal-alignment-verification',
                commandX: 0,
                commandY: 0,
                sourceSequence: aimedVision.sourceSequence,
                x: aimedTarget.x,
                y: aimedTarget.y,
                horizontal,
                vertical,
                alignment,
                aligned: aimAlignment.aligned,
                associationReason,
                associationScore: verificationAssociation.score,
                associationMargin: verificationAssociation.margin,
                predicted: verificationAssociation.predicted,
                bounds: aimedTarget.bounds,
                pixels: aimedTarget.pixels,
              });
              continue;
            }
            const movementX = Math.max(-90, Math.min(90, Math.round(horizontal * 4.0)));
            const movementY = Math.max(-55, Math.min(55, Math.round(vertical * 4.0)));
            if (movementX === 0 && movementY === 0) break;
            const previousSourceSequence = aimedVision.sourceSequence;
            const previousTarget = aimedTarget;
            await moveAim(page, movementX, movementY);
            const inputCompletedAt = performance.now();
            aimMoves += 1;
            aimServoMoves += 1;
            cameraMovedThisFrame = true;
            const reacquiredVision = await waitForPostInputVision(visionStream, previousSourceSequence, inputCompletedAt);
            if (!reacquiredVision) {
              postInputReacquired = false;
              alignment = Number.POSITIVE_INFINITY;
              associationReason = 'post-input-frame-timeout';
              break;
            }
            if (reacquiredVision.operatorTargets.length === 0) {
              postInputReacquired = false;
              alignment = Number.POSITIVE_INFINITY;
              associationReason = 'post-input-target-missing';
              break;
            }
            const association = associatePurpleOperator(previousTarget, reacquiredVision.operatorTargets, {
              commandX: movementX,
              commandY: movementY,
            });
            associationReason = association.reason;
            if (!association.target) {
              postInputReacquired = false;
              alignment = Number.POSITIVE_INFINITY;
              break;
            }
            aimedVision = reacquiredVision;
            aimedTarget = association.target;
            aimAlignment = operatorCrosshairAlignment(aimedTarget, aimedVision.width, aimedVision.height);
            ({ horizontal, vertical, normalized: alignment } = aimAlignment);
            aimTrace.push({
              step: aimTrace.length,
              phase: 'post-input',
              commandX: movementX,
              commandY: movementY,
              sourceSequence: aimedVision.sourceSequence,
              x: aimedTarget.x,
              y: aimedTarget.y,
              horizontal,
              vertical,
              alignment,
              aligned: aimAlignment.aligned,
              associationReason,
              associationScore: association.score,
              associationMargin: association.margin,
              predicted: association.predicted,
              bounds: aimedTarget.bounds,
              pixels: aimedTarget.pixels,
            });
          }
          if (!firstTargetCaptured) {
            await writeFile(resolve(artifactDirectory, 'first-target.jpg'), vision.jpeg);
            await writeFile(resolve(artifactDirectory, 'first-target-annotated.jpg'), await annotatedVisionJpeg(vision, tracking));
            firstTargetCaptured = true;
            firstTargetAnnotatedCaptured = true;
          }
          const currentlyReloading = Boolean(hud?.reloadActive) || now < reloadSuppressedUntil;
          if (twoFrameAligned && !firstTwoFrameAlignedCaptured) {
            const alignedTracking = { rawTarget: aimedTarget, confirmedTarget: aimedTarget };
            await writeFile(resolve(artifactDirectory, 'first-two-frame-aligned.jpg'), aimedVision.jpeg);
            await writeFile(resolve(artifactDirectory, 'first-two-frame-aligned-annotated.jpg'), await annotatedVisionJpeg(aimedVision, alignedTracking));
            firstTwoFrameAlignedCaptured = true;
          }
          if (allowCombatFire && tracking.fireAuthorized && postInputReacquired && twoFrameAligned && activeMatch && alignment < 0.02
            && !currentlyReloading && now - lastBurstAt >= fireCooldownMs) {
            const shots = Math.max(1, Math.min(burstShots, Number(hud?.ammo ?? burstShots)));
            if (!firstFireCaptured) {
              const fireTracking = { rawTarget: aimedTarget, confirmedTarget: aimedTarget };
              await writeFile(resolve(artifactDirectory, 'first-fire-aligned.jpg'), aimedVision.jpeg);
              await writeFile(resolve(artifactDirectory, 'first-fire-aligned-annotated.jpg'), await annotatedVisionJpeg(aimedVision, fireTracking));
              firstFireCaptured = true;
            }
            await fireBurst(page, shots, alignment < 0.012);
            shotPulses += shots;
            bursts += 1;
            lastBurstAt = now;
            actions.push({
              atMs,
              kind: 'operator-authorized-burst',
              shots,
              alignment,
              crosshairAligned: aimAlignment.aligned,
              twoFrameAligned,
              associationReason,
              trackAge: tracking.age,
              stableFrames: tracking.stableFrames,
              evidenceFrames: tracking.evidenceFrames,
              postInputReacquired,
              aimTrace,
              target: { x: aimedTarget.x, y: aimedTarget.y, pixels: aimedTarget.pixels, bounds: aimedTarget.bounds },
            });
          }
          actions.push({
            atMs,
            kind: 'operator-confirmed-track',
            alignment,
            crosshairAligned: aimAlignment.aligned,
            twoFrameAligned,
            associationReason,
            trackAge: tracking.age,
            stableFrames: tracking.stableFrames,
            evidenceFrames: tracking.evidenceFrames,
            postInputReacquired,
            aimTrace,
            target: { x: aimedTarget.x, y: aimedTarget.y, pixels: aimedTarget.pixels, bounds: aimedTarget.bounds },
            candidates: aimedVision.operatorTargets.length,
          });
        } else {
          const shouldScan = !rawTarget || tracking.reason === 'static-geometry-rejected';
          if (activeMatch && shouldScan && movementCycle % navigationLaneStride === 0) {
            let scanMovement = 0;
            if (minimapThreat && Math.abs(minimapThreat.bearingRadians) >= 0.035) {
              scanMovement = Math.max(-18, Math.min(18, Math.round(minimapThreat.bearingRadians * 42)));
            } else if (!minimapThreat && movementCycle % 2 === 0) {
              const scanDirection = Math.floor(movementCycle / 42) % 2 === 0 ? 1 : -1;
              scanMovement = scanDirection * 10;
            }
            if (scanMovement !== 0) {
              await moveAim(page, scanMovement, 0);
              aimMoves += 1;
              cameraMovedThisFrame = true;
            }
          }
          actions.push({
            atMs,
            kind: rawTarget ? tracking.reason : 'scan',
            legacyCoralCandidates: vision.targets.length,
            operatorCandidates: vision.operatorTargets.length,
            paletteRatio: vision.operatorPaletteRatio,
            trackAge: tracking.age,
            stableFrames: tracking.stableFrames,
            evidenceFrames: tracking.evidenceFrames,
            minimapThreat: minimapThreat ? {
              x: minimapThreat.x,
              y: minimapThreat.y,
              bearingRadians: minimapThreat.bearingRadians,
              distance: minimapThreat.distance,
            } : null,
            target: rawTarget ? { x: rawTarget.x, y: rawTarget.y, pixels: rawTarget.pixels, bounds: rawTarget.bounds } : null,
          });
        }

        if (mode === 'solo' && activeMatch && !fireCheckDone && shotPulses === 0 && args['fire-check']) {
          await firePulse(page, false);
          fireCheckDone = true;
          shotPulses += 1;
          unconfirmedShotPulses += 1;
          actions.push({ atMs, kind: 'mechanical-fire-check' });
        }

        if (activeMatch) {
          if (!rawTarget && lowMotionFrames >= 3) {
            desiredKeys.add('KeyS');
            desiredKeys.add(reactionDirection > 0 ? 'KeyD' : 'KeyA');
            await moveAim(page, reactionDirection > 0 ? 92 : -92, 0);
            aimMoves += 1;
            cameraMovedThisFrame = true;
            stuckRecoveries += 1;
            lowMotionFrames = 0;
            actions.push({ atMs, kind: 'stuck-recovery', visualDifference });
          } else if (now < damageReactionUntil || Number(hud?.health ?? 100) < 35) {
            desiredKeys.add('KeyS');
            desiredKeys.add(reactionDirection > 0 ? 'KeyD' : 'KeyA');
            desiredKeys.add('ShiftLeft');
          } else if (currentTarget) {
            // Hold aim steady before a burst, then make one bounded lateral step
            // while the detector reacquires through ordinary rendered frames.
            if (now - lastBurstAt < 650) desiredKeys.add(movementCycle % 2 === 0 ? 'KeyA' : 'KeyD');
          } else if (rawTarget) {
            // Scan-stop-confirm: remove both camera and translation motion so a
            // static pole/prop cannot masquerade as an independently moving bot.
          } else if (minimapThreat) {
            if (Math.abs(minimapThreat.bearingRadians) < 0.55) desiredKeys.add('KeyW');
            else desiredKeys.add(minimapThreat.bearingRadians > 0 ? 'KeyD' : 'KeyA');
            if (Math.abs(minimapThreat.bearingRadians) < 0.22 && movementCycle % 5 < 2) desiredKeys.add('ShiftLeft');
          } else {
            desiredKeys.add('KeyW');
            if (movementCycle % 12 === 4) desiredKeys.add('KeyA');
            if (movementCycle % 12 === 10) desiredKeys.add('KeyD');
            if (movementCycle % 23 === 17) desiredKeys.add('Space');
          }
          if (!rawTarget && movementCycle % 11 < 2) desiredKeys.add('ShiftLeft');
        }
        const boundedHoldMs = Math.min(maxHoldMs, 350);
        await boundedMovement(page, desiredKeys, boundedHoldMs);
        previousMovementForward = desiredKeys.has('KeyW');
        previousMovementMoved = desiredKeys.size > 0;
        cameraMovedLastFrame = cameraMovedThisFrame;
        movementCycle += 1;
        console.error(`[atomic-player] frame=${vision.sequence} legacyRaw=${vision.targets.length} operator=${vision.operatorTargets.length} confirmed=${currentTarget ? 1 : 0} shots=${shotPulses}`);
        const elapsed = performance.now() - tickStarted;
        await sleep(Math.max(controlSleepMs, tickMs - elapsed));
      }
      controlEndedAtMs = Date.now();
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
      if (matchEndedObserved) {
        await page.screenshot({ path: resolve(artifactDirectory, 'post-game.jpg'), type: 'jpeg', quality: 75 }).catch((error) => {
          browserMessages.push({ type: 'warning', text: `post-game screenshot: ${error.message}` });
        });
        matchSummaryDownload = await downloadVisibleMatchReport(
          page,
          '#download-match-summary',
          resolve(artifactDirectory, 'match-summary.json'),
        ).catch((error) => {
          browserMessages.push({ type: 'warning', text: `match summary download: ${error.message}` });
          return null;
        });
        matchTechnicalDownload = await downloadVisibleMatchReport(
          page,
          '#download-match-diagnostics',
          resolve(artifactDirectory, 'match-technical.json'),
        ).catch((error) => {
          browserMessages.push({ type: 'warning', text: `match technical download: ${error.message}` });
          return null;
        });
      }
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
    const sortedCaptureDurations = [...(visionStream?.state.captureDurationsMs ?? [])].sort((left, right) => left - right);
    const percentileFrom = (values, ratio) => values.length === 0
      ? null
      : values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))];
    await writeFile(resolve(artifactDirectory, 'telemetry.json'), `${JSON.stringify({ schemaVersion: 1, actions }, null, 2)}\n`);
    const candidateArtifacts = Array.from({ length: candidateImagesSaved }, (_, index) => `candidate-${String(index + 1).padStart(2, '0')}.jpg`);
    const damageArtifacts = Array.from({ length: Math.min(3, damageReactions) }, (_, index) => `damage-contact-${String(index + 1).padStart(2, '0')}.jpg`);
    const report = {
      schemaVersion: 2,
      kind: 'atomic-player-benchmark',
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      source: {
        url: scrubUrl(targetUrl.toString()),
        pass,
        gitSha: localHost(targetUrl) ? currentSourceSha() : null,
        harnessGitSha: args['harness-sha'] ? String(args['harness-sha']) : currentSourceSha(),
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
        cdpAttached: Boolean(cdpUrl),
      },
      fairness: {
        perception: args['lifecycle-only'] ? 'none-lifecycle-only' : 'rendered-pixels-purple-operator-geometry-v1-scan-stop-two-frame-confirmation-visible-player-up-minimap-and-hud',
        policyVersion: 'atomic-player-policy-v4-tri-lane',
        automaticCombatFireEnabled: allowCombatFire,
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
        webGlRenderer: rendererInfo,
        visionFrames,
        activeVisionFrames,
        targetFrames: rawTargetFrames,
        rawTargetFrames,
        warmupRawTargetFrames,
        operatorCandidateFrames,
        operatorRedFlashFrames,
        minimapThreatFrames,
        confirmedTargetFrames,
        staticGeometryRejects,
        fireAuthorizedFrames,
        rejectedScreenLockedFrames,
        targetFrameRatio: activeVisionFrames > 0 ? rawTargetFrames / activeVisionFrames : 0,
        confirmedTargetFrameRatio: activeVisionFrames > 0 ? confirmedTargetFrames / activeVisionFrames : 0,
        decisionFps: controlStartedAtMs !== null && controlEndedAtMs > controlStartedAtMs
          ? visionFrames / ((controlEndedAtMs - controlStartedAtMs) / 1000)
          : null,
        tickMs,
        controlSleepMs,
        realtimeProfile,
        agentLanes: {
          scoutPerception: { source: 'latest rendered screencast frame', cadence: 'every control tick' },
          tacticalNavigation: { source: 'visible player-up minimap plus collision recovery', cadenceTicks: navigationLaneStride },
          aimReflex: { source: 'fresh post-input purple-operator frames', maximumCorrectionsPerLock: 4 },
        },
        viewport: { width: viewportWidth, height: viewportHeight },
        visionLoopMs: {
          minimum: sortedVisionDurations[0] ?? null,
          median: percentileFrom(sortedVisionDurations, 0.5),
          p95: percentileFrom(sortedVisionDurations, 0.95),
          maximum: sortedVisionDurations.at(-1) ?? null,
        },
        visionStream: visionStream ? {
          mode: visionStream.state.mode === 'screencast' ? 'cdp-screencast-latest-frame' : 'on-demand-cdp-jpeg',
          requestedMode: requestedCaptureMode,
          receivedFrames: visionStream.state.receivedFrames,
          decodedFrames: visionStream.state.decodedFrames,
          failedFrames: visionStream.state.failedFrames,
          captureMs: {
            minimum: sortedCaptureDurations[0] ?? null,
            median: percentileFrom(sortedCaptureDurations, 0.5),
            p95: percentileFrom(sortedCaptureDurations, 0.95),
            maximum: sortedCaptureDurations.at(-1) ?? null,
          },
          sourceFps: visionStream.state.firstReceivedAt !== null && visionStream.state.latestReceivedAt > visionStream.state.firstReceivedAt
            ? visionStream.state.receivedFrames / ((visionStream.state.latestReceivedAt - visionStream.state.firstReceivedAt) / 1000)
            : null,
        } : null,
      },
      input: {
        aimMoves,
        aimServoMoves,
        shotPulses,
        bursts,
        warmupShotPulses,
        unconfirmedShotPulses,
        reloadRequests,
        stuckRecoveries,
        damageReactions,
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
        matchEndedObserved,
        downloadedSummary: matchSummaryDownload ? {
          suggestedFilename: matchSummaryDownload.suggestedFilename,
          file: 'match-summary.json',
          report: matchSummaryDownload.parsed,
        } : null,
        downloadedTechnical: matchTechnicalDownload ? {
          suggestedFilename: matchTechnicalDownload.suggestedFilename,
          file: 'match-technical.json',
        } : null,
      },
      browser: {
        pageErrors: errors,
        warningOrErrorCount: browserMessages.length,
        messages: browserMessages.slice(0, 50),
      },
      actionsFile: 'telemetry.json',
      actions: actions.slice(-250),
      artifacts: [
        startScreenshotCaptured ? 'start.jpg' : null,
        firstRawTargetCaptured ? 'first-raw-target.jpg' : null,
        firstRawTargetAnnotatedCaptured ? 'first-raw-target-annotated.jpg' : null,
        firstTargetCaptured ? 'first-target.jpg' : null,
        firstTargetAnnotatedCaptured ? 'first-target-annotated.jpg' : null,
        firstTwoFrameAlignedCaptured ? 'first-two-frame-aligned.jpg' : null,
        firstTwoFrameAlignedCaptured ? 'first-two-frame-aligned-annotated.jpg' : null,
        firstFireCaptured ? 'first-fire-aligned.jpg' : null,
        firstFireCaptured ? 'first-fire-aligned-annotated.jpg' : null,
        ...candidateArtifacts,
        ...annotatedCandidateArtifacts,
        ...damageArtifacts,
        finalScreenshotCaptured ? 'final.jpg' : null,
        matchEndedObserved ? 'post-game.jpg' : null,
        matchSummaryDownload ? 'match-summary.json' : null,
        matchTechnicalDownload ? 'match-technical.json' : null,
        'telemetry.json',
      ].filter(Boolean),
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
      && report.browser.pageErrors.length === 0
      && (!waitForMatchEnd || Boolean(matchEndedObserved && matchSummaryDownload && matchTechnicalDownload));
    console.log(JSON.stringify({
      ok,
      reportPath,
      pass: report.source.pass,
      renderProfile: report.performance.observedRenderProfile,
      pointerLock,
      visionFrames,
      rawTargetFrames,
      operatorCandidateFrames,
      confirmedTargetFrames,
      fireAuthorizedFrames,
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
