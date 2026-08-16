import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  PASS71_AUDIO_NATIVE,
  PASS71_AUDIO_NATIVE_MACHINE_HOSTNAME_SHA256,
  PASS71_AUDIO_NATIVE_MACHINE_ID,
  assertPass71AudioNativeReceipt,
  pass71AudioNativeToolingHashesAtSource,
  sha256Canonical,
} from './pass71-audio-native-receipt-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity, readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = path.resolve(process.cwd());
const startedAt = new Date().toISOString();

function argumentValue(name) {
  const inlinePrefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const expectedArgument = argumentValue('expected-source-sha') ?? '';
const browserArgument = argumentValue('browser') ?? 'msedge';
const machineArgument = argumentValue('machine') ?? '';
if (!/^[a-f0-9]{40}$/u.test(expectedArgument)) throw new Error('HF-302 requires --expected-source-sha=<40 lowercase hex>');
if (browserArgument !== 'msedge') throw new Error('HF-302 --browser must be msedge for signed installed-browser release evidence');
if (machineArgument !== PASS71_AUDIO_NATIVE_MACHINE_ID) throw new Error('HF-302 requires --machine=dave-gaming-pc');
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`HF-302 requires win32/x64; received ${process.platform}/${process.arch}`);
}
const hostnameSha256 = createHash('sha256').update(hostname().trim().toLowerCase(), 'utf8').digest('hex');
if (hostnameSha256 !== PASS71_AUDIO_NATIVE_MACHINE_HOSTNAME_SHA256) {
  throw new Error('HF-302 physical OS hostname does not match dave-gaming-pc host attestation');
}
const browserPaths = [
  process.env.PASS71_AUDIO_BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = browserPaths.filter(Boolean).map((candidate) => path.resolve(candidate)).find(existsSync);
if (!executablePath) throw new Error(`HF-302 requires installed ${browserArgument}`);
const executableIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(executablePath));

function git(...arguments_) {
  return execFileSync('git', arguments_, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}
function sha256File(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function clean() { return git('status', '--porcelain', '--untracked-files=all') === ''; }
function fail(message, artifactRoot) {
  rmSync(path.join(artifactRoot, 'receipt.tmp'), { force: true });
  throw new Error(message);
}

const sourceSha = git('rev-parse', 'HEAD');
const sourceTree = git('rev-parse', 'HEAD^{tree}');
const sourceBranch = git('branch', '--show-current');
if (sourceSha !== expectedArgument) throw new Error(`HF-302 source mismatch: expected ${expectedArgument}, received ${sourceSha}`);
if (!clean()) throw new Error('HF-302 requires a completely clean source SHA');
const localViteOverrides = ['.env', '.env.local', '.env.production.local'].filter((file) => existsSync(path.join(root, file)));
if (localViteOverrides.length > 0) throw new Error(`HF-302 rejects local Vite overrides: ${localViteOverrides.join(', ')}`);
const releaseChannels = JSON.parse(readFileSync(path.join(root, 'release-channels.json'), 'utf8'));
const releasePass = releaseChannels?.experimental?.pass;
if (!/^PASS [1-9][0-9]*(?:\.[0-9]+)?$/u.test(releasePass ?? '')) throw new Error('HF-302 requires a valid experimental release pass');

const artifactRoot = path.join(root, 'artifacts/pass71/audio-native');
rmSync(artifactRoot, { recursive: true, force: true });
mkdirSync(artifactRoot, { recursive: true });
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')));
const result = spawnSync(process.execPath, [
  path.join(root, 'scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass71-audio-native-long-run.spec.ts', '--project=chromium', '--workers=1', '--retries=0',
], {
  cwd: root,
  env: {
    ...inheritedEnvironment, NODE_ENV: 'production', SOURCE_SHA: sourceSha, RELEASE_PASS: releasePass,
    VITE_MATCH_BUILD_ID: sourceSha, PASS71_AUDIO_NATIVE: '1', PASS71_AUDIO_SOURCE_SHA: sourceSha,
    PASS71_AUDIO_RELEASE_PASS: releasePass, PASS71_AUDIO_BROWSER_NAME: browserArgument,
    PASS71_AUDIO_BROWSER_EXECUTABLE: executablePath, PASS70_NATIVE_ENGINE_USER_AGENT: '1',
    QA_PREVIEW_PORT: process.env.PASS71_AUDIO_PREVIEW_PORT ?? '4532',
  },
  stdio: 'inherit', windowsHide: true,
});
if (result.error) fail(`HF-302 browser harness failed to launch: ${result.error.message}`, artifactRoot);
if (result.signal) fail(`HF-302 browser harness terminated by ${result.signal}`, artifactRoot);
if ((result.status ?? 1) !== 0) fail(`HF-302 browser harness failed with exit ${result.status ?? 1}`, artifactRoot);

const arenaReceipts = PASS71_AUDIO_NATIVE.arenas.map((arenaId) => {
  const receiptPath = path.join(artifactRoot, `${arenaId}-${browserArgument}.json`);
  if (!existsSync(receiptPath)) fail(`HF-302 missing ${arenaId} receipt`, artifactRoot);
  return JSON.parse(readFileSync(receiptPath, 'utf8'));
});
const servedCandidate = arenaReceipts[0]?.servedCandidate;
if (arenaReceipts.some((receipt) => JSON.stringify(receipt.servedCandidate) !== JSON.stringify(servedCandidate))) {
  fail('HF-302 served candidate changed between arenas', artifactRoot);
}
const versions = new Set(arenaReceipts.map((receipt) => receipt.browserVersion));
const userAgents = new Set(arenaReceipts.map((receipt) => receipt.userAgent));
if (versions.size !== 1 || userAgents.size !== 1) fail('HF-302 browser identity changed between arenas', artifactRoot);
if (arenaReceipts.some((receipt) => receipt.adapter?.software !== false)) fail('HF-302 rejects software rendering', artifactRoot);

const tooling = pass71AudioNativeToolingHashesAtSource(root, sourceSha);
const endingSha = git('rev-parse', 'HEAD');
const cleanAfter = clean();
const completedAt = new Date().toISOString();
const receiptWithoutDigest = {
  schemaVersion: PASS71_AUDIO_NATIVE.schemaVersion, evidenceId: PASS71_AUDIO_NATIVE.evidenceId,
  kind: PASS71_AUDIO_NATIVE.kind, contract: PASS71_AUDIO_NATIVE.contract,
  feedbackId: PASS71_AUDIO_NATIVE.feedbackId, schema: PASS71_AUDIO_NATIVE.schema, status: 'passed',
  startedAt, completedAt,
  invocation: 'npm run qa:pass71:audio-native -- --expected-source-sha=<A> --browser=msedge --machine=dave-gaming-pc',
  environment: { machine: machineArgument, hostnameSha256, platform: process.platform, arch: process.arch },
  sourceSha, endingSha, sourceTree, sourceBranch,
  cleanBefore: true, cleanAfter, servedCandidate, profile: PASS71_AUDIO_NATIVE.profile,
  browser: {
    name: browserArgument, installed: true, executablePath: executablePath.replaceAll('\\', '/'),
    executableSha256: sha256File(executablePath), productVersion: executableIdentity.productVersion,
    installRoot: executableIdentity.installRoot.replaceAll('\\', '/'), authenticodeStatus: executableIdentity.signatureStatus,
    authenticodeSigner: executableIdentity.signerSubject,
    version: [...versions][0], userAgent: [...userAgents][0], softwareRenderer: false,
  },
  durationMsPerArena: PASS71_AUDIO_NATIVE.durationMsPerArena, arenas: PASS71_AUDIO_NATIVE.arenas, tooling, arenaReceipts,
};
const receipt = { ...receiptWithoutDigest, evidenceDigest: sha256Canonical(receiptWithoutDigest) };
assertPass71AudioNativeReceipt(receipt, { sourceSha: expectedArgument, tooling });
if (!cleanAfter || endingSha !== sourceSha) fail(`HF-302 source drifted during evidence (${sourceSha} -> ${endingSha})`, artifactRoot);
const receiptPath = path.join(artifactRoot, `${sourceSha}-${browserArgument}-receipt.json`);
const tempPath = path.join(artifactRoot, 'receipt.tmp');
writeFileSync(tempPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
renameSync(tempPath, receiptPath);
console.log(JSON.stringify({ status: 'PASS', sourceSha, browser: browserArgument, receiptPath, evidenceDigest: receipt.evidenceDigest }, null, 2));
