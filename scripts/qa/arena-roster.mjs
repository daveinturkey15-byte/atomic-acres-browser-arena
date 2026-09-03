/**
 * One derivation of the arena roster, for every QA script and gate.
 *
 * PASS 85, Lane N (QA corpus streamline).
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * A roster frozen inside a verifier is this repository's most reliable way to
 * ship a green gate that is not looking at the game. It has now happened three
 * separate times, each found only after the arena reached the owner:
 *
 *   - Two arenas shipped another map's menu preview because the preview
 *     verifier's list was written by hand.
 *   - `tests/e2e/pass74-arena-boot-smoke.spec.ts` — the gate authored *because*
 *     a boot incident reached the owner — carried a hardcoded six-id literal,
 *     so it would not have opened Test1 or Test2.
 *   - Both cross-browser entry points hardcoded the same six ids, so when
 *     Test1/Test2 shipped they were opened in NO browser by that gate, and
 *     nothing said so (owner, 2026-08-30).
 *
 * The cross-browser scripts were fixed by scraping `src/map-selection.ts`, and
 * then the scrape itself was copy-pasted into a third file. Three copies of a
 * fragile regex is the same failure one level up. This module is the single
 * copy; `scripts/qa/arena-roster-contract.test.mjs` holds it to the registry.
 *
 * WHY A SOURCE SCRAPE AND NOT AN IMPORT
 * -------------------------------------
 * `src/map-selection.ts` is TypeScript and pulls in the selector registry,
 * which reaches gameplay/bot systems. These callers are plain `.mjs` operator
 * tools that must run with bare `node` and no build step, so they read the
 * source text. `src/arena-identity.ts` exists for the same reason on the
 * TypeScript side: `.spec.ts` files should import ARENA_IDS from there rather
 * than use this module.
 *
 * THE FLOORS ARE PART OF THE CONTRACT
 * -----------------------------------
 * A regex that stops matching does not throw; it yields a SHORT list, and a
 * short list makes a gate report success while covering less of the game. An
 * `ids.length === 0` guard waves that straight through. So both derivations
 * carry a floor that tracks the real roster size, and raising the roster means
 * raising the floor in the same commit.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_SELECTION = resolve(HERE, '../../src/map-selection.ts');
const ARENA_IDENTITY = resolve(HERE, '../../src/arena-identity.ts');

/**
 * Every arena the game can name, selectable or not. Ratchet these when the
 * registry grows; see the block comment above for why a floor and not a
 * non-empty check.
 */
export const MINIMUM_ARENA_IDS = 9;

/** Every arena the arena picker offers. Currently every id except farcrysis. */
export const MINIMUM_SELECTABLE_ARENAS = 8;

function readRegistryBody() {
  const source = readFileSync(MAP_SELECTION, 'utf8');
  const start = source.indexOf('ARENA_SELECTIONS');
  if (start < 0) {
    throw new Error(`arena roster: ARENA_SELECTIONS not found in ${MAP_SELECTION}; the scrape is stale`);
  }
  return source.slice(start);
}

/**
 * Every canonical arena id, in registry order, from `src/arena-identity.ts` —
 * the module the protocol and persistence validators already treat as the
 * identity boundary.
 */
export function allArenaIds() {
  const source = readFileSync(ARENA_IDENTITY, 'utf8');
  const start = source.indexOf('ARENA_IDS');
  if (start < 0) {
    throw new Error(`arena roster: ARENA_IDS not found in ${ARENA_IDENTITY}; the scrape is stale`);
  }
  const body = source.slice(start, source.indexOf('] as const', start));
  const ids = [...body.matchAll(/'([a-z0-9-]+)'/gu)].map((match) => match[1]);
  if (ids.length < MINIMUM_ARENA_IDS) {
    throw new Error(
      `arena roster: derived only ${ids.length} arena ids from src/arena-identity.ts `
      + `(expected at least ${MINIMUM_ARENA_IDS}); the scrape is stale`,
    );
  }
  return ids;
}

/**
 * The arenas the picker offers, in registry order. `selectable: false` entries
 * (currently farcrysis, hidden until its load path is fast) are excluded — a
 * hidden arena keeps its id but must not be required of a menu/selection gate.
 */
export function selectableArenaIds() {
  return arenaRegistryEntries().filter((entry) => entry.selectable).map((entry) => entry.id);
}

/**
 * The registry as `{ id, selectable }` pairs, in registry order.
 *
 * PASS 85 Lane N repair: this is the shape
 * `scripts/qa/verify-pass77-arena-menu-preview-production.mjs` needed for its
 * shelf-wide invariants, and it had grown its OWN copy of this scrape with its
 * own regex and its own shape assumptions - the fourth copy of the thing this
 * module exists to be the only one of. It now imports this instead.
 *
 * The floor applies here rather than in `selectableArenaIds()` so every caller
 * of either function gets it.
 */
export function arenaRegistryEntries() {
  const body = readRegistryBody();
  const found = [...body.matchAll(/id:\s*'([a-z0-9-]+)'\s*as const/gu)];
  const entries = [];
  for (let index = 0; index < found.length; index += 1) {
    const start = found[index].index;
    const end = index + 1 < found.length ? found[index + 1].index : body.length;
    entries.push({
      id: found[index][1],
      selectable: !/selectable:\s*false/u.test(body.slice(start, end)),
    });
  }
  const selectable = entries.filter((entry) => entry.selectable).length;
  if (selectable < MINIMUM_SELECTABLE_ARENAS) {
    throw new Error(
      `arena roster: derived only ${selectable} selectable arenas from src/map-selection.ts `
      + `(expected at least ${MINIMUM_SELECTABLE_ARENAS}); the scrape is stale`,
    );
  }
  return entries;
}

/** The ids the registry marks `selectable: false`. */
export function hiddenArenaIds() {
  const selectable = new Set(selectableArenaIds());
  return allArenaIds().filter((id) => !selectable.has(id));
}

/**
 * Default `--arenas` value for a BOOT/RENDER sweep: every arena the game can
 * name, hidden ones included. A hidden arena still boots, still ships in the
 * bundle, and is exactly where a regression hides unseen.
 */
export function defaultBootRoster() {
  return allArenaIds().join(',');
}

/**
 * Default `--arenas` value for a SELECTION/menu sweep: only what a player can
 * pick.
 */
export function defaultSelectableRoster() {
  return selectableArenaIds().join(',');
}
