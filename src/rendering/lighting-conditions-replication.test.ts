/**
 * Lane AB — the hour is HOST-AUTHORITATIVE and replicated.
 *
 * WHY THE FIELD IS IN THE MATCH CONTRACT AND NOT IN GRAPHICS OPTIONS
 * `weatherIntensity` is a local graphics setting because it is a presentation
 * CLAMP: it can only ever show less of a sky every peer already agrees on. The
 * hour is not a clamp, it is the sky. Two peers on different hours are arguing
 * about a different match, so the choice rides the replicated
 * `PrivateMatchConfig` beside the time and kill limits, and the HOUR itself is
 * then derived from that mode plus the match seed both peers already hold —
 * one short string per lobby snapshot, zero bytes per frame.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIVATE_MATCH_CONFIG,
  isPrivateMatchConfig,
  type PrivateMatchConfig,
} from '../private-match';
import { ARENA_IDS } from '../arena-identity';
import {
  DEFAULT_LIGHTING_TIME_CHOICE,
  LIGHTING_TIME_CHOICES,
  LIGHTING_TIME_CHOICE_LABELS,
  isLightingTimeChoice,
  resolveLightingConditions,
  activeLightingTimeChoiceFrom,
} from './lighting-conditions';

const base = (changes: Partial<PrivateMatchConfig> = {}): PrivateMatchConfig => ({
  ...DEFAULT_PRIVATE_MATCH_CONFIG,
  ...changes,
});

describe('the replicated match contract carries the hour', () => {
  it('defaults to the module default, so a fresh lobby and a solo match agree', () => {
    expect(DEFAULT_PRIVATE_MATCH_CONFIG.timeOfDay).toBe(DEFAULT_LIGHTING_TIME_CHOICE);
    expect(isLightingTimeChoice(DEFAULT_PRIVATE_MATCH_CONFIG.timeOfDay)).toBe(true);
  });

  it('accepts every authored choice', () => {
    for (const choice of LIGHTING_TIME_CHOICES) {
      expect(isPrivateMatchConfig(base({ timeOfDay: choice }))).toBe(true);
    }
  });

  it('still validates a pre-PASS-87 config that has no such field at all', () => {
    const legacy = base();
    delete (legacy as Record<string, unknown>).timeOfDay;
    expect(isPrivateMatchConfig(legacy)).toBe(true);
  });

  it('rejects a value the model does not author, rather than silently guessing', () => {
    for (const bad of ['dusk', 'NIGHT', '', 17.5, null]) {
      expect(isPrivateMatchConfig(base({ timeOfDay: bad as never }))).toBe(false);
    }
  });
});

/**
 * NOTE ON WHAT THE FIRST CASE BELOW IS AND IS NOT. Calling one pure function
 * twice with identical arguments is a DETERMINISM check on that function, not a
 * host/guest agreement check -- the thing that can actually differ between two
 * peers is which arguments each one chooses, and that is the precedence rule in
 * the describe block after this one. Both are needed; only the second one could
 * have caught a guest playing a different hour to the host.
 */
describe('the pure model is deterministic, so equal arguments cannot diverge', () => {
  it('agrees on every arena, at every clock, for every choice', () => {
    const matchSeed = 0x0f1e_2d3c | 0;
    for (const arenaId of ARENA_IDS) {
      for (const choice of LIGHTING_TIME_CHOICES) {
        for (const elapsedSeconds of [0, 31.5, 214, 480.25]) {
          const host = resolveLightingConditions({ arenaId, matchSeed, elapsedSeconds, choice });
          const guest = resolveLightingConditions({ arenaId, matchSeed, elapsedSeconds, choice });
          expect(guest).toEqual(host);
        }
      }
    }
  });

  it('diverges only when the seed diverges — which is what makes it a match property', () => {
    const left = resolveLightingConditions({ arenaId: 'high-seas', matchSeed: 11, choice: 'random' });
    const right = resolveLightingConditions({ arenaId: 'high-seas', matchSeed: 12, choice: 'random' });
    expect(right.hour).not.toBe(left.hour);
  });

  it('is unaffected by a weather clamp, which is local — the hour is not', () => {
    // skyDarkenAmount comes from the SIMULATED weather state, which every peer
    // agrees on regardless of anybody's local weather ceiling.
    const host = resolveLightingConditions({ arenaId: 'farcrysis', matchSeed: 5, choice: 'late', skyDarkenAmount: 0.3 });
    const guest = resolveLightingConditions({ arenaId: 'farcrysis', matchSeed: 5, choice: 'late', skyDarkenAmount: 0.3 });
    expect(guest).toEqual(host);
  });
});

describe('the lobby row', () => {
  it('has a label for every choice and no label for anything else', () => {
    expect(Object.keys(LIGHTING_TIME_CHOICE_LABELS).sort()).toEqual([...LIGHTING_TIME_CHOICES].sort());
    for (const label of Object.values(LIGHTING_TIME_CHOICE_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.toUpperCase());
    }
  });
});

/**
 * THE ACTUAL HOST/GUEST AGREEMENT PROPERTY. `?tod=` sets a LOCAL override, and
 * it used to win over the replicated `config.timeOfDay` unconditionally -- so
 * one guest typing one query parameter played a different sky to everybody
 * else, against the brief's "friends must share a sky". This is the rule the
 * runtime's `activeLightingTimeChoice()` now delegates to.
 */
describe('inside a hosted lobby the replicated choice is the only authority', () => {
  it('makes a guest WITH a local override resolve the HOST hour, not their own', () => {
    const hostChoice = 'late';
    const hosted = { hosted: true, replicated: hostChoice } as const;
    const host = activeLightingTimeChoiceFrom(hosted);
    const guest = activeLightingTimeChoiceFrom({ ...hosted, localOverride: 'early' });
    expect(guest).toBe(hostChoice);
    expect(guest).toBe(host);
    // and therefore the same sun, at every clock the match can be at
    for (const elapsedSeconds of [0, 61.5, 402]) {
      expect(resolveLightingConditions({ arenaId: 'atomic-acres', matchSeed: 7, elapsedSeconds, choice: guest }))
        .toEqual(resolveLightingConditions({ arenaId: 'atomic-acres', matchSeed: 7, elapsedSeconds, choice: host }));
    }
  });

  it('ignores every override value a guest could type, for every host choice', () => {
    for (const replicated of LIGHTING_TIME_CHOICES) {
      for (const localOverride of LIGHTING_TIME_CHOICES) {
        expect(activeLightingTimeChoiceFrom({ hosted: true, replicated, localOverride })).toBe(replicated);
      }
    }
  });

  it('falls back to the default when the host snapshot predates the field', () => {
    expect(activeLightingTimeChoiceFrom({ hosted: true, replicated: undefined })).toBe(DEFAULT_LIGHTING_TIME_CHOICE);
    expect(activeLightingTimeChoiceFrom({ hosted: true, replicated: 'dusk', localOverride: 'early' }))
      .toBe(DEFAULT_LIGHTING_TIME_CHOICE);
  });

  it('still honours the override in SOLO, where there is no host to defer to', () => {
    expect(activeLightingTimeChoiceFrom({ hosted: false, replicated: 'random', localOverride: 'midday' })).toBe('midday');
    expect(activeLightingTimeChoiceFrom({ replicated: 'random', localOverride: 'midday' })).toBe('midday');
    expect(activeLightingTimeChoiceFrom({ hosted: false, replicated: 'late' })).toBe('late');
  });
});
