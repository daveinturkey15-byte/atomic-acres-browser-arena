import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_LIGHTING_TIME_CHOICE } from './lighting-conditions';
import {
  NON_DETERMINISTIC_LIGHTING_CHOICES,
  REVIEW_CAPTURE_LIGHTING_CHOICE,
  assertDeterministicReviewLighting,
  isDeterministicLightingChoice,
  reviewCaptureLightingOverride,
} from './deterministic-review-lighting';

describe('deterministic-review-lighting', () => {
  it('names the seed-dependent choices, and the shipped default is one of them', () => {
    // If this ever stops being true the whole defect is gone and the pin below
    // is dead weight - so it is asserted rather than assumed.
    expect(NON_DETERMINISTIC_LIGHTING_CHOICES).toContain(DEFAULT_LIGHTING_TIME_CHOICE);
    expect(isDeterministicLightingChoice('random')).toBe(false);
    expect(isDeterministicLightingChoice('cycle')).toBe(false);
    expect(isDeterministicLightingChoice('authored')).toBe(true);
    expect(isDeterministicLightingChoice('early')).toBe(true);
  });

  it('pins an unpinned review capture to the arena authored sky', () => {
    expect(reviewCaptureLightingOverride({ requestedOverride: null, fixedHour: null, hosted: false }))
      .toBe(REVIEW_CAPTURE_LIGHTING_CHOICE);
    // The live default is what a capture session actually carries.
    expect(reviewCaptureLightingOverride({ requestedOverride: 'random', fixedHour: null, hosted: false }))
      .toBe(REVIEW_CAPTURE_LIGHTING_CHOICE);
    expect(reviewCaptureLightingOverride({ requestedOverride: 'cycle', fixedHour: null, hosted: false }))
      .toBe(REVIEW_CAPTURE_LIGHTING_CHOICE);
  });

  it('keeps an operator pin, so each authored sky stays reviewable', () => {
    expect(reviewCaptureLightingOverride({ requestedOverride: 'early', fixedHour: null, hosted: false })).toBeNull();
    expect(reviewCaptureLightingOverride({ requestedOverride: 'midday', fixedHour: null, hosted: false })).toBeNull();
    expect(reviewCaptureLightingOverride({ requestedOverride: null, fixedHour: 14, hosted: false })).toBeNull();
    // A non-finite ?todhour= is not a pin.
    expect(reviewCaptureLightingOverride({ requestedOverride: null, fixedHour: Number.NaN, hosted: false }))
      .toBe(REVIEW_CAPTURE_LIGHTING_CHOICE);
  });

  it('never takes a hosted peer off the replicated sky', () => {
    expect(reviewCaptureLightingOverride({ requestedOverride: null, fixedHour: null, hosted: true })).toBeNull();
    expect(() => assertDeterministicReviewLighting({
      cameraId: 'nuketown2-coach-elevation', choice: 'random', fixedHour: null, hosted: true,
    })).not.toThrow();
  });

  it('fails closed on a solo review station committed under a seeded sky', () => {
    expect(() => assertDeterministicReviewLighting({
      cameraId: 'nuketown2-coach-elevation', choice: 'random', fixedHour: null, hosted: false,
    })).toThrow(/resolves from the match seed/);
    expect(() => assertDeterministicReviewLighting({
      cameraId: 'nuketown2-coach-elevation', choice: 'authored', fixedHour: null, hosted: false,
    })).not.toThrow();
    expect(() => assertDeterministicReviewLighting({
      cameraId: 'nuketown2-coach-elevation', choice: 'random', fixedHour: 17.6, hosted: false,
    })).not.toThrow();
  });
});

/**
 * THE FALSIFIER. This is the assertion that fails at 3d4d72de by construction:
 * at that commit `setArenaReviewCamera` pins camera, exposure, TSL time and TSL
 * seed and says nothing about the sun, so a review capture resolves through
 * `DEFAULT_LIGHTING_TIME_CHOICE = 'random'` and two captures of the SAME bundle
 * disagree by 22 percentage points of exact-black area. A source-region check
 * is the right shape here for the same reason
 * `lighting-conditions-light-set.test.ts` uses one: the property being pinned
 * is "this call site performs the ordering", and the call site is a
 * WebGPU-only debug hook that no unit environment can execute.
 */
describe('setArenaReviewCamera pins the sky', () => {
  const source = readFileSync('src/legacy-main.ts', 'utf8');
  const region = (() => {
    const start = source.indexOf('  setArenaReviewCamera: (cameraId) => {');
    expect(start).toBeGreaterThan(0);
    const end = source.indexOf('\n  setChopperExteriorReviewHold:', start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  })();

  it('installs the review-capture lighting override before committing the station', () => {
    expect(region).toContain('reviewCaptureLightingOverride({');
    expect(region).toContain('lightingTimeChoiceOverride = reviewLightingOverride');
    expect(region).toContain('applyLightingConditionUniforms(true)');
  });

  it('fails closed on a station that still resolved a seeded sky', () => {
    expect(region).toContain('assertDeterministicReviewLighting({');
  });

  it('reports the committed sky in the deterministic-review receipt', () => {
    // The number a capture manifest and the viewpoint gate need in order to
    // refuse to compare two sessions taken under different skies.
    expect(source).toContain('lightingChoice: activeLightingTimeChoice(),');
    expect(source).toContain('lightingFixedHour: lightingCaptureFixedHour,');
  });
});
