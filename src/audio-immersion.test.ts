import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from './arena-identity';
import {
  ACOUSTIC_PROFILES,
  ACOUSTIC_SPACES,
  ARENA_ACOUSTIC_SPACES,
  DEFAULT_ACOUSTIC_SPACE,
  OCCLUSION_FULL_CUTOFF_HZ,
  OCCLUSION_FULL_DIRECT_GAIN,
  REPORT_CRACK_RANGE_METRES,
  acousticProfile,
  arenaAcousticSpace,
  distanceLowpassHz,
  occlusionResponse,
  weaponReportLayering,
  type AcousticSpace,
} from './audio-immersion';

const SAMPLE_DISTANCES = [0, 1, 2, 5, 9, 14, 20, 28, 35, 42, 55, 70, 90, 140];

describe('immersive audio acoustics (HF-366)', () => {
  describe('registry', () => {
    it('is frozen, unique and complete for every space', () => {
      expect(Object.isFrozen(ACOUSTIC_SPACES)).toBe(true);
      expect(new Set(ACOUSTIC_SPACES).size).toBe(ACOUSTIC_SPACES.length);
      expect(new Set(Object.keys(ACOUSTIC_PROFILES))).toEqual(new Set(ACOUSTIC_SPACES));
      for (const space of ACOUSTIC_SPACES) {
        const profile = ACOUSTIC_PROFILES[space];
        expect(Object.isFrozen(profile)).toBe(true);
        expect(profile.space).toBe(space);
        expect(profile.farFieldCutoffHz).toBeLessThan(profile.nearFieldCutoffHz);
        expect(profile.absorptionPerMetre).toBeGreaterThan(0);
        expect(profile.tailGain).toBeGreaterThan(0);
        expect(profile.tailDurationSeconds).toBeGreaterThan(0);
        expect(profile.tailDelaySeconds).toBeGreaterThan(0);
      }
      expect(acousticProfile('does-not-exist' as AcousticSpace))
        .toBe(ACOUSTIC_PROFILES[DEFAULT_ACOUSTIC_SPACE]);
    });

    it('gives every shipped arena an acoustic space', () => {
      expect(new Set(Object.keys(ARENA_ACOUSTIC_SPACES))).toEqual(new Set(ARENA_IDS));
      for (const arenaId of ARENA_IDS) {
        expect(ACOUSTIC_SPACES).toContain(arenaAcousticSpace(arenaId));
      }
      expect(arenaAcousticSpace(null)).toBe(DEFAULT_ACOUSTIC_SPACE);
      expect(arenaAcousticSpace(undefined)).toBe(DEFAULT_ACOUSTIC_SPACE);
    });
  });

  describe('distance low-pass', () => {
    it('is strictly decreasing with distance until it reaches the floor', () => {
      for (const space of ACOUSTIC_SPACES) {
        const profile = ACOUSTIC_PROFILES[space];
        let previous = distanceLowpassHz(0, space);
        expect(previous).toBe(profile.nearFieldCutoffHz);
        for (const distance of SAMPLE_DISTANCES.slice(1)) {
          const cutoff = distanceLowpassHz(distance, space);
          // Strictly decreasing while above the floor, and pinned to it after.
          if (previous > profile.farFieldCutoffHz) expect(cutoff).toBeLessThan(previous);
          else expect(cutoff).toBe(profile.farFieldCutoffHz);
          expect(cutoff).toBeGreaterThanOrEqual(profile.farFieldCutoffHz);
          previous = cutoff;
        }
        // The floor holds however far away the source is.
        expect(distanceLowpassHz(10_000, space)).toBe(profile.farFieldCutoffHz);
      }
    });

    it('makes far gunfire audibly muffled and close gunfire sharp', () => {
      // The owner-facing claim: 60 m must be a thud, 5 m must be a crack.
      const near = distanceLowpassHz(5, 'open-field');
      const far = distanceLowpassHz(60, 'open-field');
      expect(near).toBeGreaterThan(5_000);
      expect(far).toBeLessThan(1_200);
      expect(near / far).toBeGreaterThan(4);
    });

    it('muffles fastest over open water and slowest in a hard room', () => {
      const at40 = (space: AcousticSpace): number => distanceLowpassHz(40, space);
      expect(at40('open-water')).toBeLessThan(at40('open-field'));
      expect(at40('open-field')).toBeLessThan(at40('urban-yard'));
      expect(at40('urban-yard')).toBeLessThan(at40('industrial-hall'));
      expect(at40('industrial-hall')).toBeLessThan(at40('interior-room'));
    });

    it('treats non-finite and negative distances as the near field', () => {
      for (const distance of [Number.NaN, Number.POSITIVE_INFINITY, -12]) {
        expect(distanceLowpassHz(distance, 'open-field'))
          .toBe(ACOUSTIC_PROFILES['open-field'].nearFieldCutoffHz);
      }
    });
  });

  describe('occlusion hook', () => {
    it('is an identity at zero and a bounded duck at one', () => {
      expect(occlusionResponse(0)).toEqual({
        directGainScale: 1,
        directCutoffCeilingHz: OCCLUSION_FULL_CUTOFF_HZ,
        tailGainScale: 1,
      });
      const blocked = occlusionResponse(1);
      expect(blocked.directGainScale).toBeCloseTo(OCCLUSION_FULL_DIRECT_GAIN, 9);
      // Buried, never silenced: a wall must not delete a nearby firefight.
      expect(blocked.directGainScale).toBeGreaterThan(0);
      // Reflected energy comes around the obstruction, so the tail barely moves.
      expect(blocked.tailGainScale).toBeGreaterThan(0.75);
    });

    it('ducks the direct path monotonically and clamps out-of-range input', () => {
      let previous = occlusionResponse(0).directGainScale;
      for (const amount of [0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const response = occlusionResponse(amount);
        expect(response.directGainScale).toBeLessThan(previous);
        previous = response.directGainScale;
      }
      expect(occlusionResponse(-5)).toEqual(occlusionResponse(0));
      expect(occlusionResponse(9)).toEqual(occlusionResponse(1));
      expect(occlusionResponse(Number.NaN)).toEqual(occlusionResponse(0));
    });

    it('compounds with distance in the report rather than overriding it', () => {
      const clearNear = weaponReportLayering(4, 'open-field', 0);
      const blockedNear = weaponReportLayering(4, 'open-field', 1);
      const clearFar = weaponReportLayering(70, 'open-field', 0);
      const blockedFar = weaponReportLayering(70, 'open-field', 1);

      expect(blockedNear.bodyCutoffHz).toBeLessThan(clearNear.bodyCutoffHz);
      expect(blockedNear.bodyGainScale).toBeLessThan(clearNear.bodyGainScale);
      // Already below the occlusion ceiling at range: a wall may muffle it
      // further but must never make a distant shot BRIGHTER.
      expect(blockedFar.bodyCutoffHz).toBeLessThanOrEqual(clearFar.bodyCutoffHz);
      // Full occlusion pins both to the ceiling; PARTIAL occlusion is where the
      // two effects have to compound rather than one winning outright.
      const halfNear = weaponReportLayering(4, 'open-field', 0.5);
      const halfFar = weaponReportLayering(70, 'open-field', 0.5);
      expect(halfFar.bodyCutoffHz).toBeLessThan(halfNear.bodyCutoffHz);
      expect(halfFar.bodyCutoffHz).toBeLessThan(clearFar.bodyCutoffHz);
      expect(halfFar.bodyGainScale).toBeLessThan(clearFar.bodyGainScale);
    });
  });

  describe('indoor versus outdoor tail', () => {
    it('rings longer and brighter inside than over open water', () => {
      const room = weaponReportLayering(6, 'interior-room', 0);
      const hall = weaponReportLayering(6, 'industrial-hall', 0);
      const field = weaponReportLayering(6, 'open-field', 0);
      const sea = weaponReportLayering(6, 'open-water', 0);

      expect(hall.tailDurationSeconds).toBeGreaterThan(field.tailDurationSeconds);
      expect(field.tailDurationSeconds).toBeGreaterThan(sea.tailDurationSeconds);
      expect(room.tailCentreHz).toBeGreaterThan(field.tailCentreHz);
      expect(sea.tailGainScale).toBeLessThan(field.tailGainScale);
      expect(hall.tailGainScale).toBeGreaterThan(field.tailGainScale);
      // Enclosure means the first reflection arrives sooner and rings tighter.
      expect(room.tailDelaySeconds).toBeLessThan(field.tailDelaySeconds);
      expect(room.tailQ).toBeGreaterThan(sea.tailQ);
    });

    it('spreads the tail later and longer as the source recedes', () => {
      const near = weaponReportLayering(3, 'open-field', 0);
      const far = weaponReportLayering(80, 'open-field', 0);
      expect(far.tailDelaySeconds).toBeGreaterThan(near.tailDelaySeconds);
      expect(far.tailDurationSeconds).toBeGreaterThan(near.tailDurationSeconds);
    });
  });

  describe('weapon report layering', () => {
    it('reads as a crack at 5 m and as body plus tail at 60 m', () => {
      const close = weaponReportLayering(5, 'open-field', 0);
      const distant = weaponReportLayering(60, 'open-field', 0);

      // Near: crack dominates, tail is a trace.
      expect(close.crackGainScale).toBeGreaterThan(0.6);
      expect(close.crackGainScale).toBeGreaterThan(close.tailGainScale);
      // Far: the crack is gone entirely and the tail is the loudest layer.
      expect(distant.crackGainScale).toBe(0);
      expect(distant.tailGainScale).toBeGreaterThan(distant.bodyGainScale);
      expect(distant.bodyGainScale).toBeLessThan(close.bodyGainScale * 0.5);
      // Which is what makes it the same weapon and a different sound.
      expect(distant.bodyCutoffHz).toBeLessThan(close.bodyCutoffHz * 0.5);
    });

    it('collapses the crack over its range and never revives it', () => {
      let previous = weaponReportLayering(0, 'open-field', 0).crackGainScale;
      expect(previous).toBe(1);
      for (const distance of [2, 8, 16, 24, 32, 40]) {
        const crack = weaponReportLayering(distance, 'open-field', 0).crackGainScale;
        expect(crack).toBeLessThan(previous);
        previous = crack;
      }
      for (const distance of [REPORT_CRACK_RANGE_METRES, 50, 120, 10_000]) {
        expect(weaponReportLayering(distance, 'open-field', 0).crackGainScale).toBe(0);
      }
    });

    it('grows the tail share monotonically with distance', () => {
      let previous = -1;
      for (const distance of SAMPLE_DISTANCES) {
        const layering = weaponReportLayering(distance, 'urban-yard', 0);
        expect(layering.tailGainScale).toBeGreaterThan(previous);
        previous = layering.tailGainScale;
        if (distance >= 55) break;
      }
    });

    it('returns finite frozen values for every space and hostile input', () => {
      for (const space of ACOUSTIC_SPACES) {
        for (const distance of [...SAMPLE_DISTANCES, Number.NaN, Number.POSITIVE_INFINITY, -40]) {
          for (const occlusion of [0, 0.5, 1, Number.NaN, -2, 7]) {
            const layering = weaponReportLayering(distance, space, occlusion);
            expect(Object.isFrozen(layering)).toBe(true);
            for (const [key, value] of Object.entries(layering)) {
              expect(Number.isFinite(value), `${space}/${distance}/${occlusion}/${key}`).toBe(true);
              expect(value).toBeGreaterThanOrEqual(0);
            }
            expect(layering.tailDelaySeconds).toBeLessThanOrEqual(0.3);
          }
        }
      }
    });
  });
});
