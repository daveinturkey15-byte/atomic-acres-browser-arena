/**
 * PASS 95 finish — SOURCE + BEHAVIOUR: the match clock walks the catalogue.
 *
 * `matchTimeSkyPreset()` was pure, tested, and dead: no runtime consumer fed
 * it the match clock. `matchTimeSkyPresetHour()` is the wiring seam (quarters
 * -> arena hour), and `resolveActiveLightingConditions()` in legacy-main.ts
 * feeds it `(lightingConditionsElapsedSeconds, match length)` in `cycle`
 * mode. These tests pin the documented quarter boundaries and the source
 * precedence (`?todhour=` wins, `?sky=` wins, hosted lobbies ignore all of
 * it), using the same source-region technique as
 * lighting-conditions-light-set.test.ts because legacy-main.ts is not
 * importable in vitest.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import { ARENA_DAYLIGHT_PROFILES } from './lighting-conditions';
import {
  arenaConfiguredSkyPreset,
  cycleMatchFixedHour,
  isSkyTimePresetId,
  isWeatherPresetId,
  matchTimeSkyPreset,
  matchTimeSkyPresetHour,
  skyTimePresetHour,
} from './sky-weather-presets';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEGACY_MAIN = resolve(HERE, '..', 'legacy-main.ts');

const REGION_START = '// LIGHTING: ==== time-of-day conditions (Lane AB, PASS 87) ====';
const REGION_END = '// LIGHTING: ==== end time-of-day conditions ====';

function lightingRegion(): string {
  const source = readFileSync(LEGACY_MAIN, 'utf8');
  const start = source.indexOf(REGION_START);
  const end = source.indexOf(REGION_END);
  expect(start, 'the LIGHTING region opening marker must exist').toBeGreaterThan(-1);
  expect(end, 'the LIGHTING region closing marker must exist').toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('match-time preset progression changes the preset at the documented times', () => {
  it('walks dawn -> day -> dusk -> night in equal quarters of a 300 s match', () => {
    expect(matchTimeSkyPresetHour('high-seas', 0, 300)).toBe(skyTimePresetHour('high-seas', 'dawn'));
    expect(matchTimeSkyPresetHour('high-seas', 75, 300)).toBe(skyTimePresetHour('high-seas', 'day'));
    expect(matchTimeSkyPresetHour('high-seas', 150, 300)).toBe(skyTimePresetHour('high-seas', 'dusk'));
    expect(matchTimeSkyPresetHour('high-seas', 225, 300)).toBe(skyTimePresetHour('high-seas', 'night'));
  });

  it('addresses a different hour per quarter on a wide-band arena', () => {
    const [low, high] = ARENA_DAYLIGHT_PROFILES['high-seas'].hourRange;
    expect(skyTimePresetHour('high-seas', 'dawn')).toBe(low);
    expect(skyTimePresetHour('high-seas', 'day')).toBe((low + high) / 2);
    expect(skyTimePresetHour('high-seas', 'dusk')).toBe(high);
  });

  it('is pure in all three arguments, so every peer derives the same sun', () => {
    expect(matchTimeSkyPresetHour('farcrysis', 151, 300)).toBe(matchTimeSkyPresetHour('farcrysis', 151, 300));
    expect(matchTimeSkyPresetHour('farcrysis', 151, 300)).toBe(skyTimePresetHour('farcrysis', matchTimeSkyPreset(151, 300)));
    expect(matchTimeSkyPresetHour('gun-range', 10_000, 300)).toBe(ARENA_DAYLIGHT_PROFILES['gun-range'].authoredHour);
  });
  it('falls back to the dawn hour on degenerate input, like matchTimeSkyPreset', () => {
    expect(matchTimeSkyPresetHour('high-seas', Number.NaN, Number.NaN)).toBe(skyTimePresetHour('high-seas', 'dawn'));
    expect(arenaConfiguredSkyPreset('high-seas').weather).toBe('clear');
  });

  it('resolves the replicated match length, falling back to 300 s without a clock', () => {
    expect(cycleMatchFixedHour('high-seas', 150, 300_000)).toBe(skyTimePresetHour('high-seas', 'dusk'));
    expect(cycleMatchFixedHour('high-seas', 150, null)).toBe(cycleMatchFixedHour('high-seas', 150, 300_000));
    expect(cycleMatchFixedHour('high-seas', 150, 0)).toBe(cycleMatchFixedHour('high-seas', 150, null));
    expect(cycleMatchFixedHour('high-seas', 150, Number.NaN)).toBe(cycleMatchFixedHour('high-seas', 150, null));
  });
});

describe('the cycle branch is wired into the match clock in source', () => {
  const region = lightingRegion();

  it('feeds the elapsed clock and the replicated match length into the quarters walk', () => {
    expect(region).toMatch(/cycleMatchFixedHour\(selectedArena\.id,\s*lightingConditionsElapsedSeconds,\s*currentMatchRules\(\)\.durationMs\)/);
  });

  it('keeps ?todhour=, ?sky= and hosted-lobby precedence ahead of the walk', () => {
    const todhour = region.indexOf('fixedHour: lightingCaptureFixedHour');
    const sky = region.indexOf('fixedHour: skyTimePresetHour(selectedArena.id, lightingQuerySkyPreset)');
    const walk = region.indexOf('cycleMatchFixedHour(selectedArena.id,');
    expect(todhour).toBeGreaterThan(-1);
    expect(sky).toBeGreaterThan(todhour);
    expect(walk).toBeGreaterThan(sky);
    expect(region.slice(sky, walk)).toMatch(/privateLobbySnapshot/);
    expect(region.slice(sky, walk)).toMatch(/isSkyTimePresetId\(lightingQuerySkyPreset\)/);
    expect(region.slice(sky, walk)).toMatch(/!== 'cycle'/);
  });
});

describe('the arena configured default applies for every registry arena', () => {
  it('derives a valid time x clear preset from the roster, never a hand list', () => {
    expect(ARENA_IDS.length).toBeGreaterThan(0);
    for (const arenaId of ARENA_IDS) {
      const configured = arenaConfiguredSkyPreset(arenaId);
      expect(isSkyTimePresetId(configured.time)).toBe(true);
      expect(isWeatherPresetId(configured.weather)).toBe(true);
      expect(configured.weather).toBe('clear');
      const hour = skyTimePresetHour(arenaId, configured.time);
      expect(Number.isFinite(hour)).toBe(true);
      const daylight = ARENA_DAYLIGHT_PROFILES[arenaId];
      if (arenaId === 'nuketown2') continue;
      if (daylight.pinned) {
        expect(hour).toBe(daylight.authoredHour);
      } else {
        expect(hour).toBeGreaterThanOrEqual(daylight.hourRange[0]);
        expect(hour).toBeLessThanOrEqual(daylight.hourRange[1]);
      }
    }
  });
});

describe('the arena-default branch keeps the ?sky= override winning in source', () => {
  const region = lightingRegion();

  it('applies the configured preset after the ?sky= spread', () => {
    const sky = region.indexOf('fixedHour: skyTimePresetHour(selectedArena.id, lightingQuerySkyPreset)');
    const def = region.indexOf('arenaConfiguredSkyPreset(selectedArena.id).time');
    expect(sky).toBeGreaterThan(-1);
    expect(def).toBeGreaterThan(sky);
  });

  it('lets ?todhour= win, ignores hosted lobbies, and yields to cycle', () => {
    const def = region.indexOf('arenaConfiguredSkyPreset(selectedArena.id).time');
    const guard = region.slice(region.lastIndexOf('...(', def), def);
    expect(guard).toMatch(/lightingCaptureFixedHour !== null/);
    expect(guard).toMatch(/privateLobbySnapshot/);
    expect(guard).toMatch(/isSkyTimePresetId\(lightingQuerySkyPreset\)/);
    expect(guard).toMatch(/=== 'cycle'/);
  });
});
