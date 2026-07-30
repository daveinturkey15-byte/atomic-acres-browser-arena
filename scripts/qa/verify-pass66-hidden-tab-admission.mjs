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
const displayPowerReadySignal = 'PASS66_DISPLAY_POWER_READY';
const displayPowerReleaseSignal = 'PASS66_DISPLAY_POWER_RELEASE';
const displayPowerOwnerTimeoutMs = 5_000;
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

async function waitForProcessExit(process, timeoutMs) {
  if (process.exitCode !== null || process.signalCode !== null) {
    return { code: process.exitCode, signal: process.signalCode };
  }
  return withTimeout(new Promise((resolve) => {
    const onExit = (code, signal) => resolve({ code, signal });
    process.once('exit', onExit);
    if (process.exitCode !== null || process.signalCode !== null) {
      process.off('exit', onExit);
      resolve({ code: process.exitCode, signal: process.signalCode });
    }
  }), timeoutMs, 'display-power owner exit');
}

async function acquireDisplayPowerRequest() {
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Pass66DisplayPowerOwner {
  [DllImport("kernel32.dll")]
  public static extern uint SetThreadExecutionState(uint flags);
}
'@
$continuous = [uint32]::Parse('80000000', [Globalization.NumberStyles]::HexNumber)
$displayRequired = [uint32]2
$previous = [Pass66DisplayPowerOwner]::SetThreadExecutionState($continuous -bor $displayRequired)
if ($previous -eq 0) { throw 'failed to acquire display-required execution state' }
[Console]::Out.WriteLine('${displayPowerReadySignal}')
[Console]::Out.Flush()
try {
  $release = [Console]::In.ReadLine()
  if ($release -ne '${displayPowerReleaseSignal}') { throw 'display-power owner lost its release channel' }
} finally {
  $released = [Pass66DisplayPowerOwner]::SetThreadExecutionState($continuous)
  if ($released -eq 0) { throw 'failed to release display-required execution state' }
}`;
  const owner = spawn('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle',
    'Hidden',
    '-Command',
    script,
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '';
  let stderr = '';
  owner.stdout.setEncoding('utf8');
  owner.stderr.setEncoding('utf8');
  owner.stdout.on('data', (chunk) => { stdout += chunk; });
  owner.stderr.on('data', (chunk) => { stderr += chunk; });
  try {
    await withTimeout(new Promise((resolve, reject) => {
      const inspectReady = () => {
        if (stdout.split(/\r?\n/u).includes(displayPowerReadySignal)) resolve();
      };
      owner.stdout.on('data', inspectReady);
      owner.once('error', reject);
      owner.once('exit', (code, signal) => reject(new Error(
        `display-power owner exited before readiness (code=${code}, signal=${signal}, stderr=${stderr.trim() || 'none'})`,
      )));
      inspectReady();
    }), displayPowerOwnerTimeoutMs, 'display-power owner readiness');
  } catch (error) {
    if (owner.exitCode === null) owner.kill();
    try { await waitForProcessExit(owner, displayPowerOwnerTimeoutMs); } catch { /* termination is already fail-closed */ }
    throw error;
  }
  if (owner.exitCode !== null || owner.signalCode !== null) {
    throw new Error('display-power owner did not remain alive after readiness');
  }
  return { process: owner, stderr: () => stderr };
}

async function releaseDisplayPowerRequest(owner) {
  if (owner.process.exitCode !== null || owner.process.signalCode !== null) {
    throw new Error(`display-power owner exited before explicit release (code=${owner.process.exitCode}, stderr=${owner.stderr().trim() || 'none'})`);
  }
  owner.process.stdin.end(`${displayPowerReleaseSignal}\n`);
  let exit;
  try {
    exit = await waitForProcessExit(owner.process, displayPowerOwnerTimeoutMs);
  } catch (error) {
    if (owner.process.exitCode === null) owner.process.kill();
    try { await waitForProcessExit(owner.process, displayPowerOwnerTimeoutMs); } catch { /* OS drops the request when the owner exits */ }
    throw error;
  }
  if (exit.code !== 0) {
    throw new Error(`display-power owner failed to release cleanly (code=${exit.code}, signal=${exit.signal}, stderr=${owner.stderr().trim() || 'none'})`);
  }
}

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

function bringGateChromeWindowToForeground(processId) {
  if (!Number.isSafeInteger(processId) || processId <= 0) throw new Error(`invalid gate Chrome process id: ${processId}`);
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Pass66GateWindow {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maximumCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint sourceThreadId, uint targetThreadId, bool attach);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  public static IntPtr FindSeedWindow(uint processId) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      uint owner;
      GetWindowThreadProcessId(hWnd, out owner);
      if (owner != processId || !IsWindowVisible(hWnd)) return true;
      int length = GetWindowTextLength(hWnd);
      if (length < 1) return true;
      StringBuilder title = new StringBuilder(length + 1);
      GetWindowText(hWnd, title, title.Capacity);
      if (title.ToString().IndexOf("Pass 66", StringComparison.OrdinalIgnoreCase) < 0) return true;
      found = hWnd;
      return false;
    }, IntPtr.Zero);
    return found;
  }
}
'@
$targetPid = ${processId}
$deadline = [DateTime]::UtcNow.AddSeconds(5)
do {
  [void](Get-Process -Id $targetPid -ErrorAction Stop)
  $handle = [Pass66GateWindow]::FindSeedWindow([uint32]$targetPid)
  if ($handle -ne [IntPtr]::Zero) { break }
  Start-Sleep -Milliseconds 50
} while ([DateTime]::UtcNow -lt $deadline)
if ($handle -eq [IntPtr]::Zero) { throw 'gate Chrome child did not expose a native main window' }
$ownerPid = [uint32]0
$targetThread = [Pass66GateWindow]::GetWindowThreadProcessId($handle, [ref]$ownerPid)
if ($ownerPid -ne $targetPid) { throw 'gate Chrome HWND did not belong to the launched child PID' }
$shell = New-Object -ComObject WScript.Shell
[void]$shell.AppActivate($targetPid)
$foreground = [Pass66GateWindow]::GetForegroundWindow()
$foregroundPid = [uint32]0
$foregroundThread = [Pass66GateWindow]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
$currentThread = [Pass66GateWindow]::GetCurrentThreadId()
$attachedForeground = $foregroundThread -ne 0 -and $foregroundThread -ne $currentThread -and [Pass66GateWindow]::AttachThreadInput($currentThread, $foregroundThread, $true)
$attachedTarget = $targetThread -ne 0 -and $targetThread -ne $currentThread -and [Pass66GateWindow]::AttachThreadInput($currentThread, $targetThread, $true)
try {
  [void][Pass66GateWindow]::ShowWindowAsync($handle, 3)
  [void][Pass66GateWindow]::SetWindowPos($handle, [IntPtr](-1), 0, 0, 1600, 900, 0x0040)
  [void][Pass66GateWindow]::BringWindowToTop($handle)
  [void][Pass66GateWindow]::SetForegroundWindow($handle)
  [void][Pass66GateWindow]::SetActiveWindow($handle)
  [void][Pass66GateWindow]::SetFocus($handle)
  Start-Sleep -Milliseconds 150
  if ([Pass66GateWindow]::GetForegroundWindow() -ne $handle) { throw 'gate Chrome child did not become the OS foreground window' }
} finally {
  if ($attachedTarget) { [void][Pass66GateWindow]::AttachThreadInput($currentThread, $targetThread, $false) }
  if ($attachedForeground) { [void][Pass66GateWindow]::AttachThreadInput($currentThread, $foregroundThread, $false) }
}
if (-not [Pass66GateWindow]::IsWindowVisible($handle) -or [Pass66GateWindow]::IsIconic($handle)) { throw 'gate Chrome child was not visible and restored' }
$handle.ToInt64()`;
  return execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle',
    'Hidden',
    '-Command',
    script,
  ], { encoding: 'utf8', windowsHide: true }).trim();
}

async function documentState(client) {
  return client.evaluate('({visibilityState:document.visibilityState,hasFocus:document.hasFocus()})');
}

async function trustedClick(client, selector) {
  const point = await client.evaluate(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) throw new Error('trusted-click target missing');
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await client.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await client.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
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
  '--window-position=0,0',
  '--window-size=1600,900',
  ...seedUrls,
];
assertHeadedChromeLaunchContract({ headless: false, executablePath, args: chromeArgs, automation: 'direct-cdp', seedUrls });

let chrome;
let browserClient;
let game;
let cover;
let displayPowerOwner = null;
let foregroundWindowHandle = null;
let receipt = null;
const checkpoints = {
  initial: null,
  beforeRelease: null,
  afterCpuProgress: null,
  afterHidden: null,
  recovered: null,
};
try {
  displayPowerOwner = await acquireDisplayPowerRequest();
  chrome = spawn(executablePath, chromeArgs, { stdio: 'ignore', windowsHide: false });
  const discovery = await discoverChrome(port);
  const gameTarget = discovery.targets.find((target) => target.type === 'page' && target.url === seedUrls[0]);
  const coverTarget = discovery.targets.find((target) => target.type === 'page' && target.url === seedUrls[1]);
  if (!gameTarget || !coverTarget) throw new Error('Chrome did not create the two command-line-seeded native tabs');
  browserClient = await CdpClient.connect(discovery.version.webSocketDebuggerUrl);
  game = await CdpClient.connect(gameTarget.webSocketDebuggerUrl);
  cover = await CdpClient.connect(coverTarget.webSocketDebuggerUrl);
  foregroundWindowHandle = bringGateChromeWindowToForeground(chrome.pid);

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
  checkpoints.initial = initial;
  await trustedClick(game, '#solo');
  await withTimeout(assetBarrierObserved, 30_000, 'held first-person weapon CPU asset request');
  await activateTarget(port, coverTarget.id);
  await waitForTabOwnership(game, cover, 'cover', 5_000, 'real cover foreground and game-tab visibility loss');
  const beforeRelease = await sample(game, cover);
  checkpoints.beforeRelease = beforeRelease;
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
  checkpoints.afterCpuProgress = afterCpuProgress;
  await delay(minimumHiddenObservationMs);
  const afterHidden = await sample(game, cover);
  checkpoints.afterHidden = afterHidden;
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
  checkpoints.recovered = recovered;
  const recoveryFailures = recoveredCheckpointFailures({ beforeRelease, afterHidden, recovered, maximumRecoveryMs: maximumForegroundRecoveryMs });
  const fatalErrors = uniqueFatalErrors(errors);
  if (fatalErrors.length > 0) recoveryFailures.push(`browser/GPU errors: ${fatalErrors.join(' | ')}`);
  if (recoveryFailures.length > 0) throw new Error(`foreground checkpoint failed: ${recoveryFailures.join('; ')}`);

  // A successful receipt is impossible unless the scoped power request both
  // remained alive for the complete admission and explicitly reset itself.
  await releaseDisplayPowerRequest(displayPowerOwner);
  displayPowerOwner = null;

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
      foregroundWindowHandle,
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
    partialReceipt: {
      foregroundWindowHandle,
      checkpoints,
    },
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
  try {
    if (displayPowerOwner) await releaseDisplayPowerRequest(displayPowerOwner);
  } finally {
    try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chrome can retain its profile lock briefly */ }
  }
}
