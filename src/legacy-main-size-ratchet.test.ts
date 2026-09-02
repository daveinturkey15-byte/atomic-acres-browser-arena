import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PASS 85, Lane N (QA corpus streamline) — a one-way size ratchet on
 * `src/legacy-main.ts`.
 *
 * Why this exists, measured rather than assumed:
 *
 *   Ten commits between 2026-07-27 and 2026-09-02 carry the word "streamline"
 *   or "refactor" in their subject and touch this file. Together they removed
 *   a net 191 lines. Over the same window the file grew from ~32,300 to 35,720
 *   lines. Every one of those passes was real work and every one of them was
 *   swamped, in the same window, by feature code landing in the same file.
 *   Tidying without a ratchet is a treadmill: nothing holds the ground that a
 *   cleanup pass wins, so the next lane spends its budget winning it again.
 *
 * So this test does not ask anybody to shrink the file. It asks that the file
 * not get BIGGER without somebody writing down why, and that when it does get
 * smaller the win is locked in.
 *
 * It is deliberately NOT a style rule, a complexity metric, or a lint. It is a
 * single number with a ledger, because a single number is the only thing about
 * a 35,000-line module that every contributor can check in one second.
 *
 * --------------------------------------------------------------------------
 * HOW TO LOWER THE CEILING (do this whenever you delete code)
 * --------------------------------------------------------------------------
 * 1. Run `node -e "process.stdout.write(String(require('fs').readFileSync('src/legacy-main.ts').toString().split('\n').length - 1))"`.
 * 2. Set LINE_CEILING to that number.
 * 3. Add a CEILING_HISTORY entry recording the drop.
 * That is the whole procedure. Lowering never needs review; it is the
 * direction this ratchet exists to push.
 *
 * --------------------------------------------------------------------------
 * HOW TO RAISE THE CEILING (only when the growth is genuinely warranted)
 * --------------------------------------------------------------------------
 * Raising is allowed — this is a ratchet, not a freeze — but it is not silent.
 * Add a CEILING_HISTORY entry with the new number, the date and one honest
 * sentence naming the feature that needed the lines, then set LINE_CEILING.
 * The entry is the whole point: it turns "legacy-main keeps growing" from an
 * impression into a list a reviewer can read.
 *
 * Extracting a region into its own module is always preferable to raising.
 */

/**
 * Newline count of `src/legacy-main.ts`, i.e. exactly what `wc -l` reports.
 * The file is LF-terminated with a trailing newline; see the CRLF note in
 * `docs/MULTI_AGENT_REPO_DISCIPLINE.md` — source-pinned tests in this repo
 * break if a tool rewrites this file with CRLF, so the ratchet asserts the
 * line ending too.
 */
const LINE_CEILING = 35_720;

/**
 * When the file falls this far below the ceiling, the ceiling is stale and the
 * test fails asking you to lower it. Without this rule a ceiling set once
 * decays into permanent slack and a later regrowth is waved straight through.
 * 250 lines is roughly one large function: small enough that a real cleanup
 * pass is captured, large enough that ordinary churn does not thrash the
 * number.
 */
const RATCHET_SLACK = 250;

const CEILING_HISTORY: ReadonlyArray<{ date: string; lines: number; note: string }> = [
  {
    date: '2026-09-02',
    lines: 35_720,
    note:
      'PASS 85 Lane N: first ceiling, set to the measured size at PASS 84 ship '
      + '(75a4e508). No lines were added or removed to establish it.',
  },
];

function legacyMainSource(): string {
  return readFileSync(resolve(__dirname, 'legacy-main.ts'), 'utf8');
}

function countLines(source: string): number {
  let lines = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) lines += 1;
  }
  return lines;
}

describe('src/legacy-main.ts size ratchet', () => {
  it('does not grow past the recorded ceiling', () => {
    const lines = countLines(legacyMainSource());
    expect(
      lines,
      `src/legacy-main.ts is ${lines} lines, past its ${LINE_CEILING}-line ceiling.\n`
        + 'Either extract the new code into its own module (preferred), or raise\n'
        + 'LINE_CEILING in src/legacy-main-size-ratchet.test.ts and add a\n'
        + 'CEILING_HISTORY entry saying what needed the lines.',
    ).toBeLessThanOrEqual(LINE_CEILING);
  });

  it('forces the ceiling down after a real cleanup pass', () => {
    const lines = countLines(legacyMainSource());
    expect(
      lines,
      `src/legacy-main.ts is ${lines} lines, ${LINE_CEILING - lines} below its\n`
        + `${LINE_CEILING}-line ceiling. A cleanup landed and nothing is holding the\n`
        + 'ground. Set LINE_CEILING to ' + String(lines) + ' and add a CEILING_HISTORY\n'
        + 'entry. This is the ratchet doing its job, not a failure of your change.',
    ).toBeGreaterThan(LINE_CEILING - RATCHET_SLACK);
  });

  it('keeps the ceiling honest: the history records the current number', () => {
    expect(CEILING_HISTORY.length).toBeGreaterThan(0);
    const latest = CEILING_HISTORY[CEILING_HISTORY.length - 1]!;
    expect(
      latest.lines,
      'The newest CEILING_HISTORY entry must be the current LINE_CEILING, so the\n'
        + 'ledger cannot drift away from the number actually being enforced.',
    ).toBe(LINE_CEILING);
    for (const entry of CEILING_HISTORY) {
      expect(entry.note.trim().length, 'every ceiling change carries a reason').toBeGreaterThan(20);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    }
  });

  it('is measuring the LF file the source-pinned tests read', () => {
    const source = legacyMainSource();
    // A tool that rewrites this file with CRLF changes no visible behaviour and
    // breaks 85 source-pinned tests at once. Cheapest possible tripwire.
    expect(source.includes('\r'), 'src/legacy-main.ts must stay LF-terminated').toBe(false);
    expect(source.endsWith('\n')).toBe(true);
    // Guards the measurement itself: a scrape that silently returned '' would
    // otherwise report a triumphant zero-line file and pass the ceiling.
    expect(countLines(source)).toBeGreaterThan(10_000);
  });
});
