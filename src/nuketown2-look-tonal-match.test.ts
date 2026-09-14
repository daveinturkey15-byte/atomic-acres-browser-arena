/**
 * HF-536 look-2a — TONAL MATCH TO THE BOARDS, pinned.
 *
 * Every number asserted here was DERIVED from a measurement, not felt. The
 * measurement is `scripts/forge/measure-tonal-gap.mjs` run over the 29-station
 * interim-2 capture (sha 805c102f, tod=authored, 6000 ms review hold) against
 * the per-station target boards at the same camera; its output is
 * `docs/forge/tonal-gap.json`. The three findings this file exists to keep
 * from regressing:
 *
 *  1. SKY. 19 sky boxes: ours p50 200-218 at HSV saturation 5-16%, the boards
 *     p50 158-200 at 18-31% saturated blue. Only 6 of 19 were inside 20% of
 *     the board's saturation. Causes were authored, both in sky-backdrop.ts:
 *     the warm horizon ramp started at 0.462 (inside the band a level camera
 *     sees) and a 32-deck near-white cloud field at alpha 0.50 covered the
 *     whole visible band.
 *  2. WARMTH. The sunlit set (each non-sky box's pixels at or above its own
 *     p75) is a mean 13.8 cooler in R-B than the board's, 20-60 cooler on
 *     street-centre, perimeter-wall-end and south-upper-window.
 *  3. DISTRIBUTION. Global p95 matches the boards to within 0.5 of 255 while
 *     global p50 is 47.8 ABOVE them: correct highlights, no midtone body.
 *
 * Each assertion below states the direction the fix must keep, so a later
 * "tidy" that reverts a value fails loudly instead of quietly repainting the
 * arena pale again.
 */

import { describe, expect, it } from 'vitest';

import { artDirectionForArena, ART_DIRECTION_SAFETY_BOUNDS, MINIMUM_COMPOSED_HIGHLIGHT_SHOULDER_START } from './rendering/art-direction';
import { SKY_BACKDROP_GRADIENTS, SKY_BACKDROP_CLOUDS } from './rendering/sky-backdrop';

/** The values as night-lighting shipped them at d2d15da6 — the "before" side. */
const BEFORE = Object.freeze({
  gain: [1.18, 1.16, 1.12] as const,
  splitToneStrengthScale: 1.0,
  highlightTint: 0xffd9a8,
  shoulderStartScale: 0.62,
  cloudAlpha: 0.5,
  cloudRgb: [255, 238, 214] as const,
  zenith: '#1d4a8c',
  upperMid: '#3f6a9e',
  warmRampStart: '#b08a80',
});

const hex = (value: string): readonly [number, number, number] => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

const luma = ([r, g, b]: readonly [number, number, number]): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hsvSaturation = ([r, g, b]: readonly [number, number, number]): number => {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
};

const stopAt = (offset: number): readonly [number, number, number] => {
  const found = SKY_BACKDROP_GRADIENTS['nuketown2-golden-hour'].find((entry) => entry[0] === offset);
  if (!found) throw new Error(`nuketown2-golden-hour has no stop at ${offset}`);
  return hex(found[1] as string);
};

describe('HF-536 look-2a — sky preset carries the blue the boards measure', () => {
  it('deepens and saturates every stop from the zenith to 0.40', () => {
    for (const [offset, before] of [[0, BEFORE.zenith], [0.3, BEFORE.upperMid]] as const) {
      const after = stopAt(offset);
      const wasThere = hex(before);
      expect(luma(after), `stop ${offset} must be deeper than ${before}`).toBeLessThan(luma(wasThere));
      expect(hsvSaturation(after), `stop ${offset} must be more saturated than ${before}`)
        .toBeGreaterThan(hsvSaturation(wasThere));
    }
    // The measured target: the boards' sky boxes sit at 18-31% saturation
    // AFTER the additive haze, so the authored blue has to start well above it.
    expect(hsvSaturation(stopAt(0))).toBeGreaterThan(0.8);
    expect(hsvSaturation(stopAt(0.4))).toBeGreaterThan(0.5);
  });

  it('holds the warm horizon flare to 0.482 and below, not 0.462', () => {
    const transition = stopAt(0.462);
    // Neutral, not rust: R-B under 10 where it used to be 48.
    expect(transition[0] - transition[2]).toBeLessThan(10);
    expect(hex(BEFORE.warmRampStart)[0] - hex(BEFORE.warmRampStart)[2]).toBeGreaterThan(40);
    // The horizon itself stays warm — this pass must not cool the golden hour.
    const flare = stopAt(0.482);
    const horizon = stopAt(0.4985);
    expect(flare[0] - flare[2]).toBeGreaterThan(100);
    expect(horizon[0] - horizon[2]).toBeGreaterThan(100);
    expect(luma(horizon)).toBeGreaterThan(luma(stopAt(0.4)));
  });

  it('leaves the below-horizon valley and the deck geometry alone', () => {
    // The valley stops belong to the terrain read, not to this pass.
    expect(SKY_BACKDROP_GRADIENTS['nuketown2-golden-hour'].find((entry) => entry[0] === 0.506)?.[1]).toBe('#eab89e');
    expect(SKY_BACKDROP_GRADIENTS['nuketown2-golden-hour'].find((entry) => entry[0] === 1)?.[1]).toBe('#8a7657');
    const clouds = SKY_BACKDROP_CLOUDS['nuketown2-golden-hour'];
    expect(clouds).not.toBeNull();
    expect(clouds?.count).toBe(32);
    expect(clouds?.bandTop).toBe(0.2);
    expect(clouds?.bandBottom).toBe(0.505);
    expect(clouds?.scale).toBe(0.5);
  });

  it('thins the cloud deck that was averaging the sky to white', () => {
    const clouds = SKY_BACKDROP_CLOUDS['nuketown2-golden-hour'];
    expect(clouds?.alpha).toBeLessThan(BEFORE.cloudAlpha);
    // Not removed — a cloudless golden hour reads as a screensaver, and the
    // deck is what gives the sky structure at all.
    expect(clouds?.alpha).toBeGreaterThan(0.25);
    expect(luma(clouds!.rgb as unknown as readonly [number, number, number]))
      .toBeLessThan(luma(BEFORE.cloudRgb));
  });
});

describe('HF-536 look-2a — the key is warm, and bought where it costs nothing', () => {
  const direction = artDirectionForArena('nuketown2');

  it('widens the gain R/B ratio without raising the frame', () => {
    const [r, g, b] = direction.cdl.gain;
    const [wasR, , wasB] = BEFORE.gain;
    expect(r / b).toBeGreaterThan(wasR / wasB);
    expect(r / b).toBeGreaterThan(1.08);
    // Warmer at the SAME OR LOWER luma: the frame is already 47.8 of 255 too
    // bright at the median, so warmth may not be bought with brightness.
    const lumaOf = (triple: readonly [number, number, number]) => 0.2126 * triple[0] + 0.7152 * triple[1] + 0.0722 * triple[2];
    expect(lumaOf([r, g, b])).toBeLessThan(lumaOf(BEFORE.gain));
    expect(r).toBeLessThanOrEqual(ART_DIRECTION_SAFETY_BOUNDS.gain.maximum);
    expect(b).toBeGreaterThanOrEqual(ART_DIRECTION_SAFETY_BOUNDS.gain.minimum);
  });

  it('leaves lift and gamma exactly where the shadow floor and the search put them', () => {
    // The worst ground-box p10 over 29 stations is 11 of 255 against an R26
    // floor of 10. Lift is what holds it; this pass may not spend it.
    expect(direction.cdl.lift).toEqual([0.006, 0.006, 0.006]);
    expect(direction.cdl.gamma).toEqual([0.92, 0.98, 1.04]);
  });

  it('spends the warm/cool separation on split tone, the luminance-preserving axis', () => {
    expect(direction.splitTone.strengthScale).toBeGreaterThan(BEFORE.splitToneStrengthScale);
    expect(direction.splitTone.strengthScale)
      .toBeLessThanOrEqual(ART_DIRECTION_SAFETY_BOUNDS.splitToneStrengthScale.maximum);
    // Shade stays cool slate-blue; highlight deepens toward amber.
    expect(direction.splitTone.shadowTint).toBe(0x2b4258);
    const rMinusB = (tint: number) => ((tint >> 16) & 0xff) - (tint & 0xff);
    expect(rMinusB(direction.splitTone.highlightTint)).toBeGreaterThan(rMinusB(BEFORE.highlightTint));
    expect(rMinusB(direction.splitTone.highlightTint)).toBeGreaterThanOrEqual(100);
  });

  it('does NOT raise scene saturation — the measured excess is global, not a deficit', () => {
    // Global HSV saturation measured 11.5% ABOVE the boards' across 29
    // stations (over-saturated vegetation and ground, under-saturated sky), so
    // a blanket saturation push would make the plastic read worse. The sky is
    // corrected in sky-backdrop.ts instead, and the vegetation belongs to the
    // materials lane.
    expect(direction.saturationScale).toBeLessThanOrEqual(1.06);
  });
});

describe('HF-536 look-2a — the shoulder, not the exposure, carries the midtone', () => {
  const direction = artDirectionForArena('nuketown2');

  it('starts the highlight shoulder earlier than night-lighting left it', () => {
    expect(direction.tone?.shoulderStartScale).toBeLessThan(BEFORE.shoulderStartScale);
    expect(direction.tone?.shoulderStartScale)
      .toBeGreaterThanOrEqual(ART_DIRECTION_SAFETY_BOUNDS.shoulderStartScale.minimum);
    // Composed against the quality profile's authored 0.90 shoulder start, it
    // must stay clear of the diffuse midtones where surface modelling lives.
    const composedQualityShoulder = 0.9 * (direction.tone?.shoulderStartScale ?? 1);
    expect(composedQualityShoulder).toBeGreaterThan(MINIMUM_COMPOSED_HIGHLIGHT_SHOULDER_START);
  });

  it('leaves the toe alone — nothing below the shoulder may move down', () => {
    expect(direction.tone?.toeStrengthScale).toBe(11.25);
  });
});
