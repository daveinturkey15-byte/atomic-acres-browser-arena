// Reference-grounded loop - the probe-token receipt.
//
// WHY THIS EXISTS. The overnight tiptop lane's critics moved a subject from
// 77/100 to 97/100 in six cycles, and nothing in the evidence tree proves that
// any of those critics ever received image bytes. Their prose was suggestive,
// which is not a receipt. Every other guarantee in this loop rests on "the
// model actually looked", so that fact has to be produced per round rather
// than assumed once.
//
// HOW. Before each critic call the runner stamps a deterministic four-character
// token into a corner patch of a COPY of the capture. The critic's first
// instruction is to report that token. A wrong or missing token makes the round
// INVALID: it is journalled as invalid and it contributes no score. The stamp
// never touches the archived evidence capture and its corner is excluded from
// every scored region.
//
// The token is derived, not random, so a resumed run recomputes the same
// expected answer from the journal without needing extra state.

import { createHash } from 'node:crypto';

// A critic misreading a glyph must not be journalled as a lie, so the alphabet
// carries only shapes that survive a model's own downscale. Pruned twice, both times by measurement rather than by taste.
//  1. 0/O, 1/I/L, 5/S, 2/Z, 8/B never entered: they are confusable in ANY font.
//  2. F, G, P, Q, V, 3, 4, 6, 7 were REMOVED on 2026-09-04 after the local
//     IQ3_XXS vision route read a stamped QPYU back as QFYU - one character
//     wrong, so the round was correctly refused. P and F differ by two pixels
//     of bowl at 5x7, and the same argument condemns G/C, Q/D, V/Y and every
//     digit that shares a stroke with a letter. The alphabet is now 15 shapes
//     chosen to be distinct at the size a model actually sees after its own
//     downscale. 15^4 = 50,625 codes, far more than any run can collide into.
// The fix is the ALPHABET, never verifyProbe. Loosening the check would turn
// the receipt back into the thing it was built to replace.
export const PROBE_ALPHABET = 'ACDEHJKMNRTUWXY';
export const PROBE_LENGTH = 4;
// 5x7 glyph cells with a 1-column gap between them: 4*5 + 3 = 23 columns.
export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const PROBE_BLOCK_ROWS = GLYPH_H;
export const PROBE_BLOCK_COLS = PROBE_LENGTH * GLYPH_W + (PROBE_LENGTH - 1);

// A 5x7 bitmap font covering exactly the probe alphabet.
//
// WHY A FONT AND NOT A HASH PATTERN. The first version of this rendered each
// character as a hash-derived block pattern. It was deterministic, it composited
// correctly, and it was completely useless: a vision model has no way to decode
// an arbitrary bit pattern back into a character, so every critic would have
// answered NONE and every round would have been INVALID - a receipt that always
// says "did not look" proves nothing. The token has to be READABLE. Caught by
// looking at the stamped image before running a critic against it.
export const GLYPHS = Object.freeze({
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
});

/** Deterministic token for one (subject, cycle, criticId, captureSha) round. */
export function probeToken({ subject, cycle, criticId, captureSha256 }) {
  if (!subject || !Number.isInteger(cycle) || !criticId || !captureSha256) {
    throw new TypeError('probeToken: subject, integer cycle, criticId and captureSha256 are all required');
  }
  const digest = createHash('sha256')
    .update(`${subject}|${cycle}|${criticId}|${captureSha256}`)
    .digest();
  let token = '';
  for (let i = 0; i < PROBE_LENGTH; i += 1) token += PROBE_ALPHABET[digest[i] % PROBE_ALPHABET.length];
  return token;
}

/**
 * Render the token as a bitmap grid of READABLE glyphs: 1 = ink, 0 = paper.
 * The caller scales this up into the stamped patch.
 */
export function probeBlocks(token) {
  if (typeof token !== 'string' || token.length !== PROBE_LENGTH) {
    throw new TypeError(`probeBlocks: expected a ${PROBE_LENGTH}-character token`);
  }
  const grid = Array.from({ length: PROBE_BLOCK_ROWS }, () => new Array(PROBE_BLOCK_COLS).fill(0));
  for (let c = 0; c < token.length; c += 1) {
    const glyph = GLYPHS[token[c]];
    if (!glyph) throw new RangeError(`probeBlocks: no glyph for "${token[c]}" - it is not in the probe alphabet`);
    const originCol = c * (GLYPH_W + 1);
    for (let r = 0; r < GLYPH_H; r += 1) {
      for (let k = 0; k < GLYPH_W; k += 1) {
        grid[r][originCol + k] = glyph[r][k] === '1' ? 1 : 0;
      }
    }
  }
  return grid;
}

/**
 * Decide whether a critic's answer is a receipt.
 * Case and surrounding punctuation are forgiven; a wrong character is not.
 */
export function verifyProbe(expected, answer) {
  if (typeof answer !== 'string') return { valid: false, reason: 'probe-missing', normalised: null };
  const normalised = answer.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalised.length === 0) return { valid: false, reason: 'probe-missing', normalised };
  // Accept the token appearing anywhere in a longer answer, but not a
  // substring match that would let a hallucinated wall of characters pass.
  if (normalised === expected) return { valid: true, reason: null, normalised };
  if (normalised.length <= PROBE_LENGTH * 3 && normalised.includes(expected)) {
    return { valid: true, reason: null, normalised };
  }
  return { valid: false, reason: 'probe-mismatch', normalised };
}
