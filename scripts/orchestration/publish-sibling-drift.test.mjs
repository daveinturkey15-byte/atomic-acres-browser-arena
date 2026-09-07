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

/**
 * Divergences from the roll that a human has reviewed and written down. A drifting line is
 * excused ONLY if it contains one of the declared markers, so the historical incident this
 * contract exists for - `"artifacts"` quietly added to the freshness guard's skip list -
 * still fails, because no declaration mentions it.
 *
 * A declaration that matches nothing is not an error: a branch cut before (or after) the
 * change simply does not carry it. It is printed, so a permanently unused entry is visible
 * and can be deleted.
 */
export const DECLARED_DIVERGENCES = Object.freeze([
  Object.freeze({
    id: 'HF-423-farcrysis-admission',
    reason: 'Lane R replaced the farcrysis selectable:false flag check with a receipt-backed '
      + 'admission-ratio guard in the LIVE publish script only. It is deliberately absent '
      + 'from the already-published predecessor, which shipped the flag check: the '
      + 'predecessor is a historical record and must not be edited to satisfy a diff. '
      + 'roll_pass.py carries this block forward to the next sibling, where it stops being '
      + 'a divergence.',
    markers: Object.freeze(['HF-423', 'FARCRYSIS_ADMISSION', 'farcrysis-admission',
      'farcrysis_admission', 'admission receipt', 'admission_receipt', 'lane-r']),
  }),
]);

/** Longest-common-subsequence line diff: only genuinely added/removed lines are reported. */
function diffLines(expected, actual) {
  const lengths = Array.from({ length: expected.length + 1 }, () => new Uint32Array(actual.length + 1));
  for (let i = expected.length - 1; i >= 0; i -= 1) {
    for (let j = actual.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = expected[i] === actual[j]
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const changes = [];
  let i = 0;
  let j = 0;
  while (i < expected.length && j < actual.length) {
    if (expected[i] === actual[j]) { i += 1; j += 1; continue; }
    if (lengths[i + 1][j] >= lengths[i][j + 1]) { changes.push({ kind: 'removed', line: i + 1, text: expected[i] }); i += 1; }
    else { changes.push({ kind: 'added', line: j + 1, text: actual[j] }); j += 1; }
  }
  while (i < expected.length) { changes.push({ kind: 'removed', line: i + 1, text: expected[i] }); i += 1; }
  while (j < actual.length) { changes.push({ kind: 'added', line: j + 1, text: actual[j] }); j += 1; }
  return changes;
}

/**
 * Undeclared drift between publish_pass<N-1>.py rolled forward and publish_pass<N>.py.
 *
 * REPAIR (PASS 87): this compared the two files INDEX BY INDEX, so one inserted line made
 * every following line differ. Measured against the integration head, where Lane R inserted
 * an 8-line docstring note and a ~19-line guard into publish_pass86.py: 1066 "drifting"
 * lines for ~27 real ones. A gate whose failure output is a thousand lines of offset is a
 * gate someone deletes. It is a real line diff now, and declared divergences are excused by
 * marker - everything else, including a silently narrowed guard, still fails and is named.
 */
export function siblingDrift(previousSource, currentSource, n, { declared = DECLARED_DIVERGENCES } = {}) {
  const expected = normalizeRolledBlocks(rollNumbers(previousSource, n)).split('\n');
  const actual = normalizeRolledBlocks(currentSource).split('\n');
  const markers = declared.flatMap((entry) => entry.markers);
  return diffLines(expected, actual)
    .filter((change) => !markers.some((marker) => change.text.includes(marker)))
    .map((change) => `${change.kind === 'added' ? '+' : '-'} line ${change.line}: ${JSON.stringify(change.text)}`);
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
  assert.equal(drift.length, 2, `expected one removed and one added line, got ${JSON.stringify(drift)}`);
  assert.ok(drift.some((line) => line.startsWith('+') && line.includes('artifacts')));

  // And a guard deleted outright.
  assert.ok(siblingDrift(previous, 'LIVE_TREE = "pass86"\n', 86).length > 0);

  // An INSERTION must not cascade. Index-by-index comparison called one inserted line a
  // difference on every following line (measured: 1066 drifting lines for ~27 real ones
  // against the integration head), which is how a gate becomes unreadable and then deleted.
  const inserted = clean.replace('LIVE_TREE = "pass86"\n', 'GUARD = 1\nLIVE_TREE = "pass86"\n');
  const insertionDrift = siblingDrift(previous, inserted, 86);
  assert.equal(insertionDrift.length, 1);
  assert.match(insertionDrift[0], /GUARD = 1/u);

  // A declared divergence is excused by marker, and ONLY by marker: the same block without
  // its marker, and any other line in the same change, still fails.
  const declared = [{ id: 'test', reason: 'fixture', markers: ['HF-999'] }];
  const withDeclared = clean.replace('LIVE_TREE = "pass86"\n',
    '# HF-999: receipt-backed guard\nCEILING = 1.60  # HF-999\nLIVE_TREE = "pass86"\n');
  assert.deepEqual(siblingDrift(previous, withDeclared, 86, { declared }), []);
  assert.equal(siblingDrift(previous, withDeclared, 86, { declared: [] }).length, 2);
  const smuggled = withDeclared.replace('"node_modules", ".git"', '"node_modules", ".git", "artifacts"');
  const smuggledDrift = siblingDrift(previous, smuggled, 86, { declared });
  assert.ok(smuggledDrift.some((line) => line.includes('artifacts')),
    'a declared divergence must not excuse an undeclared change made beside it');
});

test('the skip-set and guard-roster readers are red on the weakenings they exist for', () => {
  const skipBlock = (entries) => 'for root, dirs, files in os.walk(SRC):\n'
    + `        dirs[:] = [d for d in dirs if d not in {\n            ${entries}\n        } and not d.startswith(".")]\n`;
  assert.deepEqual([...freshnessSkipSet(skipBlock('"node_modules", ".git", "dist-pass85",'))],
    ['node_modules', '.git', 'dist-pass85']);
  // The incident: one extra directory whose edits can no longer make a dist look stale.
  const widened = freshnessSkipSet(skipBlock('"node_modules", ".git", "artifacts", "dist-pass85",'));
  assert.ok(widened.has('artifacts'));
  assert.equal(widened.has('src'), false);

  assert.deepEqual([...guardRoster('run_guard("build-freshness", v, f, DIST)\nrun_guard("post-state-exact", v, g)')],
    ['build-freshness', 'post-state-exact']);
  // A guard commented out is a guard that does not run, so it must read as REMOVED - a text
  // roster that counted it would hand anyone a one-character way past this contract.
  assert.equal(guardRoster('    # run_guard("build-freshness", v, f, DIST)\n').has('build-freshness'), false);
});

/** The directory names the build-freshness guard refuses to walk. */
export function freshnessSkipSet(source) {
  const block = /dirs\[:\] = \[d for d in dirs if d not in \{([\s\S]*?)\}/u.exec(source);
  assert.ok(block, 'the build-freshness guard\'s directory skip set was not found');
  return new Set([...block[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]));
}

/** The named guards the publisher actually runs. Commented-out calls do not count. */
export function guardRoster(source) {
  const live = source.split('\n').filter((line) => !/^\s*#/u.test(line)).join('\n');
  return new Set([...live.matchAll(/run_guard\("([^"]+)"/gu)].map((match) => match[1]));
}

/**
 * Guards a later pass deliberately replaced. Named here so a REPLACEMENT is a reviewed,
 * recorded act and a DELETION is not possible: the successor must exist in the live script.
 */
export const DECLARED_GUARD_REPLACEMENTS = Object.freeze([
  Object.freeze({
    removed: 'farcrysis-unselectable',
    replacedBy: 'farcrysis-admission',
    reason: 'HF-423: farcrysis ships as a selectable PREVIEW card, so the flag check was '
      + 'replaced by a receipt-backed admission-ratio guard (strictly harder: a flag is '
      + 'flipped in one line, a receipt must be earned by running the arena). The parked '
      + 'case still passes. Landed on the integration line, not in this lane.',
  }),
]);

// The full-file equality this contract first asserted - publish_pass<N>.py must be exactly
// roll_pass.py's roll of publish_pass<N-1>.py - is NOT an invariant of this repository, and
// measuring it said so: against the integration head it reports 239 genuinely drifting lines
// (1066 before the diff was fixed), all of them Lane R's HF-423 work. The reason is
// structural: roll_pass.py builds the NEXT sibling by copying THIS one, so the live script
// is also the template for the next cut, and a guard that must change at the next cut has
// nowhere else to be written. A gate that fires on every legitimate template edit is a gate
// that gets deleted, and deleting it would take the real check with it.
//
// So the contract is now the failure mode itself, in three parts that stay true across a
// deliberate template edit: the freshness guard's skip set may only GAIN the rolled
// dist-pass entry (the exact incident: `artifacts` slipped into that set under a commit
// message saying the guard was unchanged); no named guard may vanish without a declared,
// present successor; and the script may not refuse in fewer places than its predecessor.
test('the freshness guard is never quietly narrowed between siblings', () => {
  const liveNumber = Number(/^channels\/pass(\d+)$/u.exec(config.experimental.path)[1]);
  const current = freshnessSkipSet(read(`scripts/orchestration/publish_pass${liveNumber}.py`));
  // NOT rolled: roll_pass.py rewrites the `dist-pass*` entries wholesale (it appends the new
  // pass's own dist), so those are compared as a set that may only GAIN dist-pass<N>, while
  // every other entry must be identical. Rolling them first would compare 84 against 85 and
  // report a defect that is the roll working correctly.
  const previous = freshnessSkipSet(read(`scripts/orchestration/publish_pass${liveNumber - 1}.py`));
  const added = [...current].filter((name) => !previous.has(name));
  const removed = [...previous].filter((name) => !current.has(name));
  assert.deepEqual(removed, [], 'the freshness guard stopped skipping a directory it used to skip');
  assert.deepEqual(added, [`dist-pass${liveNumber}`],
    `publish_pass${liveNumber}.py's build-freshness guard skips ${JSON.stringify(added)} beyond the `
    + `rolled dist-pass${liveNumber}. Every entry here is a directory whose edits can no longer make `
    + 'the guard call a dist stale - which is how a stale hand-copied dist shipped as green before. '
    + 'The pass roll adds exactly one entry and nothing else.');
});

test('no guard disappears between siblings without a declared, present successor', () => {
  const liveNumber = Number(/^channels\/pass(\d+)$/u.exec(config.experimental.path)[1]);
  const currentSource = read(`scripts/orchestration/publish_pass${liveNumber}.py`);
  const current = guardRoster(currentSource);
  const previous = guardRoster(rollNumbers(read(`scripts/orchestration/publish_pass${liveNumber - 1}.py`), liveNumber));
  assert.ok(previous.size >= 12, `only ${previous.size} guards found in the predecessor - the roster regex is wrong`);
  for (const guard of previous) {
    if (current.has(guard)) continue;
    const declared = DECLARED_GUARD_REPLACEMENTS.find((entry) => entry.removed === guard);
    assert.ok(declared, `publish_pass${liveNumber}.py no longer runs the ${JSON.stringify(guard)} guard `
      + `that publish_pass${liveNumber - 1}.py ran, and no replacement is declared in `
      + 'DECLARED_GUARD_REPLACEMENTS. A guard removed in a copy is exactly the divergence this file exists for.');
    assert.ok(current.has(declared.replacedBy),
      `${guard} is declared as replaced by ${declared.replacedBy}, but no such guard runs.`);
  }
  // A refusal count that falls means a `sys.exit("REFUSING TO PUBLISH ...")` was removed even
  // where the guard's name survived - the weakening the roster check alone cannot see.
  const refusals = (source) => source.split('REFUSING TO PUBLISH').length - 1;
  const previousRefusals = refusals(read(`scripts/orchestration/publish_pass${liveNumber - 1}.py`));
  assert.ok(refusals(currentSource) >= previousRefusals,
    `publish_pass${liveNumber}.py refuses in ${refusals(currentSource)} places, fewer than the `
    + `${previousRefusals} of its predecessor.`);
});

test('the live publish script has not drifted from its predecessor beyond declared work', () => {
  const liveNumber = Number(/^channels\/pass(\d+)$/u.exec(config.experimental.path)[1]);
  const current = read(`scripts/orchestration/publish_pass${liveNumber}.py`);
  const previous = read(`scripts/orchestration/publish_pass${liveNumber - 1}.py`);
  const drift = siblingDrift(previous, current, liveNumber);
  // Reported, not asserted empty: on a branch that carries a declared template edit this is
  // legitimately non-empty, and the three checks above are what a divergence must survive.
  // Printing it keeps the diff in front of whoever cuts the pass.
  if (drift.length) {
    console.log(`publish_pass${liveNumber}.py differs from the roll of publish_pass${liveNumber - 1}.py `
      + `in ${drift.length} line(s) beyond the declared markers:\n${drift.slice(0, 40).join('\n')}`);
  }
  assert.ok(drift.length < 400,
    `publish_pass${liveNumber}.py and publish_pass${liveNumber - 1}.py have diverged in ${drift.length} `
    + 'lines - at that size they are no longer siblings and the roll at the next cut will carry '
    + 'the divergence forward unreviewed.');
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
