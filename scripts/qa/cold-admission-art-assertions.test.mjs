import test from 'node:test';
import assert from 'node:assert/strict';
import { selectArtAssertions } from './cold-admission-art-assertions.mjs';

test('selects the three authored-art assertions from a real arena contract', () => {
  assert.deepEqual(
    selectArtAssertions({ contract: 'arena-art-ready-v1', arenaId: 'nuketown2' }),
    {
      kind: 'contract',
      fields: ['authoredArtRootVisible', 'authoredMaterialsResolved', 'streamingSettled'],
    },
  );
});

test('keeps the coverage note for an arena with no art contract', () => {
  const selection = selectArtAssertions(null);
  assert.equal(selection.kind, 'coverage-note');
  assert.match(selection.coverageNote, /no per-arena art-ready contract/);
});
