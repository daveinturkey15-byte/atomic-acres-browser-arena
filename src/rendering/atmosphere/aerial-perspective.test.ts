/**
 * HF-481 lane LOOK — the aerial-perspective curve, bounded on the CPU.
 *
 * These are the assertions that make the shipped node safe to look at without a
 * GPU: the curve is monotonic in distance, it falls with height, it responds to
 * the sun, every tier is inside the combat ceiling, and the ceiling itself is
 * the one derived from the contrast floor rather than a number someone liked.
 */
import { describe, expect, it } from 'vitest';
import {
  AERIAL_PERSPECTIVE_ENGAGEMENT_DISTANCE_M,
  AERIAL_PERSPECTIVE_MAXIMUM_ENGAGEMENT_INSCATTER,
  AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER,
  AERIAL_PERSPECTIVE_MINIMUM_FAR_INSCATTER,
  AERIAL_PERSPECTIVE_REFERENCE_DISTANCE_M,
  AERIAL_PERSPECTIVE_STAGE,
  AERIAL_PERSPECTIVE_TIERS,
  RAYLEIGH_CHANNEL_RATIO,
  aerialPerspectiveInscatter,
  assertAerialPerspectiveCombatSafety,
  henyeyGreensteinPhase,
  nearFieldGate,
  opticalDepth,
  representativeFarInscatter,
  rayleighPhase,
  resolveAerialPerspectiveTuning,
  worstCaseInscatter,
} from './aerial-perspective';

const WHITE: readonly [number, number, number] = [1, 1, 1];
const SKY: readonly [number, number, number] = [0.55, 0.62, 0.72];
const SUN: readonly [number, number, number] = [1, 0.94, 0.81];

describe('aerial perspective — the combat bound', () => {
  it('states the ceiling the contrast floor derives', () => {
    // 0.04 / (0.16 + L) >= 0.14  ->  L <= 0.1257
    const contrastAtCeiling = 0.04 / (0.16 + AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER);
    expect(contrastAtCeiling).toBeGreaterThan(0.14);
    expect(AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER).toBeLessThanOrEqual(0.126);
  });

  it('is strictly gentler than the linear fog it sits beside', () => {
    // THREE.Fog(58, 148) at the reference distance.
    const fogMix = (AERIAL_PERSPECTIVE_REFERENCE_DISTANCE_M - 58) / (148 - 58);
    expect(fogMix).toBeCloseTo(0.3556, 3);
    // The fog removes 35.6% of the surface's own radiance. Against a 0.16
    // background that is a 0.057 loss of DIFFERENCE, which this stage never
    // takes because it never multiplies.
    expect(AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER).toBeLessThan(fogMix);
  });

  it('cannot set an engagement bound no exponential curve could meet', () => {
    // 1 - exp(-b d) is concave, so the 25 m share can never fall below 25/90.
    const linearShare =
      AERIAL_PERSPECTIVE_ENGAGEMENT_DISTANCE_M / AERIAL_PERSPECTIVE_REFERENCE_DISTANCE_M;
    const boundShare =
      AERIAL_PERSPECTIVE_MAXIMUM_ENGAGEMENT_INSCATTER / AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER;
    expect(boundShare).toBeGreaterThanOrEqual(linearShare);
  });

  it('sweeps every shipped tier from both ends', () => {
    for (const tier of AERIAL_PERSPECTIVE_TIERS) {
      const tuning = resolveAerialPerspectiveTuning(tier);
      expect(() => assertAerialPerspectiveCombatSafety(tuning)).not.toThrow();
      // The duel bound, proved against the UNCLAMPED want, so it does not lean
      // on the shader clamp.
      expect(
        worstCaseInscatter(AERIAL_PERSPECTIVE_ENGAGEMENT_DISTANCE_M, tuning),
        `${tier} at ${AERIAL_PERSPECTIVE_ENGAGEMENT_DISTANCE_M} m`,
      ).toBeLessThanOrEqual(AERIAL_PERSPECTIVE_MAXIMUM_ENGAGEMENT_INSCATTER);
      // And the floor, so the effect cannot regress to the invisible thing the
      // first cut of this module actually shipped.
      expect(representativeFarInscatter(tuning), `${tier} far field`)
        .toBeGreaterThanOrEqual(AERIAL_PERSPECTIVE_MINIMUM_FAR_INSCATTER);
    }
  });

  it('holds the ceiling by CLAMP once the curve wants more than the ceiling', () => {
    // This is the honest statement of the design. Past roughly the arena's
    // longest sightline, looking straight down the sun vector, every tier WANTS
    // more than the ceiling - that is what a strong enough far-field wash costs.
    // The ceiling is therefore held by the per-channel `min` in the shipped
    // expression, exactly as the baked-indirect probe holds its own, and the
    // sweep says so rather than pretending the tuning never reaches it.
    const ultra = resolveAerialPerspectiveTuning('ultra');
    expect(worstCaseInscatter(AERIAL_PERSPECTIVE_REFERENCE_DISTANCE_M, ultra))
      .toBeGreaterThan(AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER);
    for (const distance of [30, 60, 90, 150, 400]) {
      const rgb = aerialPerspectiveInscatter(distance, 0, 1, WHITE, WHITE, ultra);
      for (const channel of rgb) {
        expect(channel, `ultra at ${distance} m`)
          .toBeLessThanOrEqual(AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER + 1e-9);
      }
    }
  });

  it('is exactly zero inside the duel envelope, by gate rather than by luck', () => {
    for (const tier of AERIAL_PERSPECTIVE_TIERS) {
      const tuning = resolveAerialPerspectiveTuning(tier);
      expect(nearFieldGate(tuning.nearFadeStartM, tuning)).toBe(0);
      expect(nearFieldGate(tuning.nearFadeStartM - 5, tuning)).toBe(0);
      expect(nearFieldGate(tuning.nearFadeEndM, tuning)).toBe(1);
      // A close-quarters exchange receives literally nothing.
      const pointBlank = aerialPerspectiveInscatter(12, 0, 1, WHITE, WHITE, tuning);
      expect(Math.max(...pointBlank)).toBe(0);
    }
  });

  it('could not have met the duel bound arithmetically, which is why the gate exists', () => {
    // 1 - exp(-b d) is concave, so its 25 m value is at least the linear share
    // 25/90 of its 90 m value for ANY beta. A curve delivering the visibility
    // floor at 90 m would therefore be forced to put at least 27.8% of it into
    // a duel if there were no gate - which is more than the whole engagement
    // allowance. The gate is not a tuning convenience; it is the only structure
    // that lets this module be visible and duel-safe at the same time.
    for (const tier of AERIAL_PERSPECTIVE_TIERS) {
      const tuning = resolveAerialPerspectiveTuning(tier);
      const gated = worstCaseInscatter(AERIAL_PERSPECTIVE_ENGAGEMENT_DISTANCE_M, tuning);
      const gate = nearFieldGate(AERIAL_PERSPECTIVE_ENGAGEMENT_DISTANCE_M, tuning);
      const ungated = gated / gate;
      // WITHOUT the gate, this very tuning breaks the duel bound.
      expect(ungated, `${tier} ungated at 25 m`)
        .toBeGreaterThan(AERIAL_PERSPECTIVE_MAXIMUM_ENGAGEMENT_INSCATTER);
      // WITH it, the same tuning is inside, by at least a factor of four.
      expect(gated, `${tier} gated at 25 m`)
        .toBeLessThanOrEqual(AERIAL_PERSPECTIVE_MAXIMUM_ENGAGEMENT_INSCATTER);
      expect(gated).toBeLessThan(ungated * 0.25);
    }
  });

  it('rejects a tuning that would wash a duel', () => {
    const reckless = { ...resolveAerialPerspectiveTuning('ultra'), gain: 4 };
    expect(() => assertAerialPerspectiveCombatSafety(reckless)).toThrow(/HF-481/);
  });

  it('clamps the shipped expression per channel as a backstop', () => {
    const reckless = { ...resolveAerialPerspectiveTuning('ultra'), gain: 40 };
    const rgb = aerialPerspectiveInscatter(200, 0, 1, WHITE, WHITE, reckless);
    for (const channel of rgb) {
      expect(channel).toBeLessThanOrEqual(AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER + 1e-9);
    }
  });
});

describe('aerial perspective — the curve', () => {
  const tuning = resolveAerialPerspectiveTuning('high');

  it('rises monotonically with distance', () => {
    let previous = -1;
    for (let d = 0; d <= 140; d += 5) {
      const value = aerialPerspectiveInscatter(d, 0, 0, SKY, SUN, tuning)[2];
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('is nothing at the camera', () => {
    const rgb = aerialPerspectiveInscatter(0, 0, 0, SKY, SUN, tuning);
    expect(rgb[0]).toBe(0);
    expect(rgb[1]).toBe(0);
    expect(rgb[2]).toBe(0);
  });

  it('falls with height, which is the thing linear fog cannot do', () => {
    const atStreet = aerialPerspectiveInscatter(80, 0, 0, SKY, SUN, tuning)[2];
    const atGutter = aerialPerspectiveInscatter(80, 6, 0, SKY, SUN, tuning)[2];
    const atRoofline = aerialPerspectiveInscatter(80, 12, 0, SKY, SUN, tuning)[2];
    expect(atGutter).toBeLessThan(atStreet);
    expect(atRoofline).toBeLessThan(atGutter);
    // And the separation is worth having, not a rounding difference.
    expect(atRoofline / atStreet).toBeLessThan(0.75);
  });

  it('glows into the sun and does not glow away from it', () => {
    const intoSun = aerialPerspectiveInscatter(80, 0, 1, SKY, SUN, tuning)[1];
    const across = aerialPerspectiveInscatter(80, 0, 0, SKY, SUN, tuning)[1];
    const awayFromSun = aerialPerspectiveInscatter(80, 0, -1, SKY, SUN, tuning)[1];
    expect(intoSun).toBeGreaterThan(across);
    expect(across).toBeGreaterThan(awayFromSun);
    // This ratio is the whole point of the Mie lobe: the into-sun street shot
    // has to look different from the reverse angle.
    expect(intoSun / awayFromSun).toBeGreaterThan(1.8);
  });

  it('sends distance blue, which is what a far treeline does', () => {
    // Sun straight overhead relative to the view, so the Rayleigh split shows.
    const rgb = aerialPerspectiveInscatter(90, 0, 0, SKY, [0, 0, 0], tuning);
    expect(rgb[2]).toBeGreaterThan(rgb[1]);
    expect(rgb[1]).toBeGreaterThan(rgb[0]);
  });

  it('orders the tiers by how much atmosphere they deliver', () => {
    const low = worstCaseInscatter(90, resolveAerialPerspectiveTuning('low'));
    const high = worstCaseInscatter(90, resolveAerialPerspectiveTuning('high'));
    const ultra = worstCaseInscatter(90, resolveAerialPerspectiveTuning('ultra'));
    expect(low).toBeLessThan(high);
    expect(high).toBeLessThan(ultra);
    // LOW is not off: atmosphere is not an effect a player may switch away.
    expect(low).toBeGreaterThan(0);
  });
});

describe('aerial perspective — the maths it claims to use', () => {
  it('uses the real Rayleigh lambda^-4 channel ratio', () => {
    expect(RAYLEIGH_CHANNEL_RATIO[2]).toBe(1);
    expect(RAYLEIGH_CHANNEL_RATIO[0]).toBeLessThan(RAYLEIGH_CHANNEL_RATIO[1]);
    expect(RAYLEIGH_CHANNEL_RATIO[1]).toBeLessThan(RAYLEIGH_CHANNEL_RATIO[2]);
  });

  it('normalises both phase functions to their 90-degree value', () => {
    expect(rayleighPhase(0)).toBeCloseTo(1, 12);
    expect(henyeyGreensteinPhase(0, 0.62)).toBeCloseTo(1, 12);
  });

  it('makes Henyey-Greenstein forward-peaked and back-suppressed', () => {
    expect(henyeyGreensteinPhase(1, 0.62)).toBeGreaterThan(1);
    expect(henyeyGreensteinPhase(-1, 0.62)).toBeLessThan(1);
  });

  it('applies the exponential density profile to optical depth', () => {
    const tuning = resolveAerialPerspectiveTuning('high');
    expect(opticalDepth(100, 0, tuning)).toBeCloseTo(tuning.betaPerMetre * 100, 12);
    expect(opticalDepth(100, tuning.scaleHeightM, tuning)).toBeCloseTo(
      tuning.betaPerMetre * 100 * Math.exp(-1),
      12,
    );
    // A point below the camera is never hazed MORE than one level with it.
    expect(opticalDepth(100, -40, tuning)).toBe(opticalDepth(100, 0, tuning));
  });

  it('names its stage the way the linear order names stages', () => {
    expect(AERIAL_PERSPECTIVE_STAGE).toBe('aerial-perspective-inscatter-add');
    expect(AERIAL_PERSPECTIVE_STAGE.endsWith('-add')).toBe(true);
  });
});

describe('aerial perspective — why it may ride at Performance', () => {
  it('is driven by the atmosphere setting, not by a screen-space tier', async () => {
    const { GRAPHICS_PRESET_VALUES } = await import('../../graphics-settings-registry');
    // The Performance preset is the regression guard for the SCREEN-SPACE
    // family: SSR, SSGI, shafts, ray tracing, DOF and motion blur are all off
    // there and `graphics-settings-registry.test.ts` pins that they may never
    // be promoted into it. Aerial perspective is not in that family and does
    // not weaken that pin: it allocates no render target, reads no MRT
    // attachment and adds no pass, so its whole cost is arithmetic in a shader
    // that already runs. It rides `volumetricQuality`, which has ALWAYS been
    // 'low' at Performance and has never had an off rung.
    expect(GRAPHICS_PRESET_VALUES.performance.screenSpaceReflections).toBe('off');
    expect(GRAPHICS_PRESET_VALUES.performance.screenSpaceGi).toBe('off');
    expect(GRAPHICS_PRESET_VALUES.performance.volumetricLightShafts).toBe('off');
    expect(GRAPHICS_PRESET_VALUES.performance.volumetricQuality).toBe('low');
    // And the tier it therefore gets is the gentlest one that exists.
    const performance = resolveAerialPerspectiveTuning(
      GRAPHICS_PRESET_VALUES.performance.volumetricQuality,
    );
    expect(performance).toEqual(resolveAerialPerspectiveTuning('low'));
    expect(() => assertAerialPerspectiveCombatSafety(performance)).not.toThrow();
  });
});
