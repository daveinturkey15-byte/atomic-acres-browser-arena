/**
 * HF-363 — Tests for Per-Arena Ambience & Grade Identity Layer.
 */
import { describe, expect, it } from 'vitest';
import {
  ARENA_GRADE_IDENTITIES,
  COMBAT_SAFETY_BOUNDS,
  DEFAULT_ARENA_GRADE_ID,
  assertArenaGradeSafety,
  calculateFogTransmittance,
  getArenaGradeIdentity,
  resolveArenaGradeIdentity,
  type ArenaGradeIdentity,
} from './arena-grade-identity';
import type { ArenaId } from './map-selection';

const ALL_ARENA_IDS: readonly ArenaId[] = [
  'atomic-acres',
  'skyline-terminal',
  'rustworks-1v1',
  'gun-range',
  'farcrysis',
  'high-seas',
];

describe('HF-363 — Per-Arena Ambience & Grade Identity Layer', () => {
  describe('Catalog completeness and immutability', () => {
    it('contains all six authored arenas', () => {
      const registeredIds = Object.keys(ARENA_GRADE_IDENTITIES);
      expect(registeredIds.sort()).toEqual([...ALL_ARENA_IDS].sort());
      expect(registeredIds.length).toBe(6);
    });

    it('is deeply frozen to prevent runtime mutation', () => {
      expect(Object.isFrozen(ARENA_GRADE_IDENTITIES)).toBe(true);
      expect(Object.isFrozen(COMBAT_SAFETY_BOUNDS)).toBe(true);

      for (const id of ALL_ARENA_IDS) {
        const identity = ARENA_GRADE_IDENTITIES[id];
        expect(Object.isFrozen(identity)).toBe(true);
        expect(Object.isFrozen(identity.sun)).toBe(true);
        expect(Object.isFrozen(identity.sunPosition)).toBe(true);
        expect(Object.isFrozen(identity.hemisphere)).toBe(true);
        expect(Object.isFrozen(identity.ambient)).toBe(true);
        expect(Object.isFrozen(identity.fog)).toBe(true);
        expect(Object.isFrozen(identity.grade)).toBe(true);
        expect(Object.isFrozen(identity.combatMetrics)).toBe(true);
      }
    });

    it('provides top-level accessors matching domain records', () => {
      for (const id of ALL_ARENA_IDS) {
        const entry = ARENA_GRADE_IDENTITIES[id];
        expect(entry.sunColor).toBe(entry.sun.color);
        expect(entry.sunIntensity).toBe(entry.sun.intensity);
        expect(entry.sunPosition).toEqual(entry.sun.position);
        expect(entry.hemisphereSky).toBe(entry.hemisphere.skyColor);
        expect(entry.hemisphereGround).toBe(entry.hemisphere.groundColor);
        expect(entry.hemisphereIntensity).toBe(entry.hemisphere.intensity);
        expect(entry.ambientColor).toBe(entry.ambient.color);
        expect(entry.ambientIntensity).toBe(entry.ambient.intensity);
        expect(entry.ambientLevel).toBe(entry.ambient.intensity);
        expect(entry.fogColor).toBe(entry.fog.color);
        expect(entry.fogDensity).toBe(entry.fog.density);
      }
    });
  });

  describe('Grounded visual values per arena', () => {
    it('grounds atomic-acres in warm sunset cul-de-sac lighting', () => {
      const acres = resolveArenaGradeIdentity('atomic-acres');
      expect(acres.displayName).toBe('Nuke Town');
      expect(acres.sun.color).toBe(0xfff1ce);
      expect(acres.sun.intensity).toBe(3.2);
      expect(acres.hemisphere.skyColor).toBe(0xc9dbe2);
      expect(acres.hemisphere.groundColor).toBe(0xb8ab8d);
      expect(acres.ambient.color).toBe(0x8fb0bf);
      expect(acres.ambient.intensity).toBeCloseTo(0.40, 2);
      expect(acres.fog.color).toBe(0xb1c0be);
      expect(acres.fog.density).toBe(0.0035);
      expect(acres.grade.shadowTint).toBe(0x274356);
      expect(acres.grade.highlightTint).toBe(0xffd5a2);
    });

    it('grounds skyline-terminal in cool morning dawn airport lighting', () => {
      const terminal = resolveArenaGradeIdentity('skyline-terminal');
      expect(terminal.displayName).toBe('Terminal');
      expect(terminal.sun.color).toBe(0xeaf7ff);
      expect(terminal.sun.intensity).toBe(2.9);
      expect(terminal.hemisphere.skyColor).toBe(0xaed2e6);
      expect(terminal.hemisphere.groundColor).toBe(0x6a7882);
      expect(terminal.ambient.color).toBe(0x8aa5af);
      expect(terminal.ambient.intensity).toBeCloseTo(0.38, 2);
      expect(terminal.fog.color).toBe(0xa9bec4);
      expect(terminal.fog.density).toBe(0.0030);
      expect(terminal.grade.shadowTint).toBe(0x1f3344);
      expect(terminal.grade.highlightTint).toBe(0xf0f6ff);
    });

    it('grounds rustworks-1v1 in cold moonlit offshore industrial rig atmosphere', () => {
      const rig = resolveArenaGradeIdentity('rustworks-1v1');
      expect(rig.displayName).toBe('RustRig');
      expect(rig.sun.color).toBe(0xe2ebff);
      expect(rig.sun.intensity).toBe(3.6);
      expect(rig.hemisphere.skyColor).toBe(0x3a4c60);
      expect(rig.hemisphere.groundColor).toBe(0x2a221e);
      expect(rig.ambient.color).toBe(0x718aa5);
      expect(rig.ambient.intensity).toBeCloseTo(0.32, 2);
      expect(rig.fog.color).toBe(0x293747);
      expect(rig.fog.density).toBe(0.0042);
      expect(rig.grade.shadowTint).toBe(0x14202c);
      expect(rig.grade.highlightTint).toBe(0xffd2a0);
    });

    it('grounds gun-range in controlled indoor technical laboratory lighting with 0 sun', () => {
      const range = resolveArenaGradeIdentity('gun-range');
      expect(range.displayName).toBe('Gun Range');
      expect(range.sun.intensity).toBe(0.0); // Completely indoor
      expect(range.hemisphere.skyColor).toBe(0xb0d0d8);
      expect(range.hemisphere.groundColor).toBe(0x38444a);
      expect(range.ambient.color).toBe(0xc8e2e6);
      expect(range.ambient.intensity).toBeCloseTo(0.64, 2);
      expect(range.fog.color).toBe(0x28333a);
      expect(range.fog.density).toBe(0.0018);
      expect(range.grade.shadowTint).toBe(0x183038);
      expect(range.grade.highlightTint).toBe(0xffffff);
    });

    it('grounds farcrysis in golden-hour tropical beach & lush jungle canopy', () => {
      const farcrysis = resolveArenaGradeIdentity('farcrysis');
      expect(farcrysis.displayName).toBe('Farcrysis');
      expect(farcrysis.sun.color).toBe(0xffd9a0);
      expect(farcrysis.sun.intensity).toBe(3.1);
      expect(farcrysis.hemisphere.skyColor).toBe(0xffe8cc);
      expect(farcrysis.hemisphere.groundColor).toBe(0x4a6b3a);
      expect(farcrysis.ambient.color).toBe(0x9fbfa8);
      expect(farcrysis.ambient.intensity).toBeCloseTo(0.42, 2);
      expect(farcrysis.fog.color).toBe(0xcfe0c8);
      expect(farcrysis.fog.density).toBe(0.0028);
      expect(farcrysis.grade.shadowTint).toBe(0x1e3828);
      expect(farcrysis.grade.highlightTint).toBe(0xffe2b8);
    });

    it('grounds high-seas in warm daybreak yacht lighting with cool maritime fill', () => {
      const highSeas = resolveArenaGradeIdentity('high-seas');
      expect(highSeas.displayName).toBe('High Seas');
      expect(highSeas.sun.color).toBe(0xffe3bb);
      expect(highSeas.sun.intensity).toBe(3.0);
      expect(highSeas.hemisphere.skyColor).toBe(0xc7e7ed);
      expect(highSeas.ambient.color).toBe(0x9fc7cf);
      expect(highSeas.fog.color).toBe(0xb8d6dc);
      expect(highSeas.fog.density).toBe(0.0032);
      expect(highSeas.grade.shadowTint).toBe(0x294a58);
      expect(highSeas.grade.highlightTint).toBe(0xffe3bb);
    });
  });

  describe('Combat-Safety Envelopes & Sightline Bounds (Competitive FPS)', () => {
    it('enforces minimum shadow lift floor across all arenas', () => {
      for (const id of ALL_ARENA_IDS) {
        const identity = ARENA_GRADE_IDENTITIES[id];
        expect(identity.grade.shadowLift).toBeGreaterThanOrEqual(COMBAT_SAFETY_BOUNDS.minShadowLift);
        expect(identity.ambient.intensity).toBeGreaterThanOrEqual(COMBAT_SAFETY_BOUNDS.minAmbientIntensity);
      }
    });

    it('enforces maximum fog density ceiling across all arenas', () => {
      for (const id of ALL_ARENA_IDS) {
        const identity = ARENA_GRADE_IDENTITIES[id];
        expect(identity.fog.density).toBeLessThanOrEqual(COMBAT_SAFETY_BOUNDS.maxFogDensity);
        expect(identity.fog.density).toBeGreaterThan(0);
      }
    });

    it('maintains >= 60% visibility transmittance at max authored engagement distance', () => {
      for (const id of ALL_ARENA_IDS) {
        const identity = ARENA_GRADE_IDENTITIES[id];
        const dist = identity.combatMetrics.maxEngagementDistance;
        const transmittance = calculateFogTransmittance(identity.fog.density, dist);

        expect(transmittance).toBeCloseTo(identity.combatMetrics.minEngagementVisibility, 5);
        expect(transmittance).toBeGreaterThanOrEqual(COMBAT_SAFETY_BOUNDS.minEngagementTransmittance);
        // Ensure no arena blinds the player (< 0.60 transmittance)
        expect(transmittance).toBeGreaterThanOrEqual(0.60);
      }
    });

    it('passes assertArenaGradeSafety for all registered arenas', () => {
      for (const id of ALL_ARENA_IDS) {
        const identity = ARENA_GRADE_IDENTITIES[id];
        expect(() => assertArenaGradeSafety(identity)).not.toThrow();
      }
    });

    it('fails closed when an arena violates shadow lift or fog density bounds', () => {
      const valid = ARENA_GRADE_IDENTITIES['atomic-acres'];

      // Crushed shadow lift violation
      const crushedShadow = {
        ...valid,
        grade: { ...valid.grade, shadowLift: 0.01 },
      } as ArenaGradeIdentity;
      expect(() => assertArenaGradeSafety(crushedShadow)).toThrow(/shadowLift/);

      // Low ambient violation
      const darkAmbient = {
        ...valid,
        ambientIntensity: 0.05,
      } as ArenaGradeIdentity;
      expect(() => assertArenaGradeSafety(darkAmbient)).toThrow(/ambientIntensity/);

      // Dense fog blinding violation
      const blindFog = {
        ...valid,
        fogDensity: 0.02,
      } as ArenaGradeIdentity;
      expect(() => assertArenaGradeSafety(blindFog)).toThrow(/fogDensity/);

      // Severe contrast crushing violation
      const blownContrast = {
        ...valid,
        grade: { ...valid.grade, contrast: 1.5 },
      } as ArenaGradeIdentity;
      expect(() => assertArenaGradeSafety(blownContrast)).toThrow(/contrast/);
    });
  });

  describe('Lookup and resolution contracts', () => {
    it('defaults to atomic-acres on undefined/null input', () => {
      expect(resolveArenaGradeIdentity(undefined).id).toBe(DEFAULT_ARENA_GRADE_ID);
      expect(resolveArenaGradeIdentity(null).id).toBe(DEFAULT_ARENA_GRADE_ID);
      expect(getArenaGradeIdentity().id).toBe(DEFAULT_ARENA_GRADE_ID);
    });

    it('resolves each arena by ID', () => {
      for (const id of ALL_ARENA_IDS) {
        expect(resolveArenaGradeIdentity(id).id).toBe(id);
      }
    });

    it('throws fail-closed error on unknown arena ID', () => {
      expect(() => resolveArenaGradeIdentity('invalid-arena')).toThrow(/HF-363 unknown arena grade identity/);
      expect(() => resolveArenaGradeIdentity('de_dust2')).toThrow(/HF-363/);
    });
  });

  describe('calculateFogTransmittance utility', () => {
    it('returns 1.0 at distance 0', () => {
      expect(calculateFogTransmittance(0.005, 0)).toBe(1.0);
      expect(calculateFogTransmittance(0, 100)).toBe(1.0);
    });

    it('decays exponentially with distance and density', () => {
      const near = calculateFogTransmittance(0.003, 20);
      const far = calculateFogTransmittance(0.003, 60);
      expect(near).toBeGreaterThan(far);

      const lightFog = calculateFogTransmittance(0.001, 50);
      const heavyFog = calculateFogTransmittance(0.005, 50);
      expect(lightFog).toBeGreaterThan(heavyFog);
    });
  });
});
