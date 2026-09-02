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
  for (const required of ['atomic-acres', 'test1', 'test2', 'map3']) {
    assert.ok(selectableArenaIds().includes(required), `${required} is selectable and must be swept`);
  }
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
 * Both entries below are DEFAULTS bounded by measured cost. Neither is allowed
 * to be the set of *valid* ids — that must always come from the registry, so an
 * operator naming a new arena gets it rather than a silent drop.
 */
const BOUNDED_SUBSET_ALLOWANCES = Object.freeze([
  {
    file: 'scripts/qa/verify-tsl-node-build-integrity.mjs',
    reason:
      'Deliberate three-arena behaviour matrix, not a coverage sweep: gun-range and '
      + 'atomic-acres have sun shadows (the built graph must report the shaft stage ON '
      + 'with non-zero gain) and high-seas does not (the refusal must be NAMED). Widening '
      + 'it to every arena would assert the wrong half of that contract on the new maps '
      + 'until somebody classifies each one.',
  },
  {
    file: 'tests/e2e/pass66-browser-admission-cycles.spec.ts',
    reason:
      "Default only. The gate's admission-latency ceilings (20 s Edge WebGL2, 35 s Edge "
      + 'WebGPU, 60 s WebKit) and its cold/warm x forward/reverse cycle budget were '
      + 'measured against these four arenas; widening the default is a timing change that '
      + 'needs those ceilings re-measured. PASS 85 Lane N fixed the part that was actually '
      + 'broken - the id FILTER now validates against ARENA_IDS, so naming test1/test2/map3 '
      + 'runs them instead of yielding an empty roster that passed.',
  },
]);

test('no QA script or e2e spec reintroduces a hardcoded arena roster', () => {
  // The literal, not the concept: any comma-joined run of three or more real
  // arena ids inside one string is a frozen roster by definition.
  const ids = allArenaIds();
  const literal = new RegExp(
    `['"\`](?:${ids.join('|')})(?:,(?:${ids.join('|')})){2,}['"\`]`,
    'u',
  );
  const allowed = new Set(BOUNDED_SUBSET_ALLOWANCES.map((entry) => entry.file));
  const roots = [join(REPO, 'scripts/qa'), join(REPO, 'tests/e2e')];
  const offenders = [];
  const seenAllowed = new Set();
  for (const root of roots) {
    for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(mjs|cjs|js|ts)$/u.test(entry.name)) continue;
      const absolute = join(entry.parentPath ?? entry.path ?? root, entry.name);
      const path = absolute.slice(REPO.length + 1).split('\\').join('/');
      // This contract and the cross-browser one quote the literal in order to
      // forbid it; excluding them by name keeps the rule from banning itself.
      if (/arena-roster-contract\.test\.mjs$|cross-browser-gate-contract\.test\.mjs$/u.test(path)) continue;
      if (!literal.test(readFileSync(absolute, 'utf8'))) continue;
      if (allowed.has(path)) seenAllowed.add(path);
      else offenders.push(path);
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
    [...allowed].filter((file) => !seenAllowed.has(file)),
    [],
    'these allowances no longer apply; delete them so the exception list stays short',
  );
  for (const entry of BOUNDED_SUBSET_ALLOWANCES) {
    assert.ok(entry.reason.trim().length > 60, `${entry.file} needs a real reason, not a label`);
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
