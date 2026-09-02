// The coverage contract of the eye-clearance PIPELINE - all three stages and
// the ledger they ratchet against.
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
// Owner 2026-08-31, second half of that fix. This test pinned ONLY stage 1:
// every assertion read sweep-eye-clearance-spots.ts, and neither the live sweep,
// the runtime verifier nor the ledger was mentioned - so the half-done fix
// passed its own contract. Stage 2 still hardcoded five ids and stage 3 four,
// which meant `npm run qa:eye-clearance` generated spots for seven arenas,
// measured five, and printed a GREEN ratchet. Worse, the ratchet's
// missing-ceiling guard could not save it: an arena that never reaches the
// measurement loop never asks the ledger for a ceiling. A contract that covers
// one stage of a three-stage pipeline is a contract that certifies the seam it
// is blind to. All three stages and the ledger are pinned below, and a roster
// and a ceiling set that disagree is itself a failure.
//
// Run: node --test scripts/qa/eye-clearance-sweep-contract.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  eyeClearanceArenaIds, MINIMUM_EYE_CLEARANCE_ARENAS, UNMEASURED_CEILING,
} from './eye-clearance-roster.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const SWEEP_SOURCE = readFileSync(new URL('./sweep-eye-clearance-spots.ts', import.meta.url), 'utf8');
// The sweep documents the bugs it fixed by quoting the old code, so the "must
// not come back" pins are asserted against CODE only. Comment stripping is
// crude on purpose - it only has to be right for this one file, which contains
// no regex literals and no string holding `//`.
const SWEEP_CODE = SWEEP_SOURCE.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');

// The two browser stages. They run under plain node, so they cannot import the
// TypeScript roster; they go through scripts/qa/eye-clearance-roster.mjs.
const STAGE_SOURCES = {
  'sweep-eye-clearance-live.mjs': readFileSync(new URL('./sweep-eye-clearance-live.mjs', import.meta.url), 'utf8'),
  'verify-eye-clearance-runtime.mjs': readFileSync(new URL('./verify-eye-clearance-runtime.mjs', import.meta.url), 'utf8'),
};
const ROSTER_SOURCE = readFileSync(new URL('./eye-clearance-roster.mjs', import.meta.url), 'utf8');
const LEDGER = JSON.parse(readFileSync(new URL('../../docs/eye-clearance/ledger.json', import.meta.url), 'utf8'));

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
    selectable.length >= 8,
    `expected the real selectable roster, got ${JSON.stringify(selectable)}`,
  );
  for (const required of ['atomic-acres', 'test1', 'test2', 'map3']) {
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
  // Raised 7 -> 8 on 2026-09-02 (HF-405) when Map 3 shipped selectable. This
  // pin only ever moves UP: it is the guard against a truncated roster.
  assert.match(SWEEP_CODE, /MINIMUM_SWEPT_ARENAS\s*=\s*8/u, 'the roster floor must be pinned at 8');
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

// ---------------------------------------------------------------------------
// Lane J, 2026-09-02: the stage-1/stage-2 authority seam, and the per-spot
// annotations that replace prose exemptions.
//
// One TSX probe serves both, because booting the arena builders costs about
// five seconds and both questions need the real built arenas.
// ---------------------------------------------------------------------------

/**
 * The historical artefact spot. 51 of gun-range's 55 red rows sat on the west
 * face of the CLOSED test-bay secure door leaf (x 51.15 .. 51.85); this is one
 * of them, and a 0.36 m prone capsule centred here is 0.33 m inside that leaf.
 * A player can never stand here, so a violation reported from here is the
 * instrument's, not the map's.
 */
const DOOR_ARTEFACT_SPOT = Object.freeze({ x: 51.12, z: 8.64, stanceEye: 0.61, stanceRadius: 0.36 });

function runArenaProbe() {
  const sweepUrl = pathToFileURL(resolve(HERE, 'sweep-eye-clearance-spots.ts')).href;
  const collisionUrl = pathToFileURL(resolve(REPO_ROOT, 'src/collision.ts')).href;
  // Inside the repo, not os.tmpdir(): this probe needs the bare `three`
  // specifier the arena builders import, and ES module resolution walks up from
  // the FILE, not from cwd. A probe in the system temp directory cannot see
  // node_modules at all - which is exactly how this test first failed.
  const scratch = mkdtempSync(join(REPO_ROOT, '.eye-clearance-probe-'));
  try {
    const probe = join(scratch, 'probe.mts');
    writeFileSync(probe, [
      `const sweep = await import(${JSON.stringify(sweepUrl)});`,
      "const THREE = await import('three');",
      `const { collidersOverlappingVerticalSpan, isBlocked } = await import(${JSON.stringify(collisionUrl)});`,
      `const spot = ${JSON.stringify(DOOR_ARTEFACT_SPOT)};`,
      `const annotated = ${JSON.stringify(
        [...new Set((LEDGER.annotations ?? []).flatMap((entry) => entry.surfaces))],
      )};`,
      `const annotationArenas = ${JSON.stringify(
        [...new Set((LEDGER.annotations ?? []).map((entry) => entry.arena))],
      )};`,
      '',
      'const scene = new THREE.Scene();',
      "const gunRange = sweep.ARENA_BUILDERS['gun-range'](scene);",
      "const authority = sweep.dynamicAuthorityColliders('gun-range');",
      'const legality = (colliders) => isBlocked(',
      '  { x: spot.x, y: spot.stanceEye, z: spot.z },',
      '  collidersOverlappingVerticalSpan(colliders, 0.01, spot.stanceEye),',
      '  spot.stanceRadius,',
      ');',
      '',
      '// Every annotated surface, checked against the arena that owns it.',
      'const surfaceFacts = {};',
      'for (const arenaId of annotationArenas) {',
      '  const arenaScene = new THREE.Scene();',
      '  const map = sweep.ARENA_BUILDERS[arenaId](arenaScene);',
      '  const sameBox = (a, b) => a.minX === b.minX && a.maxX === b.maxX',
      '    && a.minZ === b.minZ && a.maxZ === b.maxZ',
      '    && a.minY === b.minY && a.maxY === b.maxY;',
      '  for (const surface of map.shotSurfaces) {',
      '    if (!annotated.includes(surface.name)) continue;',
      '    const fact = surfaceFacts[surface.name] ?? { arena: arenaId, shotSurfaces: 0, movementColliders: 0 };',
      '    fact.shotSurfaces += 1;',
      '    fact.movementColliders += map.colliders.filter((box) => sameBox(box, surface.bounds)).length;',
      '    surfaceFacts[surface.name] = fact;',
      '  }',
      '}',
      '',
      'process.stdout.write(JSON.stringify({',
      '  doorAuthority: authority,',
      '  artefactBlockedWithAuthority: legality([...gunRange.colliders, ...authority]),',
      '  artefactBlockedWithoutAuthority: legality(gunRange.colliders),',
      '  surfaceFacts,',
      '}));',
      '',
    ].join('\n'));
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', probe], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 300000,
    });
    return JSON.parse(stdout.slice(stdout.indexOf('{'), stdout.lastIndexOf('}') + 1));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const ARENA_PROBE = runArenaProbe();

test('stage 1 asks legality against the same state-posed authority stage 2 can hit', () => {
  // The bug: `gun-range-test-bay-secure-door-leaf` is authored solid:false,
  // shots:false because its authority is the door STATE, not the mesh -
  // gunRangeTestBayDoorLeafBounds feeds BOTH the movement collider and the
  // ballistic surface, and legacy-main splices the latter into
  // activeBallisticSurfaces for gun-range. Stage 2 traced the closed leaf;
  // stage 1 could not see it; 51 unreachable rows were reported as clips.
  assert.equal(
    ARENA_PROBE.doorAuthority.length, 1,
    'gun-range must contribute exactly the closed test-bay door leaf as dynamic authority',
  );
  const leaf = ARENA_PROBE.doorAuthority[0];
  assert.deepEqual(
    { minX: leaf.minX, maxX: leaf.maxX, minY: leaf.minY, maxY: leaf.maxY, minZ: leaf.minZ, maxZ: leaf.maxZ },
    { minX: 51.15, maxX: 51.85, minY: 0, maxY: 6.5, minZ: 8.2, maxZ: 15.8 },
    'the authority must be the CLOSED leaf bounds - the pose a player meets on arrival, '
    + 'and the pose stage 2 measures, since the sweep never walks the approach trigger',
  );
});

test('the door artefact case now reports correctly, and the old model still shows the bug', () => {
  // Both directions. Without the door authority the artefact spot is legal -
  // that is the defect, reproduced, so this test would have caught it. With the
  // authority merged it is blocked, so the sweep can no longer emit it.
  assert.equal(
    ARENA_PROBE.artefactBlockedWithoutAuthority, false,
    `(${DOOR_ARTEFACT_SPOT.x}, ${DOOR_ARTEFACT_SPOT.stanceEye}, ${DOOR_ARTEFACT_SPOT.z}) must read LEGAL against `
    + 'static colliders alone - that is the artefact this fix removes. If this now reads blocked the '
    + 'arena changed and the regression case must be re-derived, not deleted.',
  );
  assert.equal(
    ARENA_PROBE.artefactBlockedWithAuthority, true,
    'with the closed door leaf merged in, a prone capsule a third of a metre inside it must be ILLEGAL, '
    + 'so the sweep never emits a hug spot there again',
  );
});

test('every annotated surface is genuinely non-solid, so standing inside it is by design', () => {
  // The mechanical justification for a class-(c) exemption: the player can
  // legally stand where the clip is measured because the fixture is authored
  // walk-through. Make one of these panels movement-solid and the exemption
  // stops being true - and this fails, instead of quietly forgiving a real clip.
  const annotations = LEDGER.annotations ?? [];
  assert.ok(annotations.length > 0, 'the annotation mechanism must have at least one live entry to be exercised');
  for (const annotation of annotations) {
    for (const name of annotation.surfaces) {
      const fact = ARENA_PROBE.surfaceFacts[name];
      assert.ok(fact, `${annotation.id}: ${name} is not a shot surface of ${annotation.arena} at all`);
      assert.equal(
        fact.movementColliders, 0,
        `${annotation.id}: ${name} is a MOVEMENT collider, so a player cannot legally stand inside it and `
        + 'the "intentional walk-through fixture" reason is false. Fix the geometry or drop the annotation.',
      );
    }
  }
});

test('annotations are named, dated, capped and scoped to a selectable arena', () => {
  const roster = selectableArenaIdsFromSource();
  const seen = new Set();
  for (const annotation of LEDGER.annotations ?? []) {
    assert.ok(annotation.id && !seen.has(annotation.id), `duplicate or missing annotation id: ${annotation.id}`);
    seen.add(annotation.id);
    assert.ok(roster.includes(annotation.arena), `${annotation.id}: arena ${annotation.arena} is not selectable`);
    assert.ok(
      Array.isArray(annotation.surfaces) && annotation.surfaces.length > 0,
      `${annotation.id}: an annotation must name the exact surfaces it forgives, never an arena-wide count`,
    );
    assert.ok(
      Number.isInteger(annotation.maxRows) && annotation.maxRows > 0,
      `${annotation.id}: maxRows must be a positive integer row cap`,
    );
    assert.match(String(annotation.since), /^\d{4}-\d{2}-\d{2}$/u, `${annotation.id}: needs a date`);
    assert.ok(String(annotation.reason ?? '').length > 80, `${annotation.id}: needs a real reason`);
  }
});

test('the live sweep judges the ceiling on unannotated rows and fails a stale annotation', () => {
  const live = STAGE_SOURCES['sweep-eye-clearance-live.mjs'];
  assert.match(live, /partitionAnnotatedViolations/u, 'the live sweep must partition annotated rows');
  assert.match(
    live,
    /row\.unannotated > ceiling/u,
    'the ceiling must judge the rows nothing explains; annotated rows are capped under their own id',
  );
  assert.match(
    live,
    /matched NO measured row/u,
    'an annotation that describes nothing must fail as stale, not sit here forgiving rows that no longer exist',
  );
  assert.match(live, /maxRows/u, 'an annotation must carry its own ratchet');
  // Printed, always - an exemption a run does not show you is a silent one.
  assert.match(live, /\[annotation \$\{annotation\.id\}\]/u, 'every matched annotated row must be printed');
});

// ---------------------------------------------------------------------------
// Stage 2 (live sweep) and stage 3 (runtime verifier).
//
// These are the stages the first pass missed. Stage 1 generating spots for
// seven arenas is worthless if stage 2 measures five of them, because the
// number that gets reported is stage 2's.
// ---------------------------------------------------------------------------

test('both browser stages derive their roster instead of hardcoding one', () => {
  for (const [name, source] of Object.entries(STAGE_SOURCES)) {
    assert.match(source, /eye-clearance-roster\.mjs/u, `${name} must derive its roster from the shared module`);
    assert.match(source, /resolveArenaRoster\(/u, `${name} must resolve its roster at runtime`);
    // The exact literals that were there. Pinned so they cannot come back under
    // a different variable name or a different quoting.
    assert.doesNotMatch(
      source,
      /'atomic-acres,\s*skyline-terminal/u,
      `${name} must not reintroduce the hand-written comma-joined arena list`,
    );
    assert.doesNotMatch(
      source,
      /\[\s*'atomic-acres'\s*,\s*'skyline-terminal'/u,
      `${name} must not reintroduce the hand-written arena array`,
    );
  }
});

test('the shared roster derivation keeps a floor, so a dead scrape cannot pass', () => {
  // Stages 2 and 3 scrape TypeScript from JavaScript, and a scrape CAN collapse
  // to nothing. An empty roster tests nothing while reporting success - the trap
  // the cross-browser gate hit, and the reason stage 1 asserts a floor too.
  // Raised 7 -> 8 on 2026-09-02 (HF-405) with Map 3; this pin only moves UP.
  assert.match(
    ROSTER_SOURCE,
    /MINIMUM_EYE_CLEARANCE_ARENAS\s*=\s*8/u,
    'the shared roster floor must be pinned at 8',
  );
  assert.match(
    ROSTER_SOURCE,
    /ids\.length\s*<\s*MINIMUM_EYE_CLEARANCE_ARENAS/u,
    'the shared roster floor must be enforced',
  );
  assert.equal(MINIMUM_EYE_CLEARANCE_ARENAS, 8, 'the two stages must hold the same floor stage 1 holds');
});

// Source text can say the right words and still compute the wrong roster, so
// the derivation is executed and compared against this test's independent parse.
test('the shared derivation actually resolves the selectable roster', () => {
  assert.deepEqual(
    eyeClearanceArenaIds(),
    selectableArenaIdsFromSource(),
    'stages 2 and 3 must cover exactly the selectable arenas, in registry order',
  );
});

test('a narrowed --arenas cannot produce a ratchet verdict', () => {
  // Otherwise the five-arena bug is reachable again by flag: measure two
  // arenas, pass --check, print green. A narrowed run is a debugging run.
  const live = STAGE_SOURCES['sweep-eye-clearance-live.mjs'];
  assert.match(live, /ROSTER\.narrowed/u, 'the live sweep must refuse --check on a narrowed roster');
});

test('the ratchet fails on an arena it never measured', () => {
  // The guard that could not fire: an arena absent from the loop never asks for
  // a ceiling, so "no ceiling for X" never printed for test1/test2. Coverage is
  // now checked against the roster, not against the rows that happened to run.
  const live = STAGE_SOURCES['sweep-eye-clearance-live.mjs'];
  assert.match(
    live,
    /was never measured/u,
    'the ratchet must fail when a selectable arena produced no measurement',
  );
  assert.match(live, /ROSTER\.full/u, 'the coverage check must compare against the full roster');
});

test('stage 3 treats a missing stage-2 artifact as uncovered, not clean', () => {
  const verify = STAGE_SOURCES['verify-eye-clearance-runtime.mjs'];
  assert.match(verify, /missingSweep/u, 'the runtime verifier must record arenas with no sweep artifact');
  assert.match(verify, /process\.exit\(1\)/u, 'a missing sweep artifact must make the verifier exit non-zero');
});

// ---------------------------------------------------------------------------
// The ledger. A roster and a ceiling set that disagree is itself a failure -
// that disagreement is precisely how a five-id ceiling table outlived a
// seven-arena game without anyone noticing.
// ---------------------------------------------------------------------------

test('the gate that names this pipeline actually runs all three of its stages', () => {
  // Lane J 2026-09-02. `qa:eye-clearance` ran the contract, stage 1 and stage 2
  // and stopped. Stage 3 - the only stage that moves the REAL player and reads
  // the REAL camera seat - was a separate script nothing invoked, pointed at a
  // port no runner starts, and returning 0 whatever it found. The ledger's
  // `method` field has described a three-stage pipeline throughout.
  const scripts = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')).scripts;
  const aggregate = scripts['qa:eye-clearance'];
  const runtime = scripts['qa:eye-clearance:runtime'];
  assert.ok(aggregate.includes('sweep-eye-clearance-spots'), 'the gate must run stage 1');
  assert.ok(aggregate.includes('sweep-eye-clearance-live.mjs --check'), 'the gate must run stage 2 with a verdict');
  assert.ok(
    aggregate.includes('qa:eye-clearance:runtime') || aggregate.includes('verify-eye-clearance-runtime'),
    'the gate must run stage 3; a pipeline that reports on a stage it never invokes certifies a seam it cannot see',
  );
  assert.ok(
    runtime.includes('run-with-preview-server'),
    'stage 3 needs the preview server the other browser stage gets - otherwise it cannot be run by the command that names it',
  );
  assert.ok(runtime.includes('--check'), 'stage 3 must carry a verdict, not just print');

  const verify = STAGE_SOURCES['verify-eye-clearance-runtime.mjs'];
  assert.match(verify, /QA_BASE_URL/u, 'stage 3 must follow the server the runner started');
  assert.match(
    verify,
    /PerspectiveCamera/u,
    'the runtime verdict floor must be READ from the shipped camera, never frozen as a literal here',
  );
  assert.match(
    verify,
    /Refusing to judge runtime clearance against a guessed threshold/u,
    'a near-plane scrape that stops matching must throw, not fall back to a guess',
  );
  assert.match(verify, /partitionAnnotatedViolations/u, 'both stages must forgive through the same named annotations');
  // Found by running the new verdict for the first time: a `stance-blocked` row
  // carries no runtime probe, and reading that missing measurement as
  // `distance 0` reported the worst possible clip at a seat the player could not
  // even take - the same "unreachable spot reported as a clip" mistake that
  // produced 51 of this pass's red rows, reintroduced inside its own fix.
  assert.match(
    verify,
    /const unverified = partition\.unannotated\.filter\(\(row\) => !row\.runtime\)/u,
    'rows with no runtime probe must be separated out, never judged as a 0 m clip',
  );
  assert.match(
    verify,
    /UNVERIFIED row on/u,
    'an unmeasured row must be reported loudly - it is neither clean nor a clip',
  );
  assert.doesNotMatch(
    verify,
    /row\.runtime\?\.distance \?\? 0/u,
    'the "missing measurement means zero" coercion must not come back',
  );
});

test('the ledger carries exactly one ceiling per selectable arena', () => {
  const roster = selectableArenaIdsFromSource();
  const ceilings = Object.keys(LEDGER.ceilings);
  const missing = roster.filter((id) => !ceilings.includes(id));
  const extra = ceilings.filter((id) => !roster.includes(id));
  assert.deepEqual(missing, [], `selectable arenas with no ceiling: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `ceilings for arenas that are not selectable: ${extra.join(', ')}`);
});

test('a new arena enters the ratchet unmeasured, never pre-forgiven', () => {
  assert.equal(LEDGER.unmeasuredCeiling, UNMEASURED_CEILING, 'the ledger must declare the sentinel it uses');
  const unmeasured = LEDGER.unmeasured ?? [];
  const listed = unmeasured.map((row) => row.arena);
  for (const [arena, ceiling] of Object.entries(LEDGER.ceilings)) {
    assert.ok(Number.isInteger(ceiling), `${arena}: ceiling must be an integer, got ${JSON.stringify(ceiling)}`);
    if (ceiling < 0) {
      assert.equal(
        ceiling, UNMEASURED_CEILING,
        `${arena}: the only legal negative ceiling is the ${UNMEASURED_CEILING} unmeasured sentinel`,
      );
      assert.ok(listed.includes(arena), `${arena} sits at the unmeasured sentinel but has no dated note`);
    } else {
      // The other direction, and the one that matters: nobody may quietly hand
      // an unmeasured arena a real number without deleting its note and saying
      // where the number came from.
      assert.ok(
        !listed.includes(arena),
        `${arena} carries ceiling ${ceiling} while still listed as unmeasured - `
        + 'record the measured value and remove the note, or leave it at the sentinel',
      );
    }
  }
  for (const row of unmeasured) {
    assert.ok(
      Object.hasOwn(LEDGER.ceilings, row.arena),
      `${row.arena} is listed unmeasured but has no ceiling entry at all`,
    );
    assert.match(String(row.since), /^\d{4}-\d{2}-\d{2}$/u, `${row.arena}: unmeasured entries need a date`);
    assert.ok(String(row.note ?? '').length > 40, `${row.arena}: unmeasured entries need a real note`);
  }
});

test('the runtime-resolve record covers the roster too', () => {
  // Same staleness shape one level down: runtimeRemaining is the record of what
  // stage 3 found, and a five-key record beside a seven-arena roster reads as
  // "the other two are fine".
  const roster = selectableArenaIdsFromSource();
  const recorded = Object.keys(LEDGER.runtimeResolve.runtimeRemaining);
  const missing = roster.filter((id) => !recorded.includes(id));
  const extra = recorded.filter((id) => !roster.includes(id));
  assert.deepEqual(missing, [], `selectable arenas with no runtime-resolve record: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `runtime-resolve records for non-selectable arenas: ${extra.join(', ')}`);
});
