import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import {
  ARENA_ART_DIRECTIONS,
  ART_DIRECTION_SAFETY_BOUNDS,
  DISPLAY_VIGNETTE_MAXIMUM,
  MAXIMUM_COMPOSED_MIDTONE_CONTRAST,
  MAXIMUM_COMPOSED_DISPLAY_TOE_LIFT,
  MINIMUM_COMPOSED_HIGHLIGHT_SHOULDER_START,
  MINIMUM_COMPOSED_BLOOM_THRESHOLD,
  SCENE_CONTRAST_BOUNDS,
  SCENE_SATURATION_BOUNDS,
  artDirectionForArena,
  assertArtDirectionSafety,
  composeArtDirectedProfile,
  composeArtDirectedSceneGrade,
  composeArtDirectedVignette,
  type ArenaArtDirection,
} from './art-direction';
import { GRADE_PROFILES, type GradeProfileId } from './grade-profile';
import {
  evaluateDisplayReferenceStages,
  evaluateLinearReferenceStages,
  type Rgb,
} from './filmic-grade-chain';

const PROFILE_IDS: readonly GradeProfileId[] = ['performance', 'quality', 'max'];

/** Probe colours spanning shadows, midtones, skin, foliage, sky and metal. */
const PROBE_COLOURS: readonly Rgb[] = [
  [0.05, 0.05, 0.05],
  [0.18, 0.18, 0.18],
  [0.5, 0.5, 0.5],
  [0.75, 0.62, 0.5],
  [0.12, 0.38, 0.1],
  [0.2, 0.45, 0.7],
  [0.55, 0.3, 0.12],
  [0.85, 0.85, 0.9],
];

/** Simple Reinhard stand-in for the tone map between the reference halves. */
function toneMap(rgb: Rgb): Rgb {
  return [rgb[0] / (1 + rgb[0]), rgb[1] / (1 + rgb[1]), rgb[2] / (1 + rgb[2])] as const;
}

function gradeThroughArena(colour: Rgb, arenaId: (typeof ARENA_IDS)[number]): Rgb {
  const profile = composeArtDirectedProfile(GRADE_PROFILES.quality, ARENA_ART_DIRECTIONS[arenaId]);
  return evaluateDisplayReferenceStages(toneMap(evaluateLinearReferenceStages(colour, profile)), profile);
}

describe('Lane L arena art direction catalog', () => {
  it('covers every canonical arena id with a matching, distinct identity', () => {
    expect(Object.keys(ARENA_ART_DIRECTIONS).sort()).toEqual([...ARENA_IDS].sort());
    for (const arenaId of ARENA_IDS) {
      expect(ARENA_ART_DIRECTIONS[arenaId].id).toBe(arenaId);
    }
    const briefs = new Set(ARENA_IDS.map((arenaId) => ARENA_ART_DIRECTIONS[arenaId].brief));
    expect(briefs.size).toBe(ARENA_IDS.length);
  });

  it('fails closed on an unknown arena id', () => {
    expect(() => artDirectionForArena('nuke-town')).toThrow(/Unknown arena art direction/);
    expect(artDirectionForArena('farcrysis')).toBe(ARENA_ART_DIRECTIONS['farcrysis']);
  });

  it('every authored identity passes the combat-safety bounds', () => {
    for (const arenaId of ARENA_IDS) {
      expect(() => assertArtDirectionSafety(ARENA_ART_DIRECTIONS[arenaId])).not.toThrow();
    }
  });

  it('rejects an identity that crushes a channel below the gain floor', () => {
    const rogue: ArenaArtDirection = {
      ...ARENA_ART_DIRECTIONS['gun-range'],
      cdl: { gain: [0.5, 1, 1], lift: [0, 0, 0], gamma: [1, 1, 1] },
    };
    expect(() => assertArtDirectionSafety(rogue)).toThrow(/cdl\.gain\[0\]/);
  });

  it('rejects an identity with a negative lift (black-point crush)', () => {
    const rogue: ArenaArtDirection = {
      ...ARENA_ART_DIRECTIONS['gun-range'],
      cdl: { gain: [1, 1, 1], lift: [-0.01, 0, 0], gamma: [1, 1, 1] },
    };
    expect(() => assertArtDirectionSafety(rogue)).toThrow(/cdl\.lift\[0\]/);
  });

  it('rejects a vignette base above the authored cap', () => {
    const rogue: ArenaArtDirection = {
      ...ARENA_ART_DIRECTIONS['rustworks-1v1'],
      vignette: { base: 0.4, settingScale: 1 },
    };
    expect(() => assertArtDirectionSafety(rogue)).toThrow(/vignette\.base/);
  });

  it('rejects a bloom threshold scale below 1 (no threshold may move DOWN)', () => {
    const rogue: ArenaArtDirection = {
      ...ARENA_ART_DIRECTIONS['skyline-terminal'],
      bloom: { intensityScale: 1, thresholdScale: 0.9 },
    };
    expect(() => assertArtDirectionSafety(rogue)).toThrow(/bloom\.thresholdScale/);
  });
});

describe('Lane L arena distinctiveness (the whole point of the pass)', () => {
  it('every pair of arenas grades the probe set visibly apart', () => {
    // Mechanical falsifier for "the whole game looks the same": for every pair
    // of arenas, the mean per-channel difference across the probe set must
    // exceed a floor a player would notice side by side.
    //
    // THIS FLOOR IS A RATCHET. It started at 1.5 steps, and at that bar the
    // catalog shipped two pairs a player could not tell apart —
    // skyline-terminal/high-seas at 1.71 and atomic-acres/rustworks-1v1 at
    // 2.06, i.e. two cool arenas and two warm ones collapsing into each other.
    // The catalog was re-authored along the axes that separate them (teal vs
    // indigo; cream vs sodium) until the WEAKEST pair measured 4.70, and the
    // floor moved to 4.5.
    //
    // Pass 79 raised it again. At 4.5 the three closest pairs were
    // atomic-acres/rustworks-1v1 4.72, rustworks-1v1/gun-range 4.92 and
    // atomic-acres/farcrysis 4.94 — still only a quarter of a step of headroom
    // on a bar the owner had already rejected twice. Four arenas were pushed
    // apart on their CDL GAIN ONLY (hue), leaving every contrast, lift, gamma
    // and saturation value the capture rounds settled on untouched, and
    // leaving gun-range — the neutral control — completely alone. The weakest
    // pair now measures 5.77. The floor sits just under that, so flattening
    // any pair back toward the shared look fails here instead of reaching the
    // owner. This bar was proved red against the pre-pass catalog before the
    // values moved.
    const MINIMUM_MEAN_DELTA = 5.5 / 255;
    for (let a = 0; a < ARENA_IDS.length; a += 1) {
      for (let b = a + 1; b < ARENA_IDS.length; b += 1) {
        let total = 0;
        for (const probe of PROBE_COLOURS) {
          const gradedA = gradeThroughArena(probe, ARENA_IDS[a]);
          const gradedB = gradeThroughArena(probe, ARENA_IDS[b]);
          total += Math.abs(gradedA[0] - gradedB[0])
            + Math.abs(gradedA[1] - gradedB[1])
            + Math.abs(gradedA[2] - gradedB[2]);
        }
        const mean = total / (PROBE_COLOURS.length * 3);
        expect(mean, `${ARENA_IDS[a]} vs ${ARENA_IDS[b]} graded too similar (${mean.toFixed(5)})`)
          .toBeGreaterThan(MINIMUM_MEAN_DELTA);
      }
    }
  });

  it('signature hue axes point where the briefs promise', () => {
    // Warm-vs-cool identity on a neutral midtone: red gain must beat blue on
    // the warm arenas and lose to blue on the cool ones.
    const neutral: Rgb = [0.4, 0.4, 0.4];
    const rust = gradeThroughArena(neutral, 'rustworks-1v1');
    const acres = gradeThroughArena(neutral, 'atomic-acres');
    const skyline = gradeThroughArena(neutral, 'skyline-terminal');
    const seas = gradeThroughArena(neutral, 'high-seas');
    expect(rust[0]).toBeGreaterThan(rust[2]);
    expect(acres[0]).toBeGreaterThan(acres[2]);
    expect(skyline[2]).toBeGreaterThan(skyline[0]);
    expect(seas[2]).toBeGreaterThan(seas[0]);
    // Gun range stays the neutral control: red/blue within one 8-bit step.
    const range = gradeThroughArena(neutral, 'gun-range');
    expect(Math.abs(range[0] - range[2])).toBeLessThan(1.5 / 255);
    // Farcrysis pushes green foliage harder than the neutral facility does.
    const foliage: Rgb = [0.12, 0.38, 0.1];
    const jungle = gradeThroughArena(foliage, 'farcrysis');
    const rangeFoliage = gradeThroughArena(foliage, 'gun-range');
    expect(jungle[1] - (jungle[0] + jungle[2]) / 2)
      .toBeGreaterThan(rangeFoliage[1] - (rangeFoliage[0] + rangeFoliage[2]) / 2);
  });
});

describe('Lane L profile composition', () => {
  it('composes CDL gain/lift/gamma multiplicatively and additively per channel', () => {
    const direction = ARENA_ART_DIRECTIONS['rustworks-1v1'];
    for (const profileId of PROFILE_IDS) {
      const base = GRADE_PROFILES[profileId];
      const composed = composeArtDirectedProfile(base, direction);
      for (let channel = 0; channel < 3; channel += 1) {
        expect(composed.cdl.slope[channel]).toBeCloseTo(base.cdl.slope[channel] * direction.cdl.gain[channel], 10);
        expect(composed.cdl.offset[channel]).toBeCloseTo(base.cdl.offset[channel] + direction.cdl.lift[channel], 10);
        expect(composed.cdl.power[channel]).toBeCloseTo(base.cdl.power[channel] * direction.cdl.gamma[channel], 10);
      }
    }
  });

  it('the same arena identity composes over every render profile (no gameplay-visible profile split)', () => {
    for (const arenaId of ARENA_IDS) {
      const direction = ARENA_ART_DIRECTIONS[arenaId];
      for (const profileId of PROFILE_IDS) {
        const composed = composeArtDirectedProfile(GRADE_PROFILES[profileId], direction);
        // The place identity (tints, balances) is identical across profiles.
        expect(composed.display.shadowTint).toBe(direction.splitTone.shadowTint);
        expect(composed.display.highlightTint).toBe(direction.splitTone.highlightTint);
        expect(composed.display.shadowBalance).toBe(direction.splitTone.shadowBalance);
        expect(composed.display.highlightBalance).toBe(direction.splitTone.highlightBalance);
      }
    }
  });

  it('never violates the chain combat-safety envelope after composition', () => {
    for (const arenaId of ARENA_IDS) {
      for (const profileId of PROFILE_IDS) {
        const composed = composeArtDirectedProfile(GRADE_PROFILES[profileId], ARENA_ART_DIRECTIONS[arenaId]);
        expect(composed.display.midtoneContrast).toBeLessThanOrEqual(MAXIMUM_COMPOSED_MIDTONE_CONTRAST);
        expect(composed.display.midtoneContrast).toBeGreaterThanOrEqual(0);
        expect(composed.bloom.threshold).toBeGreaterThan(1);
        expect(composed.bloom.threshold).toBeGreaterThanOrEqual(MINIMUM_COMPOSED_BLOOM_THRESHOLD);
        expect(composed.display.splitToneStrength).toBeLessThanOrEqual(1);
        expect(composed.channelCrosstalkStrength).toBeGreaterThanOrEqual(
          ART_DIRECTION_SAFETY_BOUNDS.composedCrosstalk.minimum,
        );
        expect(composed.channelCrosstalkStrength).toBeLessThanOrEqual(
          ART_DIRECTION_SAFETY_BOUNDS.composedCrosstalk.maximum,
        );
        // The display toe (shadow-lift combat floor) is never weakened.
        //
        // HF-536: this used to be strict equality on toeStrength, i.e. "the
        // arena may not touch the toe at all". That is stricter than the
        // property it was defending, and it was defending the wrong side: the
        // shipped composed lift was 0.035 x 0.14 = 0.0049 display (1.25 of
        // 255), which is not a shadow floor, and nuketown2's shaded street
        // measured p50 1.7 with it. `ArenaArtDirection.tone.toeStrengthScale`
        // is bounded >= 1 so it can only LIFT, and the composition clamps the
        // composed LIFT - the quantity `applyDisplayToe` actually adds - to
        // MAXIMUM_COMPOSED_DISPLAY_TOE_LIFT. Both halves are asserted here, so
        // this row still fails on any crush and now also fails on any lift
        // past the envelope, which the equality never checked.
        expect(composed.display.toeCeiling).toBe(GRADE_PROFILES[profileId].display.toeCeiling);
        expect(composed.display.toeFloor).toBe(GRADE_PROFILES[profileId].display.toeFloor);
        expect(composed.display.toeStrength).toBeGreaterThanOrEqual(
          GRADE_PROFILES[profileId].display.toeStrength,
        );
        expect(composed.display.toeFloor * composed.display.toeStrength).toBeLessThanOrEqual(
          MAXIMUM_COMPOSED_DISPLAY_TOE_LIFT + 1e-12,
        );
        // Grain stays profile-owned outright. The highlight transfer is
        // profile-owned in shape; an arena may only move where the shoulder
        // STARTS, downwards (more pre-conditioning before ACES, never less),
        // and never below the midtone floor.
        expect(composed.grain).toBe(GRADE_PROFILES[profileId].grain);
        expect(composed.transfer.shoulderEnd).toBe(GRADE_PROFILES[profileId].transfer.shoulderEnd);
        expect(composed.transfer.shoulderPower).toBe(GRADE_PROFILES[profileId].transfer.shoulderPower);
        expect(composed.transfer.shoulderDesaturation).toBe(
          GRADE_PROFILES[profileId].transfer.shoulderDesaturation,
        );
        expect(composed.transfer.shoulderStart).toBeLessThanOrEqual(
          GRADE_PROFILES[profileId].transfer.shoulderStart,
        );
        expect(composed.transfer.shoulderStart).toBeGreaterThanOrEqual(
          MINIMUM_COMPOSED_HIGHLIGHT_SHOULDER_START,
        );
      }
    }
  });
});

describe('Lane L scene grade and vignette composition', () => {
  const authored = Object.freeze({ saturation: 1.02, contrast: 1.025 });

  it('scales the authored linear grade inside the scene bounds', () => {
    for (const arenaId of ARENA_IDS) {
      const composed = composeArtDirectedSceneGrade(authored, ARENA_ART_DIRECTIONS[arenaId]);
      expect(composed.saturation).toBeGreaterThanOrEqual(SCENE_SATURATION_BOUNDS.minimum);
      expect(composed.saturation).toBeLessThanOrEqual(SCENE_SATURATION_BOUNDS.maximum);
      expect(composed.contrast).toBeGreaterThanOrEqual(SCENE_CONTRAST_BOUNDS.minimum);
      expect(composed.contrast).toBeLessThanOrEqual(SCENE_CONTRAST_BOUNDS.maximum);
    }
    const jungle = composeArtDirectedSceneGrade(authored, ARENA_ART_DIRECTIONS['farcrysis']);
    expect(jungle.saturation).toBeCloseTo(1.02 * ARENA_ART_DIRECTIONS['farcrysis'].saturationScale, 10);
  });

  it('composes the player vignette setting with the arena character, capped', () => {
    const rust = ARENA_ART_DIRECTIONS['rustworks-1v1'];
    expect(composeArtDirectedVignette(0, rust)).toBeCloseTo(rust.vignette.base, 10);
    expect(composeArtDirectedVignette(0.2, rust)).toBeCloseTo(rust.vignette.base + 0.2 * rust.vignette.settingScale, 10);
    expect(composeArtDirectedVignette(9, rust)).toBe(DISPLAY_VIGNETTE_MAXIMUM);
    expect(composeArtDirectedVignette(0.3, null)).toBe(0.3);
    expect(composeArtDirectedVignette(Number.NaN, null)).toBe(0);
    expect(composeArtDirectedVignette(9, null)).toBe(DISPLAY_VIGNETTE_MAXIMUM);
  });
});
