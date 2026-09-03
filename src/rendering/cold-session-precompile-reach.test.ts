import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import {
  COLD_SESSION_PRECOMPILE_ARENAS,
  arenaNeedsColdSessionPrecompile,
} from './cold-session-precompile-reach';

describe('cold-session precompile reach', () => {
  it('names only real arenas, and cannot silently empty itself', () => {
    // A hand-typed roster that stops matching is this repository's recurring
    // defect: the gate goes green because it now covers nothing. Both floors
    // matter - a rename that empties the set fails here rather than shipping a
    // farcrysis that lost its relief in silence.
    expect(COLD_SESSION_PRECOMPILE_ARENAS.length).toBeGreaterThan(0);
    for (const id of COLD_SESSION_PRECOMPILE_ARENAS) expect(ARENA_IDS).toContain(id);
  });

  it('answers for the arena measured to lose the cold-session fence, and no other', () => {
    expect(arenaNeedsColdSessionPrecompile({ id: 'farcrysis' })).toBe(true);
    for (const id of ARENA_IDS) {
      if (COLD_SESSION_PRECOMPILE_ARENAS.includes(id)) continue;
      expect(arenaNeedsColdSessionPrecompile({ id })).toBe(false);
    }
  });

  it('is the authority the transition asks - the transition never reads an arena id here', () => {
    const source = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
    const region = source.slice(
      source.indexOf("profileArenaTransition('visual-definition');"),
      source.indexOf("profileArenaTransition('quality-presentation');"),
    );
    expect(region).not.toHaveLength(0);
    expect(region).toContain('arenaNeedsColdSessionPrecompile(selectedArena)');
    // The whole point of routing through this module: no per-arena special case
    // may reappear inline in the transition.
    expect(region.match(/selectedArena\.id === '/g) ?? []).toHaveLength(0);
    for (const id of ARENA_IDS) expect(region).not.toContain(`'${id}'`);
  });
});
