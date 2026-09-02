// The arena roster for the eye-clearance pipeline's two BROWSER stages.
//
// Owner 2026-08-31. Stage 1 (sweep-eye-clearance-spots.ts) was fixed at
// 60886c35 to derive its roster from `SELECTABLE_ARENAS`, but stages 2 and 3
// were left behind: the live sweep hardcoded five ids and the runtime verifier
// hardcoded four. So `npm run qa:eye-clearance` GENERATED spots for seven
// arenas, MEASURED five of them, and printed a green ratchet - the missing two
// never reached the loop, so the ratchet's own missing-ceiling guard could
// never fire for them either. A half-derived pipeline is worse than an
// honestly hardcoded one, because the first stage's coverage number is the one
// people read.
//
// These stages run under plain `node`, so they cannot import the TypeScript
// roster the way stage 1 does; they scrape it, exactly as the cross-browser
// gate does (run-cross-browser-gate.mjs, verify-cross-browser-matrix.mjs).
// A scrape can silently collapse to nothing, which is why the floor below is
// not optional: an EMPTY roster tests nothing while reporting success, and
// that trap has now been hit three times in this repo.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const MAP_SELECTION_PATH = resolve(HERE, '../../src/map-selection.ts');
export const LEDGER_PATH = resolve(HERE, '../../docs/eye-clearance/ledger.json');

/**
 * Floor on the derived roster, matching `MINIMUM_SWEPT_ARENAS` in
 * sweep-eye-clearance-spots.ts. 9 = every id in arena-identity.ts. Raise it
 * when an arena is added; never lower it to get a run green. Raised 7 -> 8 on
 * 2026-09-02 (HF-405) when Map 3 shipped, and 8 -> 9 the same day (HF-423)
 * when farcrysis was un-hidden as a PREVIEW card.
 */
export const MINIMUM_EYE_CLEARANCE_ARENAS = 9;

/**
 * A ceiling of -1 means "this arena has never been measured". It is below the
 * smallest possible measurement (0), so the ratchet is RED for that arena until
 * somebody runs the sweep and writes down what it actually found. New arenas
 * enter the ledger here, never at a guessed number that pre-forgives whatever
 * they turn out to do.
 */
export const UNMEASURED_CEILING = -1;

/** Every selectable arena, in registry order. Throws rather than under-report. */
export function eyeClearanceArenaIds() {
  const source = readFileSync(MAP_SELECTION_PATH, 'utf8');
  const body = source.slice(source.indexOf('ARENA_SELECTIONS'));
  // Each entry opens with `id: '<arena>' as const,` and may later carry
  // `selectable: false`; the next `id:` bounds the entry being inspected.
  const found = [...body.matchAll(/id:\s*'([a-z0-9-]+)'\s*as const/gu)];
  const ids = [];
  for (let index = 0; index < found.length; index += 1) {
    const start = found[index].index;
    const end = index + 1 < found.length ? found[index + 1].index : body.length;
    if (!/selectable:\s*false/u.test(body.slice(start, end))) ids.push(found[index][1]);
  }
  if (ids.length < MINIMUM_EYE_CLEARANCE_ARENAS) {
    throw new Error(
      `eye-clearance: derived only ${ids.length} selectable arenas (${ids.join(', ') || 'none'}) from `
      + `${MAP_SELECTION_PATH}; expected at least ${MINIMUM_EYE_CLEARANCE_ARENAS}. `
      + 'Refusing to report success on a roster that tests nothing.',
    );
  }
  return ids;
}

/**
 * Resolve the roster a stage should run, honouring an explicit `--arenas` but
 * refusing to let one quietly shrink coverage: a narrowed run is a debugging
 * run, and a debugging run must not be able to produce a ratchet verdict.
 */
export function resolveArenaRoster(explicit) {
  const full = eyeClearanceArenaIds();
  if (!explicit) return { ids: full, full, narrowed: false };
  const ids = explicit.split(',').map((entry) => entry.trim()).filter(Boolean);
  const unknown = ids.filter((id) => !full.includes(id));
  if (unknown.length > 0) {
    throw new Error(
      `eye-clearance: --arenas names ${unknown.join(', ')}, which ${unknown.length === 1 ? 'is' : 'are'} `
      + `not selectable. The selectable roster is ${full.join(', ')}.`,
    );
  }
  // Compared by coverage, not by length: `--arenas test1,test1,...` is seven
  // entries and still leaves six arenas unmeasured.
  return { ids, full, narrowed: !full.every((id) => ids.includes(id)) };
}

export function readLedger() {
  return JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
}

/**
 * ARENA-SIDE SUB-CEILING (HF-423).
 *
 * A raw violation ceiling stops being a ratchet when most of what it counts is
 * the instrument rather than the arena. farcrysis measured 441 on its first
 * sweep, and 373 of those name `farcrysis-terrain-proxy-*` - the ground - as
 * the surface, because stage 1 seats its eye heights on a hardcoded ground
 * plane of y = 0 and only 22.0 % of farcrysis's legal spots sit where that is
 * true. 441 is the honestly measured number and it stays as the raw ceiling.
 * But as a REGRESSION guard it is worth almost nothing: the arena's own 68 real
 * rows could grow more than fivefold - every catwalk, platform and trunk in the
 * map going bad at once - and 441 would still be green.
 *
 * So the ledger may name, per arena, a set of surface-name prefixes that are
 * known instrument artefacts, and a much tighter ceiling on everything else.
 * Both are enforced. This is a TIGHTENING, not a re-baseline: it adds a second
 * gate to an arena that previously had one loose one, and it survives the
 * stage-1 fix - when stage 1 learns to seat eye heights on a real heightfield
 * the raw count collapses toward the arena-side count and the sub-ceiling is
 * already the binding one.
 *
 * Excluding a surface class from the sub-count is NOT excusing it. The excluded
 * rows are still counted in the raw number, still ratcheted there, and the
 * ledger's `measured` note says exactly why they exist and what will retire
 * them.
 */
export function arenaSideCeiling(arena, ledger) {
  const entry = ledger?.arenaSideCeilings?.[arena];
  if (!entry) return null;
  const prefixes = entry.excludeSurfacePrefixes ?? [];
  if (!Array.isArray(prefixes) || prefixes.length === 0 || !Number.isInteger(entry.ceiling)) {
    throw new Error(
      `eye-clearance: arenaSideCeilings.${arena} must carry an integer \`ceiling\` and a non-empty `
      + '`excludeSurfacePrefixes` array. A sub-ceiling that excludes nothing, or that has no number, '
      + 'would silently pass everything.',
    );
  }
  return { ceiling: entry.ceiling, excludeSurfacePrefixes: prefixes, note: entry.note ?? null };
}

/**
 * How many of `violations` are the arena's own, i.e. do not name one of the
 * excluded surface classes. `null` when the arena has no sub-ceiling committed.
 * A row with no surface name counts as arena-side: the conservative direction.
 */
export function countArenaSideViolations(arena, violations, ledger) {
  const sub = arenaSideCeiling(arena, ledger);
  if (!sub) return null;
  return violations.filter((row) => {
    const surface = String(row?.surface ?? '');
    return !sub.excludeSurfacePrefixes.some((prefix) => surface.startsWith(prefix));
  }).length;
}
