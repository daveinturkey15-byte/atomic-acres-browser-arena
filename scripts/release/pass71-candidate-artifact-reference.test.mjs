import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pass71CandidateAArtifactNames,
  parsePass71CandidateAArtifactReference,
} from './pass71-candidate-artifact-reference.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const NAMES = pass71CandidateAArtifactNames(SOURCE_SHA);

test('enumerates the exact two Windows and eleven Linux candidate-A artifacts', () => {
  assert.equal(NAMES.length, 13);
  assert.equal(new Set(NAMES).size, 13);
  assert.ok(NAMES.includes(`pass71-windows-supplemental-pass70-chopper-gunner-${SOURCE_SHA}`));
  assert.ok(NAMES.includes(`pass71-linux-supplemental-pass71-nuke-warning-${SOURCE_SHA}`));
});

test('parses only exact-SHA byte-addressed candidate-A artifact files', () => {
  const name = `pass71-linux-supplemental-pass71-nuke-warning-${SOURCE_SHA}`;
  assert.deepEqual(parsePass71CandidateAArtifactReference(
    `artifact://candidate-a/${name}/artifacts/pass71/nuke-warning/active.png?sha256=${'b'.repeat(64)}&bytes=1234`,
    SOURCE_SHA,
  ), {
    artifactName: name,
    path: 'artifacts/pass71/nuke-warning/active.png',
    sha256: 'b'.repeat(64),
    byteLength: 1234,
  });
});

test('rejects generic, foreign, unsafe, unbound and malformed artifact references', () => {
  const name = `pass71-linux-supplemental-pass71-nuke-warning-${SOURCE_SHA}`;
  for (const reference of [
    'artifact://chooser/accepted.png',
    `artifact://candidate-a/${name}/../secret?sha256=${'b'.repeat(64)}&bytes=1`,
    `artifact://candidate-a/pass71-linux-supplemental-pass71-nuke-warning-${'c'.repeat(40)}/active.png?sha256=${'b'.repeat(64)}&bytes=1`,
    `artifact://candidate-a/${name}/active.png?sha256=${'b'.repeat(64)}`,
    `artifact://candidate-a/${name}/active.png?sha256=${'B'.repeat(64)}&bytes=1`,
    `artifact://candidate-a/${name}/active.png?sha256=${'b'.repeat(64)}&bytes=0`,
  ]) assert.throws(() => parsePass71CandidateAArtifactReference(reference, SOURCE_SHA));
});
