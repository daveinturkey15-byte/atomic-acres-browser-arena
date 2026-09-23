// node --test scripts/loop/probe.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { probeToken, probeBlocks, verifyProbe, PROBE_ALPHABET, PROBE_LENGTH, PROBE_BLOCK_ROWS, PROBE_BLOCK_COLS, GLYPHS, GLYPH_W, GLYPH_H } from './probe.mjs';

const round = { subject: 'demo', cycle: 3, criticId: 'B', captureSha256: 'a'.repeat(64) };

test('the token is deterministic for the same round', () => {
  assert.equal(probeToken(round), probeToken(round));
});

test('the token changes with cycle, critic and capture', () => {
  const base = probeToken(round);
  assert.notEqual(base, probeToken({ ...round, cycle: 4 }));
  assert.notEqual(base, probeToken({ ...round, criticId: 'C' }));
  assert.notEqual(base, probeToken({ ...round, captureSha256: 'b'.repeat(64) }));
});

test('the token uses only the unambiguous alphabet', () => {
  for (let cycle = 1; cycle <= 40; cycle += 1) {
    for (const criticId of ['A', 'B', 'C']) {
      const token = probeToken({ ...round, cycle, criticId });
      assert.equal(token.length, PROBE_LENGTH);
      for (const ch of token) assert.ok(PROBE_ALPHABET.includes(ch), `${ch} is not in the probe alphabet`);
    }
  }
});

test('probeToken refuses an incomplete round rather than inventing one', () => {
  assert.throws(() => probeToken({ subject: 'demo', cycle: 1, criticId: 'A' }), /required/);
  assert.throws(() => probeToken({ ...round, cycle: 1.5 }), /required/);
});

test('blocks are a stable grid and are not all one value', () => {
  const grid = probeBlocks('ACDE');
  assert.equal(grid.length, PROBE_BLOCK_ROWS);
  assert.equal(grid[0].length, PROBE_BLOCK_COLS);
  const flat = grid.flat();
  assert.ok(flat.some((v) => v === 1) && flat.some((v) => v === 0), 'a uniform patch would not encode anything');
  assert.deepEqual(probeBlocks('ACDE'), grid);
});

test('blocks differ between tokens', () => {
  assert.notDeepEqual(probeBlocks('ACDE'), probeBlocks('HJKM'));
});

test('verifyProbe accepts the exact token, any case, with punctuation', () => {
  assert.equal(verifyProbe('ACDE', 'ACDE').valid, true);
  assert.equal(verifyProbe('ACDE', ' acde ').valid, true);
  assert.equal(verifyProbe('ACDE', '"AC-DE"').valid, true);
});

test('verifyProbe rejects a wrong token, a missing one, and NONE', () => {
  assert.deepEqual(
    { valid: verifyProbe('ACDE', 'ACDF').valid, reason: verifyProbe('ACDE', 'ACDF').reason },
    { valid: false, reason: 'probe-mismatch' },
  );
  assert.equal(verifyProbe('ACDE', '').reason, 'probe-missing');
  assert.equal(verifyProbe('ACDE', undefined).reason, 'probe-missing');
  assert.equal(verifyProbe('ACDE', 'NONE').valid, false);
});

test('verifyProbe does not let a wall of characters brute-force a match', () => {
  const wall = PROBE_ALPHABET.repeat(20);
  assert.equal(verifyProbe(probeToken(round), wall).valid, false);
});

test('every character in the probe alphabet has a glyph of the right size', () => {
  for (const ch of PROBE_ALPHABET) {
    const glyph = GLYPHS[ch];
    assert.ok(glyph, `no glyph for ${ch} - a token could be rendered as a blank`);
    assert.equal(glyph.length, GLYPH_H);
    for (const row of glyph) {
      assert.equal(row.length, GLYPH_W);
      assert.match(row, /^[01]+$/);
    }
    assert.ok(glyph.join('').includes('1'), `glyph ${ch} has no ink`);
  }
});

test('no two glyphs in the alphabet are identical - a readable code needs distinct shapes', () => {
  const seen = new Map();
  for (const ch of PROBE_ALPHABET) {
    const key = GLYPHS[ch].join('/');
    assert.equal(seen.has(key), false, `${ch} renders identically to ${seen.get(key)}`);
    seen.set(key, ch);
  }
});

test('probeBlocks refuses a character outside the alphabet rather than stamping a blank', () => {
  assert.throws(() => probeBlocks('ABCD'), /no glyph for "B"/);
  assert.throws(() => probeBlocks('QPYU'), /no glyph for "Q"/, 'a pruned-out character must be impossible to stamp');
});

test('a rendered token reads back as the glyph rows of its characters, in order', () => {
  const grid = probeBlocks('ACDE');
  for (let c = 0; c < 4; c += 1) {
    const ch = 'ACDE'[c];
    for (let r = 0; r < GLYPH_H; r += 1) {
      const slice = grid[r].slice(c * (GLYPH_W + 1), c * (GLYPH_W + 1) + GLYPH_W).join('');
      assert.equal(slice, GLYPHS[ch][r], `row ${r} of ${ch}`);
    }
  }
});
