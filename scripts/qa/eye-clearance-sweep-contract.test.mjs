// The coverage contract of the eye-clearance sweep.
//
// Owner 2026-08-30. scripts/qa/sweep-eye-clearance-spots.ts carried its own
// hand-written five-arena array, so test1 and test2 - both rebuilt at full
// scale that day (64 x 46 m and 76 x 58 m, 32852f89) - had NO traversal or
// eye-clearance coverage at all, and nothing said so. That is the third
// instance of one failure mode in a single night: a verifier with a frozen
// arena roster that silently goes stale when arenas are added. The menu-preview
// gate was 5ac48931; the cross-browser matrix was 144ead77; this is the same
// fix and the same shape of test, deliberately - see
// cross-browser-gate-contract.test.mjs.
//
// Run: node --test scripts/qa/eye-clearance-sweep-contract.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const SWEEP_SOURCE = readFileSync(new URL('./sweep-eye-clearance-spots.ts', import.meta.url), 'utf8');
// The sweep documents the bugs it fixed by quoting the old code, so the "must
// not come back" pins are asserted against CODE only. Comment stripping is
// crude on purpose - it only has to be right for this one file, which contains
// no regex literals and no string holding `//`.
const SWEEP_CODE = SWEEP_SOURCE.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');

/**
 * The roster, derived independently of the sweep so the two can disagree.
 * Same parse as the cross-browser contract test, on purpose: if the sweep and
 * this test derived the roster the same way, a bad derivation would agree with
 * itself and prove nothing.
 */
function selectableArenaIdsFromSource() {
  const source = readFileSync(new URL('../../src/map-selection.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('ARENA_SELECTIONS'));
  const found = [...body.matchAll(/id:\s*'([a-z0-9-]+)'\s*as const/gu)];
  const selectable = [];
  for (let index = 0; index < found.length; index += 1) {
    const start = found[index].index;
    const end = index + 1 < found.length ? found[index + 1].index : body.length;
    if (!/selectable:\s*false/u.test(body.slice(start, end))) selectable.push(found[index][1]);
  }
  return selectable;
}

test('the selectable roster this test measures against is the real one', () => {
  const selectable = selectableArenaIdsFromSource();
  // Guards the derivation itself. If this regex ever stops matching the file's
  // shape it yields an EMPTY roster, and an empty roster tests nothing while
  // reporting success - the precise trap the cross-browser gate hit.
  assert.ok(
    selectable.length >= 7,
    `expected the real selectable roster, got ${JSON.stringify(selectable)}`,
  );
  for (const required of ['atomic-acres', 'test1', 'test2']) {
    assert.ok(selectable.includes(required), `${required} is selectable and must be swept`);
  }
  assert.ok(
    !selectable.includes('farcrysis'),
    'farcrysis is selectable:false and must stay out of the required set',
  );
});

test('the sweep derives its roster instead of hardcoding one', () => {
  assert.match(
    SWEEP_CODE,
    /SELECTABLE_ARENAS/u,
    'the sweep must derive its roster from src/map-selection.ts',
  );
  // The literal that used to be here. Pinned so the hand-written array cannot
  // come back under a different variable name.
  assert.doesNotMatch(
    SWEEP_CODE,
    /id:\s*'atomic-acres',\s*build:/u,
    'the sweep must not reintroduce a hand-written arena array',
  );
});

test('the sweep keeps a floor under the derived roster', () => {
  // Importing a real array cannot silently collapse the way a scraped one can,
  // but a truncated roster would still sweep less than the game ships while
  // printing success, so the script asserts a floor rather than assuming one.
  assert.match(SWEEP_CODE, /MINIMUM_SWEPT_ARENAS\s*=\s*7/u, 'the roster floor must be pinned at 7');
  assert.match(SWEEP_CODE, /ids\.length\s*<\s*MINIMUM_SWEPT_ARENAS/u, 'the roster floor must be enforced');
});

test('legality is asked at the stance capsule top, not at a sunken probe height', () => {
  // The bug this pins: `isBlocked` treats its point as the TOP of a 1.65 m
  // capsule (legacy-main.ts:19511 probes at feet + 1.7). The sweep used to
  // probe at `groundY + 0.9`, modelling a capsule 0.75 m UNDERGROUND. test1 and
  // test2 author their ground and terrace slabs as real colliders at y[-1, 0]
  // and y[-1.35, -0.35], so every position in both arenas read as illegal and
  // the sweep emitted only spots hugging the outside rim of the ground pad -
  // 2262 and 1176 of them, of which ZERO were inside the playable bounds.
  assert.doesNotMatch(
    SWEEP_CODE,
    /groundY \+ 0\.9/u,
    'the sunken 0.9 m probe height must not come back',
  );
  assert.match(
    SWEEP_CODE,
    /collidersOverlappingVerticalSpan/u,
    'the sweep must use the live movement path\'s vertical-span collider view',
  );
  assert.match(SWEEP_CODE, /y:\s*groundY \+ s\.eye/u, 'legality must be probed at the capsule top');
});

// The checks above read source. This one runs the real derivation, so a source
// that says the right words but computes the wrong roster still fails.
test('every selectable arena actually resolves to a builder at runtime', () => {
  const sweepUrl = pathToFileURL(resolve(HERE, 'sweep-eye-clearance-spots.ts')).href;
  const scratch = mkdtempSync(join(tmpdir(), 'eye-clearance-contract-'));
  let stdout;
  try {
    const probe = join(scratch, 'probe.mts');
    // A file rather than `-e`: quoting an inline script through a Windows shell
    // truncates it, and a probe that fails to parse would look like a failing
    // contract instead of a broken harness.
    writeFileSync(probe, [
      `const m = await import(${JSON.stringify(sweepUrl)});`,
      'process.stdout.write(JSON.stringify({',
      '  swept: m.sweptArenaIds(),',
      '  builders: Object.keys(m.ARENA_BUILDERS),',
      '  minimum: m.MINIMUM_SWEPT_ARENAS,',
      '}));',
      '',
    ].join('\n'));
    stdout = execFileSync(process.execPath, ['--import', 'tsx', probe], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 300000,
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const measured = JSON.parse(stdout.slice(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1));

  assert.deepEqual(
    measured.swept,
    selectableArenaIdsFromSource(),
    'the sweep must cover exactly the selectable arenas, in the registry order',
  );
  assert.ok(
    measured.swept.length >= measured.minimum,
    `swept ${measured.swept.length} arenas, floor is ${measured.minimum}`,
  );
  for (const id of measured.swept) {
    assert.ok(measured.builders.includes(id), `${id} is selectable but has no builder in ARENA_BUILDERS`);
  }
  // A hidden arena keeps its builder wired up so un-hiding it restores coverage
  // in the same edit, with no second place to remember.
  assert.ok(
    measured.builders.includes('farcrysis'),
    'farcrysis keeps its builder even while hidden, so un-hiding it restores its coverage',
  );
});
