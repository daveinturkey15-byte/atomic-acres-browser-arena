import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PASS71_GRENADE_NATIVE_EVIDENCE,
  assertPass71GrenadeNativeEvidence,
  pass71GrenadeNativeToolingHashesAtSource,
} from './pass71-grenade-native-receipt-contract.mjs';
import {
  PASS71_HF298_COVERAGE,
  assertPass71Hf298Coverage,
} from './pass71-hf298-coverage-contract.mjs';

const values = {};
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 2) {
  const name = argv[index];
  const value = argv[index + 1];
  const key = name?.startsWith('--') ? name.slice(2) : '';
  if (!['evidence', 'expected-source-sha'].includes(key) || Object.hasOwn(values, key)
    || !value || value.startsWith('--')) {
    throw new Error('Expected unique --evidence <path> --expected-source-sha <sha> arguments');
  }
  values[key] = value;
}
const sourceSha = values['expected-source-sha'];
if (!/^[a-f0-9]{40}$/u.test(sourceSha ?? '')) throw new Error('--expected-source-sha must be a full candidate A SHA');
const path = resolve(values.evidence ?? '');
const records = JSON.parse(readFileSync(path, 'utf8'));
if (!Array.isArray(records)) throw new Error('HF-298 nativeEvidence must be the canonical five-record array');
const componentKind = PASS71_GRENADE_NATIVE_EVIDENCE.kind;
const coverageKind = PASS71_HF298_COVERAGE.kind;
const components = records.filter((record) => record?.evidenceId === 'HF-298' && record?.kind === componentKind);
const coverages = records.filter((record) => record?.evidenceId === 'HF-298' && record?.kind === coverageKind);
if (records.length !== 5 || components.length !== 4 || coverages.length !== 1) {
  throw new Error('HF-298 nativeEvidence requires exactly four registered components and one coverage record');
}
const tooling = pass71GrenadeNativeToolingHashesAtSource(process.cwd(), sourceSha);
for (const component of components) assertPass71GrenadeNativeEvidence(component, { sourceSha, tooling });
assertPass71Hf298Coverage(coverages[0], { sourceSha, tooling, components });
process.stdout.write(`${JSON.stringify({
  status: 'passed', evidence: path, sourceSha,
  componentReceiptSha256: components.map((record) => record.receiptSha256),
  coverageReceiptSha256: coverages[0].receiptSha256,
}, null, 2)}\n`);
