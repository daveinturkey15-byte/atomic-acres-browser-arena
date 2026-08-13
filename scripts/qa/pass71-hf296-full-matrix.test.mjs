import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PASS71_HF296_LOCAL_KEYS,
  PASS71_HF296_MATRIX_COUNTS,
  PASS71_HF296_REMOTE_KEYS,
  PASS71_HF296_VISUAL_KEYS,
  assertPass71Hf296ExactSets,
  pass71Hf296ExactSetFailures,
} from './pass71-hf296-full-matrix.mjs';

describe('Pass 71 HF-296 exact matrix', () => {
  it('freezes the literal complete cardinalities', () => {
    assert.deepEqual(PASS71_HF296_MATRIX_COUNTS, {
      local: 18_000,
      remote: 2_400,
      visual: 180,
      weaponCatalog: 20,
    });
    assert.equal(assertPass71Hf296ExactSets({
      localKeys: [...PASS71_HF296_LOCAL_KEYS],
      remoteKeys: [...PASS71_HF296_REMOTE_KEYS],
      visualKeys: [...PASS71_HF296_VISUAL_KEYS],
    }), true);
  });

  it('rejects a missing, duplicate, or extra local cell', () => {
    const missing = PASS71_HF296_LOCAL_KEYS.slice(1);
    assert(pass71Hf296ExactSetFailures(missing, PASS71_HF296_LOCAL_KEYS, 'local').includes('local:missing'));
    const duplicate = [...PASS71_HF296_LOCAL_KEYS, PASS71_HF296_LOCAL_KEYS[0]];
    assert(pass71Hf296ExactSetFailures(duplicate, PASS71_HF296_LOCAL_KEYS, 'local').includes('local:duplicate'));
    const extra = [...PASS71_HF296_LOCAL_KEYS.slice(1), 'forged'];
    assert(pass71Hf296ExactSetFailures(extra, PASS71_HF296_LOCAL_KEYS, 'local').includes('local:extra'));
  });
});
