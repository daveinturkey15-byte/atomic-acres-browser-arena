import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import {
  PASS71_NATIVE_BROWSER_PARITY,
  PASS71_NATIVE_BROWSER_PARITY_MACHINE_HOSTNAME_SHA256,
  PASS71_NATIVE_BROWSER_PARITY_MACHINE_ID,
  PASS71_NATIVE_BROWSER_PARITY_TRUSTED_ACTION_EVENTS,
  PASS71_QUALITY_REQUESTED_GRAPHICS,
  assertPass71NativeBrowserParityReceipt,
  pass71NativeBrowserParityFailures,
  pass71NativeBrowserParityRecordSha256,
  pass71NativeBrowserParitySceneSignature,
  pass71NativeBrowserParityToolingHashesAtSource,
  summarizePass71FrameWindow,
} from './pass71-native-browser-parity-contract.mjs';

const root = path.resolve(process.cwd());
const contract = PASS71_NATIVE_BROWSER_PARITY;
const machine = requiredMachine();
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`Pass 71 native parity requires win32/x64; received ${process.platform}/${process.arch}`);
}
const hostnameSha256 = sha256(Buffer.from(hostname().trim().toLowerCase(), 'utf8'));
if (hostnameSha256 !== PASS71_NATIVE_BROWSER_PARITY_MACHINE_HOSTNAME_SHA256) {
  throw new Error('Pass 71 native parity physical OS hostname does not match dave-gaming-pc host attestation');
}
const previewPort = boundedPort('PASS71_PARITY_PREVIEW_PORT', 4_561);
const peerPort = boundedPort('PASS71_PARITY_PEER_PORT', 9_171);
const firefoxDriverPorts = [
  boundedPort('PASS71_PARITY_FIREFOX_HOST_DRIVER_PORT', 4_469),
  boundedPort('PASS71_PARITY_FIREFOX_GUEST_DRIVER_PORT', 4_470),
];
const ownedPorts = [previewPort, peerPort, ...firefoxDriverPorts];
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
const sourceStatusBefore = git('status', '--porcelain', '--untracked-files=all');
const expectedSourceSha = requiredSourceSha();
const startedAt = new Date().toISOString();
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'atomic-acres-pass71-native-parity-'));
const distRoot = path.join(temporaryRoot, 'dist');
const topologyReceiptPath = path.join(temporaryRoot, 'release-topology.json');
const profileRoot = path.join(temporaryRoot, 'profiles');
const artifactRoot = path.resolve(root, 'artifacts/pass71/native-browser-parity');
const receiptPath = path.join(artifactRoot, `${sourceSha}-receipt.json`);
const peerPath = `/peerjs-${randomBytes(12).toString('hex')}`;
const baseUrl = `http://127.0.0.1:${previewPort}/channels/the-big-one/`;
const seedForMode = (mode) => `pass71-native-parity-${mode}-v3`;
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

let viteServer = null;
let peerProcess = null;
let peerOutput = '';
let firefoxHost = null;
let firefoxGuest = null;
let failure = null;

function boundedPort(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1_024 || value > 65_535) {
    throw new Error(`${name} must be an integer port from 1024 through 65535`);
  }
  return value;
}

function requiredSourceSha() {
  const index = process.argv.indexOf('--expected-source-sha');
  const value = index >= 0 ? process.argv[index + 1] : process.env.PASS71_EXPECTED_SOURCE_SHA;
  if (!/^[a-f0-9]{40}$/u.test(value ?? '')) {
    throw new Error('Pass 71 native parity requires --expected-source-sha <40-char SHA>');
  }
  return value;
}

function requiredMachine() {
  const inline = process.argv.find((argument) => argument.startsWith('--machine='));
  const index = process.argv.indexOf('--machine');
  const value = inline ? inline.slice('--machine='.length) : index >= 0 ? process.argv[index + 1] : undefined;
  if (value !== PASS71_NATIVE_BROWSER_PARITY_MACHINE_ID) {
    throw new Error('Pass 71 native parity requires --machine dave-gaming-pc');
  }
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

function canonicalBytes(value) {
  const canonical = (entry) => Array.isArray(entry)
    ? entry.map(canonical)
    : entry && typeof entry === 'object'
      ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, canonical(entry[key])]))
      : entry;
  return Buffer.from(`${JSON.stringify(canonical(value))}\n`, 'utf8');
}

function normalizedSceneVector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`${label} must be a finite three-component position`);
  }
  return value.map((entry) => Number(entry.toFixed(6)));
}

function vectorDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function sceneStaging(mode, targetPosition) {
  const staging = {
    contract: contract.sceneStageContract,
    positionToleranceM: contract.scenePositionToleranceM,
    maximumSampleDriftM: contract.maximumSceneSampleDriftM,
    playerPosition: [22, 1.7, -39],
    targetPosition: normalizedSceneVector(targetPosition, `${mode} target staging`),
  };
  if (mode === 'hosted-quality-combat'
    && JSON.stringify(staging.targetPosition) !== JSON.stringify([19.06, 1.7, -44.22])) {
    throw new Error(`Hosted target staging drifted: ${JSON.stringify(staging.targetPosition)}`);
  }
  return staging;
}

function assertSceneSamples(label, staging, samples) {
  if (!Array.isArray(samples) || samples.length !== contract.stableTelemetrySampleCount) {
    throw new Error(`${label} did not retain ${contract.stableTelemetrySampleCount} scene samples`);
  }
  for (const [index, sample] of samples.entries()) {
    const prior = samples[index - 1];
    if (!Number.isSafeInteger(sample.frameCount) || sample.frameCount < 1
      || (prior && sample.frameCount <= prior.frameCount)
      || !Number.isFinite(sample.playerYaw)
      || vectorDistance(sample.playerPosition, staging.playerPosition) > staging.positionToleranceM
      || vectorDistance(sample.targetPosition, staging.targetPosition) > staging.positionToleranceM
      || vectorDistance(sample.playerPosition, samples[0].playerPosition) > staging.maximumSampleDriftM
      || vectorDistance(sample.targetPosition, samples[0].targetPosition) > staging.maximumSampleDriftM) {
      throw new Error(`${label} scene sampling drifted: ${JSON.stringify(samples)}`);
    }
  }
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

function peerEndpointReady() {
  return new Promise((resolveReady) => {
    const request = http.get(`http://127.0.0.1:${peerPort}${peerPath}`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body = `${body}${chunk}`.slice(0, 2_048); });
      response.once('end', () => {
        try {
          resolveReady(response.statusCode === 200 && JSON.parse(body)?.name === 'PeerJS Server');
        } catch {
          resolveReady(false);
        }
      });
    });
    request.once('error', () => resolveReady(false));
    request.setTimeout(300, () => { request.destroy(); resolveReady(false); });
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
    const forced = waitForExit(child, 3_000);
    child.kill('SIGKILL');
    if (!await forced) throw new Error(`Owned process ${child.pid ?? 'unknown'} did not exit`);
  }
}

async function stopViteServer() {
  if (!viteServer?.httpServer?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    viteServer.httpServer.close((error) => error ? rejectClose(error) : resolveClose());
    viteServer.httpServer.closeAllConnections?.();
  });
}

async function startPeerServer() {
  const executable = path.resolve(root, 'node_modules/peer/dist/bin/peerjs.js');
  peerProcess = spawn(process.execPath, [
    executable, '--host', '127.0.0.1', '--port', String(peerPort), '--path', peerPath, '--no-allow_discovery',
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const retain = (chunk) => { peerOutput = `${peerOutput}${String(chunk)}`.slice(-16_384); };
  peerProcess.stdout.on('data', retain);
  peerProcess.stderr.on('data', retain);
  await poll('PeerJS startup', () => peerEndpointReady(), Boolean, 15_000, 100);
}

function windowsExecutableIdentity(executable, browserName) {
  const probeEnv = 'PASS71_PARITY_EXE_PROBE_PATH';
  const script = [
    '$ErrorActionPreference = "Stop"',
    `$target = $env:${probeEnv}`,
    '$item = Get-Item -LiteralPath $target',
    '$signature = Get-AuthenticodeSignature -LiteralPath $target',
    '$signer = if ($null -eq $signature.SignerCertificate) { "" } else { $signature.SignerCertificate.Subject }',
    '[ordered]@{ version=$item.VersionInfo.ProductVersion; status=$signature.Status.ToString(); signer=$signer } | ConvertTo-Json -Compress',
  ].join('; ');
  const powershell = path.resolve(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const raw = execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, env: { ...process.env, [probeEnv]: executable },
  });
  const value = JSON.parse(raw);
  return {
    channel: browserName,
    installed: true,
    executableName: path.basename(executable).toLowerCase(),
    executableSha256: sha256File(executable),
    executableVersion: String(value.version ?? '').trim(),
    installRoot: path.dirname(executable),
    authenticodeStatus: String(value.status ?? '').trim(),
    authenticodeSigner: String(value.signer ?? '').trim(),
  };
}

function candidateRoute(mode) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgl2', map: 'atomic-acres',
    seed: seedForMode(mode), externalServices: 'off', multiplayerQa: '1',
    peerQaPort: String(peerPort), peerQaPath: peerPath,
  })) url.searchParams.set(key, value);
  return url.toString();
}

async function readServedCandidate() {
  const response = await fetch(new URL('channel-provenance.json', baseUrl), {
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Candidate provenance returned HTTP ${response.status}`);
  const value = await response.json();
  if (value?.schemaVersion !== 4 || value.channel !== 'the-big-one' || value.releasePass !== 'PASS 71'
    || value.sourceSha !== sourceSha || value.path !== 'channels/the-big-one'
    || !/^[a-f0-9]{64}$/u.test(value.treeSha256 ?? '')
    || !Number.isSafeInteger(value.exactRootFileCount) || value.exactRootFileCount < 2) {
    throw new Error(`Staged candidate provenance is invalid: ${JSON.stringify(value)}`);
  }
  return value;
}

async function configureQuality(adapter, mode, name) {
  await adapter.navigate(candidateRoute(mode));
  await poll(`${adapter.role} menu bootstrap`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state ? { stage: state.bootstrap?.stage, error: state.bootstrap?.error } : null;
  `), (value) => value?.stage === 'ready' && value.error == null, 90_000);
  const configured = await adapter.evaluate(`
    const key = 'atomic-acres.player-profile.v1';
    const profile = JSON.parse(localStorage.getItem(key));
    profile.settings.graphics = ${JSON.stringify(PASS71_QUALITY_REQUESTED_GRAPHICS)};
    profile.revision = Number(profile.revision) + 1;
    localStorage.setItem(key, JSON.stringify(profile));
    localStorage.setItem('atomic-acres:player-name:v1', ${JSON.stringify(name)});
    return profile.settings.graphics;
  `);
  if (JSON.stringify(configured) !== JSON.stringify(PASS71_QUALITY_REQUESTED_GRAPHICS)) {
    throw new Error(`${adapter.role} Quality profile write failed: ${JSON.stringify(configured)}`);
  }
  await adapter.navigate(candidateRoute(mode));
  await adapter.focusAndSize();
}

async function installProbe(adapter) {
  await adapter.evaluate(`
    const probe = { phase: 'idle', events: [], errors: [], longTasks: [] };
    const record = (event) => {
      const observedAtMs = performance.now();
      probe.events.push({
      sequence: probe.events.length,
      phase: probe.phase, type: event.type, trusted: event.isTrusted,
      button: typeof event.button === 'number' ? event.button : null,
      key: typeof event.key === 'string' ? event.key : null,
      code: typeof event.code === 'string' ? event.code : null,
      eventTimestampMs: Number(event.timeStamp),
      observedAtMs,
      pointerLocked: document.pointerLockElement?.id === 'game',
    });
    };
    for (const type of ['click', 'mousedown', 'mouseup', 'keydown', 'keyup']) addEventListener(type, record, true);
    addEventListener('error', (event) => probe.errors.push({ kind: 'error', message: event.message || 'unknown' }));
    addEventListener('unhandledrejection', (event) => probe.errors.push({ kind: 'unhandledrejection', message: String(event.reason) }));
    const originalConsoleError = console.error.bind(console);
    console.error = (...values) => {
      probe.errors.push({ kind: 'console-error', message: values.map((value) => String(value)).join(' ') });
      originalConsoleError(...values);
    };
    if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) probe.longTasks.push({ startTimeMs: entry.startTime, durationMs: entry.duration });
      });
      observer.observe({ type: 'longtask' });
      probe.longTaskObserver = observer;
    }
    window.__PASS71_PARITY_PROBE__ = probe;
    return true;
  `);
}

async function setProbePhase(adapter, phase) {
  await adapter.evaluate(`window.__PASS71_PARITY_PROBE__.phase = ${JSON.stringify(phase)}; return true;`);
}

async function waitForMenu(adapter) {
  await poll(`${adapter.role} canonical menu`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state ? {
      stage: state.bootstrap?.stage, error: state.bootstrap?.error, weaponReady: state.weaponReady,
      solo: document.querySelector('#solo')?.disabled === false,
      host: document.querySelector('#host')?.disabled === false,
      join: document.querySelector('#join')?.disabled === false,
      preset: state.settings?.displayedGraphicsPreset,
    } : null;
  `), (value) => value?.stage === 'ready' && value.error == null && value.weaponReady === true
    && value.solo && value.host && value.join && value.preset === 'high', 90_000);
}

async function stageSolo(adapter) {
  await installProbe(adapter);
  await setProbePhase(adapter, 'solo');
  await adapter.click('#solo');
  await poll(`${adapter.role} solo active`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state ? { started: state.gameStarted, phase: state.matchPhase, bots: state.bots?.length,
      quality: state.render?.qualityAssetStreaming?.atomicAcres, frame: state.frameCount } : null;
  `), (value) => value?.started === true && value.phase === 'active' && value.bots === 1
    && value.quality === 'ready' && value.frame > 2, 120_000);
  const placement = await adapter.evaluate(`
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.equipWeapon('carbine');
    debug.setAmmo('carbine', 2, 30);
    debug.teleportPlayer(22, 1.7, -39, 2.628, 0);
    const placement = debug.placeBotAhead(6);
    if (!placement) return null;
    debug.aimAtBot('body');
    return placement;
  `);
  if (!placement?.bot?.logicalPosition) throw new Error(`${adapter.role} could not stage the solo target`);
  return sceneStaging('solo-quality-combat', placement.bot.logicalPosition);
}

async function stageHosted(host, guest) {
  await Promise.all([installProbe(host), installProbe(guest)]);
  await setProbePhase(host, 'host');
  await host.click('#host');
  const roomCode = await poll('host room code', () => host.text('#room-code'), (value) => typeof value === 'string' && value.trim().length >= 6, 45_000);
  await guest.fill('#room-input', roomCode.trim());
  await setProbePhase(guest, 'join');
  await guest.click('#join');
  await Promise.all([host, guest].map((adapter) => poll(`${adapter.role} two-member lobby`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.privateMatch ? { members: state.privateMatch.members.length, bots: state.privateMatch.hostedBotCount } : null;
  `), (value) => value?.members === 2, 60_000)));
  await host.select('#lobby-bots', '0');
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await poll('host start enabled', () => host.evaluate(`return document.querySelector('#lobby-start')?.disabled === false;`), Boolean, 15_000);
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((adapter) => poll(`${adapter.role} hosted active`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state ? { started: state.gameStarted, phase: state.matchPhase,
      members: state.privateMatch?.members?.length, remotes: state.remotePlayers?.length,
      bots: state.privateMatch?.hostedBotCount, quality: state.render?.qualityAssetStreaming?.atomicAcres,
      frame: state.frameCount } : null;
  `), (value) => value?.started === true && value.phase === 'active' && value.members === 2
    && value.remotes === 1 && value.bots === 0 && value.quality === 'ready' && value.frame > 2, 120_000)));
  await Promise.all([
    host.evaluate(`window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(22, 1.7, -39, 2.628, 0); return true;`),
    guest.evaluate(`window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(19.06, 1.7, -44.22, -0.514, 0); return true;`),
  ]);
  await host.evaluate(`
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.equipWeapon('carbine');
    debug.setAmmo('carbine', 2, 30);
    debug.aimAtRemote('body');
    return true;
  `);
  await poll('host sees staged remote', () => host.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.remotePlayers?.[0] ? { hp: state.remotePlayers[0].hp,
      interpolation: state.remotePlayers[0].interpolationError,
      playerPosition: state.player.position,
      targetPosition: state.remotePlayers[0].authoritativePosition } : null;
  `), (value) => value?.hp === 100 && value.interpolation < 0.5
    && Array.isArray(value.playerPosition) && Array.isArray(value.targetPosition)
    && vectorDistance(value.playerPosition, [22, 1.7, -39]) <= contract.scenePositionToleranceM
    && vectorDistance(value.targetPosition, [19.06, 1.7, -44.22]) <= contract.scenePositionToleranceM, 15_000);
  return sceneStaging('hosted-quality-combat', [19.06, 1.7, -44.22]);
}

async function captureStaticTelemetry(adapter) {
  return adapter.evaluate(`
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const state = debug.snapshot();
    const audit = debug.renderAudit();
    const playable = state.render.playableScene;
    const measured = playable.budgetAudit.measured;
    const presentation = debug.samplePresentationTelemetry();
    return {
      captureFrame: state.frameCount,
      state: {
        arenaId: state.arenaSelection.id,
        gameStarted: state.gameStarted,
        matchPhase: state.matchPhase,
        qualityAssetState: state.render.qualityAssetStreaming.atomicAcres,
        botCount: state.bots.length,
        remoteCount: state.remotePlayers.length,
        memberCount: state.privateMatch?.members?.length ?? 0,
        hostRole: state.privateMatch ? 'host' : 'offline',
        player: { position: state.player.position.map((value) => Number(value.toFixed(6))), yaw: Number(state.player.yaw.toFixed(6)) },
        target: state.privateMatch
          ? { position: state.remotePlayers[0]?.authoritativePosition?.map((value) => Number(value.toFixed(6))), kind: 'remote-player' }
          : { position: state.bots[0]?.position?.map((value) => Number(value.toFixed(6))), kind: 'bot' },
      },
      runtime: state.render.runtime,
      webglVersion: state.render.webglVersion,
      displayedGraphicsPreset: state.settings.displayedGraphicsPreset,
      requestedGraphics: state.settings.requested.graphics,
      effectiveGraphics: state.settings.graphics,
      principalHdrSamples: state.render.atomicSignal.principalHdrSamples,
      residency: debug.sampleRendererResidency(),
      audit,
      budget: {
        drawCalls: measured.drawCalls, triangles: measured.triangles,
        rendererReportedCalls: measured.rendererReportedCalls,
        totalActiveShadowLights: measured.totalActiveShadowLights,
        totalActiveShadowMapPixels: measured.totalActiveShadowMapPixels,
        authoritativeArenaRoots: playable.authoritativeArenaRoots,
        duplicateArenaRoots: playable.duplicateArenaRoots,
        playerCamera: playable.playerCamera,
        route: playable.route,
      },
      presentation: {
        status: presentation.status, submissionSequence: presentation.submissionSequence,
        completedSequence: presentation.completedSequence, completionFailures: presentation.completionFailures,
        uncapturedErrors: state.render.runtime.uncapturedErrors,
        deviceLost: state.render.runtime.deviceLost,
      },
    };
  `);
}

function renderInventory(entries) {
  const normalized = [...entries].sort((left, right) => left.name.localeCompare(right.name)
    || left.material.localeCompare(right.material) || left.triangles - right.triangles);
  return {
    entries: normalized,
    drawables: normalized.length,
    uniqueMaterials: new Set(normalized.flatMap((entry) => entry.material.split(',').filter(Boolean))).size,
    triangles: normalized.reduce((sum, entry) => sum + entry.triangles, 0),
    sha256: sha256(canonicalBytes(normalized)),
  };
}

function stableTelemetryIdentity(sample) {
  return sha256(canonicalBytes({
    inventory: renderInventory(sample.audit),
    budget: sample.budget,
    residency: sample.residency,
    presentation: sample.presentation,
    runtime: sample.runtime,
    webglVersion: sample.webglVersion,
    displayedGraphicsPreset: sample.displayedGraphicsPreset,
    requestedGraphics: sample.requestedGraphics,
    effectiveGraphics: sample.effectiveGraphics,
    principalHdrSamples: sample.principalHdrSamples,
  }));
}

async function captureStableTelemetry(adapter, label) {
  const samples = [];
  let previousFrame = -1;
  for (let index = 0; index < contract.stableTelemetrySampleCount; index += 1) {
    const sample = await poll(`${adapter.role} ${label} telemetry sample ${index + 1}`, () => captureStaticTelemetry(adapter),
      (value) => Number.isSafeInteger(value?.captureFrame) && value.captureFrame > previousFrame,
      5_000, 20);
    previousFrame = sample.captureFrame;
    samples.push(sample);
  }
  const identity = stableTelemetryIdentity(samples[0]);
  if (samples.some((sample) => stableTelemetryIdentity(sample) !== identity)) {
    throw new Error(`${adapter.role} ${label} structural telemetry changed across distinct rendered frames`);
  }
  const rendererSamples = samples.map((sample) => ({
    frameCount: sample.captureFrame,
    calls: sample.budget.rendererReportedCalls,
  }));
  if (rendererSamples.some((sample) => !Number.isSafeInteger(sample.calls) || sample.calls < 1
    || sample.calls !== rendererSamples[0].calls)) {
    throw new Error(`${adapter.role} ${label} renderer calls were not stable: ${JSON.stringify(rendererSamples)}`);
  }
  const sceneSamples = samples.map((sample) => ({
    frameCount: sample.captureFrame,
    playerPosition: normalizedSceneVector(sample.state.player.position, `${adapter.role} player sample`),
    playerYaw: sample.state.player.yaw,
    targetPosition: normalizedSceneVector(sample.state.target.position, `${adapter.role} target sample`),
  }));
  return {
    ...samples.at(-1),
    budget: { ...samples.at(-1).budget, rendererSamples },
    sceneSamples,
  };
}

async function startFrameProbe(adapter) {
  await adapter.evaluate(`
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const state = debug.snapshot();
    const startedAt = performance.now();
    const probe = window.__PASS71_PARITY_PROBE__;
    probe.longTasks.length = 0;
    probe.frame = { active: true, startedAt, lastAt: null, intervalsMs: [], startingGameFrame: state.frameCount };
    const tick = (now) => {
      if (!probe.frame.active) return;
      if (probe.frame.lastAt !== null) probe.frame.intervalsMs.push(now - probe.frame.lastAt);
      probe.frame.lastAt = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  `);
}

async function stopFrameProbe(adapter) {
  const raw = await adapter.evaluate(`
    const probe = window.__PASS71_PARITY_PROBE__;
    probe.frame.active = false;
    const endedAt = performance.now();
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { elapsedMs: endedAt - probe.frame.startedAt, intervalsMs: probe.frame.intervalsMs,
      gameFrameDelta: state.frameCount - probe.frame.startingGameFrame, longTasks: probe.longTasks };
  `);
  const summary = summarizePass71FrameWindow(raw.intervalsMs, raw.elapsedMs);
  const totalDurationMs = raw.longTasks.reduce((sum, entry) => sum + entry.durationMs, 0);
  const maximumDurationMs = raw.longTasks.length > 0 ? Math.max(...raw.longTasks.map((entry) => entry.durationMs)) : 0;
  return {
    ...summary,
    gameFrameDelta: raw.gameFrameDelta,
    presentedFps: raw.gameFrameDelta * 1_000 / raw.elapsedMs,
    gameFrameToCallbackRatio: raw.gameFrameDelta / summary.sampleCount,
    intervalsMs: raw.intervalsMs,
    longTasks: { entries: raw.longTasks, count: raw.longTasks.length, totalDurationMs, maximumDurationMs },
  };
}

async function representativeCombat(adapter, mode) {
  const canvas = await adapter.canvasPoint();
  const targetBefore = await adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.privateMatch ? state.remotePlayers[0].hp : state.bots[0].hp;
  `);
  await setProbePhase(adapter, 'pointer-lock');
  await adapter.pointerClick(canvas.x, canvas.y, 0, 80);
  await poll(`${adapter.role} pointer lock`, () => adapter.evaluate(`return document.pointerLockElement?.id === 'game';`), Boolean, 15_000);
  await setProbePhase(adapter, 'ads-down');
  await adapter.pointerDown(2);
  await poll(`${adapter.role} ADS down`, () => adapter.evaluate(`return window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.adsHeld;`), Boolean, 5_000);
  const ammoBefore = await adapter.evaluate(`return window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo;`);
  await setProbePhase(adapter, 'fire');
  await adapter.pointerClick(canvas.x, canvas.y, 0, 60);
  const afterFire = await poll(`${adapter.role} fire`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { ammo: state.player.ammo, hp: state.privateMatch ? state.remotePlayers[0].hp : state.bots[0].hp };
  `), (value) => value?.ammo === ammoBefore - 1 && value.hp < targetBefore, 8_000);
  await setProbePhase(adapter, 'ads-up');
  await adapter.pointerUp(2);
  await poll(`${adapter.role} ADS up`, () => adapter.evaluate(`return window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.adsHeld;`), (value) => value === false, 5_000);
  await setProbePhase(adapter, 'reload');
  await adapter.keyPress('r');
  const reloadObserved = await poll(`${adapter.role} reload start`, () => adapter.evaluate(`return window.__ATOMIC_ACRES_DEBUG__.snapshot().player.reloading;`), Boolean, 5_000);
  const reloaded = await poll(`${adapter.role} reload completion`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
    return { ammo: state.ammo, reserve: state.reserve, reloading: state.reloading };
  `), (value) => value?.reloading === false && value.ammo > afterFire.ammo, 15_000);
  const probe = await adapter.evaluate(`return { events: window.__PASS71_PARITY_PROBE__.events,
    pointerLocked: document.pointerLockElement?.id === 'game' };`);
  await adapter.releaseActions();
  const trustedEvents = probe.events.filter((entry) => contract.actionTimeline.includes(entry.phase));
  const observedEventFields = trustedEvents.map(({ phase, type, button, key, code }) => ({ phase, type, button, key, code }));
  if (JSON.stringify(observedEventFields) !== JSON.stringify(PASS71_NATIVE_BROWSER_PARITY_TRUSTED_ACTION_EVENTS)) {
    throw new Error(`${adapter.role} emitted an unexpected trusted-action sequence: ${JSON.stringify(trustedEvents)}`);
  }
  return {
    timeline: contract.actionTimeline,
    trustedEvents,
    pointerLocked: probe.pointerLocked,
    ammoBefore,
    ammoAfterFire: afterFire.ammo,
    ammoAfterReload: reloaded.ammo,
    reserveAfterReload: reloaded.reserve,
    reloadObserved: reloadObserved === true,
    reloadCompleted: reloaded.reloading === false,
    targetHealthBefore: targetBefore,
    targetHealthAfter: afterFire.hp,
    targetKind: mode === 'solo-quality-combat' ? 'bot' : 'remote-player',
  };
}

async function auditScene(adapter, mode, identity, staging) {
  await adapter.focusAndSize();
  const settledAt = Date.now();
  await poll(`${adapter.role} settle`, () => adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { elapsed: Date.now() - ${settledAt}, frame: state.frameCount,
      visible: document.visibilityState, focused: document.hasFocus(),
      playerPosition: state.player.position,
      targetPosition: state.privateMatch ? state.remotePlayers[0]?.authoritativePosition : state.bots[0]?.position };
  `), (value) => value?.elapsed >= contract.settleMs && value.frame > 30
    && value.visible === 'visible' && value.focused === true
    && Array.isArray(value.playerPosition) && Array.isArray(value.targetPosition)
    && vectorDistance(value.playerPosition, staging.playerPosition) <= staging.positionToleranceM
    && vectorDistance(value.targetPosition, staging.targetPosition) <= staging.positionToleranceM,
  contract.settleMs + 20_000, 200);
  const before = await captureStableTelemetry(adapter, 'before-action');
  assertSceneSamples(`${adapter.role} before-action`, staging, before.sceneSamples);
  await startFrameProbe(adapter);
  const action = await representativeCombat(adapter, mode);
  await poll(`${adapter.role} frame window`, () => adapter.evaluate(`
    const frame = window.__PASS71_PARITY_PROBE__.frame;
    return { elapsed: performance.now() - frame.startedAt, samples: frame.intervalsMs.length,
      visible: document.visibilityState, focused: document.hasFocus() };
  `), (value) => value?.elapsed >= contract.targetWindowMs && value.samples >= contract.minimumSamples
    && value.visible === 'visible' && value.focused === true, contract.maximumWindowMs + 20_000, 100);
  const performance = await stopFrameProbe(adapter);
  const after = await captureStableTelemetry(adapter, 'after-action');
  assertSceneSamples(`${adapter.role} after-action`, staging, after.sceneSamples);
  const faults = await adapter.evaluate(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const watchdog = state.render.playableScene.renderWatchdog;
    const probe = window.__PASS71_PARITY_PROBE__;
    return {
      bootstrapError: state.bootstrap.error ?? null,
      runtimeErrorLog: document.querySelector('#runtime-error-log')?.textContent?.trim() ?? '',
      fatalErrorVisible: document.querySelector('#runtime-error')?.hidden === false,
      capturedErrors: probe.errors,
      watchdogStatus: watchdog.status,
      watchdogIncidents: watchdog.incidents,
      contextLosses: state.render.contextLifecycle.losses,
      documentVisible: document.visibilityState === 'visible',
      documentFocused: document.hasFocus(),
    };
  `);
  const sceneIdentity = {
    mode,
    arenaId: before.state.arenaId,
    qualityAssetState: before.state.qualityAssetState,
    seed: seedForMode(mode),
    botCount: before.state.botCount,
    remoteCount: before.state.remoteCount,
    memberCount: before.state.memberCount,
    hostRole: before.state.hostRole,
    staging,
  };
  const sceneSignature = pass71NativeBrowserParitySceneSignature(sceneIdentity);
  return {
    mode,
    route: await adapter.evaluate('return location.href;'),
    viewport: await adapter.evaluate('return { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio };'),
    freshProfile: true,
    freshBrowserProcess: true,
    scene: {
      arenaId: before.state.arenaId,
      gameStarted: before.state.gameStarted,
      matchPhase: before.state.matchPhase,
      qualityAssetState: before.state.qualityAssetState,
      seed: seedForMode(mode),
      signature: sceneSignature,
      botCount: before.state.botCount,
      remoteCount: before.state.remoteCount,
      memberCount: before.state.memberCount,
      hostRole: before.state.hostRole,
      staging,
      samples: { before: before.sceneSamples, after: after.sceneSamples },
      player: before.state.player,
      target: before.state.target,
    },
    runtime: {
      requestedBackend: before.runtime.requestedBackend,
      actualBackend: before.runtime.actualBackend,
      initialized: before.runtime.initialized,
      adapterLabel: before.runtime.adapterLabel,
      softwareAdapter: before.runtime.softwareAdapter,
      deviceLost: before.runtime.deviceLost,
      uncapturedErrors: before.runtime.uncapturedErrors,
    },
    webglVersion: before.webglVersion,
    displayedGraphicsPreset: before.displayedGraphicsPreset,
    requestedGraphics: before.requestedGraphics,
    effectiveGraphics: before.effectiveGraphics,
    principalHdrSamples: before.principalHdrSamples,
    settleMs: Date.now() - settledAt - performance.elapsedMs,
    performance,
    resources: { before: before.residency, after: after.residency },
    renderInventory: { before: renderInventory(before.audit), after: renderInventory(after.audit) },
    renderBudget: { before: before.budget, after: after.budget },
    presentation: { before: before.presentation, after: after.presentation },
    action,
    faults: { ...faults, capturedErrors: [...faults.capturedErrors, ...adapter.eventFaults] },
    identity,
  };
}

class GeckoAdapter {
  constructor(role, driverPort, profileDirectory) {
    this.role = role;
    this.name = 'firefox';
    this.driverPort = driverPort;
    this.endpoint = `http://127.0.0.1:${driverPort}`;
    this.profileDirectory = profileDirectory;
    this.sessionId = null;
    this.capabilities = null;
    this.eventFaults = [];
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
    if (!response.ok || payload?.value?.error) {
      throw new Error(`Firefox WebDriver ${method} ${routePath} failed (${response.status}): ${payload?.value?.message ?? JSON.stringify(payload)}`);
    }
    return payload?.value;
  }

  sessionRoute(suffix = '') {
    if (!this.sessionId) throw new Error(`${this.role} Firefox session is unavailable`);
    return `/session/${this.sessionId}${suffix}`;
  }

  async start() {
    await mkdir(this.profileDirectory, { recursive: true });
    this.process = spawn(geckodriverExecutable, [
      '--host', '127.0.0.1', '--port', String(this.driverPort), '--profile-root', this.profileDirectory, '--log', 'info',
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const retain = (chunk) => { this.output = `${this.output}${String(chunk)}`.slice(-32_768); };
    this.process.stdout.on('data', retain);
    this.process.stderr.on('data', retain);
    await poll(`${this.role} GeckoDriver startup`, () => this.request('GET', '/status', undefined, 1_000).catch(() => null), (value) => value?.ready === true, 20_000, 100);
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
    if (!this.sessionId || this.capabilities?.browserName !== 'firefox' || this.capabilities?.['moz:headless'] === true) {
      throw new Error(`${this.role} Firefox returned invalid headed capabilities: ${JSON.stringify(created)}`);
    }
    await this.request('POST', this.sessionRoute('/timeouts'), { implicit: 0, pageLoad: 90_000, script: 45_000 });
  }

  async navigate(url) { await this.request('POST', this.sessionRoute('/url'), { url }, 90_000); }
  async evaluate(script) { return this.request('POST', this.sessionRoute('/execute/sync'), { script, args: [] }, 60_000); }
  async find(selector) {
    const result = await this.request('POST', this.sessionRoute('/element'), { using: 'css selector', value: selector });
    const id = result?.[ELEMENT_KEY];
    if (!id) throw new Error(`${this.role} did not find ${selector}`);
    return id;
  }
  async click(selector) { const id = await this.find(selector); await this.request('POST', this.sessionRoute(`/element/${id}/click`), {}); }
  async fill(selector, value) {
    const id = await this.find(selector);
    await this.request('POST', this.sessionRoute(`/element/${id}/clear`), {});
    await this.request('POST', this.sessionRoute(`/element/${id}/value`), { text: value, value: [...value] });
  }
  async text(selector) { const id = await this.find(selector); return this.request('GET', this.sessionRoute(`/element/${id}/text`)); }
  async select(selector, value) {
    await this.evaluate(`
      const element = document.querySelector(${JSON.stringify(selector)});
      element.value = ${JSON.stringify(value)};
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return element.value;
    `);
  }
  async actions(actions) { await this.request('POST', this.sessionRoute('/actions'), { actions }); }
  async releaseActions() { if (this.sessionId) await this.request('DELETE', this.sessionRoute('/actions')).catch(() => undefined); }
  async pointerClick(x, y, button, duration) {
    await this.actions([{ type: 'pointer', id: `${this.role}-mouse`, parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', duration: 0, origin: 'viewport', x, y },
      { type: 'pointerDown', button }, { type: 'pause', duration }, { type: 'pointerUp', button },
    ] }]);
  }
  async pointerDown(button) { await this.actions([{ type: 'pointer', id: `${this.role}-mouse`, parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerDown', button }] }]); }
  async pointerUp(button) { await this.actions([{ type: 'pointer', id: `${this.role}-mouse`, parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerUp', button }] }]); }
  async keyPress(value) { await this.actions([{ type: 'key', id: `${this.role}-keyboard`, actions: [{ type: 'keyDown', value }, { type: 'keyUp', value }] }]); }
  async canvasPoint() {
    return this.evaluate(`
      const canvas = document.querySelector('#game');
      const rect = canvas.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width * 0.5);
      const y = Math.round(rect.top + rect.height * 0.5);
      if (document.elementFromPoint(x, y) !== canvas) throw new Error('Canvas center is obstructed');
      return { x, y };
    `);
  }
  async focusAndSize() {
    await this.request('POST', this.sessionRoute('/window/rect'), { x: 0, y: 0, width: 1_920, height: 1_080 });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const inner = await this.evaluate('window.focus(); return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio };');
      if (inner.width === contract.viewport.width && inner.height === contract.viewport.height && inner.dpr === 1) return;
      const rect = await this.request('GET', this.sessionRoute('/window/rect'));
      await this.request('POST', this.sessionRoute('/window/rect'), {
        x: 0, y: 0,
        width: rect.width + contract.viewport.width - inner.width,
        height: rect.height + contract.viewport.height - inner.height,
      });
    }
    throw new Error(`${this.role} Firefox viewport could not be normalized`);
  }
  identity(userAgent) {
    const executable = windowsExecutableIdentity(firefoxExecutable, 'firefox');
    return {
      ...executable,
      runtimeVersion: this.capabilities?.browserVersion ?? '',
      userAgent,
      geckodriver: {
        executableSha256: sha256File(geckodriverExecutable),
        version: execFileSync(geckodriverExecutable, ['--version'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/u)[0],
      },
    };
  }
  async stop() {
    await this.releaseActions();
    if (this.sessionId) await this.request('DELETE', this.sessionRoute(), undefined, 15_000).catch(() => undefined);
    this.sessionId = null;
    await stopChild(this.process);
    if (await listenerPresent(this.driverPort)) throw new Error(`${this.role} GeckoDriver listener remained after cleanup`);
  }
}

class ChromeAdapter {
  constructor(role, page) {
    this.role = role;
    this.name = 'chrome';
    this.page = page;
    this.eventFaults = [];
    page.on('pageerror', (error) => this.eventFaults.push({ kind: 'pageerror', message: error.message }));
    page.on('crash', () => this.eventFaults.push({ kind: 'page-crash', message: 'renderer crashed' }));
  }
  async navigate(url) { await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }); }
  async evaluate(script) { return this.page.evaluate((source) => Function(source)(), script); }
  async click(selector) { await this.page.locator(selector).click(); }
  async fill(selector, value) { await this.page.locator(selector).fill(value); }
  async text(selector) { return this.page.locator(selector).textContent(); }
  async select(selector, value) { await this.page.locator(selector).selectOption(value); }
  async pointerClick(x, y, button, duration) { await this.page.mouse.click(x, y, { button: button === 2 ? 'right' : 'left', delay: duration }); }
  async pointerDown(button) { await this.page.mouse.down({ button: button === 2 ? 'right' : 'left' }); }
  async pointerUp(button) { await this.page.mouse.up({ button: button === 2 ? 'right' : 'left' }); }
  async keyPress(value) { await this.page.keyboard.press(value); }
  async releaseActions() { await this.page.mouse.up({ button: 'left' }).catch(() => undefined); await this.page.mouse.up({ button: 'right' }).catch(() => undefined); }
  async canvasPoint() {
    return this.page.locator('#game').evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width * 0.5);
      const y = Math.round(rect.top + rect.height * 0.5);
      if (document.elementFromPoint(x, y) !== canvas) throw new Error('Canvas center is obstructed');
      return { x, y };
    });
  }
  async focusAndSize() { await this.page.bringToFront(); }
}

async function launchChromePair(mode) {
  const modeRoot = path.join(profileRoot, `chrome-${mode}`);
  const context = await chromium.launchPersistentContext(modeRoot, {
    headless: false,
    executablePath: chromeExecutable,
    viewport: contract.viewport,
    deviceScaleFactor: 1,
    args: [
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--force-device-scale-factor=1',
      '--window-position=0,0', '--window-size=1920,1080',
    ],
  });
  const pages = context.pages();
  const host = new ChromeAdapter(`chrome-${mode}-host`, pages[0] ?? await context.newPage());
  const guest = mode === 'hosted-quality-combat'
    ? new ChromeAdapter(`chrome-${mode}-guest`, await context.newPage())
    : null;
  return { context, host, guest };
}

async function runChromeScene(mode) {
  const launched = await launchChromePair(mode);
  try {
    await configureQuality(launched.host, mode, 'Chrome Host');
    await waitForMenu(launched.host);
    let staging;
    if (launched.guest) {
      await configureQuality(launched.guest, mode, 'Chrome Guest');
      await waitForMenu(launched.guest);
      staging = await stageHosted(launched.host, launched.guest);
    } else staging = await stageSolo(launched.host);
    const userAgent = await launched.host.evaluate('return navigator.userAgent;');
    const identity = {
      ...windowsExecutableIdentity(chromeExecutable, 'chrome'),
      runtimeVersion: launched.context.browser()?.version() ?? '',
      userAgent,
    };
    const scene = await auditScene(launched.host, mode, identity, staging);
    delete scene.identity;
    return { identity, scene };
  } finally {
    await launched.context.close();
  }
}

async function runFirefoxScene(mode) {
  firefoxHost = new GeckoAdapter(`firefox-${mode}-host`, firefoxDriverPorts[0], path.join(profileRoot, `firefox-${mode}-host`));
  firefoxGuest = mode === 'hosted-quality-combat'
    ? new GeckoAdapter(`firefox-${mode}-guest`, firefoxDriverPorts[1], path.join(profileRoot, `firefox-${mode}-guest`))
    : null;
  await firefoxHost.start();
  if (firefoxGuest) await firefoxGuest.start();
  try {
    await configureQuality(firefoxHost, mode, 'Firefox Host');
    await waitForMenu(firefoxHost);
    let staging;
    if (firefoxGuest) {
      await configureQuality(firefoxGuest, mode, 'Firefox Guest');
      await waitForMenu(firefoxGuest);
      staging = await stageHosted(firefoxHost, firefoxGuest);
    } else staging = await stageSolo(firefoxHost);
    const userAgent = await firefoxHost.evaluate('return navigator.userAgent;');
    const identity = firefoxHost.identity(userAgent);
    const scene = await auditScene(firefoxHost, mode, identity, staging);
    delete scene.identity;
    return { identity, scene };
  } finally {
    await firefoxGuest?.stop();
    await firefoxHost.stop();
    firefoxGuest = null;
    firefoxHost = null;
  }
}

async function buildAndStage() {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')));
  const buildEnvironment = {
    ...inherited,
    NODE_ENV: 'production',
    VITE_MATCH_BUILD_ID: sourceSha,
  };
  const previousBuildId = process.env.VITE_MATCH_BUILD_ID;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.VITE_MATCH_BUILD_ID = sourceSha;
  process.env.NODE_ENV = 'production';
  try {
    await build({ root, mode: 'production', logLevel: 'warn', build: { outDir: distRoot, emptyOutDir: true } });
  } finally {
    if (previousBuildId === undefined) delete process.env.VITE_MATCH_BUILD_ID;
    else process.env.VITE_MATCH_BUILD_ID = previousBuildId;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
  execFileSync(process.execPath, ['scripts/release/stage-release-topology.mjs'], {
    cwd: root,
    env: {
      ...buildEnvironment,
      SOURCE_SHA: sourceSha,
      RELEASE_PASS: 'PASS 71',
      RELEASE_DIST_ROOT: distRoot,
      RELEASE_TOPOLOGY_RECEIPT_PATH: topologyReceiptPath,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const topology = JSON.parse(await readFile(topologyReceiptPath, 'utf8'));
  if (topology?.schemaVersion !== 4 || topology.sourceSha !== sourceSha || topology.releasePass !== 'PASS 71') {
    throw new Error(`Staged topology is invalid: ${JSON.stringify(topology)}`);
  }
  viteServer = await preview({
    root,
    logLevel: 'warn',
    build: { outDir: distRoot },
    preview: { host: '127.0.0.1', port: previewPort, strictPort: true },
  });
  return topology.channels.experimental;
}

function comparisons(chromeScenes, firefoxScenes) {
  return contract.sceneModes.map((mode, index) => ({
    mode,
    firefoxMedianFpsRatio: firefoxScenes[index].performance.medianFps / chromeScenes[index].performance.medianFps,
    firefoxPresentedFpsRatio: firefoxScenes[index].performance.presentedFps / chromeScenes[index].performance.presentedFps,
    firefoxP95FrameTimeRatio: firefoxScenes[index].performance.p95FrameTimeMs / chromeScenes[index].performance.p95FrameTimeMs,
    firefoxMaximumFrameTimeRatio: firefoxScenes[index].performance.maximumFrameTimeMs / chromeScenes[index].performance.maximumFrameTimeMs,
  }));
}

async function main() {
  if (new Set(ownedPorts).size !== ownedPorts.length) throw new Error('Pass 71 parity owned ports must be unique');
  for (const port of ownedPorts) if (await listenerPresent(port)) throw new Error(`Pass 71 parity requires unbound owned port ${port}`);
  if (sourceSha !== expectedSourceSha || !/^[a-f0-9]{40}$/u.test(sourceTree) || sourceStatusBefore) {
    throw new Error(`Pass 71 parity requires clean exact source ${expectedSourceSha}; received ${sourceSha}, dirty=${sourceStatusBefore || '(clean)'}`);
  }
  const viteOverrides = ['.env', '.env.local', '.env.production.local'].filter((value) => existsSync(path.resolve(root, value)));
  if (viteOverrides.length > 0) throw new Error(`Pass 71 parity rejects local Vite overrides: ${viteOverrides.join(', ')}`);
  const servedCandidate = await buildAndStage();
  await startPeerServer();
  const chromeResults = [];
  const firefoxResults = [];
  for (const mode of contract.sceneModes) chromeResults.push(await runChromeScene(mode));
  for (const mode of contract.sceneModes) firefoxResults.push(await runFirefoxScene(mode));
  const servedAfter = await readServedCandidate();
  if (JSON.stringify(servedAfter) !== JSON.stringify(servedCandidate)) throw new Error('Served candidate provenance drifted during native parity');
  await stopChild(peerProcess);
  peerProcess = null;
  await stopViteServer();
  viteServer = null;
  const endingSha = git('rev-parse', 'HEAD');
  const cleanAfter = git('status', '--porcelain', '--untracked-files=all') === '';
  const chromeIdentity = chromeResults[0].identity;
  const firefoxIdentity = firefoxResults[0].identity;
  if (JSON.stringify(chromeResults.map((result) => result.identity)) !== JSON.stringify([chromeIdentity, chromeIdentity])) {
    throw new Error('Installed Chrome identity drifted across fresh scene processes');
  }
  if (JSON.stringify(firefoxResults.map((result) => result.identity)) !== JSON.stringify([firefoxIdentity, firefoxIdentity])) {
    throw new Error('Installed Firefox identity drifted across fresh scene processes');
  }
  const receipt = {
    schemaVersion: contract.schemaVersion,
    evidenceId: contract.evidenceId,
    kind: contract.kind,
    contract: contract.contract,
    gate: contract.gate,
    status: 'passed',
    startedAt,
    completedAt: new Date().toISOString(),
    source: {
      expectedSourceSha,
      checkoutSourceSha: sourceSha,
      endingCheckoutSourceSha: endingSha,
      sourceTree,
      cleanBefore: sourceStatusBefore === '',
      cleanAfter,
    },
    servedCandidate,
    environment: {
      machine,
      hostnameSha256,
      platform: process.platform,
      arch: process.arch,
    },
    tooling: pass71NativeBrowserParityToolingHashesAtSource(root, sourceSha),
    browsers: {
      chrome: { name: 'chrome', identity: chromeIdentity, scenes: chromeResults.map((result) => result.scene) },
      firefox: { name: 'firefox', identity: firefoxIdentity, scenes: firefoxResults.map((result) => result.scene) },
    },
    comparison: { scenes: comparisons(chromeResults.map((result) => result.scene), firefoxResults.map((result) => result.scene)) },
    faults: [],
    claims: {
      observed: 'Installed native Chrome and Firefox ran fresh-profile exact-A Quality solo and hosted representative combat with retained intervals, long tasks, residency, draw, material and presentation evidence.',
      inference: 'A passing receipt supports foreground native Firefox and Chrome parity for these two bounded Atomic Acres Quality combat scenes on this machine.',
      assumption: 'The deterministic solo and two-peer hosted action timelines represent the reported foreground match pacing regression.',
      unknown: 'This exact-machine receipt does not establish parity for other drivers, displays, browsers, maps or WebGPU.',
      falsifiers: 'Source, topology, browser, viewport, Quality, scene, action, allocation, draw, material, synchronous presentation, runtime fault, cadence or 0.80/1.25 parity drift fails the gate.',
    },
  };
  receipt.receiptSha256 = pass71NativeBrowserParityRecordSha256(receipt);
  const failures = pass71NativeBrowserParityFailures(receipt, {
    sourceSha,
    tooling: receipt.tooling,
    machine: PASS71_NATIVE_BROWSER_PARITY_MACHINE_ID,
  });
  if (failures.length > 0) {
    receipt.status = 'failed';
    receipt.faults.push(...failures);
    receipt.receiptSha256 = pass71NativeBrowserParityRecordSha256(receipt);
  }
  await mkdir(artifactRoot, { recursive: true });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const temporaryReceipt = `${receiptPath}.tmp`;
  await writeFile(temporaryReceipt, serialized, 'utf8');
  await rename(temporaryReceipt, receiptPath);
  await writeFile(`${receiptPath}.sha256`, `${sha256(serialized)}  ${path.basename(receiptPath)}\n`, 'utf8');
  assertPass71NativeBrowserParityReceipt(receipt, {
    sourceSha,
    tooling: receipt.tooling,
    machine: PASS71_NATIVE_BROWSER_PARITY_MACHINE_ID,
  });
  process.stdout.write(`${JSON.stringify({ status: receipt.status, sourceSha, receiptPath, comparison: receipt.comparison }, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  failure = error;
} finally {
  const cleanupErrors = [];
  for (const [label, cleanup] of [
    ['Firefox guest', () => firefoxGuest?.stop()],
    ['Firefox host', () => firefoxHost?.stop()],
    ['PeerJS', () => stopChild(peerProcess)],
    ['Vite', () => stopViteServer()],
  ]) {
    try { await cleanup(); } catch (error) { cleanupErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  for (const port of ownedPorts) if (await listenerPresent(port)) cleanupErrors.push(`owned port ${port} remained bound`);
  await rm(temporaryRoot, { recursive: true, force: true }).catch((error) => cleanupErrors.push(`temporary cleanup: ${error.message}`));
  if (cleanupErrors.length > 0) failure = new Error(`${failure instanceof Error ? `${failure.stack ?? failure.message}\n` : ''}Cleanup failed: ${cleanupErrors.join('; ')}`);
}

if (failure) {
  process.stderr.write(`${failure instanceof Error ? failure.stack ?? failure.message : String(failure)}\n`);
  process.exitCode = 1;
}
