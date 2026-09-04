/**
 * Contract for the one arena-roster derivation (scripts/qa/arena-roster.mjs).
 *
 * PASS 85, Lane N. Three separate gates in this repository have gone green
 * while looking at a roster written by hand, and each was found by the owner
 * rather than by CI. The derivation fixes that for the scripts that use it;
 * this file is what stops a hand-written list coming back, and what catches the
 * quieter failure where the scrape itself degrades and silently covers less.
 *
 * Run: npm run qa:arena-roster:contract
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MINIMUM_ARENA_IDS,
  MINIMUM_SELECTABLE_ARENAS,
  allArenaIds,
  defaultBootRoster,
  defaultSelectableRoster,
  hiddenArenaIds,
  selectableArenaIds,
} from './arena-roster.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/**
 * Independent re-derivation of the registry, written differently on purpose:
 * this one reads `src/map-selection.ts` line by line rather than with the
 * module's own regex, so a scrape that quietly stops matching fails here
 * instead of agreeing with itself.
 */
function registryFromSource() {
  const source = readFileSync(join(REPO, 'src/map-selection.ts'), 'utf8');
  const body = source.slice(source.indexOf('ARENA_SELECTIONS'));
  const ids = [];
  let current = null;
  for (const line of body.split('\n')) {
    const idMatch = /^\s*id:\s*'([a-z0-9-]+)'\s*as const,?\s*$/u.exec(line);
    if (idMatch) {
      current = { id: idMatch[1], selectable: true };
      ids.push(current);
      continue;
    }
    if (current && /^\s*selectable:\s*false,?\s*$/u.test(line)) current.selectable = false;
  }
  return ids;
}

test('the derived roster is exactly the registry, in registry order', () => {
  const registry = registryFromSource();
  assert.deepEqual(allArenaIds(), registry.map((entry) => entry.id));
  assert.deepEqual(
    selectableArenaIds(),
    registry.filter((entry) => entry.selectable).map((entry) => entry.id),
  );
  assert.deepEqual(
    hiddenArenaIds(),
    registry.filter((entry) => !entry.selectable).map((entry) => entry.id),
  );
});

test('src/arena-identity.ts and src/map-selection.ts have not drifted apart', () => {
  // ARENA_IDS is the protocol/persistence identity boundary and ARENA_SELECTIONS
  // is the picker registry. An arena that exists in one and not the other is a
  // shipped id nothing can select, or a selectable entry the network layer will
  // reject. Both are silent until a player finds them.
  const identity = allArenaIds();
  const registry = registryFromSource().map((entry) => entry.id);
  assert.deepEqual(
    [...identity].sort(),
    [...registry].sort(),
    'every arena must appear in BOTH src/arena-identity.ts and src/map-selection.ts',
  );
});

test('the roster is cross-arena distinct', () => {
  // Two arenas sharing an id is how one map ends up showing another map's menu
  // preview, spawn table or evidence row, and every downstream gate keyed by id
  // then covers one of them twice and the other never.
  for (const roster of [allArenaIds(), selectableArenaIds()]) {
    assert.equal(new Set(roster).size, roster.length, `duplicate id in ${JSON.stringify(roster)}`);
    for (const id of roster) {
      assert.match(id, /^[a-z0-9][a-z0-9-]*$/u, `${id} is not a usable arena id`);
    }
  }
  const selectable = new Set(selectableArenaIds());
  for (const hidden of hiddenArenaIds()) {
    assert.ok(!selectable.has(hidden), `${hidden} is both hidden and selectable`);
  }
});

test('the floors track the real roster and cannot collapse silently', () => {
  // The floors are the load-bearing part. A regex that partially stops matching
  // yields a SHORT roster, and a short roster makes every consumer report
  // success over less of the game. Raising the roster raises the floor in the
  // same commit; that is the only maintenance this module asks for.
  assert.equal(allArenaIds().length, MINIMUM_ARENA_IDS, 'MINIMUM_ARENA_IDS must equal the real roster size');
  assert.equal(
    selectableArenaIds().length,
    MINIMUM_SELECTABLE_ARENAS,
    'MINIMUM_SELECTABLE_ARENAS must equal the real selectable roster size',
  );
  // The arenas that were invisible to hardcoded gates, named so a future
  // truncation of the scrape is a failure rather than a shrug.
  for (const required of ['test1', 'test2', 'map3']) {
    assert.ok(selectableArenaIds().includes(required), `${required} is selectable and must be swept`);
  }
  assert.ok(hiddenArenaIds().includes('atomic-acres'), 'the original Nuketown is parked, not removed');
  assert.ok(!selectableArenaIds().includes('farcrysis'), 'farcrysis is selectable:false');
  assert.ok(allArenaIds().includes('farcrysis'), 'farcrysis still exists and boot sweeps must open it');
});

test('the boot roster is a superset of the selectable roster', () => {
  const boot = defaultBootRoster().split(',');
  const selectable = defaultSelectableRoster().split(',');
  for (const id of selectable) assert.ok(boot.includes(id), `${id} missing from the boot roster`);
  assert.ok(boot.length >= selectable.length);
});

/**
 * The only files allowed to write an arena list by hand, each with the reason
 * a derived roster would be wrong there. This list is the whole mechanism: a
 * frozen roster is not forbidden, it is made VISIBLE. Adding a file here is an
 * edit a reviewer sees; leaving one out is a red test.
 *
 * PASS 85 Lane N repair. The first version of this guard looked for ONE syntax
 * — ids comma-joined inside a single quoted string — and said so nowhere. A
 * skeptic pass measured 26 further files writing the identical roster as an
 * ARRAY literal, 15 of them reachable live gates, including the menu-preview
 * verifier this module's own header names as recurrence #1 and
 * `tests/e2e/pass65-menu-lifecycle.spec.ts`, which runs straight out of
 * `.github/workflows/verify.yml` over four ids. The detector below now reads
 * both syntaxes, and every remaining literal is either derived or listed here.
 *
 * Each entry states its KIND, because they are not the same risk:
 *
 *   PINNED SET     — the ids are the subject of an equality assertion or a
 *                    receipt digest. Widening it asserts something false.
 *   AUTHORED ORDER — a switch/browse SEQUENCE (ids repeat, order matters), not
 *                    a coverage roster.
 *   TIMING BOUNDED — a coverage roster deliberately capped by measured cost.
 *                    These are the ones that rot; each names what would have to
 *                    be re-measured to widen it.
 *   REQUIRED SET   — a contract naming arenas that MUST appear in a derived
 *                    roster. The opposite of a frozen roster: it is what makes
 *                    a collapsed derivation fail.
 *   BEHAVIOUR MAP  — ids classified by a per-arena PROPERTY (which game mode,
 *                    which lighting shape). The roster it runs over is derived;
 *                    this list only says what each arena IS.
 *
 * A TIMING BOUNDED entry is a debt, not a resolution.
 */
const BOUNDED_SUBSET_ALLOWANCES = Object.freeze([
  {
    file: 'scripts/qa/verify-tsl-node-build-integrity.mjs',
    kind: 'PINNED SET',
    reason:
      'Deliberate three-arena behaviour matrix, not a coverage sweep: gun-range and '
      + 'atomic-acres have sun shadows (the built graph must report the shaft stage ON '
      + 'with non-zero gain) and high-seas does not (the refusal must be NAMED). Widening '
      + 'it to every arena would assert the wrong half of that contract on the new maps '
      + 'until somebody classifies each one.',
  },
  {
    file: 'tests/e2e/pass66-browser-admission-cycles.spec.ts',
    kind: 'TIMING BOUNDED',
    reason:
      "Default only. The gate's admission-latency ceilings (20 s Edge WebGL2, 35 s Edge "
      + 'WebGPU, 60 s WebKit) and its cold/warm x forward/reverse cycle budget were '
      + 'measured against these four arenas; widening the default is a timing change that '
      + 'needs those ceilings re-measured. PASS 85 Lane N fixed the part that was actually '
      + 'broken - the id FILTER now validates against ARENA_IDS, so naming test1/test2/map3 '
      + 'runs them instead of yielding an empty roster that passed.',
  },
  {
    file: 'scripts/qa/cross-browser-gate-contract.test.mjs',
    kind: 'REQUIRED SET',
    reason:
      'The four ids are the REQUIRED set its derivation must contain (atomic-acres plus '
      + 'the three arenas that shipped after the last hardcoded roster), and the quoted '
      + "string at line 81 is the forbidden literal it asserts is ABSENT from the two "
      + 'cross-browser scripts. Both are the mechanism, not the defect: replacing them '
      + 'with a derived list would make the contract agree with whatever the derivation '
      + 'currently returns, which is exactly the collapse it exists to catch.',
  },
  {
    file: 'scripts/qa/eye-clearance-sweep-contract.test.mjs',
    kind: 'REQUIRED SET',
    reason:
      'Same shape as the cross-browser contract: the ids are the REQUIRED set the '
      + "eye-clearance sweep's derived roster must contain, and the floor beside them is "
      + 'what turns a collapsed scrape into a red test. Lane J owns this file in PASS 85, '
      + 'so it is listed rather than touched; folding its third copy of the '
      + 'selectable-arena scrape into scripts/qa/arena-roster.mjs stays PROPOSED.',
  },
  {
    file: 'scripts/qa/pass65-hardware-webgl2-receipt-contract.mjs',
    kind: 'PINNED SET',
    reason:
      'HARDWARE_WEBGL2_ARENAS is the arena set of the T-COLD-HARDWARE-WEBGL2 receipt '
      + 'itself: the contract asserts arenas.length === 4 with atomic-acres first and '
      + 'recomputes an atomic-versus-terminal comparison from named entries. The ids are '
      + 'inside the hashed evidence shape, so widening the roster invalidates every '
      + 'receipt already recorded against it rather than covering more of the game.',
  },
  {
    file: 'scripts/qa/verify-pass65-hardware-webgl2-admission.ts',
    kind: 'PINNED SET',
    reason:
      'The producer half of the same pinned receipt: it must emit exactly the four arenas '
      + 'pass65-hardware-webgl2-receipt-contract.mjs re-derives and compares, in that '
      + 'order. The two literals move together or the receipt contract reds; neither can '
      + 'be derived without re-cutting the recorded hardware evidence.',
  },
  {
    file: 'scripts/qa/verify-pass65-menu-preview-production.mjs',
    kind: 'PINNED SET',
    reason:
      'The RETAINED Pass 66 capture family is exactly these four arenas, and '
      + '`helicopterArenas = arenas.slice(0, 3)` depends on that order (three helicopter '
      + 'flyovers, then the protected Gun Range cat map). Arenas added afterwards ship '
      + 'their previews through additive families with their own gates, which is what '
      + 'verify-pass77-arena-menu-preview-production.mjs owns; the shelf-wide invariant '
      + 'that every SELECTABLE arena has a preview lives there and IS derived.',
  },
  {
    file: 'scripts/qa/verify-pass77-arena-menu-preview-production.mjs',
    kind: 'PINNED SET',
    reason:
      'RETAINED_ARENAS names the four arenas the retained Pass 66 masters choreography '
      + 'was captured for, and the whole point of the file is asserting that file still '
      + 'describes exactly those four - Pass 74 appended a fifth, moved its digest and '
      + 'took the retained gate red. ARENAS is this additive family\'s own two. PASS 85 '
      + 'Lane N repair removed the real defect here: its private fourth copy of the '
      + 'map-selection scrape now imports arenaRegistryEntries() from '
      + 'scripts/qa/arena-roster.mjs, so the shelf invariants run off the single '
      + 'derivation.',
  },
  {
    file: 'scripts/qa/verify-pass65-support-vehicle-production.mjs',
    kind: 'PINNED SET',
    reason:
      'The literal is one side of an equality assertion: the prerecorded menu-preview '
      + 'provenance must cover EXACTLY the three helicopter maps plus the protected Gun '
      + 'Range cat map. Deriving it would make the assertion compare the registry with '
      + 'itself and stop detecting the stale-provenance case it was written for.',
  },
  {
    file: 'scripts/qa/verify-pass64-webgpu.mjs',
    kind: 'PINNED SET',
    reason:
      'Not a roster: a per-arena behaviour matrix. atomic-acres alone may carry auxiliary '
      + 'roots and visible grass (both asserted as arenaId-specific equalities), and the '
      + 'chunk-URL regexes below name the same four arena modules to prove the right '
      + 'bundle was streamed. Widening the sweep without classifying each new arena '
      + 'asserts the atomic-acres half of the contract on maps nobody has classified.',
  },
  {
    file: 'scripts/qa/verify-pass65-webgpu-endurance.mjs',
    kind: 'AUTHORED ORDER',
    reason:
      'canonicalArenaSequence is a ten-step switch SEQUENCE with deliberate repeats '
      + '(rustworks appears four times, twice consecutively) that reproduces the endurance '
      + 'pattern the receipt is cut against, on a clean-worktree exact-SHA run. It is an '
      + 'ordered script, not a coverage roster; a derived list would have neither the '
      + 'repeats nor the ordering the recorded evidence is comparable across.',
  },
  {
    file: 'scripts/qa/verify-pass66-atomic-sky-webgpu.mjs',
    kind: 'AUTHORED ORDER',
    reason:
      'An authored revisit sequence - leave atomic-acres, visit skyline-terminal and '
      + 'rustworks-1v1, come BACK to atomic-acres - because the defect it watches for is '
      + 'sky state surviving a round trip. The return visit is the assertion; a derived '
      + 'roster iterated once would never make it.',
  },
  {
    file: 'scripts/qa/verify-pass65-menu-preview-webgpu.mjs',
    kind: 'AUTHORED ORDER',
    reason:
      'An authored browse sequence over the four retained-family cards, sampling render '
      + 'calls and submission sequence between clicks to prove browsing constructs no '
      + 'gameplay arena. Its subject is the retained media set (see '
      + 'verify-pass65-menu-preview-production.mjs); orphaned from every entry point '
      + 'since Pass 65 and listed here rather than silently widened.',
  },
  {
    file: 'scripts/qa/run-pass66-audio-long-run.mjs',
    kind: 'TIMING BOUNDED',
    reason:
      'A long-run audio soak: one full Playwright run per arena, sequential, each writing '
      + 'its own receipt into an aggregate. The four-arena set is the measured budget for '
      + 'that soak. PASS 85 Lane N repair hardened the matching half instead - the spec '
      + 'now REFUSES an unknown PASS66_AUDIO_ARENA rather than silently selecting nothing.',
  },
  {
    file: 'tests/e2e/pass66-audio-long-run.spec.ts',
    kind: 'TIMING BOUNDED',
    reason:
      'The spec half of the same soak; its ARENAS must equal the runner\'s list or the '
      + 'aggregate receipt is short. Widening is a budget change measured in '
      + 'scripts/qa/run-pass66-audio-long-run.mjs, not an edit here.',
  },
  {
    file: 'tests/e2e/pass66-prone-contact-matrix.spec.ts',
    kind: 'TIMING BOUNDED',
    reason:
      'ARENAS x PROFILES is an explicit cell count (EXPECTED_CELLS) recorded in the '
      + 'receipt, run twice - solo and two-client multiplayer with an owned peer server. '
      + 'Four arenas x three render profiles is twelve cells; the roster and the cell '
      + 'count must move together, and the multiplayer half is what caps it.',
  },
  {
    file: 'tests/e2e/pass66-owner-feedback-multiplayer-ui.spec.ts',
    kind: 'AUTHORED ORDER',
    reason:
      'hostArenaSequence is an ordered lobby script with a deliberate return transition '
      + '(rustworks -> ... -> rustworks): a one-way pass cannot catch stale scene roots, '
      + 'collider ownership or forced Gun Range settings leaking into the NEXT selection. '
      + 'The repeat is the assertion.',
  },
  {
    file: 'tests/e2e/pass65-preview-choreography.spec.ts',
    kind: 'AUTHORED ORDER',
    reason:
      'A rapid-switch sequence that must END on gun-range: it clicks four cards as fast '
      + 'as the menu allows and then asserts the final selected source is not a stale '
      + 'media event from an earlier click. Order and terminal element are the contract; '
      + 'orphaned from every entry point and listed rather than widened.',
  },
  {
    file: 'tests/e2e/pass54-wall-penetration.spec.ts',
    kind: 'PINNED SET',
    reason:
      'The literal is the expected KEY SET of the ballistics debug snapshot - '
      + 'expect(Object.keys(snapshot.arenas).sort()).toEqual([...]) - beside the same '
      + 'assertion over weapon profiles. It asserts what the runtime exposes, so deriving '
      + 'it from the registry would make the test agree with the runtime instead of '
      + 'checking it. Currently orphaned AND red (30 s internal wait exceeded, PASS 85 '
      + 'Lane N); the arena-key set is not why.',
  },
  {
    file: 'scripts/qa/verify-remotes-matrix-cdp.mjs',
    kind: 'BEHAVIOUR MAP',
    reason:
      'Its arena ROSTER is derived (defaultBootRoster, PASS 85 Lane N). The remaining '
      + 'literal is modeFor(): the arenas played as TDM, with everything else FFA and '
      + 'gun-range forced to range. That is a per-arena property, not a coverage list. '
      + 'Worth knowing that a new arena defaults to FFA here silently - correct today, '
      + 'and the place to notice it if a future arena is TDM-only.',
  },
  {
    file: 'tests/e2e/pass65-menu-lifecycle.spec.ts',
    kind: 'TIMING BOUNDED',
    reason:
      'OPEN DEBT, the worst entry on this list: it runs from .github/workflows/verify.yml '
      + 'and its test is titled "twenty all-arena solo starts" while covering four of nine '
      + 'arenas, so test1, test2, map3 and high-seas have never been solo-started by CI. '
      + 'The literal at line 764 and the local four-id `type ArenaId` at line 8 both have '
      + 'to move together. It is NOT derived here because twenty starts over eight arenas '
      + 'doubles the cold arena compiles inside a 300 s test timeout on a CI runner this '
      + 'lane cannot measure, and gun-range alone currently exceeds 45 s cold on the dev '
      + 'machine (routed to Lane H). Widening it needs a measured CI budget first.',
  },
]);

/**
 * Every syntax a frozen roster is actually written in.
 *
 * A run of three or more DISTINCT arena ids separated by commas, in either the
 * comma-joined-string form (`'a,b,c'`, the CLI `--arenas` shape) or the array
 * form (`['a', 'b', 'c']`, the shape 26 files used while the first version of
 * this guard saw none of them). Distinctness matters: a run that repeats an id
 * is a switch SEQUENCE, and calling those rosters would have buried the real
 * offenders under noise.
 */
function frozenRosterIn(text, ids) {
  const quoted = `['"\`](?:${ids.join('|')})['"\`]`;
  const array = new RegExp(`${quoted}(?:\\s*,\\s*${quoted}){2,}`, 'gu');
  const joined = new RegExp(`['"\`](?:${ids.join('|')})(?:,(?:${ids.join('|')})){2,}['"\`]`, 'gu');
  const idIn = new RegExp(`(?:${ids.join('|')})`, 'gu');
  for (const pattern of [array, joined]) {
    for (const match of text.matchAll(pattern)) {
      const found = match[0].match(idIn) ?? [];
      if (new Set(found).size < 3) continue;
      return { at: text.slice(0, match.index).split('\n').length, ids: found };
    }
  }
  return null;
}

test('the roster detector sees both syntaxes and ignores a switch sequence', () => {
  // The guard below is only worth what this test says it is. A detector that
  // silently stopped matching would report zero offenders and read as success -
  // the same failure, one level up, that the module comment describes.
  const ids = allArenaIds();
  assert.ok(frozenRosterIn("const a = ['atomic-acres', 'test1', 'map3'];", ids), 'array literal must be seen');
  assert.ok(frozenRosterIn("'atomic-acres,test1,map3'", ids), 'comma-joined string must be seen');
  assert.ok(
    frozenRosterIn("[\n  'atomic-acres',\n  'test1',\n  'map3',\n]", ids),
    'a multi-line array literal must be seen',
  );
  assert.equal(
    frozenRosterIn("['test1', 'map3', 'test1', 'map3']", ids),
    null,
    'a repeating switch sequence is not a roster',
  );
  assert.equal(frozenRosterIn("['atomic-acres', 'test1']", ids), null, 'two ids is a pair, not a roster');
});

test('no QA script or e2e spec reintroduces a hardcoded arena roster', () => {
  const ids = allArenaIds();
  const allowed = new Map(BOUNDED_SUBSET_ALLOWANCES.map((entry) => [entry.file, entry]));
  const roots = [join(REPO, 'scripts/qa'), join(REPO, 'tests/e2e')];
  const offenders = [];
  const seenAllowed = new Set();
  for (const root of roots) {
    for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(mjs|cjs|js|ts)$/u.test(entry.name)) continue;
      const absolute = join(entry.parentPath ?? entry.path ?? root, entry.name);
      const path = absolute.slice(REPO.length + 1).split('\\').join('/');
      // This file quotes the literal in order to forbid it, and quotes rosters
      // again in the detector test above; excluding itself by name keeps the
      // rule from banning itself. Every OTHER contract test that names arenas -
      // cross-browser, eye-clearance - is in the allowance list instead, so its
      // reason is visible rather than implied by a filename pattern.
      if (path === 'scripts/qa/arena-roster-contract.test.mjs') continue;
      const hit = frozenRosterIn(readFileSync(absolute, 'utf8'), ids);
      if (!hit) continue;
      if (allowed.has(path)) seenAllowed.add(path);
      else offenders.push(`${path}:${hit.at} [${hit.ids.join(',')}]`);
    }
  }
  assert.deepEqual(
    offenders.sort(),
    [],
    'these files hardcode an arena roster; import it from scripts/qa/arena-roster.mjs'
      + ' (or ARENA_IDS from src/arena-identity.ts in a .ts spec), or add a'
      + ' BOUNDED_SUBSET_ALLOWANCES entry here saying why a derived roster is wrong',
  );
  // An allowance whose file no longer hardcodes anything is dead permission, and
  // dead permission is how the next frozen roster slips in unnoticed.
  assert.deepEqual(
    [...allowed.keys()].filter((file) => !seenAllowed.has(file)),
    [],
    'these allowances no longer apply; delete them so the exception list stays short',
  );
  for (const entry of BOUNDED_SUBSET_ALLOWANCES) {
    assert.ok(entry.reason.trim().length > 60, `${entry.file} needs a real reason, not a label`);
    assert.match(
      entry.kind ?? '',
      /^(PINNED SET|AUTHORED ORDER|TIMING BOUNDED|REQUIRED SET|BEHAVIOUR MAP)$/u,
      `${entry.file} needs one of the four declared kinds`,
    );
  }
});

test('the scripts that sweep arenas derive their default roster', () => {
  // Named individually rather than scanned, so deleting a consumer is a visible
  // edit to this list and not a silently shrinking guarantee.
  const derived = [
    'verify-webgpu-arena-boot.mjs',
    'measure-arena-fps.mjs',
    'verify-arena-boot-cdp.mjs',
    'capture-visual-review.mjs',
    'probe-arena-surface-roughness.mjs',
    'verify-raytraced-preset-cdp.mjs',
    'verify-player-path-cdp.mjs',
    'run-cross-browser-gate.mjs',
    'verify-cross-browser-matrix.mjs',
  ];
  for (const name of derived) {
    const source = readFileSync(join(REPO, 'scripts/qa', name), 'utf8');
    assert.match(
      source,
      /from '\.\/arena-roster\.mjs'/u,
      `${name} must take its arena roster from scripts/qa/arena-roster.mjs`,
    );
  }
});
