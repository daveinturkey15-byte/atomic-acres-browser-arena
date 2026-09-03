import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  GENERATOR_PATH,
  LINEAGE_PATH,
  buildLineage,
  crlfSha256,
  liveGeneratorDigests,
  normalisedSha256,
} from './write-capture-generator-lineage.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LINEAGE = JSON.parse(readFileSync(resolve(ROOT, LINEAGE_PATH), 'utf8'));
const VERSIONS = [LINEAGE.current, ...LINEAGE.retired];

/**
 * PASS 87 Lane AR, item 11 - the shared menu-preview capture generator.
 *
 * Every preview family records the generator it captured with. The pass77 gate
 * then re-hashed the LIVE file and demanded equality, so any later family that
 * edited the shared generator turned an older family's honest capture record
 * into a red gate whose only "fixes" were falsifying a historical digest or
 * living with the red. It lived with the red.
 */
test('the committed lineage is what git says it is', () => {
  const rebuilt = buildLineage();
  assert.deepEqual(rebuilt, LINEAGE, 'run node scripts/assets/write-capture-generator-lineage.mjs');
});

test('the live generator is the version the lineage calls current', () => {
  assert.equal(liveGeneratorDigests().sha256, LINEAGE.current.sha256);
  assert.equal(LINEAGE.path, GENERATOR_PATH);
});

test('every family provenance records a generator version that really existed', () => {
  const families = [
    'source-assets/menu/pass65-preview-masters',
    'source-assets/menu/pass77-arena-previews',
    'source-assets/menu/pass79-test-arena-previews',
    'source-assets/menu/pass84-map3-preview',
    'source-assets/menu/pass85-nuketown2-preview',
    'source-assets/loading/pass79-test-arena-loading',
    'source-assets/loading/pass84-map3-loading',
    'source-assets/loading/pass85-nuketown2-loading',
  ];
  const unaccounted = [];
  for (const family of families) {
    const recorded = JSON.parse(readFileSync(resolve(ROOT, family, 'provenance.json'), 'utf8')).generator?.sha256;
    const match = VERSIONS.find((version) => version.sha256 === recorded || version.crlfSha256 === recorded);
    if (!match) unaccounted.push(`${family}: ${recorded}`);
  }
  assert.deepEqual(unaccounted, [], 'a family records a generator digest no committed version ever had');
});

test('the CRLF half of the defect is recorded, not papered over', () => {
  // pass77 and pass79 recorded 80194703..., which is the CRLF hash of the
  // generator at 5ac48931 and has NEVER equalled the LF bytes git stores. That
  // pin was a line-ending artifact from the day it was written - green on a
  // CRLF checkout, red on an LF one - independently of Map 3 touching the file.
  // Nothing here rewrites it; the lineage explains it.
  const CRLF_RECORD = '80194703903c5c8381ac7ac706b117540885b950242a9293189f224153032d15';
  const match = VERSIONS.find((version) => version.crlfSha256 === CRLF_RECORD);
  assert.ok(match, 'the pass77/pass79 record must resolve to a real generator version');
  assert.equal(match.commit, '5ac48931');
  assert.notEqual(match.sha256, CRLF_RECORD, 'and it must be the CRLF digest, not the LF one');
});

test('the two digests are computed the way they claim to be', () => {
  const lf = Buffer.from('a\nb\n', 'utf8');
  const crlf = Buffer.from('a\r\nb\r\n', 'utf8');
  assert.equal(normalisedSha256(lf), normalisedSha256(crlf), 'normalised digests must not see line endings');
  assert.equal(crlfSha256(lf), crlfSha256(crlf));
  assert.notEqual(normalisedSha256(lf), crlfSha256(lf));
});

test('the lineage is append-only in shape: newest first, no duplicates', () => {
  const digests = VERSIONS.map((version) => version.sha256);
  assert.equal(new Set(digests).size, digests.length, 'a digest may appear once');
  for (const version of VERSIONS) {
    assert.match(version.sha256, /^[0-9a-f]{64}$/u);
    assert.match(version.crlfSha256, /^[0-9a-f]{64}$/u);
    assert.match(version.date, /^\d{4}-\d{2}-\d{2}$/u);
    assert.ok(version.subject.length > 0, 'every version says what changed');
  }
  const dates = VERSIONS.map((version) => version.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), 'newest first');
});
