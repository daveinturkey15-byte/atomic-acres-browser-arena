import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import {
  PASS71_NATIVE_BROWSER_PARITY,
  assertPass71NativeBrowserParityReceipt,
  pass71NativeBrowserParityFailures,
  summarizePass71FrameWindow,
} from './pass71-native-browser-parity-contract.mjs';

const root = path.resolve(process.cwd());
const contract = PASS71_NATIVE_BROWSER_PARITY;
const previewPort = boundedPort('PASS71_PARITY_PREVIEW_PORT', 4_561);
const driverPort = boundedPort('PASS71_PARITY_GECKODRIVER_PORT', 4_469);
const chromeExecutable = requireExecutable([
  process.env.PASS71_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
], 'installed Google Chrome');
const firefoxExecutable = requireExecutable([
  process.env.PASS71_FIREFOX_PATH,
  'C:/Program Files/Mozilla Firefox/firefox.exe',
  'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
], 'installed Mozilla Firefox');
const geckodriverExecutable = requireExecutable([
  process.env.PASS71_GECKODRIVER_PATH,
  path.resolve(root, 'artifacts/geckodriver-pass71/geckodriver.exe'),
  path.resolve(root, '../atomic-acres-pass71-perception-firefox/artifacts/geckodriver-pass71/geckodriver.exe'),
], 'GeckoDriver (set PASS71_GECKODRIVER_PATH)');
const sourceSha = git('rev-parse', 'HEAD');
const sourceTree = git('rev-parse', 'HEAD^{tree}');
const sourceBranch = git('branch', '--show-current');
const sourceStatusBefore = git('status', '--porcelain', '--untracked-files=all');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'atomic-acres-pass71-native-parity-'));
const distRoot = path.join(temporaryRoot, 'dist');
const chromeProfile = path.join(temporaryRoot, 'chrome-profile');
const firefoxProfileRoot = path.join(temporaryRoot, 'firefox-profiles');
const artifactRoot = path.resolve(root, 'artifacts/pass71/native-browser-parity');
const receiptPath = path.join(artifactRoot, `${sourceSha}-receipt.json`);
const route = new URL(`http://127.0.0.1:${previewPort}/`);
for (const [key, value] of Object.entries({
  release: 'latest',
  renderer: 'webgl2',
  render: 'blender',
  map: 'atomic-acres',
  seed: 'pass71-native-parity-v1',
  externalServices: 'off',
})) route.searchParams.set(key, value);
const requestedRoute = route.toString();

let viteServer = null;
let firefoxDriver = null;
let receipt = null;
let failure = null;

function boundedPort(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1_024 || value > 65_535) throw new Error(`${name} must be an integer port from 1024 through 65535`);
  return value;
}

function requireExecutable(candidates, label) {
  const value = candidates.filter(Boolean).map((candidate) => path.resolve(candidate)).find((candidate) => existsSync(candidate));
  if (!value) throw new Error(`Pass 71 native parity requires ${label}`);
  return value;
}

function git(...arguments_) {
  return execFileSync('git', arguments_, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  return sha256(readFileSync(file));
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function poll(label, sample, predicate, timeoutMs, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      last = await sample();
      lastError = null;
      if (predicate(last)) return last;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw new Error(`${label} timed out: ${lastError instanceof Error ? lastError.message : JSON.stringify(last)}`);
}

function listenerPresent(port) {
  return new Promise((resolveListener) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (present) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveListener(present);
    };
    socket.setTimeout(300);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function collectBuildFiles(directory, relative = '') {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const childAbsolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectBuildFiles(childAbsolute, childRelative));
    else if (entry.isFile()) {
      const bytes = await readFile(childAbsolute);
      files.push({ path: childRelative.replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  return files;
}

async function stopViteServer() {
  if (!viteServer?.httpServer?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    viteServer.httpServer.close((error) => error ? rejectClose(error) : resolveClose());
    viteServer.httpServer.closeAllConnections?.();
  });
}

function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => { child.removeListener('exit', onExit); resolveExit(false); }, timeoutMs);
    const onExit = () => { clearTimeout(timer); resolveExit(true); };
    child.once('exit', onExit);
  });
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const graceful = waitForExit(child, 5_000);
  child.kill('SIGTERM');
  if (!await graceful) {
    const forced = waitForExit(child, 2_000);
    child.kill('SIGKILL');
    if (!await forced) throw new Error(`Owned process ${child.pid ?? 'unknown'} did not exit`);
  }
}

async function configureCanonicalGraphics(adapter) {
  await adapter.navigate(requestedRoute);
  await poll(`${adapter.name} warm bootstrap`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state ? { stage: state.bootstrap?.stage, error: state.bootstrap?.error } : null;
  `), (value) => value?.stage === 'ready' && value.error == null, 90_000);
  const configured = await adapter.evaluate(`
    const key = 'atomic-acres.player-profile.v1';
    const serialized = localStorage.getItem(key);
    if (!serialized) throw new Error('Canonical player profile was not created');
    const profile = JSON.parse(serialized);
    const graphics = profile?.settings?.graphics;
    if (!graphics) throw new Error('Canonical graphics profile is unavailable');
    Object.assign(graphics, {
      schemaVersion: 1,
      preset: 'custom',
      renderScale: 1,
      adaptiveResolution: false,
      targetFps: 240,
      frameRateLimit: 0,
      antiAliasing: 'msaa-4x',
      geometryDetail: 'full',
    });
    profile.revision = Number(profile.revision) + 1;
    localStorage.setItem(key, JSON.stringify(profile));
    return { preset: graphics.preset, renderScale: graphics.renderScale, adaptiveResolution: graphics.adaptiveResolution,
      targetFps: graphics.targetFps, frameRateLimit: graphics.frameRateLimit, antiAliasing: graphics.antiAliasing,
      geometryDetail: graphics.geometryDetail };
  `);
  const expected = {
    preset: 'custom', renderScale: 1, adaptiveResolution: false, targetFps: 240,
    frameRateLimit: 0, antiAliasing: 'msaa-4x', geometryDetail: 'full',
  };
  if (Object.entries(expected).some(([key, value]) => configured?.[key] !== value)) {
    throw new Error(`${adapter.name} canonical profile write failed: ${JSON.stringify(configured)}`);
  }
  await adapter.navigate(requestedRoute);
}

async function installFaultProbe(adapter) {
  await adapter.evaluate(`
    const probe = { errors: [], consoleErrors: [] };
    addEventListener('error', (event) => probe.errors.push({ kind: 'error', message: event.message || 'unknown' }));
    addEventListener('unhandledrejection', (event) => probe.errors.push({ kind: 'unhandledrejection', message: String(event.reason) }));
    const prior = console.error.bind(console);
    console.error = (...args) => { probe.consoleErrors.push(args.map(String).join(' ')); prior(...args); };
    window.__PASS71_PARITY_FAULTS__ = probe;
    return true;
  `);
}

async function stageScene(adapter) {
  await poll(`${adapter.name} canonical menu`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state ? { stage: state.bootstrap?.stage, error: state.bootstrap?.error, weaponReady: state.weaponReady,
      soloEnabled: document.querySelector('#solo')?.disabled === false, arena: state.arenaSelection?.id,
      backend: state.render?.runtime?.actualBackend } : null;
  `), (value) => value?.stage === 'ready' && value.error == null && value.weaponReady === true
    && value.soloEnabled === true && value.arena === 'atomic-acres' && value.backend === 'webgl2', 90_000);
  await installFaultProbe(adapter);
  await adapter.evaluate(`window.__ATOMIC_ACRES_DEBUG__.startSolo(); return true;`);
  await poll(`${adapter.name} active Atomic Acres`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state ? { gameStarted: state.gameStarted, phase: state.matchPhase, arena: state.arenaSelection?.id,
      botCount: state.bots?.length, quality: state.render?.qualityAssetStreaming?.atomicAcres,
      frame: state.frameCount, focused: document.hasFocus(), visible: document.visibilityState } : null;
  `), (value) => value?.gameStarted === true && value.phase === 'active' && value.arena === 'atomic-acres'
    && value.botCount === 1 && value.frame > 2 && value.focused === true && value.visible === 'visible', 90_000);
  const staged = await adapter.evaluate(`
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.teleportPlayer(22, 1.7, -39, 2.628, 0);
    debug.setBotsFrozen(true);
    debug.setBotPresentation('stand', 0);
    const bot = debug.placeBotAhead(6);
    if (!bot) throw new Error('Unable to stage the parity bot');
    return bot;
  `);
  await poll(`${adapter.name} quality assets`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return { quality: state?.render?.qualityAssetStreaming?.atomicAcres, profile: state?.render?.profile,
      representation: state?.render?.representation, frame: state?.frameCount };
  `), (value) => value?.quality === 'ready' && value.profile === 'blender'
    && value.representation === 'blender' && value.frame > 10, 90_000);
  return staged;
}

async function startFrameProbe(adapter) {
  await adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    if (!state) throw new Error('Debug snapshot unavailable');
    const startedAt = performance.now();
    const probe = { active: true, startedAt, lastAt: null, intervalsMs: [], startingGameFrame: state.frameCount };
    window.__PASS71_PARITY_FRAME_PROBE__ = probe;
    const tick = (now) => {
      if (!probe.active) return;
      if (probe.lastAt !== null) probe.intervalsMs.push(now - probe.lastAt);
      probe.lastAt = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  `);
}

async function stopFrameProbe(adapter) {
  const raw = await adapter.evaluate(`
    const probe = window.__PASS71_PARITY_FRAME_PROBE__;
    if (!probe) throw new Error('Frame probe unavailable');
    probe.active = false;
    const endedAt = performance.now();
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { elapsedMs: endedAt - probe.startedAt, intervalsMs: probe.intervalsMs,
      gameFrameDelta: state.frameCount - probe.startingGameFrame };
  `);
  return { ...summarizePass71FrameWindow(raw.intervalsMs, raw.elapsedMs), gameFrameDelta: raw.gameFrameDelta, intervalsMs: raw.intervalsMs };
}

async function auditBrowser(adapter, staged, browserEventFaults) {
  const evidence = await adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const graphics = state.settings.graphics;
    const requested = state.settings.requested.graphics;
    const watchdog = state.render.playableScene.renderWatchdog;
    const faults = window.__PASS71_PARITY_FAULTS__ ?? { errors: [], consoleErrors: [] };
    const round = (values) => values.map((value) => Number(Number(value).toFixed(4)));
    return {
      route: location.href,
      viewport: { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio },
      scene: {
        arenaId: state.arenaSelection.id, gameStarted: state.gameStarted, matchPhase: state.matchPhase,
        botCount: state.bots.length, qualityAssetState: state.render.qualityAssetStreaming.atomicAcres,
        player: { position: round(state.player.position), yaw: Number(state.player.yaw.toFixed(4)) },
        bot: { position: round(state.bots[0].position), yaw: Number(state.bots[0].rootYaw.toFixed(4)) },
      },
      runtime: state.render.runtime,
      webglVersion: state.render.webglVersion,
      graphics: { ...graphics, geometryDetail: requested.geometryDetail },
      principalHdrSamples: state.render.atomicSignal.principalHdrSamples,
      faults: {
        bootstrapError: state.bootstrap.error ?? null,
        runtimeErrorLog: document.querySelector('#runtime-error-log')?.textContent?.trim() ?? '',
        fatalErrorVisible: document.querySelector('#runtime-error')?.hidden === false,
        capturedErrors: [...faults.errors, ...faults.consoleErrors.map((message) => ({ kind: 'console-error', message }))],
        watchdogStatus: watchdog.status,
        watchdogIncidents: watchdog.incidents,
        contextLosses: state.render.contextLifecycle.losses,
        documentVisible: document.visibilityState === 'visible',
        documentFocused: document.hasFocus(),
      },
      userAgent: navigator.userAgent,
      adapterLabel: state.render.runtime.adapterLabel,
      drawingBuffer: state.render.drawingBuffer,
    };
  `);
  evidence.scene.seed = 'pass71-native-parity-v1';
  evidence.scene.staging = 'frozen-one-bot-ahead-v1';
  evidence.scene.botsFrozen = staged?.contract === 'debug-place-bot-ahead-synchronous-transaction-v1';
  evidence.scene.signature = JSON.stringify({ player: evidence.scene.player, bot: evidence.scene.bot });
  evidence.faults.capturedErrors.push(...browserEventFaults);
  return evidence;
}

async function exerciseBrowser(adapter, identity, browserEventFaults = []) {
  await adapter.focusAndSize();
  await configureCanonicalGraphics(adapter);
  await adapter.focusAndSize();
  const staged = await stageScene(adapter);
  const settledAt = Date.now();
  await poll(`${adapter.name} settle`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return { elapsed: Date.now() - ${settledAt}, frame: state?.frameCount, visible: document.visibilityState, focused: document.hasFocus() };
  `), (value) => value?.elapsed >= contract.settleMs && value.frame > 30
    && value.visible === 'visible' && value.focused === true, contract.settleMs + 15_000, 200);
  await startFrameProbe(adapter);
  await poll(`${adapter.name} ${contract.targetWindowMs}ms frame window`, () => adapter.evaluate(`
    const probe = window.__PASS71_PARITY_FRAME_PROBE__;
    return probe ? { elapsed: performance.now() - probe.startedAt, samples: probe.intervalsMs.length,
      visible: document.visibilityState, focused: document.hasFocus() } : null;
  `), (value) => value?.elapsed >= contract.targetWindowMs && value.samples >= 120
    && value.visible === 'visible' && value.focused === true, contract.maximumWindowMs + 15_000, 100);
  const performance = await stopFrameProbe(adapter);
  const evidence = await auditBrowser(adapter, staged, browserEventFaults);
  return {
    name: adapter.name,
    identity,
    requestedRoute,
    route: evidence.route,
    viewport: evidence.viewport,
    scene: evidence.scene,
    runtime: evidence.runtime,
    webglVersion: evidence.webglVersion,
    graphics: evidence.graphics,
    principalHdrSamples: evidence.principalHdrSamples,
    adapterLabel: evidence.adapterLabel,
    drawingBuffer: evidence.drawingBuffer,
    userAgent: evidence.userAgent,
    headed: true,
    warmCache: true,
    settleMs: Date.now() - settledAt - performance.elapsedMs,
    performance,
    faults: evidence.faults,
  };
}

class GeckoAdapter {
  constructor() {
    this.name = 'firefox';
    this.endpoint = `http://127.0.0.1:${driverPort}`;
    this.sessionId = null;
    this.capabilities = null;
    this.output = '';
  }

  async request(method, routePath, body, timeoutMs = 30_000) {
    const response = await fetch(`${this.endpoint}${routePath}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.value?.error) throw new Error(`Firefox WebDriver ${method} ${routePath} failed (${response.status}): ${payload?.value?.message ?? JSON.stringify(payload)}`);
    return payload?.value;
  }

  sessionRoute(suffix = '') {
    if (!this.sessionId) throw new Error('Firefox session is unavailable');
    return `/session/${this.sessionId}${suffix}`;
  }

  async start() {
    await mkdir(firefoxProfileRoot, { recursive: true });
    this.process = spawn(geckodriverExecutable, ['--host', '127.0.0.1', '--port', String(driverPort), '--profile-root', firefoxProfileRoot, '--log', 'info'], {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    const retain = (chunk) => { this.output = `${this.output}${String(chunk)}`.slice(-32_768); };
    this.process.stdout.on('data', retain);
    this.process.stderr.on('data', retain);
    await poll('GeckoDriver startup', () => this.request('GET', '/status', undefined, 1_000).catch(() => null), (value) => value?.ready === true, 20_000, 100);
    const created = await this.request('POST', '/session', { capabilities: { alwaysMatch: {
      browserName: 'firefox', acceptInsecureCerts: false, pageLoadStrategy: 'normal',
      'moz:firefoxOptions': {
        binary: firefoxExecutable,
        prefs: {
          'browser.shell.checkDefaultBrowser': false,
          'browser.startup.page': 0,
          'datareporting.policy.dataSubmissionEnabled': false,
          'toolkit.telemetry.reportingpolicy.firstRun': false,
          'gfx.webrender.all': true,
          'gfx.webrender.force-disabled': false,
          'gfx.webrender.software': false,
          'layers.acceleration.disabled': false,
          'webgl.disabled': false,
        },
      },
    } } }, 60_000);
    this.sessionId = created?.sessionId;
    this.capabilities = created?.capabilities;
    if (!this.sessionId || this.capabilities?.browserName !== 'firefox' || this.capabilities?.['moz:headless'] === true) throw new Error(`Firefox returned invalid headed capabilities: ${JSON.stringify(created)}`);
    await this.request('POST', this.sessionRoute('/timeouts'), { implicit: 0, pageLoad: 90_000, script: 30_000 });
  }

  async navigate(url) {
    await this.request('POST', this.sessionRoute('/url'), { url }, 90_000);
  }

  async evaluate(script) {
    return this.request('POST', this.sessionRoute('/execute/sync'), { script, args: [] }, 45_000);
  }

  async focusAndSize() {
    await this.request('POST', this.sessionRoute('/window/rect'), { x: 0, y: 0, width: 1_920, height: 1_080 });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const inner = await this.evaluate('window.focus(); return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio };');
      if (inner.width === contract.viewport.width && inner.height === contract.viewport.height) return;
      const rect = await this.request('GET', this.sessionRoute('/window/rect'));
      await this.request('POST', this.sessionRoute('/window/rect'), {
        x: 0, y: 0,
        width: rect.width + contract.viewport.width - inner.width,
        height: rect.height + contract.viewport.height - inner.height,
      });
    }
    const inner = await this.evaluate('window.focus(); return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio };');
    if (inner.width !== contract.viewport.width || inner.height !== contract.viewport.height) throw new Error(`Firefox viewport could not be normalized: ${JSON.stringify(inner)}`);
  }

  identity() {
    return {
      executablePath: firefoxExecutable,
      executableSha256: sha256File(firefoxExecutable),
      version: this.capabilities?.browserVersion ?? null,
      processId: this.capabilities?.['moz:processID'] ?? null,
      profile: this.capabilities?.['moz:profile'] ?? null,
      geckodriver: {
        executablePath: geckodriverExecutable,
        executableSha256: sha256File(geckodriverExecutable),
        version: this.capabilities?.['moz:geckodriverVersion'] ?? execFileSync(geckodriverExecutable, ['--version'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/u)[0],
      },
    };
  }

  async stop() {
    if (this.sessionId) await this.request('DELETE', this.sessionRoute(), undefined, 15_000).catch(() => undefined);
    this.sessionId = null;
    await stopChild(this.process);
    if (await listenerPresent(driverPort)) throw new Error('Owned GeckoDriver listener remained after cleanup');
  }
}

async function runChrome() {
  await mkdir(chromeProfile, { recursive: true });
  const eventFaults = [];
  const context = await chromium.launchPersistentContext(chromeProfile, {
    headless: false,
    executablePath: chromeExecutable,
    viewport: contract.viewport,
    deviceScaleFactor: 1,
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--force-device-scale-factor=1',
      '--window-position=0,0',
      '--window-size=1920,1080',
    ],
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    page.on('pageerror', (error) => eventFaults.push({ kind: 'pageerror', message: error.message }));
    page.on('crash', () => eventFaults.push({ kind: 'page-crash', message: 'renderer crashed' }));
    const adapter = {
      name: 'chrome',
      navigate: (url) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }),
      evaluate: (script) => page.evaluate((source) => Function(source)(), script),
      focusAndSize: async () => { await page.bringToFront(); },
    };
    return await exerciseBrowser(adapter, {
      executablePath: chromeExecutable,
      executableSha256: sha256File(chromeExecutable),
      version: context.browser()?.version() ?? null,
      processId: null,
    }, eventFaults);
  } finally {
    await context.close();
  }
}

async function runFirefox() {
  firefoxDriver = new GeckoAdapter();
  await firefoxDriver.start();
  try {
    return await exerciseBrowser(firefoxDriver, firefoxDriver.identity());
  } finally {
    await firefoxDriver.stop();
    firefoxDriver = null;
  }
}

async function main() {
  if (previewPort === driverPort || await listenerPresent(previewPort) || await listenerPresent(driverPort)) throw new Error('Pass 71 native parity requires two distinct unbound owned ports');
  if (!/^[a-f0-9]{40}$/u.test(sourceSha) || !/^[a-f0-9]{40}$/u.test(sourceTree) || sourceStatusBefore) throw new Error('Pass 71 native parity requires one completely clean exact source SHA');
  const viteOverrides = ['.env', '.env.local', '.env.production.local'].filter((value) => existsSync(path.resolve(root, value)));
  if (viteOverrides.length > 0) throw new Error(`Pass 71 native parity rejects local Vite overrides: ${viteOverrides.join(', ')}`);
  process.env.VITE_MATCH_BUILD_ID = sourceSha;
  await build({ root, mode: 'production', logLevel: 'warn', build: { outDir: distRoot, emptyOutDir: true } });
  const buildFiles = await collectBuildFiles(distRoot);
  const buildManifest = { schemaVersion: 1, sourceSha, files: buildFiles };
  const buildManifestSerialized = `${JSON.stringify(buildManifest)}\n`;
  viteServer = await preview({ root, logLevel: 'warn', preview: { host: '127.0.0.1', port: previewPort, strictPort: true }, build: { outDir: distRoot } });
  const chrome = await runChrome();
  const firefox = await runFirefox();
  await stopViteServer();
  viteServer = null;
  const cleanAfter = git('status', '--porcelain', '--untracked-files=all') === '';
  const comparison = {
    firefoxMedianFpsRatio: firefox.performance.medianFps / chrome.performance.medianFps,
    firefoxP95FrameTimeRatio: firefox.performance.p95FrameTimeMs / chrome.performance.p95FrameTimeMs,
  };
  receipt = {
    schemaVersion: contract.schemaVersion,
    gate: contract.gate,
    status: 'pending-contract',
    generatedAt: new Date().toISOString(),
    source: { sha: sourceSha, tree: sourceTree, branch: sourceBranch, cleanBefore: sourceStatusBefore === '', cleanAfter },
    build: { manifestSha256: sha256(buildManifestSerialized), fileCount: buildFiles.length, totalBytes: buildFiles.reduce((sum, file) => sum + file.bytes, 0) },
    tooling: {
      runnerSha256: sha256File(path.resolve(root, 'scripts/qa/run-pass71-native-browser-parity.mjs')),
      contractSha256: sha256File(path.resolve(root, 'scripts/qa/pass71-native-browser-parity-contract.mjs')),
    },
    contract,
    browsers: { chrome, firefox },
    comparison,
    claims: {
      observed: 'Installed native Chrome and Firefox ran sequentially, headful and focused on one exact built SHA with retained rAF intervals and runtime telemetry.',
      inference: 'A passing ratio supports browser performance parity for this bounded warm Atomic Acres WebGL2 quality scene on this machine.',
      assumption: 'The frozen one-bot scene and nine-second steady window represent the reported foreground match pacing regression.',
      unknown: 'This single-machine gate does not establish parity for other drivers, displays, maps, cold asset admission or WebGPU.',
      falsifiers: 'Source drift, browser or viewport drift, software rendering, graphics drift, runtime/watchdog faults, Firefox median FPS below 0.80 Chrome or Firefox p95 frame time above 1.25 Chrome fail the gate.',
    },
  };
  const failures = pass71NativeBrowserParityFailures(receipt);
  receipt.status = failures.length === 0 ? 'passed' : 'failed';
  receipt.failures = failures;
  await mkdir(artifactRoot, { recursive: true });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeFile(receiptPath, serialized, 'utf8');
  await writeFile(`${receiptPath}.sha256`, `${sha256(serialized)}  ${path.basename(receiptPath)}\n`, 'utf8');
  assertPass71NativeBrowserParityReceipt(receipt);
  process.stdout.write(`${JSON.stringify({ status: receipt.status, sourceSha, receiptPath, comparison, chrome: chrome.performance, firefox: firefox.performance }, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  failure = error;
} finally {
  const cleanupErrors = [];
  if (firefoxDriver) await firefoxDriver.stop().catch((error) => cleanupErrors.push(error));
  await stopViteServer().catch((error) => cleanupErrors.push(error));
  await rm(temporaryRoot, { recursive: true, force: true }).catch((error) => cleanupErrors.push(error));
  if (cleanupErrors.length > 0) failure = new Error(`${failure instanceof Error ? `${failure.stack ?? failure.message}\n` : ''}Cleanup failed: ${cleanupErrors.map((error) => error.message).join('; ')}`);
}

if (failure) {
  process.stderr.write(`${failure instanceof Error ? failure.stack ?? failure.message : String(failure)}\n`);
  process.exitCode = 1;
}
