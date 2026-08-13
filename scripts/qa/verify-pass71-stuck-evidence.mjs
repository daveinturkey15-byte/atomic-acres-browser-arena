import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertPass71StuckEvidence,
  pass71StuckEvidenceToolingHashesAtSource,
} from './pass71-stuck-evidence-contract.mjs';

const values = parseArgs(process.argv.slice(2));
const sourceSha = values['expected-source-sha'];
if (!/^[a-f0-9]{40}$/u.test(sourceSha ?? '')) {
  throw new Error('Pass 71 STUCK verifier requires --expected-source-sha with candidate A full SHA');
}
if (!values.evidence) throw new Error('Pass 71 STUCK verifier requires --evidence <path>');
const evidencePath = resolve(values.evidence);
const record = JSON.parse(readFileSync(evidencePath, 'utf8'));
const tooling = pass71StuckEvidenceToolingHashesAtSource(process.cwd(), sourceSha);
assertPass71StuckEvidence(record, { sourceSha, tooling });
process.stdout.write(`${JSON.stringify({
  status: 'passed',
  evidence: evidencePath,
  sourceSha,
  receiptSha256: record.receiptSha256,
  frameCount: record.frames.length,
}, null, 2)}\n`);

function parseArgs(argv) {
  const allowed = new Set(['evidence', 'expected-source-sha']);
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error('Expected --evidence <path> --expected-source-sha <sha>');
    }
    const key = name.slice(2);
    if (!allowed.has(key) || Object.hasOwn(parsed, key)) {
      throw new Error(`Unexpected or duplicate Pass 71 STUCK verifier argument --${key}`);
    }
    parsed[key] = value;
  }
  return parsed;
}
