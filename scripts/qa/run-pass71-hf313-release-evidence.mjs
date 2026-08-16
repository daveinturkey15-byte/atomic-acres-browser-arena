import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  PASS71_HF313_RELEASE_EVIDENCE,
  createPass71Hf313EvidenceFixture,
  pass71Hf313DependencyProjection,
  pass71Hf313EvidenceFailures,
  pass71Hf313NativeEvidenceEnvelope,
  pass71Hf313SourceAuditAtSource,
  pass71Hf313ToolingAtSource,
} from './pass71-hf313-release-evidence-contract.mjs';

const root = resolve(process.cwd());
const SHA40 = /^[a-f0-9]{40}$/u;

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 128 * 1024 * 1024,
  }).trim();
}

function clean() {
  return git('status', '--porcelain', '--untracked-files=all') === '';
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function args(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error(`Invalid HF-313 argument: ${key ?? '<missing>'}`);
    values[key.slice(2)] = value;
  }
  return values;
}

const values = args(process.argv.slice(2));
const expectedSourceSha = values['expected-source-sha'];
const evidencePath = values['native-evidence'];
if (!SHA40.test(expectedSourceSha ?? '') || !evidencePath) {
  throw new Error('Usage: node scripts/qa/run-pass71-hf313-release-evidence.mjs --expected-source-sha <candidate-A-SHA> --native-evidence <complete-native-evidence-array.json>');
}
const absoluteEvidencePath = resolve(root, evidencePath);
if (!existsSync(absoluteEvidencePath)) throw new Error(`HF-313 native evidence array does not exist: ${absoluteEvidencePath}`);
const nativeEvidence = JSON.parse(readFileSync(absoluteEvidencePath, 'utf8'));
if (!Array.isArray(nativeEvidence) || nativeEvidence.some((record) => record?.evidenceId === 'HF-313')) {
  throw new Error('HF-313 input must be the complete pre-HF313 native evidence array');
}
const checkoutSourceSha = git('rev-parse', 'HEAD');
if (checkoutSourceSha !== expectedSourceSha || !clean()) throw new Error('HF-313 requires one clean exact candidate A checkout');
const startedAt = new Date().toISOString();
const sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`);
const sourceAudit = pass71Hf313SourceAuditAtSource(root, expectedSourceSha);
const tooling = pass71Hf313ToolingAtSource(root, expectedSourceSha);
const dependencies = pass71Hf313DependencyProjection(nativeEvidence);
const dependencyEnvelope = pass71Hf313NativeEvidenceEnvelope(nativeEvidence);
const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
if (endingCheckoutSourceSha !== expectedSourceSha || !clean()) throw new Error('HF-313 checkout changed while binding release readiness');
const completedAt = new Date().toISOString();
const record = createPass71Hf313EvidenceFixture({
  sourceSha: expectedSourceSha, sourceTreeSha, sourceAudit, tooling, dependencies, dependencyEnvelope,
  startedAt, completedAt,
});
record.source.checkoutSourceSha = checkoutSourceSha;
record.source.endingCheckoutSourceSha = endingCheckoutSourceSha;
const failures = pass71Hf313EvidenceFailures(record, {
  sourceSha: expectedSourceSha, sourceTreeSha, sourceAudit, tooling, dependencies, dependencyEnvelope,
});
if (failures.length) throw new Error(`HF-313 readiness receipt rejected: ${failures.join(', ')}`);
const outputPath = resolve(root, 'artifacts/pass71/hf313-release-readiness/native-evidence.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
writeFileSync(`${outputPath}.sha256`, `${sha256(readFileSync(outputPath))}  native-evidence.json\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  evidence: PASS71_HF313_RELEASE_EVIDENCE.kind,
  outputPath,
  dependencyCount: dependencies.length,
  nativeEvidenceJsonBytes: dependencyEnvelope.jsonBytes,
  receiptSha256: record.receiptSha256,
}, null, 2));
