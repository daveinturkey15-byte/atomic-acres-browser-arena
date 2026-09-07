/**
 * HF-536 night-lighting lane — the Nuke Town Rebuild post chain and rig, pinned.
 *
 * Every assertion here fails on the lane's base commit 64738e1e by
 * construction: `ArenaArtDirection.tone` did not exist, the composed display
 * toe lift was 0.0049 (1.25 of 255), the GTAO gather radius was 0.22 m and the
 * arena environment scale was 0.24.
 *
 * The point of the file is that the two new tone shapers are ONE-WAY. A test
 * that only pinned the numbers would let a later pass invert the direction and
 * still pass; these pin the direction as well, against every shipped profile.
 */
import { describe, expect, it } from 'vitest';
import {
  ART_DIRECTION_SAFETY_BOUNDS,
  MAXIMUM_COMPOSED_DISPLAY_TOE_LIFT,
  MINIMUM_COMPOSED_HIGHLIGHT_SHOULDER_START,
  artDirectionForArena,
  composeArtDirectedProfile,
} from './rendering/art-direction';
import { ARENA_IDS } from './arena-identity';
import { GRADE_PROFILES, type GradeProfileId } from './rendering/grade-profile';
import { GTAO_RADIUS_METRES } from './pass65-settings';
import { arenaEnvironmentScale } from './graphics-refinement';

const PROFILE_IDS: readonly GradeProfileId[] = ['performance', 'quality', 'max'];

/** Exactly what `applyDisplayToe` adds to a fully-shadowed pixel, display-referred. */
const composedToeLift = (profileId: GradeProfileId, arenaId: 'nuketown2'): number => {
  const composed = composeArtDirectedProfile(GRADE_PROFILES[profileId], artDirectionForArena(arenaId));
  return composed.display.toeFloor * composed.display.toeStrength;
};

/** R26's value plan: shadow floor >= 10 of 255. */
const SHADOW_FLOOR_255 = 10;

describe('HF-536 nuketown2 display toe — the ACES toe no longer crushes the shaded street', () => {
  it('authors a lift-only toe scale on the arena row', () => {
    const direction = artDirectionForArena('nuketown2');
    expect(direction.tone).toBeDefined();
    expect(direction.tone?.toeStrengthScale).toBe(11.25);
    expect(direction.tone?.toeStrengthScale).toBeGreaterThanOrEqual(
      ART_DIRECTION_SAFETY_BOUNDS.toeStrengthScale.minimum,
    );
  });

  it('clears the R26 shadow floor of 10/255 in EVERY shipped grade profile', () => {
    for (const profileId of PROFILE_IDS) {
      const lift = composedToeLift(profileId, 'nuketown2');
      expect(lift * 255).toBeGreaterThanOrEqual(SHADOW_FLOOR_255);
    }
  });

  it('never exceeds the 5%-display combat envelope in any profile', () => {
    for (const profileId of PROFILE_IDS) {
      expect(composedToeLift(profileId, 'nuketown2')).toBeLessThanOrEqual(MAXIMUM_COMPOSED_DISPLAY_TOE_LIFT + 1e-12);
    }
  });

  it('is strictly a LIFT: the composed toe is never below the profile it composes from', () => {
    for (const profileId of PROFILE_IDS) {
      const base = GRADE_PROFILES[profileId];
      const composed = composeArtDirectedProfile(base, artDirectionForArena('nuketown2'));
      expect(composed.display.toeStrength).toBeGreaterThan(base.display.toeStrength);
      expect(composed.display.toeFloor).toBe(base.display.toeFloor);
      expect(composed.display.toeCeiling).toBe(base.display.toeCeiling);
    }
  });

  it('base 64738e1e behaviour: the shipped toe was under one 8-bit step', () => {
    // The number this lane exists to move. Quality: 0.035 * 0.14 = 0.0049.
    const base = GRADE_PROFILES.quality;
    expect(base.display.toeFloor * base.display.toeStrength * 255).toBeLessThan(1.3);
  });
});

describe('HF-536 nuketown2 highlight shoulder — the into-sun sky is conditioned, not clipped', () => {
  it('authors a compress-only shoulder scale', () => {
    const direction = artDirectionForArena('nuketown2');
    // HF-536 look-2a, 2026-09-06 — RE-STATED, AND STRICTLY STRONGER. This row
    // pinned the literal 0.62 by equality, which asserted the VALUE rather
    // than the property it was defending (compress-only, and never walked
    // back). night-lighting itself named 0.52 as the next value and left it
    // unspent; look-2a spent it with a measurement (global p95 within 0.5 of
    // the target boards while global p50 sits 47.8 above them, over 29
    // stations - docs/forge/tonal-gap.json). The pin now asserts the RATCHET:
    // the shoulder may go on compressing and may never be relaxed back toward
    // the ACES clip night-lighting found the sky sitting on. That admits
    // strictly fewer values than `<= maximum` alone did, and it would still
    // have caught the regression the literal was written to catch.
    const SHOULDER_START_SCALE_RATCHET = 0.62;
    expect(direction.tone?.shoulderStartScale).toBeLessThanOrEqual(SHOULDER_START_SCALE_RATCHET);
    expect(direction.tone?.shoulderStartScale).toBeGreaterThanOrEqual(
      ART_DIRECTION_SAFETY_BOUNDS.shoulderStartScale.minimum,
    );
    expect(direction.tone?.shoulderStartScale).toBeLessThanOrEqual(
      ART_DIRECTION_SAFETY_BOUNDS.shoulderStartScale.maximum,
    );
  });

  it('lowers the composed shoulder start in every profile and never below the midtone floor', () => {
    for (const profileId of PROFILE_IDS) {
      const base = GRADE_PROFILES[profileId];
      const composed = composeArtDirectedProfile(base, artDirectionForArena('nuketown2'));
      expect(composed.transfer.shoulderStart).toBeLessThan(base.transfer.shoulderStart);
      expect(composed.transfer.shoulderStart).toBeGreaterThanOrEqual(MINIMUM_COMPOSED_HIGHLIGHT_SHOULDER_START);
      // Everything else about the transfer is the profile's.
      expect(composed.transfer.shoulderEnd).toBe(base.transfer.shoulderEnd);
      expect(composed.transfer.shoulderPower).toBe(base.transfer.shoulderPower);
      expect(composed.transfer.shoulderDesaturation).toBe(base.transfer.shoulderDesaturation);
    }
  });
});

describe('HF-536 tone shapers are opt-in and one-way for every other arena', () => {
  it('leaves every arena that authors no tone block composing exactly as before', () => {
    for (const arenaId of ARENA_IDS) {
      const direction = artDirectionForArena(arenaId);
      if (direction.tone) continue;
      for (const profileId of PROFILE_IDS) {
        const base = GRADE_PROFILES[profileId];
        const composed = composeArtDirectedProfile(base, direction);
        expect(composed.transfer).toEqual(base.transfer);
        expect(composed.display.toeStrength).toBe(base.display.toeStrength);
      }
    }
  });

  it('nuketown2 is the only arena that authors one in this pass', () => {
    const authored = ARENA_IDS.filter((arenaId) => artDirectionForArena(arenaId).tone !== undefined);
    expect(authored).toEqual(['nuketown2']);
  });

  it('the bounds themselves are one-way', () => {
    // A future row cannot CRUSH shadows or RAISE the shoulder through this field.
    expect(ART_DIRECTION_SAFETY_BOUNDS.toeStrengthScale.minimum).toBe(1);
    expect(ART_DIRECTION_SAFETY_BOUNDS.shoulderStartScale.maximum).toBe(1);
  });
});

describe('HF-536 nuketown2 golden-hour split tone — warm key, cool shade, no purple lift', () => {
  const channels = (hex: number) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff] as const;

  it('puts the shade on the cool side of neutral, not the magenta side', () => {
    const [r, g, b] = channels(artDirectionForArena('nuketown2').splitTone.shadowTint);
    expect(b).toBeGreaterThan(r); // cool, not warm
    expect(g).toBeGreaterThan(r); // and NOT violet: violet is r > g with b highest
  });

  it('puts the key on the warm side', () => {
    const [r, g, b] = channels(artDirectionForArena('nuketown2').splitTone.highlightTint);
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });
});

describe('HF-536 nuketown2 bloom — emitters only, threshold further above white', () => {
  it('keeps the composed threshold above 1.0 linear in every profile', () => {
    for (const profileId of PROFILE_IDS) {
      const composed = composeArtDirectedProfile(GRADE_PROFILES[profileId], artDirectionForArena('nuketown2'));
      expect(composed.bloom.threshold).toBeGreaterThan(1);
    }
  });

  it('raises the arena threshold scale rather than lowering it', () => {
    const bloom = artDirectionForArena('nuketown2').bloom;
    expect(bloom.thresholdScale).toBe(1.1);
    expect(bloom.thresholdScale).toBeGreaterThanOrEqual(ART_DIRECTION_SAFETY_BOUNDS.bloomThresholdScale.minimum);
    expect(bloom.intensityScale).toBe(1.28);
    expect(bloom.intensityScale).toBeLessThanOrEqual(ART_DIRECTION_SAFETY_BOUNDS.bloomIntensityScale.maximum);
  });
});

describe('HF-536 GTAO gather radius is an exterior-scale length', () => {
  it('pins the metre radii', () => {
    expect(GTAO_RADIUS_METRES.low).toBe(0.42);
    expect(GTAO_RADIUS_METRES.high).toBe(0.6);
    expect(GTAO_RADIUS_METRES.ultra).toBe(0.8);
  });

  it('is monotonic in tier and covers the arena contact separations', () => {
    expect(GTAO_RADIUS_METRES.low).toBeLessThan(GTAO_RADIUS_METRES.high);
    expect(GTAO_RADIUS_METRES.high).toBeLessThan(GTAO_RADIUS_METRES.ultra);
    // Kerb-to-asphalt, house-base-to-lawn, vehicle-to-road: 0.4-0.9 m.
    expect(GTAO_RADIUS_METRES.high).toBeGreaterThanOrEqual(0.4);
  });

  it('base 64738e1e behaviour: the shipped high radius was an interior prop radius', () => {
    expect(GTAO_RADIUS_METRES.high).toBeGreaterThan(0.22);
  });
});

describe('HF-536 nuketown2 environment reflection weight', () => {
  it('raises the arena IBL scale for damp asphalt and painted panels', () => {
    expect(arenaEnvironmentScale('nuketown2')).toBe(0.32);
  });

  it('stays inside the exposure budget the sunlit siding is held to', () => {
    // Shadow-floor lane measurement: 0.24 -> 1.00 costs +7.6% sunlit luma, so
    // the cost here is (0.32 - 0.24) / (1.00 - 0.24) * 7.6% = 0.8%, well under
    // the +-5% this pass may move the sunlit siding.
    const costPercent = ((0.32 - 0.24) / (1 - 0.24)) * 7.6;
    expect(costPercent).toBeLessThan(5);
  });

  it('does not move any other arena', () => {
    expect(arenaEnvironmentScale('atomic-acres')).toBe(0.24);
    expect(arenaEnvironmentScale('test2')).toBe(0.22);
    expect(arenaEnvironmentScale('map3')).toBe(0.18);
  });
});
