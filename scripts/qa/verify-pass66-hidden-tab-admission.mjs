import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isFatalWebGpuConsoleWarning } from './pass65-browser-console-contract.mjs';
import {
  PASS66_HIDDEN_TAB_GATE_SCHEMA,
  REQUIRED_BACKGROUND_CPU_PHASE,
  REQUIRED_HELD_CPU_ASSET,
  assertHeadedChromeLaunchContract,
  hasExactBrowserWeaponCatalog,
  hiddenCheckpointFailures,
  recoveredCheckpointFailures,
} from './pass66-hidden-tab-contract.mjs';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const maximumHiddenPreparationMs = 30_000;
const minimumHiddenObservationMs = 1_500;
const maximumForegroundRecoveryMs = 20_000;
const artifactRoot = 'artifacts/pass66/hidden-tab-admission';
const chromeCandidates = [
  process.env.PASS66_CHROME_PATH,
  process.env.PASS65_CHROME_PATH,
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 66 hidden-tab admission requires installed Google Chrome');

const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) {
  throw new Error('Pass 66 hidden-tab admission requires a clean tracked worktree');
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function withTimeout(promise, milliseconds, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} did not complete within ${milliseconds}ms`)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

function uniqueFatalErrors(errors) {
  return [...new Set(errors)].filter((message) => !/favicon|leaderboard|Failed to fetch/i.test(message));
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('failed to reserve a Chrome debugging port');
  return port;
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
    socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('CDP socket closed'));
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpClient(socket);
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  command(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, userGesture = false) {
    const response = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? 'Runtime.evaluate failed');
    return response.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function discoverChrome(port) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const [versionResponse, targetsResponse] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/json/version`),
        fetch(`http://127.0.0.1:${port}/json/list`),
      ]);
      if (versionResponse.ok && targetsResponse.ok) {
        return { version: await versionResponse.json(), targets: await targetsResponse.json() };
      }
    } catch {
      // Chrome has not opened the debugging endpoint yet.
    }
    await delay(50);
  }
  throw new Error('installed Chrome did not open its direct CDP endpoint');
}

async function activateTarget(port, targetId) {
  const response = await fetch(`http://127.0.0.1:${port}/json/activate/${targetId}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chrome refused to activate native tab ${targetId}: ${response.status}`);
}

async function documentState(client) {
  return client.evaluate('({visibilityState:document.visibilityState,hasFocus:document.hasFocus()})');
}

async function waitForTabOwnership(game, cover, expected, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = { game: await documentState(game), cover: await documentState(cover) };
    const expectedGame = expected === 'game'
      ? latest.game.visibilityState === 'visible' && latest.game.hasFocus
      : latest.game.visibilityState === 'hidden' && !latest.game.hasFocus;
    const expectedCover = expected === 'cover'
      ? latest.cover.visibilityState === 'visible' && latest.cover.hasFocus
      : latest.cover.visibilityState === 'hidden' && !latest.cover.hasFocus;
    if (expectedGame && expectedCover) return latest;
    await delay(50);
  }
  throw new Error(`${label} did not complete within ${timeoutMs}ms; latest=${JSON.stringify(latest)}`);
}

const snapshotExpression = `(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const state = api.snapshot();
  const transition = state.arenaSelection.streaming.transition;
  return {
    sampledAt: performance.now(),
    document: { visibilityState: document.visibilityState, hasFocus: document.hasFocus() },
    frameCount: state.frameCount,
    gameStarted: state.gameStarted,
    matchPhase: state.matchPhase,
    bootstrap: state.bootstrap,
    presentationScheduling: state.presentationScheduling,
    admission: api.admissionState(),
    presentation: api.samplePresentationTelemetry(),
    runtime: state.render.runtime,
    audio: window.__PASS66_AUDIO_AUDIT__.snapshot(),
    interactiveWorldTick: state.interactiveWorld.tick,
    weaponCatalog: api.sampleWeaponCatalogReadiness(),
    assetResources: performance.getEntriesByType('resource')
      .filter((entry) => entry.name.includes('${REQUIRED_HELD_CPU_ASSET}'))
      .map((entry) => ({
        name: new URL(entry.name, location.href).pathname,
        startTime: entry.startTime,
        responseEnd: entry.responseEnd,
        duration: entry.duration,
        decodedBodySize: 'decodedBodySize' in entry ? entry.decodedBodySize : null,
      })),
    streaming: {
      constructionCount: state.arenaSelection.streaming.constructionCount,
      constructionHistory: state.arenaSelection.streaming.constructionHistory,
      constructedArenaIds: state.arenaSelection.streaming.constructedArenaIds,
      residentArenaRoots: state.arenaSelection.streaming.residentArenaRoots,
      activeRoots: state.arenaSelection.activeRoots,
    },
    transition: {
      generation: transition.generation,
      phase: transition.phase,
      failure: transition.failure,
      renderSubmissionPaused: transition.renderSubmissionPaused,
      profile: transition.profile,
    },
  };
})()`;

async function sample(game, cover) {
  const checkpoint = await game.evaluate(snapshotExpression);
  checkpoint.coverDocument = await documentState(cover);
  return checkpoint;
}

async function waitForNodeSample(game, cover, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await sample(game, cover);
    if (predicate(latest)) return latest;
    await delay(100);
  }
  throw new Error(`${label} did not complete within ${timeoutMs}ms; latest=${JSON.stringify(latest)}`);
}

function audioAuditInit() {
  const NativeAudioContext = window.AudioContext;
  const contexts = [];
  const audit = { suspendCalls: 0, resumeCalls: 0 };
  const nativeSuspend = NativeAudioContext.prototype.suspend;
  const nativeResume = NativeAudioContext.prototype.resume;
  NativeAudioContext.prototype.suspend = function trackedSuspend(...args) {
    audit.suspendCalls += 1;
    return nativeSuspend.apply(this, args);
  };
  NativeAudioContext.prototype.resume = function trackedResume(...args) {
    audit.resumeCalls += 1;
    return nativeResume.apply(this, args);
  };
  function TrackedAudioContext(...args) {
    const context = new NativeAudioContext(...args);
    contexts.push(context);
    return context;
  }
  Object.setPrototypeOf(TrackedAudioContext, NativeAudioContext);
  TrackedAudioContext.prototype = NativeAudioContext.prototype;
  Object.defineProperty(window, 'AudioContext', { configurable: true, value: TrackedAudioContext });
  Object.defineProperty(window, '__PASS66_AUDIO_AUDIT__', {
    configurable: false,
    value: {
      snapshot: () => ({
        contexts: contexts.map((context) => ({ state: context.state, sampleRate: context.sampleRate })),
        suspendCalls: audit.suspendCalls,
        resumeCalls: audit.resumeCalls,
      }),
    },
  });
}

await mkdir(artifactRoot, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'atomic-acres-pass66-hidden-tab-'));
const gameSeedPath = join(profile, 'pass66-game-tab.html');
const coverSeedPath = join(profile, 'pass66-cover-tab.html');
await writeFile(gameSeedPath, '<!doctype html><title>Pass 66 game tab seed</title>', 'utf8');
await writeFile(coverSeedPath, '<!doctype html><title>Pass 66 hidden-tab cover</title><main>Pass 66 background-throttling probe</main>', 'utf8');
const seedUrls = [pathToFileURL(gameSeedPath).href, pathToFileURL(coverSeedPath).href];
const port = await availablePort();
const chromeArgs = [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--enable-unsafe-webgpu',
  '--no-first-run',
  '--no-default-browser-check',
  ...seedUrls,
];
assertHeadedChromeLaunchContract({ headless: false, executablePath, args: chromeArgs, automation: 'direct-cdp', seedUrls });

let chrome;
let browserClient;
let game;
let cover;
let receipt = null;
try {
  chrome = spawn(executablePath, chromeArgs, { stdio: 'ignore', windowsHide: false });
  const discovery = await discoverChrome(port);
  const gameTarget = discovery.targets.find((target) => target.type === 'page' && target.url === seedUrls[0]);
  const coverTarget = discovery.targets.find((target) => target.type === 'page' && target.url === seedUrls[1]);
  if (!gameTarget || !coverTarget) throw new Error('Chrome did not create the two command-line-seeded native tabs');
  browserClient = await CdpClient.connect(discovery.version.webSocketDebuggerUrl);
  game = await CdpClient.connect(gameTarget.webSocketDebuggerUrl);
  cover = await CdpClient.connect(coverTarget.webSocketDebuggerUrl);

  const errors = [];
  let heldAssetRequests = 0;
  let heldAssetReleased = false;
  const heldRequestIds = [];
  let observeAssetBarrier;
  const assetBarrierObserved = new Promise((resolve) => { observeAssetBarrier = resolve; });
  const recordAsyncError = (error) => errors.push(error instanceof Error ? error.message : String(error));

  game.on('Runtime.exceptionThrown', ({ exceptionDetails }) => errors.push(exceptionDetails?.text ?? 'runtime exception'));
  game.on('Runtime.consoleAPICalled', ({ type, args }) => {
    const text = args?.map((argument) => argument.value ?? argument.description ?? '').join(' ') ?? '';
    if (type === 'error' || type === 'warning' && isFatalWebGpuConsoleWarning(text)) errors.push(text);
  });
  game.on('Log.entryAdded', ({ entry }) => {
    if (entry?.level === 'error') errors.push(entry.text);
  });
  game.on('Fetch.requestPaused', (event) => {
    void (async () => {
      const url = event.request.url;
      if (url.includes(REQUIRED_HELD_CPU_ASSET)) {
        heldAssetRequests += 1;
        if (heldAssetReleased) await game.command('Fetch.continueRequest', { requestId: event.requestId });
        else {
          heldRequestIds.push(event.requestId);
          observeAssetBarrier();
        }
        return;
      }
      if (url.startsWith('https://fonts.googleapis.com/')) {
        await game.command('Fetch.fulfillRequest', {
          requestId: event.requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/css' }],
          body: '',
        });
        return;
      }
      if (url.includes('/v1/leaderboard?') || url.includes('/v1/streak')) {
        const streak = url.includes('/v1/streak');
        await game.command('Fetch.fulfillRequest', {
          requestId: event.requestId,
          responseCode: streak ? 202 : 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(streak ? { accepted: true } : { entries: [] })).toString('base64'),
        });
        return;
      }
      await game.command('Fetch.continueRequest', { requestId: event.requestId });
    })().catch(recordAsyncError);
  });

  await Promise.all([
    game.command('Runtime.enable'),
    game.command('Log.enable'),
    game.command('Page.enable'),
    game.command('Page.addScriptToEvaluateOnNewDocument', { source: `(${audioAuditInit.toString()})();` }),
    game.command('Fetch.enable', { patterns: [
      { urlPattern: 'https://fonts.googleapis.com/*' },
      { urlPattern: '*/v1/leaderboard?*' },
      { urlPattern: '*/v1/streak*' },
      { urlPattern: `*${REQUIRED_HELD_CPU_ASSET}*` },
    ] }),
    cover.command('Runtime.enable'),
  ]);

  const url = new URL(baseUrl);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('externalServices', 'off');
  url.searchParams.set('render', 'blender');
  url.searchParams.set('map', 'atomic-acres');
  url.searchParams.set('seed', '660152');
  await activateTarget(port, gameTarget.id);
  await waitForTabOwnership(game, cover, 'game', 5_000, 'initial real game-tab ownership');
  await game.command('Page.navigate', { url: url.toString() });
  const readyDeadline = Date.now() + 60_000;
  while (Date.now() < readyDeadline) {
    try {
      const ready = await game.evaluate(`(() => {
        const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return state?.bootstrap.stage === 'ready'
          && state?.render.runtime.actualBackend === 'webgpu'
          && state?.render.runtime.softwareAdapter === false
          && state?.arenaSelection.streaming.constructionCount === 0;
      })()`);
      if (ready) break;
    } catch {
      // The app has not installed its debug surface yet.
    }
    await delay(100);
  }
  if (Date.now() >= readyDeadline) throw new Error('Pass 66 game bootstrap did not become ready within 60000ms');
  await game.evaluate(`(() => {
    const input = document.querySelector('#player-name');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'Pass 66 Hidden Tab QA');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`, true);
  const initial = await sample(game, cover);
  await game.evaluate(`document.querySelector('#solo').click()`, true);
  await withTimeout(assetBarrierObserved, 30_000, 'held first-person weapon CPU asset request');
  await activateTarget(port, coverTarget.id);
  await waitForTabOwnership(game, cover, 'cover', 5_000, 'real cover foreground and game-tab visibility loss');
  const beforeRelease = await sample(game, cover);
  heldAssetReleased = true;
  await Promise.all(heldRequestIds.splice(0).map((requestId) => game.command('Fetch.continueRequest', { requestId })));
  const afterCpuProgress = await waitForNodeSample(game, cover, (checkpoint) => (
    checkpoint.document.visibilityState === 'hidden'
    && checkpoint.coverDocument.visibilityState === 'visible'
    && checkpoint.coverDocument.hasFocus
    && checkpoint.assetResources.length >= 1
    && hasExactBrowserWeaponCatalog(checkpoint)
    && checkpoint.transition.profile?.phases.some((entry) => entry.phase === REQUIRED_BACKGROUND_CPU_PHASE)
  ), maximumHiddenPreparationMs, 'hidden fetch/decode/CPU preparation');
  await delay(minimumHiddenObservationMs);
  const afterHidden = await sample(game, cover);
  const hiddenFailures = hiddenCheckpointFailures({ beforeRelease, afterHidden, heldAssetRequests });
  if (hiddenFailures.length > 0) throw new Error(`hidden checkpoint failed: ${hiddenFailures.join('; ')}`);

  const foregroundStartedAt = Date.now();
  await activateTarget(port, gameTarget.id);
  await waitForTabOwnership(game, cover, 'game', 5_000, 'real game-tab foreground recovery');
  const recovered = await waitForNodeSample(game, cover, (checkpoint) => (
    checkpoint.document.visibilityState === 'visible'
    && checkpoint.document.hasFocus
    && checkpoint.gameStarted
    && checkpoint.admission.presentedGameplayFrame >= 1
    && checkpoint.transition.phase === 'idle'
    && checkpoint.presentation.status === 'healthy'
    && checkpoint.audio.contexts.length === 1
    && checkpoint.audio.contexts.every((context) => context.state === 'running')
  ), maximumForegroundRecoveryMs, 'foreground match recovery');
  recovered.foregroundRecoveryMs = Date.now() - foregroundStartedAt;
  const recoveryFailures = recoveredCheckpointFailures({ beforeRelease, afterHidden, recovered, maximumRecoveryMs: maximumForegroundRecoveryMs });
  const fatalErrors = uniqueFatalErrors(errors);
  if (fatalErrors.length > 0) recoveryFailures.push(`browser/GPU errors: ${fatalErrors.join(' | ')}`);
  if (recoveryFailures.length > 0) throw new Error(`foreground checkpoint failed: ${recoveryFailures.join('; ')}`);

  receipt = {
    schema: PASS66_HIDDEN_TAB_GATE_SCHEMA,
    gate: 'pass66-real-headed-chrome-hidden-tab-admission',
    verdict: 'pass',
    checkedAt: new Date().toISOString(),
    sourceRevision,
    browser: {
      executablePath,
      version: discovery.version.Browser,
      headed: true,
      automation: 'direct-cdp',
      launchArgs: chromeArgs.map((argument) => argument.startsWith('--user-data-dir=') ? '--user-data-dir=<isolated-temp-profile>' : argument),
      backgroundThrottlingBypassFlags: [],
    },
    contract: { heldAsset: REQUIRED_HELD_CPU_ASSET, heldAssetRequests, minimumHiddenObservationMs, maximumHiddenPreparationMs, maximumForegroundRecoveryMs },
    initial,
    beforeRelease,
    afterCpuProgress,
    afterHidden,
    recovered,
    errors: fatalErrors,
  };
  await writeFile(`${artifactRoot}/exact-sha-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    pass: true,
    sourceRevision,
    browserVersion: discovery.version.Browser,
    hiddenCpuPhase: afterCpuProgress.transition.profile?.phases.at(-1)?.phase ?? null,
    hiddenRetainedWeaponIds: afterCpuProgress.weaponCatalog.retained,
    hiddenSubmissionAdvance: afterHidden.presentation.submissionSequence - beforeRelease.presentation.submissionSequence,
    foregroundRecoveryMs: recovered.foregroundRecoveryMs,
    receipt: `${artifactRoot}/exact-sha-receipt.json`,
  }, null, 2));
} catch (error) {
  await writeFile(`${artifactRoot}/failure-receipt.json`, `${JSON.stringify({
    schema: PASS66_HIDDEN_TAB_GATE_SCHEMA,
    gate: 'pass66-real-headed-chrome-hidden-tab-admission',
    verdict: 'fail',
    checkedAt: new Date().toISOString(),
    sourceRevision,
    executablePath,
    partialReceipt: receipt,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  game?.close();
  cover?.close();
  if (browserClient) {
    try { await browserClient.command('Browser.close'); } catch { /* browser closes the socket before acknowledging on some Chrome builds */ }
    browserClient.close();
  }
  if (chrome?.exitCode === null) {
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(2_000)]);
    if (chrome.exitCode === null) chrome.kill();
  }
  try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chrome can retain its profile lock briefly */ }
}
