import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertPass71GrenadeNativeEvidence,
  pass71GrenadeNativeToolingHashesAtSource,
} from './pass71-grenade-native-receipt-contract.mjs';

const values = Object.fromEntries(Array.from({ length: Math.ceil(process.argv.slice(2).length / 2) }, (_, index) => {
  const name = process.argv[2 + index * 2];
  const value = process.argv[3 + index * 2];
  if (!name?.startsWith('--') || !value || value.startsWith('--')) throw new Error('Expected --evidence <path> --expected-source-sha <sha>');
  return [name.slice(2), value];
}));
const sourceSha = values['expected-source-sha'];
if (!/^[a-f0-9]{40}$/u.test(sourceSha ?? '')) throw new Error('--expected-source-sha must be a full candidate A SHA');
const path = resolve(values.evidence ?? '');
const record = JSON.parse(readFileSync(path, 'utf8'));
assertPass71GrenadeNativeEvidence(record, {
  sourceSha,
  tooling: pass71GrenadeNativeToolingHashesAtSource(process.cwd(), sourceSha),
});
process.stdout.write(`${JSON.stringify({ status: 'passed', evidence: path, sourceSha, receiptSha256: record.receiptSha256 }, null, 2)}\n`);
