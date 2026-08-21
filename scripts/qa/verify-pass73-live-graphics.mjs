import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { preview } from 'vite';
import { assertStagedTopology } from './pass66-owned-browser-verifier-contract.mjs';
import { assertPass73LiveGraphicsReceipt } from './pass73-live-graphics-contract.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const artifactRoot = resolve(repositoryRoot, 'artifacts', 'pass73', 'live-graphics');
const allowedArtifactParent = `${resolve(repositoryRoot, 'artifacts', 'pass73')}${sep}`;
if (!artifactRoot.startsWith(allowedArtifactParent)) throw new Error('Live graphics artifact root escaped Pass 73 artifacts');

function requiredSourceSha() {
  const value = process.env.PASS73_LIVE_GRAPHICS_SOURCE_SHA?.trim();
  if (!value || !/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error('Set PASS73_LIVE_GRAPHICS_SOURCE_SHA to the exact clean candidate commit');
  }
  return value;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function git(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function walkFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function resolveInstalledChromeIdentity() {
  const candidates = [
    process.env.PASS73_CHROME_PATH,
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.env['PROGRAMFILES(X86)'] ? join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
  const executablePath = candidates.map((candidate) => resolve(candidate)).find((candidate) => existsSync(candidate));
  if (!executablePath || basename(executablePath).toLowerCase() !== 'chrome.exe') {
    throw new Error('Pass 73 live graphics requires an installed Google Chrome executable');
  }
  return Object.freeze({ executablePath, executableSha256: sha256File(executablePath) });
}

function listenerPresent(port) {
  return new Promise((resolveListener) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (present) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveListener(present);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(750, () => finish(false));
  });
}

function runBrowserVerifier(environment) {
  return new Promise((resolveExit, rejectExit) => {
    const child = spawn(process.execPath, [resolve(repositoryRoot, 'scripts', 'qa', 'run-pass73-live-graphics-browser.mjs')], {
      cwd: repositoryRoot,
      env: environment,
      stdio: 'inherit',
      windowsHide: true,
    });
    const timeout = setTimeout(() => {
      try {
        if (process.platform === 'win32' && child.pid) {
          execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        child.kill('SIGKILL');
      }
      rejectExit(new Error('Pass 73 live graphics browser verifier exceeded its 12-minute owned-run deadline'));
    }, 12 * 60_000);
    timeout.unref();
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectExit(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      if (signal) rejectExit(new Error(`Pass 73 live graphics browser verifier terminated by ${signal}`));
      else resolveExit(code ?? 1);
    });
  });
}

function assertScreenshotFiles(receipt) {
  for (const screenshot of receipt.screenshots ?? []) {
    const absolutePath = resolve(repositoryRoot, screenshot.path);
    if (!absolutePath.startsWith(`${artifactRoot}${sep}`) || !existsSync(absolutePath)) {
      throw new Error(`Pass 73 screenshot escaped or is missing: ${String(screenshot.path)}`);
    }
    if (statSync(absolutePath).size !== screenshot.bytes || sha256File(absolutePath) !== screenshot.sha256) {
      throw new Error(`Pass 73 screenshot bytes drifted: ${screenshot.path}`);
    }
  }
}

const expectedSourceSha = requiredSourceSha();
const startingSha = git(['rev-parse', 'HEAD']);
const sourceTree = git(['rev-parse', 'HEAD^{tree}']);
const startingStatus = git(['status', '--porcelain', '--untracked-files=all']);
if (startingSha !== expectedSourceSha || startingStatus !== '') {
  throw new Error(`Pass 73 live graphics requires exact clean ${expectedSourceSha}; found ${startingSha}${startingStatus ? ' with worktree changes' : ''}`);
}

const releaseChannels = JSON.parse(readFileSync(resolve(repositoryRoot, 'release-channels.json'), 'utf8'));
const releasePass = releaseChannels?.experimental?.pass;
const topologySchemaVersion = releaseChannels?.schemaVersion;
if (!/^PASS \d+(?:\.\d+)?$/u.test(releasePass ?? '')
  || !Number.isSafeInteger(topologySchemaVersion) || topologySchemaVersion < 1) {
  throw new Error('Pass 73 live graphics could not resolve the configured release topology identity');
}

const localViteOverrides = ['.env', '.env.local', '.env.production.local', '.env.development.local']
  .filter((path) => existsSync(resolve(repositoryRoot, path)));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`Pass 73 live graphics rejects Vite overrides: ${[...localViteOverrides, ...inheritedViteVariables].join(', ')}`);
}

const port = Number(process.env.PASS73_LIVE_GRAPHICS_PORT ?? 44_273);
if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535 || await listenerPresent(port)) {
  throw new Error(`Pass 73 live graphics requires an unowned valid preview port; rejected ${String(port)}`);
}

const browserIdentity = resolveInstalledChromeIdentity();
const temporaryRoot = mkdtempSync(join(tmpdir(), 'atomic-acres-pass73-live-graphics-'));
const temporaryDist = join(temporaryRoot, 'dist');
const topologyReceiptPath = join(temporaryRoot, 'release-topology.json');
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const buildEnvironment = {
  ...inheritedEnvironment,
  NODE_ENV: 'production',
  VITE_MATCH_BUILD_ID: expectedSourceSha,
};
let server = null;
let failed = true;

try {
  execFileSync(process.execPath, [
    resolve(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    'build', '--outDir', temporaryDist, '--emptyOutDir',
  ], {
    cwd: repositoryRoot,
    env: buildEnvironment,
    stdio: 'inherit',
    windowsHide: true,
  });
  execFileSync(process.execPath, [resolve(repositoryRoot, 'scripts', 'release', 'stage-release-topology.mjs')], {
    cwd: repositoryRoot,
    env: {
      ...buildEnvironment,
      SOURCE_SHA: expectedSourceSha,
      RELEASE_PASS: releasePass,
      RELEASE_DIST_ROOT: temporaryDist,
      RELEASE_TOPOLOGY_RECEIPT_PATH: topologyReceiptPath,
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const topologyReceiptSha256 = sha256File(topologyReceiptPath);
  const topology = JSON.parse(readFileSync(topologyReceiptPath, 'utf8'));
  const candidate = assertStagedTopology(topology, expectedSourceSha, releasePass, topologySchemaVersion);
  const stagedCandidateRoot = resolve(temporaryDist, candidate.path);
  const sourceEvidenceFiles = walkFiles(resolve(stagedCandidateRoot, 'assets'))
    .filter((path) => path.endsWith('.js') && readFileSync(path).includes(Buffer.from(expectedSourceSha)))
    .map((path) => relative(temporaryDist, path).replaceAll('\\', '/'));
  if (sourceEvidenceFiles.length < 1) {
    throw new Error('Built/staged candidate assets do not contain the exact source SHA build identity');
  }

  server = await preview({
    build: { outDir: temporaryDist },
    preview: { host: '127.0.0.1', port, strictPort: true },
  });
  const baseUrl = `http://127.0.0.1:${port}/channels/the-big-one/`;
  const childEnvironment = {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    PASS73_LIVE_GRAPHICS_BASE_URL: baseUrl,
    PASS73_LIVE_GRAPHICS_SOURCE_SHA: expectedSourceSha,
    PASS73_LIVE_GRAPHICS_SOURCE_TREE: sourceTree,
    PASS73_LIVE_GRAPHICS_TREE_SHA256: candidate.treeSha256,
    PASS73_LIVE_GRAPHICS_TOPOLOGY_RECEIPT_SHA256: topologyReceiptSha256,
    PASS73_LIVE_GRAPHICS_BROWSER_PATH: browserIdentity.executablePath,
    PASS73_LIVE_GRAPHICS_BROWSER_SHA256: browserIdentity.executableSha256,
    PASS73_LIVE_GRAPHICS_FILE_COUNT: String(candidate.exactRootFileCount),
    PASS73_LIVE_GRAPHICS_TOPOLOGY_SCHEMA: String(topologySchemaVersion),
    PASS73_LIVE_GRAPHICS_RELEASE_PASS: releasePass,
    PASS73_LIVE_GRAPHICS_SERVER_KIND: 'built-staged-release-topology-vite-preview',
    PASS73_LIVE_GRAPHICS_SOURCE_EVIDENCE: JSON.stringify(sourceEvidenceFiles),
  };
  const exitCode = await runBrowserVerifier(childEnvironment);
  if (exitCode !== 0) throw new Error(`Pass 73 live graphics browser verifier failed with exit ${exitCode}`);

  const receiptPath = resolve(artifactRoot, 'receipt.json');
  if (!existsSync(receiptPath)) throw new Error('Pass 73 live graphics browser exited without a receipt');
  const endingSha = git(['rev-parse', 'HEAD']);
  const endingTree = git(['rev-parse', 'HEAD^{tree}']);
  const endingStatus = git(['status', '--porcelain', '--untracked-files=all']);
  if (endingSha !== expectedSourceSha || endingTree !== sourceTree || endingStatus !== '') {
    throw new Error('Pass 73 live graphics source HEAD/tree/clean drifted during the native browser run');
  }
  if (!existsSync(browserIdentity.executablePath)
    || sha256File(browserIdentity.executablePath) !== browserIdentity.executableSha256) {
    throw new Error('Installed Chrome executable changed during Pass 73 live graphics verification');
  }
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  assertPass73LiveGraphicsReceipt(receipt, {
    sourceSha: expectedSourceSha,
    sourceTree,
    topologySchemaVersion,
    releasePass,
    treeSha256: candidate.treeSha256,
    exactRootFileCount: candidate.exactRootFileCount,
    topologyReceiptSha256,
    sourceEvidenceFiles,
    browserExecutablePath: browserIdentity.executablePath,
    browserExecutableSha256: browserIdentity.executableSha256,
    baseUrl,
  });
  assertScreenshotFiles(receipt);
  const receiptSha256 = createHash('sha256').update(receiptBytes).digest('hex');
  const sidecar = readFileSync(`${receiptPath}.sha256`, 'utf8').trim();
  if (sidecar !== `${receiptSha256}  receipt.json`) throw new Error('Pass 73 live graphics receipt hash sidecar drifted');
  failed = false;
  console.log('PASS73_LIVE_GRAPHICS_WRAPPER', JSON.stringify({
    verdict: 'pass',
    sourceSha: expectedSourceSha,
    sourceTree,
    releasePass,
    topologySchemaVersion,
    stagedTreeSha256: candidate.treeSha256,
    stagedFileCount: candidate.exactRootFileCount,
    sourceEvidenceFiles,
    topologyReceiptSha256,
    browserExecutablePath: browserIdentity.executablePath.replaceAll('\\', '/'),
    browserExecutableSha256: browserIdentity.executableSha256,
    receiptPath: receiptPath.replaceAll('\\', '/'),
    receiptSha256,
  }, null, 2));
} finally {
  await server?.close().catch(() => undefined);
  if (await listenerPresent(port)) {
    failed = true;
    console.error(`Pass 73 live graphics preview port ${port} remained bound after cleanup`);
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
  if (failed) rmSync(artifactRoot, { recursive: true, force: true });
}

if (failed) process.exitCode = 1;
