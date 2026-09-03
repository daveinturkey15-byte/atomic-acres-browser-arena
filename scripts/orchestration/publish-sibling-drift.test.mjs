// Lane AD (PASS 87). `publish_pass<N>.py` is a 913-line copy of `publish_pass<N-1>.py` with
// the pass numbers rolled. Lane AD's brief asked for that duplication to become one shared
// module with the pass number as a parameter. It is NOT safe to do that on the night of a
// cut: `scripts/orchestration/roll_pass.py` generates the next sibling by textually rolling
// this file, `src/release-topology.test.ts` source-pins roughly sixty exact strings inside
// it (including a differential comparison of the build-freshness guard's exclusion set
// against the PREVIOUS sibling, which only works while both are copies), and
// `publish_pass<N>_plan.test.mjs` drives the script itself. Rewriting the only publisher
// hours before it has to publish is the wrong trade.
//
// What actually hurt is not the duplication - it is DIVERGENCE between the copies. The
// ledger records the exact incident: "the pass86 copy of the guard once quietly added
// `artifacts` to that skip list under a commit line saying the guard was unchanged; the
// skeptic caught it." A human caught it. This makes it mechanical.
//
// The invariant: publish_pass<N>.py must be EXACTLY roll_pass.py's `roll_numbers` applied to
// publish_pass<N-1>.py, apart from the two blocks roll_pass.py is documented to rewrite -
// the DESCRIPTION and the freshness-guard `dist-pass*` exclusion list. Anything else is
// undeclared drift and fails here, naming the lines.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const read = (relative) => readFileSync(join(repositoryRoot, relative), 'utf8');
const config = JSON.parse(read('release-channels.json'));

/** Port of roll_pass.py's `roll_numbers`: pass{n-1} -> pass{n} and pass{n-2} -> pass{n-1}. */
export function rollNumbers(source, n) {
  const a = n - 1;
  const b = n - 2;
  return source.replace(/(PASS |Pass |pass|dist-pass|publish_pass)(\d{2})\b/gu, (whole, prefix, digits) => {
    const value = Number(digits);
    if (value === a) return `${prefix}${n}`;
    if (value === b) return `${prefix}${a}`;
    return whole;
  });
}

/** The two blocks roll_pass.py rewrites wholesale, blanked so they cannot mask real drift. */
export function normalizeRolledBlocks(source) {
  return source
    .replace(/\nDESCRIPTION = \(\n(?: {4}"[^\n]*\n)+\)/u, '\nDESCRIPTION = (<rolled>)')
    .replace(/(?:"dist-pass\d{2}", )+/u, '<dist-pass exclusions>');
}

export function siblingDrift(previousSource, currentSource, n) {
  const expected = normalizeRolledBlocks(rollNumbers(previousSource, n)).split('\n');
  const actual = normalizeRolledBlocks(currentSource).split('\n');
  const drift = [];
  for (let index = 0; index < Math.max(expected.length, actual.length); index += 1) {
    if (expected[index] !== actual[index]) {
      drift.push(`line ${index + 1}\n  expected: ${JSON.stringify(expected[index] ?? null)}`
        + `\n  actual:   ${JSON.stringify(actual[index] ?? null)}`);
    }
  }
  return drift;
}

test('the roll_numbers port matches roll_pass.py, including what it must NOT touch', () => {
  assert.equal(rollNumbers('LIVE_TREE = "pass85"\nBACKUP_TREE = "pass84"\n', 86),
    'LIVE_TREE = "pass86"\nBACKUP_TREE = "pass85"\n');
  // `\b` does not sit between a digit and an underscore, so roll_pass.py's roll CANNOT
  // update `publish_pass85_plan.test.mjs`. That is why the docstring reference to the plan
  // contract test went stale by two passes and stayed stale: it is now written `<N>`.
  assert.equal(rollNumbers('publish_pass85_plan.test.mjs', 86), 'publish_pass85_plan.test.mjs');
  assert.equal(rollNumbers('publish_pass85.py', 86), 'publish_pass86.py');
  assert.equal(rollNumbers('PASS 85 · SAFE BACKUP', 86), 'PASS 86 · SAFE BACKUP');
  // Older passes named in prose are history and must survive untouched.
  assert.equal(rollNumbers('the pass80 cut and PASS 63 rollback', 86), 'the pass80 cut and PASS 63 rollback');
  assert.equal(rollNumbers('dist-pass83', 86), 'dist-pass83');
});

test('the drift detector reports the exact silent narrowing that shipped once before', () => {
  const previous = 'dirs[:] = [d for d in dirs if d not in {"node_modules", ".git", "dist-pass84", }]\n'
    + 'LIVE_TREE = "pass85"\n';
  const clean = 'dirs[:] = [d for d in dirs if d not in {"node_modules", ".git", "dist-pass84", "dist-pass85", }]\n'
    + 'LIVE_TREE = "pass86"\n';
  assert.deepEqual(siblingDrift(previous, clean, 86), []);

  // The real incident: `artifacts` quietly added to the guard's skip list under a commit
  // message saying the guard was unchanged.
  const narrowed = clean.replace('"node_modules", ".git"', '"node_modules", ".git", "artifacts"');
  const drift = siblingDrift(previous, narrowed, 86);
  assert.equal(drift.length, 1);
  assert.match(drift[0], /artifacts/u);

  // And a guard deleted outright.
  assert.ok(siblingDrift(previous, 'LIVE_TREE = "pass86"\n', 86).length > 0);
});

test('the live publish script is its predecessor with the pass numbers rolled, and nothing else', () => {
  const liveNumber = Number(/^channels\/pass(\d+)$/u.exec(config.experimental.path)[1]);
  const current = read(`scripts/orchestration/publish_pass${liveNumber}.py`);
  const previous = read(`scripts/orchestration/publish_pass${liveNumber - 1}.py`);
  const drift = siblingDrift(previous, current, liveNumber);
  assert.deepEqual(drift, [],
    `publish_pass${liveNumber}.py has drifted from publish_pass${liveNumber - 1}.py beyond the pass roll:\n`
    + `${drift.join('\n')}\n`
    + 'Every guard in the publisher is duplicated across siblings; a change made to one copy '
    + 'and not the other is exactly how a narrowed freshness guard shipped before. Make the '
    + 'change in the predecessor and re-roll, or state the divergence here.');
});

test('the live publish script has its own contract test and cites it un-numbered', () => {
  const liveNumber = Number(/^channels\/pass(\d+)$/u.exec(config.experimental.path)[1]);
  assert.ok(read(`scripts/orchestration/publish_pass${liveNumber}_plan.test.mjs`).length > 0);
  const source = read(`scripts/orchestration/publish_pass${liveNumber}.py`);
  // A literal `publish_pass<digits>_plan.test.mjs` in the docstring is unreachable by the
  // pass roll (see the `\b` case above), so it decays into a pointer at an older pass's
  // contract test - which is what it had become. The reference is parameterised instead.
  assert.ok(source.includes('publish_pass<N>_plan.test.mjs'));
  assert.doesNotMatch(source, /publish_pass\d+_plan\.test\.mjs/u);
});
