import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - QA instrument, plain ESM with no type declarations.
import { eulerianPairWalk, selectableArenaIdsFromSource } from '../scripts/qa/arena-switch-matrix-roster.mjs';
import { ARENA_IDS } from './arena-identity';
import { SELECTABLE_ARENAS } from './map-selection';

/**
 * HF-417 (PASS 85 lane H). Gun Range shipped in PASS 84 unreachable by an
 * in-match map switch while every existing gate was green, because every gate
 * only ever booted STRAIGHT INTO an arena. The switch matrix
 * (`scripts/qa/probe-arena-switch-matrix.mjs`) closes that hole, and these
 * tests exist because a coverage gate is only worth its roster:
 *
 *  - a hardcoded six-id roster in the arena boot smoke once left Test1 and
 *    Test2 completely untested after they shipped (repaired 2026-08-31), and
 *  - on 2026-09-02 this probe read its roster off the DOM as soon as the deploy
 *    button enabled, got 8 arenas on three runs and 7 on the fourth, and would
 *    have written a green 42-pair report while calling it the full 56.
 *
 * So: the derivation must equal the real selectable set, and the walk must
 * cover every ordered pair exactly once. Neither is checked by running the
 * probe — a probe that covers less simply reports less.
 */
describe('arena switch matrix roster', () => {
  const mapSelectionSource = readFileSync(new URL('./map-selection.ts', import.meta.url), 'utf8');

  it('derives exactly the arenas the menu offers, from source', () => {
    const derived: string[] = selectableArenaIdsFromSource(mapSelectionSource);
    expect([...derived].sort()).toEqual([...SELECTABLE_ARENAS.map((entry) => entry.id)].sort());
    // The hidden arena is hidden, not forgotten: it is in the registry and out
    // of the menu, and that difference is the whole point of the derivation.
    expect(derived.length).toBeLessThan(ARENA_IDS.length);
    expect(derived).not.toContain('farcrysis');
  });

  it('never silently shrinks: a collapsed derivation throws instead of sweeping less', () => {
    expect(() => selectableArenaIdsFromSource('export const ARENA_SELECTIONS = [];'))
      .toThrow(/derivation collapsed/u);
    // Enough entries to clear the first floor, all hidden, so the second floor
    // is the one that has to catch it.
    const allHidden = ARENA_IDS
      .map((id) => `  id: '${id}' as const,\n    selectable: false,\n`).join('');
    expect(() => selectableArenaIdsFromSource(allHidden)).toThrow(/selectable-arena derivation collapsed/u);
  });

  it('walks every ordered pair of the real roster exactly once', () => {
    const roster: string[] = selectableArenaIdsFromSource(mapSelectionSource);
    const pairs: [string, string][] = eulerianPairWalk(roster);
    expect(pairs).toHaveLength(roster.length * (roster.length - 1));
    const seen = new Set(pairs.map(([source, target]) => `${source}->${target}`));
    expect(seen.size).toBe(pairs.length);
    for (const source of roster) {
      for (const target of roster) {
        if (source === target) continue;
        expect(seen.has(`${source}->${target}`), `${source} -> ${target} is never switched`).toBe(true);
      }
    }
  });

  it('is one continuous chain, so each pair is a real switch from the previous arena', () => {
    const pairs: [string, string][] = eulerianPairWalk(['a', 'b', 'c', 'd']);
    expect(pairs).toHaveLength(12);
    for (let index = 1; index < pairs.length; index += 1) {
      expect(pairs[index][0]).toBe(pairs[index - 1][1]);
    }
    // No self-switch: `performArenaSelection` early-returns on the committed
    // arena, so a self-pair would be a silently unmeasured row.
    for (const [source, target] of pairs) expect(source).not.toBe(target);
  });

  it('has nothing to walk below two arenas', () => {
    expect(eulerianPairWalk([])).toEqual([]);
    expect(eulerianPairWalk(['solo'])).toEqual([]);
  });
});
