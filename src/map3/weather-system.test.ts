/**
 * map3/weather-system.test.ts — M3.WEATHER.1a/2a/3a contract.
 *
 * Pins BEHAVIOUR, not values: ramp-not-cut transitions, asymmetric soak/dry,
 * severity ordering, deterministic pins, and allocation-free updates. A retune
 * of any constant keeps these green; a rewritten transition model fails them.
 */
import { describe, expect, it } from 'vitest';
import {
  MAP3_WEATHER_IDS,
  MAP3_WEATHER_TAU,
  createMap3WeatherRig,
  driveMap3Lightning,
  fillBayPrecipitation,
  fillSplashCentres,
  fillUniformPrecipitation,
  isMap3WeatherId,
  m3hash11,
  map3WeatherPreset,
  map3WeatherSeverity,
  Map3WeatherController,
  publishMap3WeatherShared,
  map3WeatherShared,
  resolveMap3WeatherPin,
  type Map3WeatherId,
} from './weather-system';

const step = (c: Map3WeatherController, seconds: number, dt = 1 / 60): void => {
  const n = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < n; i++) c.update(dt);
};

describe('map3 weather states', () => {
  it('exposes exactly the five contracted states', () => {
    expect([...MAP3_WEATHER_IDS].sort()).toEqual(
      ['clear', 'overcast', 'rain', 'snow', 'storm'].sort());
  });

  it('rejects unknown ids without throwing', () => {
    expect(isMap3WeatherId('hurricane')).toBe(false);
    expect(isMap3WeatherId('')).toBe(false);
    expect(isMap3WeatherId('Storm')).toBe(false);
  });

  it('orders severity storm > rain = snow > overcast > clear', () => {
    expect(map3WeatherSeverity('storm')).toBeGreaterThan(map3WeatherSeverity('rain'));
    expect(map3WeatherSeverity('rain')).toBe(map3WeatherSeverity('snow'));
    expect(map3WeatherSeverity('rain')).toBeGreaterThan(map3WeatherSeverity('overcast'));
    expect(map3WeatherSeverity('overcast')).toBeGreaterThan(map3WeatherSeverity('clear'));
  });

  it('storm is darkest, densest and wettest; clear is calmest', () => {
    const lum = (id: Map3WeatherId): number => {
      const c = map3WeatherPreset(id).skyTint;
      const col = { value: null as unknown };
      void col;
      // skyTint is a ColorRepresentation — resolve through THREE-free luminance
      // weights on the hex form used by every preset row.
      const hex = typeof c === 'number' ? c : 0xffffff;
      const r = (hex >> 16) & 255;
      const g = (hex >> 8) & 255;
      const b = hex & 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(lum('storm')).toBeLessThan(lum('rain'));
    expect(lum('rain')).toBeLessThan(lum('overcast'));
    expect(lum('overcast')).toBeLessThan(lum('clear'));
    expect(map3WeatherPreset('storm').fogDensityScale)
      .toBeGreaterThan(map3WeatherPreset('rain').fogDensityScale);
    expect(map3WeatherPreset('rain').fogDensityScale)
      .toBeGreaterThan(map3WeatherPreset('clear').fogDensityScale);
    expect(map3WeatherPreset('storm').precipitationRate).toBe(1);
    expect(map3WeatherPreset('clear').precipitationRate).toBe(0);
    expect(map3WeatherPreset('storm').windSpeedMps)
      .toBeGreaterThan(map3WeatherPreset('rain').windSpeedMps);
  });
});

describe('deterministic pin', () => {
  it('resolves ?map3weather= (preferred) and ?weather=, last wins', () => {
    expect(resolveMap3WeatherPin('?map3weather=storm')).toBe('storm');
    expect(resolveMap3WeatherPin('?weather=snow')).toBe('snow');
    expect(resolveMap3WeatherPin('?weather=rain&map3weather=storm')).toBe('storm');
    expect(resolveMap3WeatherPin('?map3weather=STORM')).toBe('storm');
  });

  it('returns null for missing or unknown values — never a silent default', () => {
    expect(resolveMap3WeatherPin('')).toBeNull();
    expect(resolveMap3WeatherPin('?map3weather=hurricane')).toBeNull();
    expect(resolveMap3WeatherPin('?other=storm')).toBeNull();
  });

  it('a pin beats setTarget until unpinned', () => {
    const c = new Map3WeatherController('clear', 'storm');
    expect(c.effectiveTarget).toBe('storm');
    c.setTarget('clear');
    expect(c.effectiveTarget).toBe('storm');
    c.pinTo(null);
    expect(c.effectiveTarget).toBe('clear');
  });
});

describe('ramp, never cut', () => {
  it('moves a fraction on the first frame and converges on a long update', () => {
    const c = new Map3WeatherController('clear');
    c.setTarget('storm');
    const before = c.displayed.precipitationRate;
    c.update(1 / 60);
    // Moved, but nowhere near the target: a cut would equal 1.0 here.
    expect(c.displayed.precipitationRate).toBeGreaterThan(before);
    expect(c.displayed.precipitationRate).toBeLessThan(0.5);
    step(c, 60);
    expect(c.displayed.precipitationRate).toBeCloseTo(1, 2);
    expect(c.displayed.stormAmount).toBeCloseTo(1, 2);
  });

  it('soaks faster than it dries', () => {
    expect(MAP3_WEATHER_TAU.wetUpSeconds).toBeLessThan(MAP3_WEATHER_TAU.wetDownSeconds);
    const up = new Map3WeatherController('clear');
    up.setTarget('storm');
    let upSteps = 0;
    while (up.displayed.wetness < 0.9 && upSteps < 20000) { up.update(1); upSteps++; }
    const down = new Map3WeatherController('storm');
    down.setTarget('clear');
    let downSteps = 0;
    while (down.displayed.wetness > 0.1 && downSteps < 40000) { down.update(1); downSteps++; }
    expect(upSteps).toBeLessThan(downSteps);
  });

  it('returns the same displayed object every update (no per-frame allocation)', () => {
    const c = new Map3WeatherController('clear');
    c.setTarget('rain');
    const a = c.update(1 / 60);
    const b = c.update(1 / 60);
    expect(a).toBe(b);
    expect(a).toBe(c.displayed);
  });

  it('ignores non-positive dt without moving', () => {
    const c = new Map3WeatherController('clear');
    c.setTarget('storm');
    c.update(0);
    expect(c.displayed.precipitationRate).toBe(0);
    c.update(-1);
    expect(c.displayed.precipitationRate).toBe(0);
  });
});

describe('shared uniforms', () => {
  it('publishes wind in m/s on XZ with y = 0, mutated in place', () => {
    const c = new Map3WeatherController('storm');
    step(c, 30);
    const before = map3WeatherShared.windVector;
    publishMap3WeatherShared(c.displayed, 30, c.effectiveTarget);
    expect(map3WeatherShared.windVector).toBe(before);
    expect(map3WeatherShared.windVector.y).toBe(0);
    // Storm gusts well above a breeze but stays physical, not cartoonish.
    expect(map3WeatherShared.windVector.length()).toBeGreaterThan(8);
    expect(map3WeatherShared.windVector.length()).toBeLessThan(30);
    // Wetness stays inside [0,1] through the whole publish.
    expect(map3WeatherShared.wetness.value).toBeGreaterThanOrEqual(0);
    expect(map3WeatherShared.wetness.value).toBeLessThanOrEqual(1);
    // Restore the singleton for other tests.
    const clear = new Map3WeatherController('clear');
    publishMap3WeatherShared(clear.displayed, 0, 'clear');
  });
});

describe('lightning driver', () => {
  it('rests at zero and flashes deterministically at the same elapsed time', () => {
    const light = { intensity: -1 };
    const flash = { value: -1 };
    driveMap3Lightning(3.0, light, flash, true);
    const first = { ...light, ...{ f: flash.value } };
    driveMap3Lightning(3.0, light, flash, true);
    expect(light.intensity).toBe(first.intensity);
    expect(flash.value).toBe(first.f);
    // Disabled weather forces dark, whatever the phase.
    driveMap3Lightning(3.0, light, flash, false);
    expect(light.intensity).toBe(0);
    expect(flash.value).toBe(0);
  });
});

describe('attribute fills', () => {
  it('hashes deterministically in [0,1)', () => {
    expect(m3hash11(0)).toBeGreaterThanOrEqual(0);
    expect(m3hash11(0)).toBeLessThan(1);
    expect(m3hash11(123.456)).toBe(m3hash11(123.456));
  });

  it('reproduces the corridor byte-for-byte: the move changed no numbers', () => {
    // Independent transcription of the loop corridor-weather.ts shipped
    // before M3.WEATHER.1a (hash renamed, maths untouched).
    const count = 2000;
    const BAY = 14;
    const expectedOrigin = new Float32Array(count * 3);
    const expectedSeeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const h0 = m3hash11(i * 1.37);
      const h1 = m3hash11(i * 3.71 + 11);
      const h2 = m3hash11(i * 7.13 + 29);
      expectedOrigin[i * 3] = (h0 - 0.5) * 17;
      expectedOrigin[i * 3 + 1] = h1 * 14;
      let zSample: number;
      if (h2 < 0.55) {
        zSample = -(BAY * 1.5 + (m3hash11(i * 9.17) - 0.5) * BAY * 1.6);
      } else if (h2 < 0.80) {
        zSample = -(BAY * 3.0 + (m3hash11(i * 9.17) - 0.5) * BAY * 1.0);
      } else {
        zSample = -(BAY * 1.0 + (m3hash11(i * 9.17) - 0.5) * BAY * 1.0);
      }
      expectedOrigin[i * 3 + 2] = zSample;
      expectedSeeds[i] = h0 * 97 + h1 * 31;
    }
    const origin = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    fillBayPrecipitation(origin, seeds, count, 17, BAY);
    expect(origin).toEqual(expectedOrigin);
    expect(seeds).toEqual(expectedSeeds);
  });
  it('scatters the map-wide fill uniformly inside the rectangle', () => {
    const count = 1000;
    const origin = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    fillUniformPrecipitation(origin, seeds, count, 0, 0, 200, 200);
    for (let i = 0; i < count; i++) {
      expect(Math.abs(origin[i * 3])).toBeLessThanOrEqual(100);
      expect(Math.abs(origin[i * 3 + 2])).toBeLessThanOrEqual(100);
    }
  });

  it('lays splash rings flat just above the ground', () => {
    const count = 100;
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    fillSplashCentres(pos, seeds, count, 0, -20, 20, 20);
    for (let i = 0; i < count; i++) expect(pos[i * 3 + 1]).toBeCloseTo(0.05, 5);
  });
});

describe('map-wide rig', () => {
  it('adds exactly 2 draw calls at full tier, 0 at low tier', () => {
    const full = createMap3WeatherRig({ tier: 'full', precipitationCount: 64, splashCount: 8 });
    expect(full.stats.draws).toBe(2);
    expect(full.group.children.length).toBeGreaterThanOrEqual(2);
    full.dispose();
    const low = createMap3WeatherRig({ tier: 'low' });
    expect(low.stats.draws).toBe(0);
    expect(low.group.children.length).toBe(1); // lightning light only
    low.dispose();
  });
});
