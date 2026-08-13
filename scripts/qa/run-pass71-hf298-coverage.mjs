import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import {
  PASS71_GRENADE_NATIVE_EVIDENCE,
  assertPass71GrenadeNativeEvidence,
  pass71GrenadeNativeToolingHashesAtSource,
} from './pass71-grenade-native-receipt-contract.mjs';
import {
  assertPass71Hf298Coverage,
  createPass71Hf298CoverageRecord,
} from './pass71-hf298-coverage-contract.mjs';

const root = resolve(process.cwd());
const values = parseArgs(process.argv.slice(2));
const expectedSourceSha = values['expected-source-sha'];
const previewPort = boundedPort(values.port ?? process.env.PASS71_GRENADE_NATIVE_PORT ?? '4564');
const peerPort = boundedPort(values['peer-port'] ?? process.env.PASS71_GRENADE_PEER_PORT ?? '4565');
const artifactRoot = resolve(root, 'artifacts/pass71/grenade-native');

function parseArgs(argv) {
  const parsed = {};
  const allowed = new Set(['expected-source-sha', 'port', 'peer-port', 'edge-executable']);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Pass 71 HF-298 coverage runner expected --name value; received ${name ?? '(missing)'}`);
    }
    const key = name.slice(2);
    if (!allowed.has(key) || Object.hasOwn(parsed, key)) {
      throw new Error(`Pass 71 HF-298 coverage runner rejected unknown or duplicate argument --${key}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function boundedPort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error('Pass 71 HF-298 coverage ports must be from 1024 through 65535');
  }
  return port;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeHashedJson(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  writeFileSync(path, bytes);
  writeFileSync(`${path}.sha256`, `${sha256(bytes)}  ${basename(path)}\n`, 'utf8');
  return sha256(bytes);
}

function componentPath(scope) {
  return resolve(
    artifactRoot,
    `${expectedSourceSha}-${scope.mode}-${scope.renderer}-native-evidence.json`,
  );
}

function runComponent(scope) {
  const arguments_ = [
    resolve(root, 'scripts/qa/run-pass71-grenade-native-receipt.mjs'),
    '--expected-source-sha', expectedSourceSha,
    '--mode', scope.mode,
    '--renderer', scope.renderer,
    '--port', String(previewPort),
    '--peer-port', String(peerPort),
  ];
  if (values['edge-executable']) arguments_.push('--edge-executable', values['edge-executable']);
  const result = spawnSync(process.execPath, arguments_, {
    cwd: root, env: process.env, stdio: 'inherit', windowsHide: true,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`Pass 71 HF-298 ${scope.mode}/${scope.renderer} component failed: ${result.error?.message ?? result.signal ?? result.status}`);
  }
}

function readComponent(scope, tooling) {
  const path = componentPath(scope);
  if (!existsSync(path)) throw new Error(`Pass 71 HF-298 component is missing: ${path}`);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  assertPass71GrenadeNativeEvidence(record, { sourceSha: expectedSourceSha, tooling });
  if (record.scope?.mode !== scope.mode || record.scope?.renderer !== scope.renderer) {
    throw new Error(`Pass 71 HF-298 component scope mismatch at ${path}`);
  }
  return record;
}

function main() {
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')) {
    throw new Error('Pass 71 HF-298 coverage runner requires --expected-source-sha with candidate A full SHA');
  }
  if (process.platform !== 'win32') throw new Error('Pass 71 HF-298 coverage requires Windows installed-Edge evidence');
  const checkoutSourceSha = git('rev-parse', 'HEAD');
  const cleanBefore = git('status', '--porcelain', '--untracked-files=all') === '';
  if (checkoutSourceSha !== expectedSourceSha || !cleanBefore) {
    throw new Error(`Pass 71 HF-298 coverage requires clean exact candidate A (${checkoutSourceSha}/${expectedSourceSha}; clean=${cleanBefore})`);
  }
  for (const scope of PASS71_GRENADE_NATIVE_EVIDENCE.scopes) runComponent(scope);
  const tooling = pass71GrenadeNativeToolingHashesAtSource(root, expectedSourceSha);
  const components = PASS71_GRENADE_NATIVE_EVIDENCE.scopes.map((scope) => readComponent(scope, tooling));
  const finalizedAt = new Date().toISOString();
  const coverage = createPass71Hf298CoverageRecord({
    sourceSha: expectedSourceSha, tooling, components, finalizedAt,
  });
  assertPass71Hf298Coverage(coverage, { sourceSha: expectedSourceSha, tooling, components });
  const endingSourceSha = git('rev-parse', 'HEAD');
  const cleanAfter = git('status', '--porcelain', '--untracked-files=all') === '';
  if (endingSourceSha !== expectedSourceSha || !cleanAfter) {
    throw new Error(`Pass 71 HF-298 coverage changed candidate A (${endingSourceSha}/${expectedSourceSha}; clean=${cleanAfter})`);
  }
  mkdirSync(artifactRoot, { recursive: true });
  const coveragePath = resolve(artifactRoot, `${expectedSourceSha}-hf298-coverage.json`);
  const manifestEvidencePath = resolve(artifactRoot, `${expectedSourceSha}-hf298-native-evidence.json`);
  const coverageFileSha256 = writeHashedJson(coveragePath, coverage);
  const manifestEvidence = [...components, coverage];
  const manifestEvidenceFileSha256 = writeHashedJson(manifestEvidencePath, manifestEvidence);
  process.stdout.write(`${JSON.stringify({
    status: 'passed', sourceSha: expectedSourceSha,
    representativeScopes: PASS71_GRENADE_NATIVE_EVIDENCE.scopes,
    coveragePath, coverageReceiptSha256: coverage.receiptSha256, coverageFileSha256,
    manifestEvidencePath, manifestEvidenceFileSha256,
    next: 'Paste the complete five-record nativeEvidence array into acceptance/pass-71.json; do not transcribe or omit records.',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
}
