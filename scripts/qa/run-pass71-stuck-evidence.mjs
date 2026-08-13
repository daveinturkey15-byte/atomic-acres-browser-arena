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
import net from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { preview } from 'vite';
import {
  PASS71_STUCK_CLAIMS,
  PASS71_STUCK_EVIDENCE,
  PASS71_STUCK_EVIDENCE_TOOL_PATHS,
  assertPass71StuckEvidence,
  pass71StuckEvidenceRecordSha256,
  pass71StuckEvidenceToolingHashesAtSource,
} from './pass71-stuck-evidence-contract.mjs';
import { readWindowsExecutableIdentity } from './pass71-edge-executable-identity.mjs';
import { assertStagedTopology } from './pass66-owned-browser-verifier-contract.mjs';
import {
  PASS66_MULTIPLAYER_BROWSER_CHANNEL,
  PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV,
  PASS66_MULTIPLAYER_BROWSER_EXECUTABLE_ENV,
  PASS66_MULTIPLAYER_BROWSER_SHA256_ENV,
  PASS66_MULTIPLAYER_FORBIDDEN_AUTOMATION_ENV,
} from './pass66-multiplayer-stability-contract.mjs';
import { PASS70_NATIVE_USER_AGENT_ENV } from './pass70-cross-browser-native-user-agent-contract.mjs';

const root = resolve(process.cwd());
const values = parseArgs(process.argv.slice(2));
const expectedSourceSha = values['expected-source-sha'];
const previewPort = boundedPort(values['preview-port'] ?? process.env.PASS71_STUCK_PREVIEW_PORT ?? '4568', 'preview');
const peerPort = boundedPort(values['peer-port'] ?? process.env.PASS71_STUCK_PEER_PORT ?? '9078', 'PeerJS');
const peerPath = `/peerjs-hf310-${randomBytes(8).toString('hex')}`;
const artifactRoot = resolve(root, 'artifacts/pass71/stuck-evidence');
const evidencePath = resolve(artifactRoot, `${expectedSourceSha}-native-evidence.json`);
const checkoutSourceSha = git('rev-parse', 'HEAD');
const cleanBefore = sourceStatus() === '';
const temporaryRoot = mkdtempSync(join(tmpdir(), 'atomic-acres-pass71-stuck-evidence-'));
const temporaryDist = join(temporaryRoot, 'dist');
const topologyReceiptPath = join(temporaryRoot, 'release-topology.json');
const componentPath = join(temporaryRoot, 'stuck-browser-component.json');
const ownedReceiptPath = join(temporaryRoot, 'owned-browser-receipt-unused.json');

let server = null;
let playwrightProcess = null;
let chromeExecutable = null;
let failed = true;

function parseArgs(argv) {
  const allowed = new Set(['expected-source-sha', 'preview-port', 'peer-port', 'chrome-executable']);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Pass 71 STUCK runner expected --name value; received ${name ?? '(missing)'}`);
    }
    const key = name.slice(2);
    if (!allowed.has(key)) throw new Error(`Pass 71 STUCK runner received unknown argument --${key}`);
    if (Object.hasOwn(parsed, key)) throw new Error(`Pass 71 STUCK runner received duplicate argument --${key}`);
    parsed[key] = value;
  }
  return parsed;
}

function boundedPort(value, label) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error(`Pass 71 STUCK ${label} port must be from 1024 through 65535`);
  }
  return port;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function sourceStatus() {
  return git('status', '--porcelain', '--untracked-files=all');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
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

function installedChromeCandidates() {
  const suffix = join('Google', 'Chrome', 'Application', 'chrome.exe');
  const prefixes = [
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.HOMEDRIVE ? join(process.env.HOMEDRIVE, 'Program Files') : undefined,
    process.env.HOMEDRIVE ? join(process.env.HOMEDRIVE, 'Program Files (x86)') : undefined,
  ].filter(Boolean);
  return [
    values['chrome-executable'],
    process.env.PASS71_STUCK_CHROME_EXECUTABLE,
    ...prefixes.map((prefix) => join(prefix, suffix)),
  ].filter(Boolean).map((candidate) => resolve(candidate));
}

function requireInstalledChrome() {
  const executable = [...new Set(installedChromeCandidates())].find((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!executable || basename(executable).toLowerCase() !== 'chrome.exe') {
    throw new Error('Pass 71 STUCK evidence requires installed Google Chrome');
  }
  const identity = readWindowsExecutableIdentity(executable);
  const canonicalRoots = [
    ['per-user', process.env.LOCALAPPDATA],
    ['machine-x64', process.env.PROGRAMFILES],
    ['machine-x86', process.env['PROGRAMFILES(X86)']],
  ].filter(([, prefix]) => Boolean(prefix)).map(([scope, prefix]) => ({
    scope,
    root: resolve(prefix, 'Google', 'Chrome', 'Application'),
  }));
  const installation = canonicalRoots.find(({ root: candidateRoot }) => (
    candidateRoot.toLowerCase() === identity.installRoot.toLowerCase()
  ));
  if (!/^\d+(?:\.\d+){3}$/u.test(identity.productVersion)
    || !installation
    || identity.signatureStatus !== 'Valid'
    || !/\bGoogle LLC\b/iu.test(identity.signerSubject)) {
    throw new Error(`Pass 71 STUCK Chrome identity is invalid: ${JSON.stringify(identity)}`);
  }
  return Object.freeze({ ...identity, installScope: installation.scope, executableSha256: sha256File(executable) });
}

function exactObjectKeys(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`Pass 71 STUCK ${label} fields are invalid`);
  }
}

function readComponent(candidate) {
  if (!existsSync(componentPath)) throw new Error('Pass 71 STUCK browser did not emit its component');
  const component = JSON.parse(readFileSync(componentPath, 'utf8'));
  exactObjectKeys(component, [
    'schemaVersion', 'contract', 'expectedSourceSha', 'checkoutSourceSha', 'servedCandidate',
    'browser', 'topology', 'authorityProjection', 'frames', 'faults',
  ], 'browser component');
  if (component.schemaVersion !== 1
    || component.contract !== 'atomic-acres/pass71-hf310-stuck-browser-component@1'
    || component.expectedSourceSha !== expectedSourceSha
    || component.checkoutSourceSha !== expectedSourceSha
    || JSON.stringify(component.servedCandidate) !== JSON.stringify(candidate)
    || component.browser?.project !== 'chromium'
    || component.browser?.version !== chromeExecutable.productVersion
    || !/\bChrome\/\d+\./u.test(component.browser?.userAgent ?? '')
    || /\bEdg\//u.test(component.browser?.userAgent ?? '')
    || component.topology?.peerCount !== 2
    || component.topology?.peerServer?.host !== '127.0.0.1'
    || component.topology?.peerServer?.port !== peerPort
    || component.topology?.peerServer?.path !== peerPath
    || component.topology?.peerServer?.owned !== true
    || component.topology?.layoutContextCount !== 6
    || component.topology?.roomCodePersisted !== false
    || component.authorityProjection?.mode !== 'canonical-qa-sticky-authority'
    || component.authorityProjection?.receiverAttachmentAuthority !== true
    || component.authorityProjection?.hostResultAuthority !== true
    || component.authorityProjection?.physicalProjectilePath !== false
    || !Array.isArray(component.frames) || component.frames.length !== PASS71_STUCK_EVIDENCE.frameCount
    || !Array.isArray(component.faults) || component.faults.length !== 0) {
    throw new Error(`Pass 71 STUCK browser component is invalid: ${JSON.stringify({
      schemaVersion: component.schemaVersion,
      expectedSourceSha: component.expectedSourceSha,
      browser: component.browser,
      topology: component.topology,
      authorityProjection: component.authorityProjection,
      frameCount: component.frames?.length,
      faults: component.faults,
    })}`);
  }
  return component;
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
    if (!await forced) throw new Error(`Owned Playwright process ${child.pid ?? 'unknown'} did not exit`);
  }
}

async function closeServer() {
  const httpServer = server?.httpServer;
  if (!httpServer?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    httpServer.close((error) => error ? rejectClose(error) : resolveClose());
    httpServer.closeAllConnections?.();
  });
}

function runPlaywright(environment) {
  return new Promise((resolveExit, rejectExit) => {
    playwrightProcess = spawn(process.execPath, [
      resolve(root, 'node_modules/@playwright/test/cli.js'),
      'test',
      'tests/e2e/pass66-qoder-multiplayer-authority.spec.ts',
      '--project=chromium',
      '--workers=1',
      '--retries=0',
      '--grep=Semtex and crossbolt sticky results apply once under duplicate, reorder and guest rejoin',
    ], {
      cwd: root,
      env: environment,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    });
    playwrightProcess.once('error', rejectExit);
    playwrightProcess.once('close', (code, signal) => {
      if (signal) rejectExit(new Error(`Pass 71 STUCK Playwright terminated by ${signal}`));
      else resolveExit(code ?? 1);
    });
  });
}

function writeAtomic(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, bytes);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function writeHashedJson(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  writeAtomic(path, bytes);
  writeAtomic(`${path}.sha256`, Buffer.from(`${sha256(bytes)}  ${basename(path)}\n`, 'utf8'));
  return sha256(bytes);
}

async function main() {
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')) {
    throw new Error('Pass 71 STUCK runner requires --expected-source-sha with candidate A full SHA');
  }
  if (process.platform !== 'win32') throw new Error('Pass 71 STUCK installed-Chrome evidence requires Windows');
  if (previewPort === peerPort) throw new Error('Pass 71 STUCK preview and PeerJS ports must differ');
  if (checkoutSourceSha !== expectedSourceSha || !cleanBefore) {
    throw new Error(`Pass 71 STUCK evidence requires clean exact candidate A (${checkoutSourceSha}/${expectedSourceSha}; clean=${cleanBefore})`);
  }
  if (await listenerPresent(previewPort) || await listenerPresent(peerPort)) {
    throw new Error(`Pass 71 STUCK evidence requires unbound owned ports ${previewPort} and ${peerPort}`);
  }
  const viteOverrides = ['.env', '.env.local', '.env.production.local']
    .filter((path) => existsSync(resolve(root, path)));
  if (viteOverrides.length > 0) throw new Error(`Pass 71 STUCK runner rejects Vite overrides: ${viteOverrides.join(', ')}`);
  const reservedEnvironment = [
    'QA_INSTALLED_EDGE',
    PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV,
    PASS66_MULTIPLAYER_BROWSER_EXECUTABLE_ENV,
    PASS66_MULTIPLAYER_BROWSER_SHA256_ENV,
    PASS70_NATIVE_USER_AGENT_ENV,
    'PASS71_STUCK_EVIDENCE_COMPONENT_PATH',
    'PASS71_STUCK_EXPECTED_SOURCE_SHA',
    ...PASS66_MULTIPLAYER_FORBIDDEN_AUTOMATION_ENV,
  ].filter((key) => process.env[key] !== undefined);
  if (reservedEnvironment.length > 0) {
    throw new Error(`Pass 71 STUCK runner rejects browser environment drift: ${reservedEnvironment.join(', ')}`);
  }

  const lockfilePreflight = await new Promise((resolveExit, rejectExit) => {
    const child = spawn(process.execPath, [resolve(root, 'scripts/qa/verify-npm10-lockfile.mjs')], {
      cwd: root, stdio: 'inherit', windowsHide: true,
    });
    child.once('error', rejectExit);
    child.once('close', (code, signal) => signal
      ? rejectExit(new Error(`Pass 71 STUCK lockfile preflight terminated by ${signal}`))
      : resolveExit(code ?? 1));
  });
  if (lockfilePreflight !== 0) throw new Error(`Pass 71 STUCK lockfile preflight failed with exit ${lockfilePreflight}`);

  chromeExecutable = requireInstalledChrome();
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
    !key.toUpperCase().startsWith('VITE_')
    && !key.toUpperCase().startsWith('PASS71_STUCK_')
    && !key.toUpperCase().startsWith('QA_')
  )));
  const buildEnvironment = {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: expectedSourceSha,
    RELEASE_PASS: 'PASS 71',
    VITE_MATCH_BUILD_ID: expectedSourceSha,
  };
  execFileSync(process.execPath, [
    resolve(root, 'node_modules/vite/bin/vite.js'),
    'build', '--outDir', temporaryDist, '--emptyOutDir',
  ], { cwd: root, env: buildEnvironment, stdio: 'inherit', windowsHide: true });
  execFileSync(process.execPath, [resolve(root, PASS71_STUCK_EVIDENCE_TOOL_PATHS.topologyStager)], {
    cwd: root,
    env: {
      ...buildEnvironment,
      RELEASE_DIST_ROOT: temporaryDist,
      RELEASE_TOPOLOGY_RECEIPT_PATH: topologyReceiptPath,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const candidate = assertStagedTopology(
    JSON.parse(readFileSync(topologyReceiptPath, 'utf8')),
    expectedSourceSha,
    'PASS 71',
  );

  server = await preview({
    build: { outDir: temporaryDist },
    preview: { host: '127.0.0.1', port: previewPort, strictPort: true },
  });
  const baseUrl = `http://127.0.0.1:${previewPort}/channels/the-big-one/`;
  const childEnvironment = {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    CI: '1',
    BASE_URL: baseUrl,
    QA_BASE_URL: baseUrl,
    QA_EXTERNAL_PREVIEW: '1',
    QA_OWNED_GATE: 'multiplayer-stability',
    QA_OWNED_RELEASE_PASS: 'PASS 71',
    QA_OWNED_SOURCE_SHA: expectedSourceSha,
    QA_OWNED_TREE_SHA256: candidate.treeSha256,
    QA_OWNED_FILE_COUNT: String(candidate.exactRootFileCount),
    QA_OWNED_RECEIPT_PATH: ownedReceiptPath,
    PASS66_OWNED_GATE: 'multiplayer-stability',
    PASS66_OWNED_SOURCE_SHA: expectedSourceSha,
    PASS66_OWNED_TREE_SHA256: candidate.treeSha256,
    PASS66_OWNED_FILE_COUNT: String(candidate.exactRootFileCount),
    [PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV]: PASS66_MULTIPLAYER_BROWSER_CHANNEL,
    [PASS66_MULTIPLAYER_BROWSER_EXECUTABLE_ENV]: chromeExecutable.executablePath,
    [PASS66_MULTIPLAYER_BROWSER_SHA256_ENV]: chromeExecutable.executableSha256,
    [PASS70_NATIVE_USER_AGENT_ENV]: '1',
    PASS66_QODER_AUTHORITY_PEER_PORT: String(peerPort),
    PASS66_QODER_AUTHORITY_PEER_PATH: peerPath,
    PASS71_STUCK_EVIDENCE_COMPONENT_PATH: componentPath,
    PASS71_STUCK_EXPECTED_SOURCE_SHA: expectedSourceSha,
  };
  const startedAt = new Date().toISOString();
  const exitCode = await runPlaywright(childEnvironment);
  if (exitCode !== 0) throw new Error(`Pass 71 STUCK Playwright failed with exit ${exitCode}`);
  if (await listenerPresent(peerPort)) throw new Error(`Pass 71 STUCK PeerJS port ${peerPort} remained bound after the browser run`);

  const component = readComponent(candidate);
  const completedAt = new Date().toISOString();
  const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
  const cleanAfter = sourceStatus() === '';
  const finalChromeIdentity = requireInstalledChrome();
  if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter
    || finalChromeIdentity.executablePath !== chromeExecutable.executablePath
    || finalChromeIdentity.executableSha256 !== chromeExecutable.executableSha256
    || finalChromeIdentity.productVersion !== chromeExecutable.productVersion) {
    throw new Error('Pass 71 STUCK source or installed Chrome changed during capture');
  }
  const tooling = pass71StuckEvidenceToolingHashesAtSource(root, expectedSourceSha);
  const record = {
    schemaVersion: PASS71_STUCK_EVIDENCE.schemaVersion,
    evidenceId: PASS71_STUCK_EVIDENCE.evidenceId,
    kind: PASS71_STUCK_EVIDENCE.kind,
    contract: PASS71_STUCK_EVIDENCE.contract,
    gate: PASS71_STUCK_EVIDENCE.gate,
    status: 'passed',
    startedAt,
    completedAt,
    capturedAt: completedAt,
    invocation: {
      runner: PASS71_STUCK_EVIDENCE_TOOL_PATHS.runner,
      expectedSourceSha,
      previewPort,
      peerPort,
      renderer: 'webgl2',
      renderProfile: 'performance',
      evidenceMode: 'manifest-embedded-lossless-png',
      playwrightProject: 'chromium',
      workers: 1,
      retries: 0,
      browserLaunchCount: 1,
      browserContextCount: 6,
      peerProcessCount: 1,
      dependencyPreflight: 'npm@10.9.8-ci-dry-run',
      previewOwnership: 'owned-fresh-staged-topology',
      authorityProjection: 'canonical-qa-sticky-authority',
    },
    source: {
      expectedSourceSha,
      checkoutSourceSha,
      servedSourceSha: component.servedCandidate.sourceSha,
      endingCheckoutSourceSha,
      cleanBefore,
      cleanAfter,
      servedProvenanceSchemaVersion: component.servedCandidate.schemaVersion,
      servedChannel: component.servedCandidate.channel,
      servedReleasePass: component.servedCandidate.releasePass,
      servedPath: component.servedCandidate.path,
      servedTreeSha256: component.servedCandidate.treeSha256,
      servedFileCount: component.servedCandidate.exactRootFileCount,
    },
    environment: { platform: process.platform, arch: process.arch },
    browser: {
      channel: 'chrome',
      installed: true,
      executableName: basename(chromeExecutable.executablePath),
      executableSha256: chromeExecutable.executableSha256,
      executableVersion: chromeExecutable.productVersion,
      browserVersion: component.browser.version,
      userAgent: component.browser.userAgent,
      installScope: chromeExecutable.installScope,
      authenticodeStatus: chromeExecutable.signatureStatus,
      authenticodeSigner: chromeExecutable.signerSubject,
      isolation: 'one-installed-chrome-launch-six-fresh-peer-contexts',
    },
    topology: component.topology,
    tooling,
    frames: component.frames,
    faults: component.faults,
    claims: { ...PASS71_STUCK_CLAIMS },
  };
  record.receiptSha256 = pass71StuckEvidenceRecordSha256(record);
  assertPass71StuckEvidence(record, { sourceSha: expectedSourceSha, tooling });
  const evidenceFileSha256 = writeHashedJson(evidencePath, record);
  failed = false;
  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    sourceSha: expectedSourceSha,
    evidencePath,
    evidenceFileSha256,
    evidenceCanonicalSha256: record.receiptSha256,
    frameCount: record.frames.length,
    next: 'Embed this exact JSON object as the single HF-310 nativeEvidence record in the Pass 71 acceptance manifest.',
  }, null, 2)}\n`);
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  await stopChild(playwrightProcess).catch((error) => { failure ??= error; });
  await closeServer().catch((error) => { failure ??= error; });
  if (await listenerPresent(peerPort)) {
    failure ??= new Error(`Pass 71 STUCK PeerJS port ${peerPort} remained bound after cleanup`);
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}
if (failure || failed) {
  const error = failure ?? new Error('Pass 71 STUCK evidence did not complete');
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
