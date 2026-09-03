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
  arenaSideCeiling, countArenaSideViolations, eyeClearanceArenaIds,
  MINIMUM_EYE_CLEARANCE_ARENAS, UNMEASURED_CEILING, partitionAnnotatedViolations,
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
  // MAP3 (owner 2026-09-02, HF-409): ratcheted 8 -> 7 when Map 3's card was
  // WITHDRAWN again the same day - the card launched the authored stone
  // gallery, not the corridor showcase. The floor tracks the REAL roster
  // size, which is what makes it a collapsed-derivation alarm rather than a
  // coverage promise; it must never be lowered to excuse an arena that is
  // still offered in the menu, and the explicit exclusion below is what pins
  // this particular drop to a deliberate decision.
  // MAP3 (owner 2026-09-02, HF-409, PASS 86): ratcheted BACK UP 7 -> 8 with the
  // card. The 8 -> 7 drop lasted exactly as long as the withdrawal did.
  assert.ok(
    selectable.length >= 10,
    `expected the real selectable roster, got ${JSON.stringify(selectable)}`,
  );
  for (const required of ['atomic-acres', 'test1', 'test2', 'map3', 'farcrysis']) {
    assert.ok(selectable.includes(required), `${required} is selectable and must be swept`);
  }
  // The negative pin that used to stand here - "farcrysis is selectable:false
  // and must stay out of the required set" - is retired by HF-423, which ships
  // it as a PREVIEW card. It is not dropped: farcrysis moved into the REQUIRED
  // list above, which is the same fact asserted in the stronger direction.
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
  // Raised 7 -> 8 on 2026-09-02 (HF-405) when Map 3 shipped selectable, back to 7
  // while its card was withdrawn, 8 again when the showcase became the arena,
  // 9 (HF-407) when the Nuke Town Rebuild shipped, 10 (HF-423) when farcrysis
  // was un-hidden as a PREVIEW card, and 11 (HF-408) when the Raid Rebuild
  // shipped. The floor must equal the REAL roster, which the equality assertion
  // below enforces in both directions.
  assert.match(SWEEP_CODE, /MINIMUM_SWEPT_ARENAS\s*=\s*11/u, 'the roster floor must be pinned at 11');
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
  // Raised 7 -> 8 on 2026-09-02 (HF-405) with Map 3, and back to 7 the same day
  // (HF-409) when Map 3's card was withdrawn. 9 with the Nuke Town Rebuild
  // (HF-407), 10 with farcrysis un-hidden (HF-423).
  //
  // MAP3: "this pin only moves UP" was the wrong rule, and lowering the literal
  // is not what makes this honest - so the literal is no longer the pin. The
  // floor now has to EQUAL the roster this file derives independently, which
  // fails in BOTH directions: a floor above the roster makes every eye-clearance
  // run throw instead of measuring, and a floor below it is the relaxation the
  // original comment was guarding against. An arena may only leave the roster by
  // being written `selectable: false` in src/map-selection.ts, and the test above
  // pins which arenas are allowed to be in that state.
  const derived = selectableArenaIdsFromSource();
  assert.equal(
    MINIMUM_EYE_CLEARANCE_ARENAS, derived.length,
    `the floor (${MINIMUM_EYE_CLEARANCE_ARENAS}) must equal the real selectable roster `
    + `(${derived.length}: ${derived.join(', ')})`,
  );
  assert.match(
    ROSTER_SOURCE,
    /MINIMUM_EYE_CLEARANCE_ARENAS\s*=\s*11/u,
    'the shared roster floor must be pinned at 11',
  );
  assert.match(
    ROSTER_SOURCE,
    /ids\.length\s*<\s*MINIMUM_EYE_CLEARANCE_ARENAS/u,
    'the shared roster floor must be enforced',
  );
  assert.equal(MINIMUM_EYE_CLEARANCE_ARENAS, 11, 'the two stages must hold the same floor stage 1 holds');
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
  // PASS 87 Lane AR item 9. The scrape moved to scripts/qa/lib/camera-near-plane.mjs
  // so it could be unit-tested - this file launches a browser at module scope,
  // so nothing could import the function, and the consequence was that its
  // regex silently stopped matching when HF-410 replaced the near-plane literal
  // with a named constant, killing stage 3's verdict for two passes.
  //
  // The rule is unchanged and now followed through the indirection rather than
  // satisfied by the word appearing anywhere in stage 3: whichever file owns
  // the scrape must read the shipped camera and must refuse to guess. The
  // behavioural half - that the value it produces equals the constant the game
  // is actually built with, which is the assertion that would have caught the
  // original defect - lives in scripts/qa/camera-near-plane-contract.test.mjs,
  // because it needs to call the function rather than read it.
  const nearPlaneOwner = verify.includes('PerspectiveCamera')
    ? verify
    : (assert.match(
      verify,
      /import \{ readCameraNearPlaneM \} from '\.\/lib\/camera-near-plane\.mjs';/u,
      'stage 3 must either read the shipped camera itself or import the shared reader',
    ), readFileSync(resolve(REPO_ROOT, 'scripts', 'qa', 'lib', 'camera-near-plane.mjs'), 'utf8'));
  assert.match(
    nearPlaneOwner,
    /PerspectiveCamera/u,
    'the runtime verdict floor must be READ from the shipped camera, never frozen as a literal here',
  );
  assert.match(
    nearPlaneOwner,
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

test('stage 3 forgives on the surface it actually hit, not the one stage 2 flagged', () => {
  // Lane J repair 2026-09-02. Stage 3 partitioned annotations on `row.surface`
  // - the STAGE-2 surface - while reporting and judging `row.runtime.surface`.
  // The two are the same today only because the two gun-range rows happen to
  // hit the same panel at both stages; the runtime seat can be a third of a
  // metre from the authored one after depenetration plus resolveEyeClearance,
  // and a fan from there can land anywhere. A row forgiven under an annotation
  // that does not name the surface it hit is a clip nobody examined.
  const verify = STAGE_SOURCES['verify-eye-clearance-runtime.mjs'];
  assert.match(
    verify,
    /partitionAnnotatedViolations\(\s*LEDGER,\s*arena,\s*result\.remaining,\s*\(row\) => row\.runtime\?\.surface \?\? row\.surface,?\s*\)/u,
    'stage 3 must partition on the RUNTIME surface, falling back to the sweep surface only when it has no probe',
  );
  // ...and the helper must honour it, so the pin above is not decoration.
  const ledger = {
    annotations: [{ id: 'a', arena: 'gun-range', surfaces: ['annotated-panel'], maxRows: 2 }],
  };
  const rows = [
    { surface: 'annotated-panel', runtime: { surface: 'annotated-panel' } },
    { surface: 'annotated-panel', runtime: { surface: 'some-other-wall' } },
    { surface: 'annotated-panel' },
  ];
  const runtimeFirst = partitionAnnotatedViolations(
    ledger, 'gun-range', rows, (row) => row.runtime?.surface ?? row.surface,
  );
  assert.equal(
    runtimeFirst.unannotated.length, 1,
    'the row whose RUNTIME probe hit an unannotated wall must stay unannotated and reach the verdict',
  );
  assert.equal(runtimeFirst.unannotated[0].runtime.surface, 'some-other-wall');
  assert.equal(
    runtimeFirst.matched.get('a').length, 2,
    'the annotated hit and the row with no runtime probe both stay under the annotation',
  );
  // The default accessor is stage 2's own behaviour, unchanged.
  assert.equal(partitionAnnotatedViolations(ledger, 'gun-range', rows).unannotated.length, 0);
});

test('a row stage 3 could not measure is ratcheted, not just warned about', () => {
  // Lane J repair 2026-09-02. The first shipped version of the stage-3 verdict
  // separated unmeasured rows out (correct - reading a missing measurement as
  // 0 m reports the worst possible clip at a seat nobody can take) and then let
  // them through unbounded: four atomic-acres rows with sweep distances of
  // 0.053-0.099, three of them BELOW the 0.08 m near plane the verdict exists
  // to enforce, were console.warn'd while the gate exited 0. With the stance
  // machine's own order-dependence, a regression that pushed every row into
  // that bucket would have produced a fully green stage 3 that measured
  // nothing - the exact "green gate that never looked" class this pipeline was
  // built to catch, reintroduced inside the fix for it.
  const roster = selectableArenaIdsFromSource();
  const allowances = LEDGER.unverifiedCeiling ?? {};
  const missing = roster.filter((id) => !Object.hasOwn(allowances, id));
  const extra = Object.keys(allowances).filter((id) => !roster.includes(id));
  assert.deepEqual(missing, [], `selectable arenas with no unverified allowance: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `unverified allowances for arenas that are not selectable: ${extra.join(', ')}`);
  for (const [arena, allowance] of Object.entries(allowances)) {
    assert.ok(
      Number.isInteger(allowance) && allowance >= 0,
      `${arena}: an unverified allowance must be a non-negative integer, got ${JSON.stringify(allowance)}`,
    );
  }
  assert.ok(
    String(LEDGER.unverifiedCeilingNote ?? '').length > 80,
    'the unverified allowances need a dated note saying they are measurements, not budget',
  );

  const verify = STAGE_SOURCES['verify-eye-clearance-runtime.mjs'];
  assert.match(verify, /unverifiedCeilingFor/u, 'stage 3 must read the per-arena unverified allowance');
  assert.match(
    verify,
    /has no unverifiedCeiling entry/u,
    'an arena with no recorded allowance must FAIL rather than default to unlimited',
  );
  assert.match(
    verify,
    /unverifiedCount > allowance/u,
    'more unmeasured rows than the allowance must fail: that is coverage loss, not clearance',
  );
});

test('a spot stage 2 stops flagging is still re-probed at runtime', () => {
  // Lane J repair 2026-09-02. Stage 3 teleports only to spots stage 2 flagged,
  // so FIXING an arena's analytic clearance deletes the pipeline's runtime view
  // of that arena in the same commit: skyline-terminal went to zero analytic
  // violations and stage 3 stopped visiting the nacelles on the very run that
  // moved them. Forced probes are the standing counter - named coordinates
  // measured every run, judged by the same near-plane floor, and failing when
  // one stops being visited.
  const roster = selectableArenaIdsFromSource();
  const forced = LEDGER.forcedProbes ?? [];
  assert.ok(forced.length > 0, 'the forced-probe mechanism must have at least one live entry to be exercised');
  const seen = new Set();
  for (const probe of forced) {
    assert.ok(probe.id && !seen.has(probe.id), `duplicate or missing forced-probe id: ${probe.id}`);
    seen.add(probe.id);
    assert.ok(roster.includes(probe.arena), `${probe.id}: arena ${probe.arena} is not selectable`);
    for (const key of ['x', 'z']) {
      assert.ok(Number.isFinite(probe[key]), `${probe.id}: ${key} must be a finite coordinate`);
    }
    assert.ok(['stand', 'crouch', 'prone'].includes(probe.stance), `${probe.id}: needs a real stance`);
    assert.ok(
      Array.isArray(probe.dir) && probe.dir.length === 3 && probe.dir.every(Number.isFinite),
      `${probe.id}: needs a 3-component look direction`,
    );
    assert.match(String(probe.since), /^\d{4}-\d{2}-\d{2}$/u, `${probe.id}: needs a date`);
    assert.ok(String(probe.reason ?? '').length > 80, `${probe.id}: needs a real reason`);
  }

  const verify = STAGE_SOURCES['verify-eye-clearance-runtime.mjs'];
  assert.match(verify, /forcedProbesForArena/u, 'stage 3 must read the forced probes');
  assert.match(
    verify,
    /!violations\.length && forcedRows\.length === 0/u,
    'an arena stage 2 found clean must still be booted when it carries forced probes',
  );
  assert.match(
    verify,
    /was never run/u,
    'a forced probe that stops being measured must fail, not disappear',
  );
  assert.match(
    verify,
    /forced probe \$\{forced\.id\}/u,
    'forced probes must be judged by the same near-plane floor as the swept rows',
  );
});

test('stage 3 measures a seat only after the body it teleported has stopped moving', () => {
  // Lane J repair 2026-09-02. `teleportPlayer` sets the EYE and clears
  // grounding, so the body then falls and depenetrates. Stage 3 read
  // `cameraSeat()` four frames later - which is how this lane's own nacelle
  // captures recorded a "prone" seat at y 1.66, ~0.04 m under the 1.7 m
  // teleport height: a camera photographed mid-fall, a metre above the stance
  // the receipt claimed, and then reasoned about as if it were a resolve push.
  const verify = STAGE_SOURCES['verify-eye-clearance-runtime.mjs'];
  assert.match(verify, /const settle = async \(\)/u, 'stage 3 must settle the body before reading a seat');
  assert.match(
    verify,
    /unsettled:\$\{posed\.frames\}-frames/u,
    'a seat that never stopped moving is an UNMEASURED row, not a measurement',
  );
  assert.match(
    verify,
    /\[0, -1, 0\], \[1, 0, 0\], \[-1, 0, 0\], \[0, 0, 1\], \[0, 0, -1\]/u,
    'the runtime probe fan must cover all six axes: after a lateral push the nearest surface is '
    + 'usually the one the seat was pushed away from, and a fan blind to it reports "nearest: null"',
  );
});

test('the gap between the modelled eye and the shipped camera stays the number that was measured', () => {
  // Lane J repair 2026-09-02, found by settling the body before reading a seat.
  // Every stage here models the eye at the movement profile's stance height
  // (1.7 / 1.16 / 0.61), but the shipped camera applies a flat floor standoff on
  // top of it before resolveEyeClearance runs, so the real camera sits 0.14 m
  // higher than anything this pipeline traces from - measured on three arenas
  // and three stances in one run. That makes the sweep optimistic about
  // overhead surfaces by exactly that much, which is why a nacelle with 0.17 m
  // of analytic prone clearance still needs the runtime resolve to push the
  // camera down. Re-modelling the eye moves every arena's numbers and belongs
  // in its own pass; until then the constant is PINNED, so it cannot drift
  // while the ledger's account of it silently goes stale.
  const legacyMain = readFileSync(resolve(REPO_ROOT, 'src/legacy-main.ts'), 'utf8');
  // HF-412 (drop shots) inserted the stance-transition eye offset into the same
  // expression; the standoff constant is still the last term and still pinned.
  const match = /camera\.position\.y = Math\.max\(player\.position\.y \+ (?:stanceTransitionSample\.eyeOffsetMeters \+ )?([\d.]+), camera\.position\.y\);/u
    .exec(legacyMain);
  assert.ok(
    match,
    'the camera floor standoff must still be findable in src/legacy-main.ts. If it moved or was rewritten, '
    + 're-measure the eye-model divergence and update docs/eye-clearance/ledger.json eyeModelDivergence.',
  );
  const record = LEDGER.eyeModelDivergence ?? {};
  assert.equal(
    Number(match[1]), record.constantM,
    `the shipped camera standoff is ${match[1]} m but the ledger records ${record.constantM} m. `
    + 'Every eye-clearance number in this pipeline is traced from the modelled eye, not this one; '
    + 're-measure before changing the constant.',
  );
  assert.match(String(record.measuredAt), /^\d{4}-\d{2}-\d{2}$/u, 'the divergence record needs a date');
  assert.ok(String(record.measured ?? '').length > 80, 'the divergence record needs its measurements');
});

test('every arena-conditional ballistic splice in legacy-main has a stage-1 authority model', () => {
  // The seam this lane found, generalised. `activeBallisticSurfaces` splices
  // extra state-posed surfaces in for a named arena; stage 2 can hit them and
  // stage 1's legality model could not see them, so the sweep emitted 51 hug
  // spots inside a closed door. The fix covers gun-range. Nothing stopped the
  // NEXT such fixture from reopening the seam, so the two lists are compared.
  const legacyMain = readFileSync(resolve(REPO_ROOT, 'src/legacy-main.ts'), 'utf8');
  const start = legacyMain.indexOf('function activeBallisticSurfaces(');
  assert.ok(start >= 0, 'activeBallisticSurfaces must exist in src/legacy-main.ts');
  const end = legacyMain.indexOf('\nfunction ', start + 1);
  const body = legacyMain.slice(start, end > start ? end : undefined);
  const splicedArenas = [...new Set(
    [...body.matchAll(/selectedArena\.id === '([a-z0-9-]+)'/gu)].map((match) => match[1]),
  )].sort();

  const modelled = [...new Set(
    [...SWEEP_CODE.slice(SWEEP_CODE.indexOf('export function dynamicAuthorityColliders'))
      .slice(0, 600)
      .matchAll(/'([a-z0-9-]+)'/gu)].map((match) => match[1]),
  )].sort();
  assert.deepEqual(
    splicedArenas, modelled,
    `src/legacy-main.ts splices extra ballistic surfaces for [${splicedArenas.join(', ')}] but `
    + `sweep-eye-clearance-spots.ts models dynamic authority for [${modelled.join(', ')}]. `
    + 'Stage 2 can shoot authority stage 1 cannot see, which is exactly how 51 unreachable '
    + 'hug spots were reported as clips. Add the new fixture to dynamicAuthorityColliders.',
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

// ---------------------------------------------------------------------------
// The arena-side sub-ceiling (HF-423).
//
// A raw ceiling stops being a ratchet once most of what it counts is the
// instrument. farcrysis entered at 441, and 373 of those rows name the ground
// proxy because stage 1 seats eye heights on a hardcoded y = 0 plane. Left at
// that, the arena's own 68 rows could grow more than fivefold and the ratchet
// would stay green. The sub-ceiling is the second gate; these pins stop it
// being added and then quietly ignored, widened, or emptied.
// ---------------------------------------------------------------------------

test('the arena-side sub-ceiling is enforced by the ratchet, not just recorded', () => {
  const live = STAGE_SOURCES['sweep-eye-clearance-live.mjs'];
  assert.match(live, /countArenaSideViolations\(/u, 'the live sweep must classify violations by surface class');
  assert.match(live, /arenaSideCeiling\(/u, 'the live sweep must read the sub-ceiling from the ledger');
  assert.match(
    live,
    /ARENA-SIDE violations > sub-ceiling/u,
    'the ratchet must fail when the arena-side count exceeds its sub-ceiling',
  );
  // A committed sub-ceiling with no measurement behind it must REFUSE, not pass.
  assert.match(
    live,
    /produced no arena-side count/u,
    'a run that committed a sub-ceiling but produced no arena-side count must fail',
  );
});

test('every committed sub-ceiling is real: an integer, a non-empty exclusion list, a dated note', () => {
  const subs = LEDGER.arenaSideCeilings ?? {};
  const roster = selectableArenaIdsFromSource();
  assert.ok(
    String(LEDGER.arenaSideCeilingsNote ?? '').length > 40,
    'the ledger must say what arenaSideCeilings means and how it is enforced',
  );
  for (const [arena, entry] of Object.entries(subs)) {
    assert.ok(roster.includes(arena), `${arena} has a sub-ceiling but is not selectable`);
    // Runs the real reader, so a shape that reads fine to the eye but throws in
    // the ratchet fails here instead of at 2 a.m. on cut night.
    const resolved = arenaSideCeiling(arena, LEDGER);
    assert.ok(resolved, `${arena}: arenaSideCeiling() must resolve a committed entry`);
    assert.ok(Number.isInteger(resolved.ceiling) && resolved.ceiling >= 0,
      `${arena}: sub-ceiling must be a non-negative integer`);
    assert.ok(resolved.excludeSurfacePrefixes.length > 0,
      `${arena}: a sub-ceiling that excludes nothing is the raw ceiling wearing a hat`);
    assert.ok(resolved.ceiling <= LEDGER.ceilings[arena],
      `${arena}: the arena-side sub-ceiling (${resolved.ceiling}) cannot exceed the raw ceiling `
      + `(${LEDGER.ceilings[arena]}) - it counts a strict subset of the same rows`);
    assert.ok(String(entry.note ?? '').length > 80, `${arena}: a sub-ceiling needs the measurement behind it`);
    assert.match(String(entry.measuredAt), /^\d{4}-\d{2}-\d{2}$/u, `${arena}: a sub-ceiling needs a date`);
  }
});

test('farcrysis keeps its arena-side sub-ceiling, and it matches the committed evidence', () => {
  // Recomputed from the stage-2 artifact rather than trusted: 441 rows, 373
  // naming the ground proxy, 68 the arena's own colliders. If the number in the
  // ledger and the number in the evidence ever disagree, one of them is a guess.
  const resolved = arenaSideCeiling('farcrysis', LEDGER);
  assert.ok(resolved, 'farcrysis must keep an arena-side sub-ceiling while stage 1 seats eyes on a flat plane');
  const evidence = JSON.parse(readFileSync(
    resolve(REPO_ROOT, 'docs/evidence/pass87/lane-r/eye-clearance-stage2-violations.json'), 'utf8',
  ));
  assert.equal(evidence.violations.length, LEDGER.ceilings.farcrysis,
    'the raw ceiling must be the row count in the committed stage-2 evidence');
  const arenaSide = countArenaSideViolations('farcrysis', evidence.violations, LEDGER);
  assert.equal(arenaSide, resolved.ceiling,
    `the sub-ceiling must BE the measured arena-side count (evidence ${arenaSide}, ledger ${resolved.ceiling})`);
  assert.ok(arenaSide < evidence.violations.length,
    'the exclusion must actually exclude something, or the sub-ceiling proves nothing');
});
