import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import process from 'node:process';
import { preview } from 'vite';
import {
  PASS70_FIREFOX_GECKODRIVER_IDENTITY,
  assertPass70FirefoxGeckodriverReceipt,
  normalizePass70BidiLogEntry,
  pass70StagedCandidateFailures,
} from './pass70-firefox-geckodriver-contract.mjs';

const root = resolve(process.cwd());
const identity = PASS70_FIREFOX_GECKODRIVER_IDENTITY;
const evidenceRoot = resolve(root, 'artifacts', 'pass70', 'firefox-geckodriver');
const receiptPath = join(evidenceRoot, 'receipt.json');
const defaultArchivePath = resolve(root, '..', 'browser-tools', identity.geckodriver.archiveName);
const archivePath = resolve(process.env.PASS70_GECKODRIVER_ARCHIVE_PATH ?? defaultArchivePath);
const firefoxExecutable = resolve(
  process.env.PASS70_FIREFOX_EXECUTABLE_PATH ?? 'C:/Program Files/Mozilla Firefox/firefox.exe',
);
const previewPort = Number(process.env.PASS70_FIREFOX_PREVIEW_PORT ?? 4_551);
const peerPort = Number(process.env.PASS70_FIREFOX_PEER_PORT ?? 9_091);
const hostDriverPort = Number(process.env.PASS70_FIREFOX_HOST_DRIVER_PORT ?? 4_467);
const guestDriverPort = Number(process.env.PASS70_FIREFOX_GUEST_DRIVER_PORT ?? 4_468);
const driverPorts = [hostDriverPort, guestDriverPort];
const hostBidiPort = Number(process.env.PASS70_FIREFOX_HOST_BIDI_PORT ?? 4_477);
const guestBidiPort = Number(process.env.PASS70_FIREFOX_GUEST_BIDI_PORT ?? 4_478);
const bidiPorts = [hostBidiPort, guestBidiPort];
const allOwnedPorts = [previewPort, peerPort, ...driverPorts, ...bidiPorts];
const firefoxSha256 = sha256File(firefoxExecutable);
const temporaryRoot = mkdtempSync(join(tmpdir(), 'atomic-acres-pass70-firefox-geckodriver-'));
const temporaryDist = join(temporaryRoot, 'dist');
const topologyReceiptPath = join(temporaryRoot, 'release-topology.json');
const driverExtractionRoot = join(temporaryRoot, 'geckodriver');
const driverProfileRoots = {
  host: join(temporaryRoot, 'profiles', 'host'),
  guest: join(temporaryRoot, 'profiles', 'guest'),
};
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const sourceSha = gitSha();
const buildEnvironment = {
  ...inheritedEnvironment,
  NODE_ENV: 'production',
  VITE_MATCH_BUILD_ID: sourceSha,
};
const peerPath = `/peerjs-${randomBytes(12).toString('hex')}`;
const baseUrl = `http://127.0.0.1:${previewPort}/channels/the-big-one/`;
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';
const faultPattern = /AudioListener|positionX|can't access property\s+["']?value|SYSTEM PAUSED/iu;

let viteServer = null;
let peerProcess = null;
let peerOutput = '';
let hostDriver = null;
let guestDriver = null;
let completed = null;
let failure = null;
const cleanupErrors = [];

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function gitSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function gitDirty() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function poll(label, sample, predicate, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  let last;
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
  const detail = lastError instanceof Error ? lastError.message : JSON.stringify(last);
  throw new Error(`${label} timed out after ${timeoutMs} ms; last sample: ${detail}`);
}

function validatePort(value, label) {
  if (!Number.isInteger(value) || value < 1_024 || value > 65_535) {
    throw new Error(`${label} must be an integer port from 1024 through 65535; received ${value}`);
  }
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
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolveExit(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once('exit', onExit);
  });
}

function processPresent(processId) {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitForProcessExit(processId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processPresent(processId)) return true;
    await delay(100);
  }
  return !processPresent(processId);
}

async function stopOwnedOperatingSystemProcess(processId, label) {
  if (!processPresent(processId)) return;
  process.kill(processId, 'SIGTERM');
  if (!await waitForProcessExit(processId, 5_000)) {
    process.kill(processId, 'SIGKILL');
    if (!await waitForProcessExit(processId, 2_000)) throw new Error(`Owned ${label} process ${processId} did not terminate`);
  }
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const graceful = waitForExit(child, 5_000);
  child.kill('SIGTERM');
  if (!await graceful) {
    const forced = waitForExit(child, 2_000);
    child.kill('SIGKILL');
    if (!await forced) throw new Error(`Owned child ${child.pid ?? 'unknown'} did not terminate`);
  }
}

async function stopViteServer() {
  const httpServer = viteServer?.httpServer;
  if (!httpServer?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    httpServer.close((error) => error ? rejectClose(error) : resolveClose());
    httpServer.closeAllConnections?.();
  });
}

function assertStaticPreconditions() {
  for (const [port, label] of [
    [previewPort, 'preview port'],
    [peerPort, 'PeerJS port'],
    [hostDriverPort, 'host GeckoDriver port'],
    [guestDriverPort, 'guest GeckoDriver port'],
    [hostBidiPort, 'host WebDriver BiDi port'],
    [guestBidiPort, 'guest WebDriver BiDi port'],
  ]) validatePort(port, label);
  if (new Set(allOwnedPorts).size !== allOwnedPorts.length) throw new Error('All Pass 70 Firefox owned ports must be distinct');
  if (!/^[a-f0-9]{40}$/u.test(sourceSha) || gitDirty()) {
    throw new Error('Pass 70 Firefox GeckoDriver verification requires one completely clean source SHA');
  }
  const viteOverrides = ['.env', '.env.local', '.env.production.local']
    .filter((path) => existsSync(resolve(root, path)));
  if (viteOverrides.length > 0) throw new Error(`Pass 70 Firefox gate rejects local Vite overrides: ${viteOverrides.join(', ')}`);
  if (!isAbsolute(archivePath) || !existsSync(archivePath) || !statSync(archivePath).isFile()
    || basename(archivePath) !== identity.geckodriver.archiveName) {
    throw new Error(`PASS70_GECKODRIVER_ARCHIVE_PATH must name ${identity.geckodriver.archiveName}`);
  }
  if (statSync(archivePath).size !== identity.geckodriver.archiveSize
    || sha256File(archivePath) !== identity.geckodriver.archiveSha256) {
    throw new Error('Official GeckoDriver archive size/SHA-256 mismatch');
  }
  if (!isAbsolute(firefoxExecutable) || !existsSync(firefoxExecutable) || !statSync(firefoxExecutable).isFile()
    || basename(firefoxExecutable).toLowerCase() !== identity.firefox.executableName
    || firefoxSha256 !== identity.firefox.sha256) {
    throw new Error('Installed Firefox executable identity mismatch');
  }
}

async function assertPortsInitiallyFree() {
  for (const port of allOwnedPorts) {
    if (await listenerPresent(port)) throw new Error(`Refusing stale or unowned listener on port ${port}`);
  }
}

function extractPinnedGeckodriver() {
  const systemRoot = process.env.SystemRoot ?? 'C:/Windows';
  const tarExecutable = resolve(systemRoot, 'System32', 'tar.exe');
  if (!existsSync(tarExecutable)) throw new Error(`Windows tar executable is unavailable: ${tarExecutable}`);
  const entries = execFileSync(tarExecutable, ['-tf', archivePath], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean);
  if (entries.length !== 1 || entries[0] !== identity.geckodriver.executableName
    || entries.some((entry) => entry.includes('..') || entry.includes('/') || entry.includes('\\') || /^[A-Za-z]:/u.test(entry))) {
    throw new Error(`GeckoDriver archive has unsafe or unexpected entries: ${JSON.stringify(entries)}`);
  }
  mkdirSync(driverExtractionRoot, { recursive: true });
  execFileSync(tarExecutable, ['-xf', archivePath, '-C', driverExtractionRoot], {
    cwd: root,
    stdio: 'pipe',
    windowsHide: true,
  });
  const executable = join(driverExtractionRoot, identity.geckodriver.executableName);
  if (!existsSync(executable) || !statSync(executable).isFile()) throw new Error('Verified GeckoDriver archive did not extract one executable');
  const versionOutput = execFileSync(executable, ['--version'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  if (!new RegExp(`^geckodriver ${identity.geckodriver.version.replaceAll('.', '\\.')}\\b`, 'u').test(versionOutput)) {
    throw new Error(`Extracted GeckoDriver version mismatch: ${versionOutput}`);
  }
  return { executable, entries, executableSha256: sha256File(executable), versionOutput };
}

async function startOwnedPeer() {
  const peerExecutable = resolve(root, 'node_modules', 'peer', 'dist', 'bin', 'peerjs.js');
  if (!existsSync(peerExecutable)) throw new Error(`Owned PeerJS executable is missing: ${peerExecutable}`);
  peerProcess = spawn(process.execPath, [
    peerExecutable,
    '--host', '127.0.0.1', '--port', String(peerPort), '--path', peerPath, '--no-allow_discovery',
  ], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const retain = (chunk) => { peerOutput = `${peerOutput}${String(chunk)}`.slice(-16_384); };
  peerProcess.stdout.on('data', retain);
  peerProcess.stderr.on('data', retain);
  await poll('owned PeerJS readiness', async () => {
    if (peerProcess.exitCode !== null || peerProcess.signalCode !== null) {
      throw new Error(`Owned PeerJS exited before readiness (${peerProcess.exitCode ?? peerProcess.signalCode})\n${peerOutput}`);
    }
    return peerEndpointReady();
  }, Boolean, 15_000, 100);
}

class OwnedGeckoDriver {
  constructor(role, executable, port, bidiPort, profileRoot) {
    this.role = role;
    this.executable = executable;
    this.port = port;
    this.bidiPort = bidiPort;
    this.profileRoot = profileRoot;
    this.endpoint = `http://127.0.0.1:${port}`;
    this.process = null;
    this.sessionId = null;
    this.capabilities = null;
    this.output = '';
    this.bidiSocket = null;
    this.bidiWebSocketUrl = null;
    this.bidiNextId = 1;
    this.bidiPending = new Map();
    this.bidiEntries = [];
    this.bidiPhase = 'session-bootstrap';
    this.bidiFailure = null;
    this.bidiClosing = false;
    this.bidiSubscribed = false;
  }

  async request(method, route, body, timeoutMs = 30_000) {
    const response = await fetch(`${this.endpoint}${route}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.value?.error) {
      const detail = payload?.value?.stacktrace || payload?.value?.message || JSON.stringify(payload);
      throw new Error(`${this.role} WebDriver ${method} ${route} failed (${response.status}): ${detail}`);
    }
    return payload?.value;
  }

  sessionRoute(suffix = '') {
    if (!this.sessionId) throw new Error(`${this.role} Firefox session is not available`);
    return `/session/${this.sessionId}${suffix}`;
  }

  async connectBidi(webSocketUrl) {
    const expectedUrl = new URL(webSocketUrl);
    if (expectedUrl.protocol !== 'ws:' || expectedUrl.hostname !== '127.0.0.1'
      || Number(expectedUrl.port) !== this.bidiPort
      || expectedUrl.pathname !== `/session/${this.sessionId}`) {
      throw new Error(`${this.role} WebDriver BiDi endpoint is not the owned local session: ${webSocketUrl}`);
    }
    this.bidiWebSocketUrl = webSocketUrl;
    this.bidiSocket = new WebSocket(webSocketUrl);
    this.bidiSocket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (Number.isSafeInteger(payload?.id)) {
          const pending = this.bidiPending.get(payload.id);
          if (!pending) return;
          this.bidiPending.delete(payload.id);
          clearTimeout(pending.timer);
          if (payload.type === 'success') pending.resolve(payload.result);
          else pending.reject(new Error(`${this.role} BiDi command failed: ${payload.error ?? 'unknown'} ${payload.message ?? ''}`.trim()));
          return;
        }
        const logEntry = normalizePass70BidiLogEntry(payload, this.bidiPhase);
        if (logEntry) this.bidiEntries.push(logEntry);
      } catch (error) {
        this.bidiFailure = `${this.role} BiDi message parse failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    });
    this.bidiSocket.addEventListener('error', () => {
      if (!this.bidiClosing) this.bidiFailure = `${this.role} WebDriver BiDi socket error`;
    });
    this.bidiSocket.addEventListener('close', () => {
      if (!this.bidiClosing) this.bidiFailure = `${this.role} WebDriver BiDi socket closed unexpectedly`;
      for (const pending of this.bidiPending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`${this.role} WebDriver BiDi socket closed`));
      }
      this.bidiPending.clear();
    });
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error(`${this.role} WebDriver BiDi open timed out`)), 10_000);
      this.bidiSocket.addEventListener('open', () => { clearTimeout(timer); resolveOpen(); }, { once: true });
      this.bidiSocket.addEventListener('error', () => { clearTimeout(timer); rejectOpen(new Error(`${this.role} WebDriver BiDi open failed`)); }, { once: true });
    });
    await this.bidiCommand('session.subscribe', { events: ['log.entryAdded'] });
    this.bidiSubscribed = true;
  }

  async bidiCommand(method, params, timeoutMs = 10_000) {
    if (!this.bidiSocket || this.bidiSocket.readyState !== WebSocket.OPEN || this.bidiFailure) {
      throw new Error(this.bidiFailure ?? `${this.role} WebDriver BiDi socket is unavailable`);
    }
    const id = this.bidiNextId;
    this.bidiNextId += 1;
    return new Promise((resolveCommand, rejectCommand) => {
      const timer = setTimeout(() => {
        this.bidiPending.delete(id);
        rejectCommand(new Error(`${this.role} WebDriver BiDi ${method} timed out`));
      }, timeoutMs);
      this.bidiPending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
      this.bidiSocket.send(JSON.stringify({ id, method, params }));
    });
  }

  beginBidiPhase(phase) {
    if (!this.bidiSubscribed || this.bidiFailure) throw new Error(this.bidiFailure ?? `${this.role} WebDriver BiDi subscription is unavailable`);
    this.bidiPhase = phase;
    return this.bidiEntries.length;
  }

  async bidiErrorsSince(startIndex) {
    await this.bidiCommand('session.status', {});
    if (this.bidiFailure) throw new Error(this.bidiFailure);
    return this.bidiEntries.slice(startIndex).filter((entry) => entry.level === 'error');
  }

  async closeBidi() {
    if (!this.bidiSocket) return;
    this.bidiClosing = true;
    for (const pending of this.bidiPending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`${this.role} WebDriver BiDi closed for cleanup`));
    }
    this.bidiPending.clear();
    if (this.bidiSocket.readyState === WebSocket.OPEN || this.bidiSocket.readyState === WebSocket.CONNECTING) {
      this.bidiSocket.close();
      const deadline = Date.now() + 2_000;
      while (this.bidiSocket.readyState !== WebSocket.CLOSED && Date.now() < deadline) await delay(50);
    }
  }

  async start() {
    mkdirSync(this.profileRoot, { recursive: true });
    this.process = spawn(this.executable, [
      '--host', '127.0.0.1', '--port', String(this.port), '--websocket-port', String(this.bidiPort),
      '--profile-root', this.profileRoot, '--log', 'info',
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const retain = (chunk) => { this.output = `${this.output}${String(chunk)}`.slice(-32_768); };
    this.process.stdout.on('data', retain);
    this.process.stderr.on('data', retain);
    await poll(`${this.role} GeckoDriver readiness`, async () => {
      if (this.process.exitCode !== null || this.process.signalCode !== null) {
        throw new Error(`${this.role} GeckoDriver exited (${this.process.exitCode ?? this.process.signalCode})\n${this.output}`);
      }
      return this.request('GET', '/status', undefined, 1_000).catch(() => null);
    }, (status) => status?.ready === true, 20_000, 100);
    const created = await this.request('POST', '/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'firefox',
          webSocketUrl: true,
          acceptInsecureCerts: false,
          pageLoadStrategy: 'normal',
          'moz:firefoxOptions': {
            binary: firefoxExecutable,
            args: ['-headless'],
            prefs: {
              'browser.shell.checkDefaultBrowser': false,
              'browser.startup.page': 0,
              'datareporting.policy.dataSubmissionEnabled': false,
              'toolkit.telemetry.reportingpolicy.firstRun': false,
            },
            log: { level: 'info' },
          },
        },
      },
    }, 60_000);
    this.sessionId = created?.sessionId;
    this.capabilities = created?.capabilities;
    if (!this.sessionId || !this.capabilities) throw new Error(`${this.role} Firefox returned an incomplete session: ${JSON.stringify(created)}`);
    if (this.capabilities.browserName !== 'firefox'
      || this.capabilities.browserVersion !== identity.firefox.version
      || this.capabilities['moz:headless'] !== true
      || this.capabilities['moz:geckodriverVersion'] !== identity.geckodriver.version
      || typeof this.capabilities.webSocketUrl !== 'string'
      || !Number.isSafeInteger(this.capabilities['moz:processID'])
      || typeof this.capabilities['moz:profile'] !== 'string') {
      throw new Error(`${this.role} Firefox session provenance mismatch: ${JSON.stringify(this.capabilities)}`);
    }
    await this.connectBidi(this.capabilities.webSocketUrl);
    await this.request('POST', this.sessionRoute('/timeouts'), { implicit: 0, pageLoad: 90_000, script: 30_000 });
    await this.request('POST', this.sessionRoute('/window/rect'), { width: 1_280, height: 720 });
  }

  async navigate(url) {
    await this.request('POST', this.sessionRoute('/url'), { url }, 90_000);
  }

  async execute(script, args = [], timeoutMs = 30_000) {
    return this.request('POST', this.sessionRoute('/execute/sync'), { script, args }, timeoutMs);
  }

  async find(selector) {
    const result = await this.request('POST', this.sessionRoute('/element'), { using: 'css selector', value: selector });
    const elementId = result?.[ELEMENT_KEY];
    if (!elementId) throw new Error(`${this.role} Firefox did not find ${selector}: ${JSON.stringify(result)}`);
    return elementId;
  }

  async click(selector) {
    const elementId = await this.find(selector);
    await this.request('POST', this.sessionRoute(`/element/${encodeURIComponent(elementId)}/click`), {});
  }

  async clear(selector) {
    const elementId = await this.find(selector);
    await this.request('POST', this.sessionRoute(`/element/${encodeURIComponent(elementId)}/clear`), {});
  }

  async sendKeys(selector, value) {
    const elementId = await this.find(selector);
    await this.request('POST', this.sessionRoute(`/element/${encodeURIComponent(elementId)}/value`), {
      text: value,
      value: [...value],
    });
  }

  async fill(selector, value) {
    await this.clear(selector);
    await this.sendKeys(selector, value);
  }

  async text(selector) {
    const elementId = await this.find(selector);
    return this.request('GET', this.sessionRoute(`/element/${encodeURIComponent(elementId)}/text`));
  }

  async attribute(selector, name) {
    const elementId = await this.find(selector);
    return this.request('GET', this.sessionRoute(`/element/${encodeURIComponent(elementId)}/attribute/${encodeURIComponent(name)}`));
  }

  async performActions(actions) {
    await this.request('POST', this.sessionRoute('/actions'), { actions });
  }

  async releaseActions() {
    if (!this.sessionId) return;
    await this.request('DELETE', this.sessionRoute('/actions')).catch(() => undefined);
  }

  async currentWindow() {
    return this.request('GET', this.sessionRoute('/window'));
  }

  async newWindow() {
    return this.request('POST', this.sessionRoute('/window/new'), { type: 'tab' });
  }

  async switchWindow(handle) {
    await this.request('POST', this.sessionRoute('/window'), { handle });
  }

  async closeWindow() {
    return this.request('DELETE', this.sessionRoute('/window'));
  }

  async screenshot(path) {
    const encoded = await this.request('GET', this.sessionRoute('/screenshot'), undefined, 30_000);
    if (typeof encoded !== 'string' || encoded.length < 100) throw new Error(`${this.role} Firefox returned an invalid screenshot`);
    writeFileSync(path, Buffer.from(encoded, 'base64'));
  }

  ownership() {
    return {
      role: this.role,
      host: '127.0.0.1',
      port: this.port,
      bidiPort: this.bidiPort,
      localOnly: true,
      sessionId: this.sessionId,
      geckodriverProcessId: this.process?.pid,
      firefoxProcessId: this.capabilities?.['moz:processID'],
      profile: this.capabilities?.['moz:profile'],
      bidiWebSocketUrl: this.bidiWebSocketUrl,
      bidiSubscribed: this.bidiSubscribed,
    };
  }

  async stop() {
    const errors = [];
    const firefoxProcessId = this.capabilities?.['moz:processID'];
    await this.releaseActions();
    try {
      await this.closeBidi();
    } catch (error) {
      errors.push(`WebDriver BiDi: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (this.sessionId) {
      try {
        await this.request('DELETE', this.sessionRoute(), undefined, 15_000);
      } catch (error) {
        errors.push(`session delete: ${error instanceof Error ? error.message : String(error)}`);
      }
      this.sessionId = null;
    }
    try {
      if (Number.isSafeInteger(firefoxProcessId) && !await waitForProcessExit(firefoxProcessId, 5_000)) {
        await stopOwnedOperatingSystemProcess(firefoxProcessId, `${this.role} Firefox`);
      }
    } catch (error) {
      errors.push(`Firefox process: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await stopChild(this.process);
    } catch (error) {
      errors.push(`GeckoDriver process: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (processPresent(firefoxProcessId)) errors.push(`Firefox process ${firefoxProcessId} remained alive`);
    if (this.process && processPresent(this.process.pid)) errors.push(`GeckoDriver process ${this.process.pid} remained alive`);
    if (await listenerPresent(this.port)) errors.push(`GeckoDriver port ${this.port} remained bound`);
    if (errors.length > 0) throw new Error(`${this.role} cleanup failed: ${errors.join('; ')}`);
  }
}

function candidateRoute(seed) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgpu', requireWebGPU: '1', render: 'blender',
    externalServices: 'off', multiplayerQa: '1',
    peerQaPort: String(peerPort), peerQaPath: peerPath, seed,
  })) url.searchParams.set(key, value);
  return url.toString();
}

async function readServedCandidate(expected) {
  const response = await fetch(new URL('channel-provenance.json', baseUrl), {
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Candidate provenance returned HTTP ${response.status}`);
  const value = await response.json();
  const failures = pass70StagedCandidateFailures(value, expected);
  if (failures.length > 0) throw new Error(`Served candidate provenance mismatch: ${failures.join('; ')}`);
  return value;
}

async function preparePlayer(driver, name, seed) {
  const bidiStartIndex = driver.beginBidiPhase(`${seed}:load`);
  await driver.navigate(candidateRoute(seed));
  await poll(`${driver.role} ${seed} menu readiness`, () => driver.execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return {
      stage: state?.bootstrap?.stage ?? null,
      error: state?.bootstrap?.error ?? null,
      weaponReady: state?.weaponReady === true,
      soloEnabled: document.querySelector('#solo')?.disabled === false,
      hostEnabled: document.querySelector('#host')?.disabled === false,
      joinEnabled: document.querySelector('#join')?.disabled === false,
      runtimeLogPresent: document.querySelector('#runtime-error-log') !== null,
      bannerPresent: document.querySelector('#banner') !== null,
      url: location.href,
    };
  `), (state) => state?.stage === 'ready' && state.weaponReady && state.soloEnabled
    && state.hostEnabled && state.joinEnabled && state.runtimeLogPresent && state.bannerPresent, 90_000);
  await driver.fill('#player-name', name);
  return bidiStartIndex;
}

async function installPageProbe(driver) {
  await driver.execute(`
    const probe = {
      phase: 'idle',
      sequence: 0,
      events: [],
      errors: [],
      pointerLockEvents: [],
    };
    const describeTarget = (target) => {
      if (!(target instanceof Element)) return { targetId: null, targetTag: null };
      return {
        targetId: target.id || target.getAttribute('data-mtc') || null,
        targetTag: target.tagName.toLowerCase(),
      };
    };
    const record = (event) => {
      const target = describeTarget(event.target);
      const sequence = ++probe.sequence;
      probe.events.push({
        sequence,
        atMs: performance.now(),
        phase: probe.phase,
        type: event.type,
        trusted: event.isTrusted,
        button: typeof event.button === 'number' ? event.button : null,
        code: typeof event.code === 'string' ? event.code : null,
        key: typeof event.key === 'string' ? event.key : null,
        targetId: target.targetId,
        targetTag: target.targetTag,
        pointerLocked: document.pointerLockElement?.id === 'game',
      });
    };
    for (const type of ['click', 'mousedown', 'mouseup', 'keydown', 'keyup']) {
      window.addEventListener(type, record, true);
    }
    window.addEventListener('error', (event) => {
      probe.errors.push({ type: 'error', message: event.message || String(event.error || 'unknown error') });
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      probe.errors.push({
        type: 'unhandledrejection',
        message: reason instanceof Error ? reason.name + ': ' + reason.message : String(reason),
      });
    });
    document.addEventListener('pointerlockchange', (event) => {
      probe.pointerLockEvents.push({
        sequence: ++probe.sequence,
        atMs: performance.now(),
        phase: probe.phase,
        type: event.type,
        trusted: event.isTrusted,
        lockedElementId: document.pointerLockElement?.id ?? null,
      });
    });
    document.addEventListener('pointerlockerror', (event) => {
      probe.pointerLockEvents.push({
        sequence: ++probe.sequence,
        atMs: performance.now(),
        phase: probe.phase,
        type: event.type,
        trusted: event.isTrusted,
        lockedElementId: document.pointerLockElement?.id ?? null,
      });
    });
    window.__PASS70_GECKODRIVER_PROBE__ = probe;
    return true;
  `);
}

async function setProbePhase(driver, phase) {
  await driver.execute(`
    const probe = window.__PASS70_GECKODRIVER_PROBE__;
    if (!probe) throw new Error('Pass 70 GeckoDriver input probe is missing');
    probe.phase = arguments[0];
    return true;
  `, [phase]);
}

async function trustedClick(driver, phase, selector) {
  await setProbePhase(driver, phase);
  await driver.click(selector);
}

async function startFrameProbe(driver) {
  await driver.execute(`
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    if (!snapshot) throw new Error('Atomic Acres debug snapshot is unavailable');
    const startedAt = performance.now();
    const probe = {
      active: true,
      frames: 0,
      gaps: [],
      last: startedAt,
      startedAt,
      startingGameFrame: snapshot.frameCount,
    };
    window.__PASS70_GECKODRIVER_FRAME_PROBE__ = probe;
    const tick = (now) => {
      if (!probe.active) return;
      if (probe.frames > 0) probe.gaps.push(now - probe.last);
      probe.last = now;
      probe.frames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  `);
}

async function waitForFrameWindow(driver) {
  await poll(`${driver.role} two-second frame window`, () => driver.execute(`
    const probe = window.__PASS70_GECKODRIVER_FRAME_PROBE__;
    return probe ? { elapsed: performance.now() - probe.startedAt, frames: probe.frames } : null;
  `), (value) => value?.elapsed >= 2_050 && value.frames > 30, 10_000, 100);
}

async function stopFrameProbe(driver) {
  return driver.execute(`
    const probe = window.__PASS70_GECKODRIVER_FRAME_PROBE__;
    if (!probe) throw new Error('Pass 70 GeckoDriver frame probe is missing');
    probe.active = false;
    const endedAt = performance.now();
    const endGapMs = endedAt - probe.last;
    const sorted = [...probe.gaps].sort((left, right) => left - right);
    const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      wallClockMs: endedAt - probe.startedAt,
      frames: probe.frames,
      frameDelta: state.frameCount - probe.startingGameFrame,
      maxGapMs: Math.max(0, endGapMs, ...sorted),
      endGapMs,
      p95GapMs: percentile(0.95),
    };
  `);
}

async function sampleAudio(driver) {
  return driver.execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const standard = typeof window.AudioContext === 'function' ? window.AudioContext : null;
    const webkit = typeof window.webkitAudioContext === 'function' ? window.webkitAudioContext : null;
    const Constructor = standard ?? webkit;
    if (!Constructor) {
      return {
        context: state.audio.context,
        listenerPoseMode: state.audio.listener.poseMode,
        expectedListenerPoseMode: 'unavailable',
        capabilities: { constructorSource: 'unavailable', properties: {}, methods: {} },
      };
    }
    const context = new Constructor();
    const listener = context.listener;
    const typeOf = (value) => value === null ? 'null' : typeof value;
    const properties = Object.fromEntries([
      'positionX', 'positionY', 'positionZ',
      'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ',
    ].map((name) => {
      const property = listener[name];
      return [name, { propertyType: typeOf(property), valueType: typeOf(property?.value) }];
    }));
    const methods = {
      setPosition: typeOf(listener.setPosition),
      setOrientation: typeOf(listener.setOrientation),
    };
    const audioParam = (name) => properties[name]?.propertyType === 'object' && properties[name]?.valueType === 'number';
    const modernPosition = ['positionX', 'positionY', 'positionZ'].every(audioParam);
    const modernOrientation = ['forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].every(audioParam);
    const legacyPosition = methods.setPosition === 'function';
    const legacyOrientation = methods.setOrientation === 'function';
    let expectedListenerPoseMode = 'hybrid';
    if ((!modernPosition && !legacyPosition) || (!modernOrientation && !legacyOrientation)) {
      expectedListenerPoseMode = 'unavailable';
    } else if (modernPosition && modernOrientation) {
      expectedListenerPoseMode = 'modern-audio-param';
    } else if (!modernPosition && !modernOrientation) {
      expectedListenerPoseMode = 'legacy-setters';
    }
    void context.close();
    return {
      context: state.audio.context,
      listenerPoseMode: state.audio.listener.poseMode,
      expectedListenerPoseMode,
      capabilities: {
        constructorSource: standard ? 'standard' : 'webkit',
        properties,
        methods,
      },
    };
  `);
}

async function sampleFaults(driver, bidiStartIndex) {
  const value = await driver.execute(`
    const runtimeLog = document.querySelector('#runtime-error-log');
    const banner = document.querySelector('#banner');
    const capturedErrors = window.__PASS70_GECKODRIVER_PROBE__?.errors ?? [];
    const runtimeErrorLog = runtimeLog?.textContent?.trim() ?? '';
    const bannerText = banner?.textContent?.trim() ?? '';
    return {
      runtimeErrorLogPresent: runtimeLog !== null,
      bannerPresent: banner !== null,
      runtimeErrorLog,
      systemPaused: bannerText.includes('SYSTEM PAUSED'),
      capturedErrors,
      faultText: [runtimeErrorLog, bannerText, ...capturedErrors.map((entry) => entry.message)].join('\\n'),
    };
  `);
  const bidiErrors = await driver.bidiErrorsSince(bidiStartIndex);
  value.bidiErrors = bidiErrors;
  value.faultText = [value.faultText, ...bidiErrors.map((entry) => entry.text)].filter(Boolean).join('\n');
  if (!value.runtimeErrorLogPresent || !value.bannerPresent || value.runtimeErrorLog
    || value.systemPaused || value.capturedErrors.length > 0 || bidiErrors.length > 0 || faultPattern.test(value.faultText)) {
    throw new Error(`${driver.role} Firefox reported a runtime fault: ${JSON.stringify(value)}`);
  }
  return value;
}

async function runSoloCycle(driver, label) {
  const bidiStartIndex = await preparePlayer(driver, `Firefox ${label}`, `pass70-firefox-${label}`);
  await installPageProbe(driver);
  await trustedClick(driver, 'solo', '#solo');
  const active = await poll(`${label} exact one-bot Skirmish`, () => driver.execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state ? {
      gameStarted: state.gameStarted === true,
      matchPhase: state.matchPhase,
      botCount: state.bots?.length,
      backend: state.render?.runtime?.actualBackend ?? null,
      requestedBackend: state.render?.runtime?.requestedBackend ?? null,
      failClosed: state.render?.runtime?.failClosed ?? null,
      deviceLost: state.render?.runtime?.deviceLost ?? null,
      uncapturedErrors: state.render?.runtime?.uncapturedErrors ?? null,
      qualityAssetState: state.render?.qualityAssetStreaming?.atomicAcres ?? null,
      post: state.render?.atomicSignal ?? null,
      webglVersion: state.render?.webglVersion ?? null,
      userAgent: navigator.userAgent,
      weapon: state.player?.weapon,
    } : null;
  `), (state) => state?.gameStarted && state.matchPhase === 'active' && state.botCount === 1, 90_000);
  if (active.weapon !== 'carbine' || active.requestedBackend !== 'webgpu' || active.backend !== 'webgpu'
    || active.failClosed !== true || active.deviceLost !== false || active.uncapturedErrors !== 0
    || active.qualityAssetState !== 'ready' || active.post?.depthAwareBloom !== true
    || active.post?.advancedGraphics?.bloomStrength <= 0) {
    throw new Error(`${label} Firefox one-bot backend/weapon mismatch: ${JSON.stringify(active)}`);
  }
  const setup = await driver.execute(`
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.setAmmo('carbine', 2, 30);
    return { state: debug.snapshot().player, readiness: debug.sampleActiveWeaponReadiness() };
  `);
  if (setup.state.ammo !== 2 || setup.state.reserve !== 30 || setup.readiness?.ready !== true) {
    throw new Error(`${label} Firefox deterministic weapon setup failed: ${JSON.stringify(setup)}`);
  }
  await driver.find('#game');
  const canvasTarget = await driver.execute(`
    const canvas = document.querySelector('#game');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const rect = canvas.getBoundingClientRect();
    const bounds = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
    const candidates = [
      [0.16, 0.18], [0.84, 0.18], [0.16, 0.82], [0.84, 0.82],
      [0.50, 0.50], [0.28, 0.50], [0.72, 0.50],
    ];
    for (const [xFraction, yFraction] of candidates) {
      const x = Math.round(rect.left + rect.width * xFraction);
      const y = Math.round(rect.top + rect.height * yFraction);
      const top = document.elementFromPoint(x, y);
      if (top === canvas) {
        return {
          x,
          y,
          elementId: canvas.id,
          topElementId: top.id,
          topElementTag: top.tagName.toLowerCase(),
          rect: bounds,
          verifiedAtAction: true,
        };
      }
    }
    return {
      x: -1,
      y: -1,
      elementId: canvas.id,
      topElementId: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.id ?? null,
      topElementTag: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.tagName?.toLowerCase() ?? null,
      rect: bounds,
      verifiedAtAction: false,
    };
  `);
  if (canvasTarget?.verifiedAtAction !== true || canvasTarget.elementId !== 'game' || canvasTarget.topElementId !== 'game') {
    throw new Error(`${label} Firefox has no unobscured native canvas input point: ${JSON.stringify(canvasTarget)}`);
  }
  const preRetryPointerLock = await poll(`${label} automatic pointer-lock request settlement`, () => driver.execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return {
      locked: document.pointerLockElement?.id === 'game',
      surface: state?.menuLifecycle?.surface ?? null,
      pointerLockLifecycle: state?.menuLifecycle?.pointerLock ?? null,
      pointerRejectCount: state?.menuLifecycle?.pointerRejectCount ?? null,
      status: document.querySelector('#status')?.textContent?.trim() ?? '',
      pointerLockEvents: window.__PASS70_GECKODRIVER_PROBE__?.pointerLockEvents ?? [],
    };
  `), (state) => state?.locked === true || (state?.pointerLockLifecycle === 'denied'
    && state.pointerLockEvents.some((event) => event?.type === 'pointerlockerror' && event.phase === 'solo')),
  10_000, 100);
  if (preRetryPointerLock.locked || preRetryPointerLock.surface !== 'hidden'
    || preRetryPointerLock.pointerLockLifecycle !== 'denied'
    || !Number.isSafeInteger(preRetryPointerLock.pointerRejectCount) || preRetryPointerLock.pointerRejectCount < 1) {
    throw new Error(`${label} Firefox automatic pointer-lock request did not settle into the expected retry state: ${JSON.stringify({ canvasTarget, preRetryPointerLock })}`);
  }
  await setProbePhase(driver, 'pointer-lock');
  await driver.performActions([{
    type: 'pointer', id: 'pass70-mouse', parameters: { pointerType: 'mouse' },
    actions: [
      { type: 'pointerMove', duration: 0, origin: 'viewport', x: canvasTarget.x, y: canvasTarget.y },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 80 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  await poll(`${label} trusted canvas pointer lock`, () => driver.execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return {
      locked: document.pointerLockElement?.id === 'game',
      focused: document.hasFocus(),
      surface: state?.menuLifecycle?.surface ?? null,
      pointerLockLifecycle: state?.menuLifecycle?.pointerLock ?? null,
      pointerRejectCount: state?.menuLifecycle?.pointerRejectCount ?? null,
      status: document.querySelector('#status')?.textContent?.trim() ?? '',
      topElementId: document.elementFromPoint(arguments[0], arguments[1])?.id ?? null,
      canvasRect: (() => {
        const rect = document.querySelector('#game')?.getBoundingClientRect();
        return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
      })(),
      events: (window.__PASS70_GECKODRIVER_PROBE__?.events ?? []).filter((event) => event.phase === 'pointer-lock'),
      pointerLockEvents: window.__PASS70_GECKODRIVER_PROBE__?.pointerLockEvents ?? [],
    };
  `, [canvasTarget.x, canvasTarget.y]), (state) => state?.locked === true && state.focused === true, 15_000);
  await startFrameProbe(driver);
  await setProbePhase(driver, 'ads-down');
  await driver.performActions([{
    type: 'pointer', id: 'pass70-mouse', parameters: { pointerType: 'mouse' },
    actions: [{ type: 'pointerDown', button: 2 }],
  }]);
  await poll(`${label} trusted ADS down`, () => driver.execute(`
    return window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.adsHeld;
  `), (held) => held === true, 5_000);
  const beforeFire = await driver.execute(`return window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo;`);
  await setProbePhase(driver, 'fire');
  await driver.performActions([{
    type: 'pointer', id: 'pass70-mouse', parameters: { pointerType: 'mouse' },
    actions: [
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 60 },
      { type: 'pointerUp', button: 0 },
    ],
  }]);
  const afterFire = await poll(`${label} trusted fire ammo mutation`, () => driver.execute(`
    return window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo;
  `), (ammo) => ammo === beforeFire - 1, 5_000);
  await setProbePhase(driver, 'ads-up');
  await driver.performActions([{
    type: 'pointer', id: 'pass70-mouse', parameters: { pointerType: 'mouse' },
    actions: [{ type: 'pointerUp', button: 2 }],
  }]);
  await poll(`${label} trusted ADS release`, () => driver.execute(`
    return window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.adsHeld;
  `), (held) => held === false, 5_000);
  await setProbePhase(driver, 'reload');
  await driver.performActions([{
    type: 'key', id: 'pass70-keyboard', actions: [
      { type: 'keyDown', value: 'r' },
      { type: 'keyUp', value: 'r' },
    ],
  }]);
  await poll(`${label} trusted reload start`, () => driver.execute(`
    return window.__ATOMIC_ACRES_DEBUG__.snapshot().player.reloading;
  `), (reloading) => reloading === true, 5_000);
  const afterReload = await poll(`${label} trusted reload completion`, () => driver.execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
    return { ammo: state.ammo, reserve: state.reserve, reloading: state.reloading };
  `), (state) => state?.reloading === false && state.ammo > afterFire, 15_000);
  await waitForFrameWindow(driver);
  const frames = await stopFrameProbe(driver);
  const [audio, faults, eventState] = await Promise.all([
    sampleAudio(driver),
    sampleFaults(driver, bidiStartIndex),
    driver.execute(`
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        pointerLock: document.pointerLockElement?.id === 'game',
        adsHeld: state.textChat.adsHeld,
        events: window.__PASS70_GECKODRIVER_PROBE__.events,
        pointerLockEvents: window.__PASS70_GECKODRIVER_PROBE__.pointerLockEvents,
        menuLifecycle: state.menuLifecycle,
      };
    `),
  ]);
  await driver.releaseActions();
  return {
    label,
    gameStarted: active.gameStarted,
    matchPhase: active.matchPhase,
    botCount: active.botCount,
    backend: active.backend,
    requestedBackend: active.requestedBackend,
    failClosed: active.failClosed,
    deviceLost: active.deviceLost,
    uncapturedErrors: active.uncapturedErrors,
    qualityAssetState: active.qualityAssetState,
    post: active.post,
    webglVersion: active.webglVersion,
    userAgent: active.userAgent,
    pointerLock: eventState.pointerLock,
    canvasTarget,
    preRetryPointerLock,
    pointerLockEvents: eventState.pointerLockEvents,
    pointerLockLifecycle: {
      surface: eventState.menuLifecycle.surface,
      state: eventState.menuLifecycle.pointerLock,
      rejectCount: eventState.menuLifecycle.pointerRejectCount,
    },
    adsHeldObserved: true,
    adsReleasedObserved: eventState.adsHeld === false,
    ammo: { beforeFire, afterFire, afterReload: afterReload.ammo, reserveAfterReload: afterReload.reserve },
    reload: { observedStart: true, observedCompletion: afterReload.reloading === false },
    trustedEvents: eventState.events,
    frames,
    audio,
    faults,
  };
}

async function waitForActivePair(host, guest, label) {
  return Promise.all([host, guest].map((driver) => poll(`${label} ${driver.role} active pair`, () => driver.execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state ? {
      gameStarted: state.gameStarted === true,
      matchPhase: state.matchPhase,
      members: state.privateMatch?.members ?? [],
      remotePlayers: state.remotePlayers?.length ?? 0,
      playerId: state.player?.id ?? null,
      hostedBotCount: state.privateMatch?.hostedBotCount ?? null,
    } : null;
  `), (state) => state?.gameStarted && state.matchPhase === 'active'
    && state.members.length === 2 && state.members.every((member) => member.connected)
    && state.remotePlayers === 1, 90_000)));
}

async function runMultiplayer(host, guest) {
  const [hostBidiStartIndex, guestBidiStartIndex] = await Promise.all([
    preparePlayer(host, 'Firefox Host', 'pass70-firefox-host'),
    preparePlayer(guest, 'Firefox Guest', 'pass70-firefox-guest'),
  ]);
  await Promise.all([installPageProbe(host), installPageProbe(guest)]);
  await trustedClick(host, 'host', '#host');
  const roomCode = await poll('Firefox host room code', () => host.text('#room-code'), (value) => typeof value === 'string' && value.trim().length >= 6, 45_000);
  await guest.fill('#room-input', roomCode.trim());
  await trustedClick(guest, 'join', '#join');
  await Promise.all([host, guest].map((driver) => poll(`${driver.role} two-member lobby`, () => driver.execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.privateMatch ? {
      members: state.privateMatch.members.length,
      hostedBotCount: state.privateMatch.hostedBotCount,
    } : null;
  `), (state) => state?.members === 2, 60_000)));
  const hostedBotCount = await host.execute(`return window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.hostedBotCount;`);
  if (hostedBotCount !== 0) {
    await trustedClick(host, 'host-bots-zero', '#lobby-bots option[value="0"]');
    await poll('Firefox hosted bot count zero', () => host.execute(`
      return window.__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.hostedBotCount;
    `), (count) => count === 0, 10_000);
  }
  await trustedClick(host, 'host-ready', '#lobby-ready');
  await trustedClick(guest, 'guest-ready', '#lobby-ready');
  await poll('Firefox host start enabled', () => host.execute(`return document.querySelector('#lobby-start')?.disabled === false;`), Boolean, 15_000);
  await trustedClick(host, 'host-start', '#lobby-start');
  const initialStates = await waitForActivePair(host, guest, 'initial');
  const initialMemberIds = {
    host: initialStates[0].members.map((member) => member.id).sort(),
    guest: initialStates[1].members.map((member) => member.id).sort(),
  };
  const initialHostId = initialStates[0].playerId;
  const initialGuestId = initialStates[1].playerId;
  const initiallyConverged = JSON.stringify(initialMemberIds.host) === JSON.stringify(initialMemberIds.guest)
    && initialMemberIds.host.includes(initialHostId) && initialMemberIds.host.includes(initialGuestId)
    && initialHostId !== initialGuestId;
  if (!initiallyConverged) throw new Error(`Firefox initial host/guest roster split-brain: ${JSON.stringify({ initialMemberIds, initialHostId, initialGuestId })}`);
  const hostEvents = await host.execute(`return window.__PASS70_GECKODRIVER_PROBE__.events;`);
  const guestEvents = await guest.execute(`return window.__PASS70_GECKODRIVER_PROBE__.events;`);
  const originalGuestWindow = await guest.currentWindow();
  const replacement = await guest.newWindow();
  if (!replacement?.handle || replacement.type !== 'tab' || replacement.handle === originalGuestWindow) {
    throw new Error(`Firefox guest did not create an independent replacement tab: ${JSON.stringify(replacement)}`);
  }
  await guest.switchWindow(originalGuestWindow);
  const remainingHandles = await guest.closeWindow();
  if (!Array.isArray(remainingHandles) || !remainingHandles.includes(replacement.handle)) {
    throw new Error(`Firefox guest replacement tab was not retained: ${JSON.stringify(remainingHandles)}`);
  }
  await guest.switchWindow(replacement.handle);
  await poll('Firefox host observes destroyed guest page', () => host.execute(`
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.privateMatch?.members.find((member) => member.id === arguments[0])?.connected ?? null;
  `, [initialGuestId]), (connected) => connected === false, 30_000);
  await preparePlayer(guest, 'Firefox Guest', 'pass70-firefox-guest-rejoin');
  await installPageProbe(guest);
  await guest.fill('#room-input', roomCode.trim());
  const rejoinAvailable = await guest.attribute('#join', 'data-rejoin-available');
  if (rejoinAvailable !== 'true') throw new Error(`Firefox guest rejoin is unavailable: ${rejoinAvailable}`);
  await trustedClick(guest, 'rejoin', '#join');
  const rejoinedStates = await waitForActivePair(host, guest, 'rejoined');
  const rejoinedGuestId = rejoinedStates[1].playerId;
  if (rejoinedGuestId !== initialGuestId) {
    throw new Error(`Firefox guest identity changed across rejoin: ${initialGuestId} -> ${rejoinedGuestId}`);
  }
  const rejoinedMemberIds = {
    host: rejoinedStates[0].members.map((member) => member.id).sort(),
    guest: rejoinedStates[1].members.map((member) => member.id).sort(),
  };
  const rosterPreservedAfterRejoin = JSON.stringify(rejoinedMemberIds.host) === JSON.stringify(rejoinedMemberIds.guest)
    && JSON.stringify(rejoinedMemberIds.host) === JSON.stringify(initialMemberIds.host);
  if (!rosterPreservedAfterRejoin) {
    throw new Error(`Firefox rejoined host/guest roster split-brain: ${JSON.stringify({ initialMemberIds, rejoinedMemberIds })}`);
  }
  await Promise.all([startFrameProbe(host), startFrameProbe(guest)]);
  await Promise.all([waitForFrameWindow(host), waitForFrameWindow(guest)]);
  const [hostFrames, guestFrames] = await Promise.all([stopFrameProbe(host), stopFrameProbe(guest)]);
  const [hostFaults, guestFaults, rejoinedGuestEvents] = await Promise.all([
    sampleFaults(host, hostBidiStartIndex),
    sampleFaults(guest, guestBidiStartIndex),
    guest.execute(`return window.__PASS70_GECKODRIVER_PROBE__.events;`),
  ]);
  return {
    hostGuestIndependentSessions: host.sessionId !== guest.sessionId
      && host.capabilities['moz:processID'] !== guest.capabilities['moz:processID']
      && host.capabilities['moz:profile'] !== guest.capabilities['moz:profile'],
    initiallyConverged,
    initialMemberIds,
    initialHostId,
    initialGuestId,
    hostedBotCountBefore: { host: initialStates[0].hostedBotCount, guest: initialStates[1].hostedBotCount },
    remotePlayersBefore: { host: initialStates[0].remotePlayers, guest: initialStates[1].remotePlayers },
    guestPageDestroyed: true,
    hostObservedDisconnect: true,
    originalGuestWindow,
    replacementGuestWindow: replacement.handle,
    remainingGuestWindowsAfterClose: remainingHandles,
    rejoinAvailable: rejoinAvailable === 'true',
    rejoinIdentityPreserved: rejoinedGuestId === initialGuestId,
    rejoinedGuestId,
    rejoinedMemberIds,
    activeAfterRejoin: rejoinedStates.every((state) => state.gameStarted && state.matchPhase === 'active'),
    membersConnectedAfterRejoin: rejoinedStates.every((state) => state.members.every((member) => member.connected)),
    rosterPreservedAfterRejoin,
    hostedBotCountAfter: { host: rejoinedStates[0].hostedBotCount, guest: rejoinedStates[1].hostedBotCount },
    remotePlayersAfter: { host: rejoinedStates[0].remotePlayers, guest: rejoinedStates[1].remotePlayers },
    trustedLobbyEvents: { host: hostEvents, guest: guestEvents, rejoinedGuest: rejoinedGuestEvents },
    frames: { host: hostFrames, guest: guestFrames },
    faults: { host: hostFaults, guest: guestFaults },
  };
}

function pngMetadata(path, artifactPath) {
  const bytes = readFileSync(path);
  const signature = bytes.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error(`Firefox screenshot is not a valid PNG: ${path}`);
  }
  return {
    path: artifactPath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function verifyScreenshotRecord(record) {
  const absolute = resolve(root, record.path);
  if (!absolute.startsWith(`${evidenceRoot}\\`) && absolute !== evidenceRoot) throw new Error(`Screenshot escaped evidence root: ${record.path}`);
  const current = pngMetadata(absolute, record.path);
  if (JSON.stringify(current) !== JSON.stringify(record)) throw new Error(`Screenshot bytes drifted: ${record.path}`);
}

async function executeGate() {
  assertStaticPreconditions();
  await assertPortsInitiallyFree();
  rmSync(evidenceRoot, { recursive: true, force: true });
  mkdirSync(evidenceRoot, { recursive: true });
  const geckodriver = extractPinnedGeckodriver();
  execFileSync(process.execPath, [resolve(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', temporaryDist, '--emptyOutDir'], {
    cwd: root,
    env: buildEnvironment,
    stdio: 'inherit',
    windowsHide: true,
  });
  execFileSync(process.execPath, [resolve(root, 'scripts', 'release', 'stage-release-topology.mjs')], {
    cwd: root,
    env: {
      ...buildEnvironment,
      SOURCE_SHA: sourceSha,
      RELEASE_PASS: identity.releasePass,
      RELEASE_DIST_ROOT: temporaryDist,
      RELEASE_TOPOLOGY_RECEIPT_PATH: topologyReceiptPath,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const topology = JSON.parse(readFileSync(topologyReceiptPath, 'utf8'));
  if (topology?.schemaVersion !== 4 || topology.sourceSha !== sourceSha
    || topology.releasePass !== identity.releasePass || topology.root?.kind !== 'chooser-only') {
    throw new Error(`Pass 70 staged topology identity mismatch: ${JSON.stringify(topology)}`);
  }
  const candidate = topology.channels?.experimental;
  const candidateFailures = pass70StagedCandidateFailures(candidate, {
    sourceSha,
    treeSha256: candidate?.treeSha256,
    exactRootFileCount: candidate?.exactRootFileCount,
  });
  if (candidateFailures.length > 0) throw new Error(`Pass 70 staged candidate is invalid: ${candidateFailures.join('; ')}`);
  viteServer = await preview({
    build: { outDir: temporaryDist },
    preview: { host: '127.0.0.1', port: previewPort, strictPort: true },
  });
  await startOwnedPeer();
  const expected = {
    sourceSha,
    treeSha256: candidate.treeSha256,
    exactRootFileCount: candidate.exactRootFileCount,
    baseUrl,
    previewPort,
    peerPort,
    peerPath,
    driverPorts,
    bidiPorts,
  };
  const servedCandidateBefore = await readServedCandidate(expected);
  hostDriver = new OwnedGeckoDriver('host', geckodriver.executable, hostDriverPort, hostBidiPort, driverProfileRoots.host);
  guestDriver = new OwnedGeckoDriver('guest', geckodriver.executable, guestDriverPort, guestBidiPort, driverProfileRoots.guest);
  await hostDriver.start();
  await guestDriver.start();
  const hostOwnership = hostDriver.ownership();
  const guestOwnership = guestDriver.ownership();
  if (hostOwnership.sessionId === guestOwnership.sessionId
    || hostOwnership.geckodriverProcessId === guestOwnership.geckodriverProcessId
    || hostOwnership.firefoxProcessId === guestOwnership.firefoxProcessId
    || hostOwnership.profile === guestOwnership.profile) {
    throw new Error('Firefox host and guest sessions are not independent');
  }
  const soloCycles = [
    await runSoloCycle(hostDriver, 'cold'),
    await runSoloCycle(hostDriver, 'warm'),
  ];
  const soloArtifactPath = 'artifacts/pass70/firefox-geckodriver/firefox-warm-one-bot.png';
  const soloAbsolutePath = resolve(root, soloArtifactPath);
  await hostDriver.screenshot(soloAbsolutePath);
  const soloScreenshot = pngMetadata(soloAbsolutePath, soloArtifactPath);
  const multiplayer = await runMultiplayer(hostDriver, guestDriver);
  const multiplayerArtifactPath = 'artifacts/pass70/firefox-geckodriver/firefox-multiplayer-rejoin.png';
  const multiplayerAbsolutePath = resolve(root, multiplayerArtifactPath);
  await hostDriver.screenshot(multiplayerAbsolutePath);
  const multiplayerScreenshot = pngMetadata(multiplayerAbsolutePath, multiplayerArtifactPath);
  const servedCandidateAfter = await readServedCandidate(expected);
  const userAgents = await Promise.all([
    hostDriver.execute('return navigator.userAgent;'),
    guestDriver.execute('return navigator.userAgent;'),
  ]);
  completed = {
    expected,
    receipt: {
      schema: identity.schema,
      schemaVersion: identity.schemaVersion,
      status: 'PASS',
      gate: identity.gate,
      releasePass: identity.releasePass,
      sourceSha,
      sourceState: null,
      servedCandidateBefore,
      servedCandidateAfter,
      toolchain: {
        node: { version: process.version, platform: process.platform, arch: process.arch },
        firefox: {
          executablePath: firefoxExecutable,
          executableName: basename(firefoxExecutable).toLowerCase(),
          sha256: firefoxSha256,
          expectedVersion: identity.firefox.version,
          sessionVersions: [hostDriver.capabilities.browserVersion, guestDriver.capabilities.browserVersion],
          userAgents,
          headless: true,
          automation: 'raw-w3c-http+bidi',
        },
        geckodriver: {
          version: identity.geckodriver.version,
          releaseTag: identity.geckodriver.releaseTag,
          releaseUrl: identity.geckodriver.releaseUrl,
          archive: {
            path: archivePath,
            name: basename(archivePath),
            url: identity.geckodriver.archiveUrl,
            bytes: statSync(archivePath).size,
            sha256: sha256File(archivePath),
            entries: geckodriver.entries,
          },
          executableSha256: geckodriver.executableSha256,
          versionOutput: geckodriver.versionOutput,
        },
      },
      ownership: {
        preview: { host: '127.0.0.1', port: previewPort, baseUrl, localOnly: true },
        peer: { host: '127.0.0.1', port: peerPort, path: peerPath, localOnly: true },
        drivers: [hostOwnership, guestOwnership],
      },
      cleanup: null,
      soloCycles,
      multiplayer,
      screenshots: { solo: soloScreenshot, multiplayer: multiplayerScreenshot },
      errors: [],
    },
  };
}

try {
  await executeGate();
} catch (error) {
  failure = error;
} finally {
  for (const [label, cleanup] of [
    ['guest Firefox/GeckoDriver', () => guestDriver?.stop()],
    ['host Firefox/GeckoDriver', () => hostDriver?.stop()],
    ['PeerJS', () => stopChild(peerProcess)],
    ['Vite preview', () => stopViteServer()],
  ]) {
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const port of allOwnedPorts) {
    if (await listenerPresent(port)) cleanupErrors.push(`owned port ${port} remained bound after cleanup`);
  }
  if (completed) {
    const ports = [];
    for (const port of allOwnedPorts) ports.push({ port, free: !await listenerPresent(port) });
    const firefoxProcessIds = completed.receipt.ownership.drivers.map((driver) => driver.firefoxProcessId);
    const geckodriverProcessIds = completed.receipt.ownership.drivers.map((driver) => driver.geckodriverProcessId);
    completed.receipt.cleanup = {
      ports,
      firefoxProcessIds,
      geckodriverProcessIds,
      allOwnedPortsReleased: ports.every((entry) => entry.free),
      allOwnedProcessesExited: [...firefoxProcessIds, ...geckodriverProcessIds].every((processId) => !processPresent(processId)),
    };
  }
  try {
    rmSync(temporaryRoot, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(`temporary profile cleanup: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failure || cleanupErrors.length > 0 || !completed) {
  rmSync(evidenceRoot, { recursive: true, force: true });
  const detail = failure instanceof Error ? failure.stack ?? failure.message : String(failure ?? 'gate did not complete');
  const driverDetail = [hostDriver, guestDriver]
    .map((driver) => driver?.output ? `--- ${driver.role} geckodriver ---\n${driver.output}` : '')
    .filter(Boolean)
    .join('\n');
  const peerDetail = peerOutput ? `--- PeerJS ---\n${peerOutput}` : '';
  throw new Error([detail, ...cleanupErrors, driverDetail, peerDetail].filter(Boolean).join('\n'));
}

const endingSha = gitSha();
const endingDirty = gitDirty();
completed.receipt.sourceState = {
  startingSha: sourceSha,
  endingSha,
  cleanBefore: true,
  cleanAfter: endingDirty === '',
};
if (endingSha !== sourceSha || endingDirty) {
  rmSync(evidenceRoot, { recursive: true, force: true });
  throw new Error(`Pass 70 Firefox source drifted during verification: SHA=${endingSha}, dirty=${endingDirty || '(clean)'}`);
}
assertPass70FirefoxGeckodriverReceipt(completed.receipt, completed.expected);
verifyScreenshotRecord(completed.receipt.screenshots.solo);
verifyScreenshotRecord(completed.receipt.screenshots.multiplayer);
const temporaryReceiptPath = `${receiptPath}.tmp`;
writeFileSync(temporaryReceiptPath, `${JSON.stringify(completed.receipt, null, 2)}\n`, 'utf8');
renameSync(temporaryReceiptPath, receiptPath);
console.log(JSON.stringify({
  status: 'PASS',
  gate: identity.gate,
  sourceSha,
  receiptPath: relative(root, receiptPath).replaceAll('\\', '/'),
}, null, 2));
