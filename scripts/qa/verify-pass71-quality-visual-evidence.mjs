import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  assertPass71QualityVisualEvidence,
  pass71QualityVisualToolingHashesAtSource,
} from './pass71-quality-visual-parity-contract.mjs';

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`HF-303 verifier expected --name value; received ${name ?? '(missing)'}`);
    }
    const key = name.slice(2);
    if (Object.hasOwn(parsed, key)) throw new Error(`HF-303 verifier received duplicate --${key}`);
    parsed[key] = value;
    index += 1;
  }
  for (const key of Object.keys(parsed)) {
    if (!['receipt', 'expected-source-sha'].includes(key)) throw new Error(`HF-303 verifier does not accept --${key}`);
  }
  return parsed;
}

const values = parseArgs(process.argv.slice(2));
const repositoryRoot = resolve(process.cwd());
const receiptPath = resolve(values.receipt ?? '');
const sourceSha = values['expected-source-sha'];
if (!/^[0-9a-f]{40}$/u.test(sourceSha ?? '')) {
  throw new Error('HF-303 verifier requires --expected-source-sha with one full candidate SHA');
}
if (!values.receipt || !existsSync(receiptPath)) throw new Error('HF-303 verifier requires an existing --receipt JSON path');
const record = JSON.parse(readFileSync(receiptPath, 'utf8'));
const tooling = pass71QualityVisualToolingHashesAtSource(repositoryRoot, sourceSha);
assertPass71QualityVisualEvidence(record, { sourceSha, tooling });
process.stdout.write(`${JSON.stringify({
  status: 'passed', evidenceId: record.evidenceId, sourceSha, receiptPath,
  receiptSha256: record.receiptSha256, pairs: record.pairs.map(({ backend, metrics }) => ({ backend, metrics })),
}, null, 2)}\n`);
