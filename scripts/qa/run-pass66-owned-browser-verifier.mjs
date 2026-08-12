import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { preview } from 'vite';
import {
  assertOwnedBrowserVerifierReceipt,
  assertStagedTopology,
} from './pass66-owned-browser-verifier-contract.mjs';
import {
  PASS66_MULTIPLAYER_BROWSER_CHANNEL,
  PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV,
  PASS66_MULTIPLAYER_BROWSER_EXECUTABLE_ENV,
  PASS66_MULTIPLAYER_BROWSER_SHA256_ENV,
  PASS66_MULTIPLAYER_REMOTE_PLAYWRIGHT_ENV,
} from './pass66-multiplayer-stability-contract.mjs';
import { PASS70_NATIVE_USER_AGENT_ENV } from './pass70-cross-browser-native-user-agent-contract.mjs';

const targets = Object.freeze({
  'installed-firefox': Object.freeze({
    verifier: 'scripts/qa/verify-installed-firefox.mjs',
    previewPort: 4526,
    peerPort: null,
    receipt: 'artifacts/pass66/installed-firefox/receipt.json',
  }),
  'private-lobby': Object.freeze({
    verifier: 'scripts/qa/verify-private-lobby.mjs',
    previewPort: 4527,
    peerPort: 9077,
    receipt: 'artifacts/pass66/private-lobby/receipt.json',
  }),
  'support-operate-prompt': Object.freeze({
    verifier: 'scripts/qa/run-pass66-support-operate-prompt-evidence.mjs',
    previewPort: 4528,
    peerPort: null,
    receipt: 'artifacts/pass66/support-operate-prompt/receipt.json',
    evidenceRoot: 'artifacts/pass66/support-operate-prompt',
  }),
  'pass61-netcode': Object.freeze({
    verifier: 'scripts/qa/verify-pass61-authoritative-netcode.mjs',
    previewPort: 4529,
    peerPort: 9081,
    receipt: 'artifacts/pass66/pass61-netcode/receipt.json',
  }),
  'multiplayer-stability': Object.freeze({
    verifier: 'scripts/qa/verify-pass66-multiplayer-stability.mjs',
    previewPort: 4530,
    peerPort: null,
    receipt: 'artifacts/multiplayer/stability/receipt.json',
  }),
});

const gate = process.argv[2] ?? '';
const target = targets[gate];
if (!target) throw new Error(`Owned Pass 66 browser verifier must be one of ${Object.keys(targets).join(', ')}; received ${gate || '(missing)'}`);

const root = process.cwd();
const configuredReleasePass = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'))?.experimental?.pass;
const releasePass = gate === 'multiplayer-stability' ? configuredReleasePass : 'PASS 66';
if (!/^PASS \d+(?:\.\d+)?$/u.test(releasePass ?? '')) {
  throw new Error(`Owned ${gate} verifier could not resolve an experimental release pass`);
}
const receiptPath = resolve(root, target.receipt);
if (target.evidenceRoot) rmSync(resolve(root, target.evidenceRoot), { recursive: true, force: true });
mkdirSync(dirname(receiptPath), { recursive: true });
rmSync(receiptPath, { force: true });

const viteLocalOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
if (viteLocalOverrides.length > 0) {
  throw new Error(`Pass 66 ${gate} rejects local Vite environment overrides: ${viteLocalOverrides.join(', ')}`);
}
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
if (dirty) throw new Error(`Pass 66 ${gate} requires a completely clean worktree`);
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) throw new Error(`Invalid Pass 66 ${gate} source SHA ${sourceSha}`);

const browserDriftEnvironment = gate === 'multiplayer-stability' ? [
  ...(process.env.QA_INSTALLED_EDGE === '1' ? ['QA_INSTALLED_EDGE'] : []),
  ...PASS66_MULTIPLAYER_REMOTE_PLAYWRIGHT_ENV.filter((key) => process.env[key] !== undefined),
] : [];
if (browserDriftEnvironment.length > 0) {
  throw new Error(`Pass 66 multiplayer-stability rejects browser environment drift: ${browserDriftEnvironment.join(', ')}`);
}
const multiplayerBrowserIdentity = gate === 'multiplayer-stability'
  ? resolveInstalledChromeIdentity()
  : null;

const previewPort = Number(process.env.QA_PREVIEW_PORT ?? target.previewPort);
const peerPort = target.peerPort === null ? null : Number(process.env.QA_PEER_PORT ?? target.peerPort);
if (!Number.isInteger(previewPort) || previewPort < 1_024 || previewPort > 65_535) {
  throw new Error(`Invalid Pass 66 ${gate} preview port ${process.env.QA_PREVIEW_PORT ?? ''}`);
}
if (peerPort !== null && (!Number.isInteger(peerPort) || peerPort < 1_024 || peerPort > 65_535 || peerPort === previewPort)) {
  throw new Error(`Invalid Pass 66 ${gate} PeerJS port ${process.env.QA_PEER_PORT ?? ''}`);
}

const temporaryRoot = mkdtempSync(join(tmpdir(), `atomic-acres-pass66-${gate}-`));
const temporaryDist = join(temporaryRoot, 'dist');
const topologyReceiptPath = join(temporaryRoot, 'release-topology.json');
const ownedBrowserEnvironmentKeys = new Set([
  'QA_INSTALLED_EDGE',
  PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV,
  PASS66_MULTIPLAYER_BROWSER_EXECUTABLE_ENV,
  PASS66_MULTIPLAYER_BROWSER_SHA256_ENV,
  PASS70_NATIVE_USER_AGENT_ENV,
  ...PASS66_MULTIPLAYER_REMOTE_PLAYWRIGHT_ENV,
]);
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => (
    !key.toUpperCase().startsWith('VITE_')
    && !(gate === 'multiplayer-stability' && ownedBrowserEnvironmentKeys.has(key))
  )),
);
const buildEnvironment = {
  ...inheritedEnvironment,
  NODE_ENV: 'production',
  VITE_MATCH_BUILD_ID: sourceSha,
};
let server = null;
let verifierProcess = null;
let peerProcess = null;
let peerPath = null;

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

function peerEndpointReady(port, path) {
  return new Promise((resolveReady) => {
    const request = http.get(`http://127.0.0.1:${port}${path}`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body = `${body}${chunk}`.slice(0, 2_048); });
      response.once('end', () => {
        try {
          const value = JSON.parse(body);
          resolveReady(response.statusCode === 200 && value.name === 'PeerJS Server');
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

async function stopServer() {
  const httpServer = server?.httpServer;
  if (!httpServer?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    httpServer.close((error) => error ? rejectClose(error) : resolveClose());
    httpServer.closeAllConnections?.();
  });
}

async function startOwnedPeer() {
  if (peerPort === null) return;
  if (await listenerPresent(peerPort)) throw new Error(`Refusing stale or unowned listener on PeerJS port ${peerPort}`);
  peerPath = `/peerjs-${randomBytes(12).toString('hex')}`;
  peerProcess = spawn(process.execPath, [
    resolve(root, 'node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1', '--port', String(peerPort), '--path', peerPath, '--no-allow_discovery',
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  const retain = (chunk) => { output = `${output}${String(chunk)}`.slice(-8_192); };
  peerProcess.stdout.on('data', retain);
  peerProcess.stderr.on('data', retain);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (peerProcess.exitCode !== null || peerProcess.signalCode !== null) {
      throw new Error(`Owned PeerJS exited before readiness (${peerProcess.exitCode ?? peerProcess.signalCode})\n${output}`);
    }
    if (await peerEndpointReady(peerPort, peerPath)) return;
    await new Promise((wait) => setTimeout(wait, 50));
  }
  throw new Error(`Owned PeerJS did not become ready on ${peerPort}${peerPath}\n${output}`);
}

async function runVerifier(environment) {
  return new Promise((resolveExit, rejectExit) => {
    verifierProcess = spawn(process.execPath, [resolve(root, target.verifier)], {
      cwd: root,
      env: environment,
      stdio: 'inherit',
      windowsHide: true,
    });
    verifierProcess.once('error', rejectExit);
    verifierProcess.once('close', (code, signal) => {
      if (signal) rejectExit(new Error(`Pass 66 ${gate} verifier terminated by ${signal}`));
      else resolveExit(code ?? 1);
    });
  });
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function installedChromeCandidates(environment = process.env) {
  if (process.platform === 'win32') {
    const suffix = join('Google', 'Chrome', 'Application', 'chrome.exe');
    const prefixes = [
      environment.LOCALAPPDATA,
      environment.PROGRAMFILES,
      environment['PROGRAMFILES(X86)'],
      environment.HOMEDRIVE ? join(environment.HOMEDRIVE, 'Program Files') : undefined,
      environment.HOMEDRIVE ? join(environment.HOMEDRIVE, 'Program Files (x86)') : undefined,
    ].filter(Boolean);
    return [...new Set(prefixes.map((prefix) => join(prefix, suffix)))];
  }
  if (process.platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  }
  if (process.platform === 'linux') return ['/opt/google/chrome/chrome'];
  return [];
}

function resolveInstalledChromeIdentity() {
  const executablePath = installedChromeCandidates().find((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!executablePath) {
    throw new Error(`Pass 66 multiplayer-stability requires Playwright channel ${PASS66_MULTIPLAYER_BROWSER_CHANNEL} installed Chrome`);
  }
  return Object.freeze({
    channel: PASS66_MULTIPLAYER_BROWSER_CHANNEL,
    executablePath: resolve(executablePath),
    executableSha256: sha256File(executablePath),
  });
}

function assertSupportPromptEvidenceFiles(receipt) {
  if (gate !== 'support-operate-prompt') return;
  for (const viewport of receipt.viewports ?? []) {
    for (const kind of ['full', 'visible', 'hidden']) {
      const artifact = viewport.artifacts?.[kind];
      const expectedPath = `artifacts/pass66/support-operate-prompt/${viewport.supportId}-${viewport.label}-${kind}.png`;
      if (artifact?.path !== expectedPath || !/^[a-f0-9]{64}$/u.test(artifact?.sha256 ?? '')) {
        throw new Error(`Pass 66 support prompt ${viewport.label ?? 'unknown'} ${kind} artifact identity is invalid`);
      }
      const absolutePath = resolve(root, artifact.path);
      if (!existsSync(absolutePath) || sha256File(absolutePath) !== artifact.sha256) {
        throw new Error(`Pass 66 support prompt ${viewport.label ?? 'unknown'} ${kind} artifact bytes do not match the receipt`);
      }
    }
  }
}

let failed = true;
try {
  execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', temporaryDist, '--emptyOutDir'], {
    cwd: root,
    env: buildEnvironment,
    stdio: 'inherit',
    windowsHide: true,
  });
  execFileSync(process.execPath, [resolve(root, 'scripts/release/stage-release-topology.mjs')], {
    cwd: root,
    env: {
      ...buildEnvironment,
      SOURCE_SHA: sourceSha,
      RELEASE_PASS: releasePass,
      RELEASE_DIST_ROOT: temporaryDist,
      RELEASE_TOPOLOGY_RECEIPT_PATH: topologyReceiptPath,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const topology = JSON.parse(readFileSync(topologyReceiptPath, 'utf8'));
  const candidate = assertStagedTopology(topology, sourceSha, releasePass);

  server = await preview({
    build: { outDir: temporaryDist },
    preview: { host: '127.0.0.1', port: previewPort, strictPort: true },
  });
  await startOwnedPeer();
  const baseUrl = `http://127.0.0.1:${previewPort}/channels/the-big-one/`;
  const childEnvironment = {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    QA_BASE_URL: baseUrl,
    BASE_URL: baseUrl,
    QA_OWNED_GATE: gate,
    QA_OWNED_RELEASE_PASS: releasePass,
    QA_OWNED_SOURCE_SHA: sourceSha,
    QA_OWNED_TREE_SHA256: candidate.treeSha256,
    QA_OWNED_FILE_COUNT: String(candidate.exactRootFileCount),
    QA_OWNED_RECEIPT_PATH: receiptPath,
    PASS66_OWNED_GATE: gate,
    PASS66_OWNED_SOURCE_SHA: sourceSha,
    PASS66_OWNED_TREE_SHA256: candidate.treeSha256,
    PASS66_OWNED_FILE_COUNT: String(candidate.exactRootFileCount),
    PASS66_OWNED_RECEIPT_PATH: receiptPath,
    ...(multiplayerBrowserIdentity === null ? {} : {
      [PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV]: multiplayerBrowserIdentity.channel,
      [PASS66_MULTIPLAYER_BROWSER_EXECUTABLE_ENV]: multiplayerBrowserIdentity.executablePath,
      [PASS66_MULTIPLAYER_BROWSER_SHA256_ENV]: multiplayerBrowserIdentity.executableSha256,
      [PASS70_NATIVE_USER_AGENT_ENV]: '1',
    }),
    ...(peerPort === null ? {} : {
      QA_PEER_PORT: String(peerPort),
      QA_PEER_PATH: peerPath,
    }),
  };
  const exitCode = await runVerifier(childEnvironment);
  if (exitCode !== 0) throw new Error(`Pass 66 ${gate} verifier failed with exit ${exitCode}`);
  if (!existsSync(receiptPath)) throw new Error(`Pass 66 ${gate} exited successfully without a receipt`);
  const finalDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  }).trim();
  const finalSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  }).trim();
  if (finalDirty || finalSha !== sourceSha) throw new Error(`Pass 66 ${gate} source drifted during verification`);
  if (multiplayerBrowserIdentity !== null
    && (!existsSync(multiplayerBrowserIdentity.executablePath)
      || sha256File(multiplayerBrowserIdentity.executablePath) !== multiplayerBrowserIdentity.executableSha256)) {
    throw new Error('Installed Chrome executable changed during multiplayer stability verification');
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (gate === 'support-operate-prompt') {
    receipt.sourceState = {
      startingSha: sourceSha,
      endingSha: finalSha,
      cleanBefore: true,
      cleanAfter: true,
    };
    const temporaryReceiptPath = `${receiptPath}.tmp`;
    writeFileSync(temporaryReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    rmSync(receiptPath, { force: true });
    renameSync(temporaryReceiptPath, receiptPath);
  }
  assertOwnedBrowserVerifierReceipt(receipt, {
    gate,
    releasePass,
    sourceSha,
    treeSha256: candidate.treeSha256,
    exactRootFileCount: candidate.exactRootFileCount,
    baseUrl,
    ...(multiplayerBrowserIdentity === null ? {} : {
      browserChannel: multiplayerBrowserIdentity.channel,
      browserExecutablePath: multiplayerBrowserIdentity.executablePath,
      browserExecutableSha256: multiplayerBrowserIdentity.executableSha256,
    }),
    ...(peerPort === null ? {} : { peerPort, peerPath }),
  });
  assertSupportPromptEvidenceFiles(receipt);
  failed = false;
  console.log(JSON.stringify({ status: 'PASS', gate, sourceSha, receiptPath }, null, 2));
} finally {
  await stopChild(verifierProcess).catch(() => undefined);
  await stopChild(peerProcess).catch(() => undefined);
  await stopServer().catch(() => undefined);
  if (peerPort !== null && await listenerPresent(peerPort)) {
    failed = true;
    console.error(`Owned PeerJS port ${peerPort} remained bound after cleanup`);
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
  if (failed) {
    if (target.evidenceRoot) rmSync(resolve(root, target.evidenceRoot), { recursive: true, force: true });
    else rmSync(receiptPath, { force: true });
  }
}

if (failed) process.exitCode = 1;
