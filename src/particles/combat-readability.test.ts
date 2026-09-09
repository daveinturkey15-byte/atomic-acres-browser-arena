/**
 * HF-371 — the readability contract.
 *
 * These are the assertions that make "particles never obscure an enemy" a
 * property rather than an intention. Every one of them describes a way the
 * feature could ship looking good and playing badly.
 */
import { describe, expect, it } from 'vitest';
import {
  PARTICLE_READABILITY,
  auditFamilyOpacityCeilings,
  centreConeRadius,
  centreVisibility,
  combatSafetyVerdict,
  particleScreenLoad,
  screenLoadScale,
  sightlineVisibility,
  smoothstep01,
  visibilityToScaleGate,
} from './combat-readability';

describe('the protected centre cone', () => {
  it('is angular, so it covers the same slice of screen at every range', () => {
    // The failure this prevents: a metric radius that clears smoke at 3 m and
    // does nothing at 40 m, where the target actually is.
    const near = centreConeRadius(10);
    const far = centreConeRadius(40);
    expect(far / near).toBeCloseTo(4, 5);
    // ...with a near-field floor, because a pure cone pinches to zero at the
    // eye and would let a puff sit at arm's length filling the view.
    expect(centreConeRadius(0.1)).toBe(PARTICLE_READABILITY.centreMinRadiusM);
  });

  it('clears obscuring families dead ahead, at every combat range', () => {
    for (const range of [2, 5, 12, 30, 60]) {
      expect(centreVisibility(range, 0, 0, true), `on-axis at ${range} m`).toBe(0);
    }
  });

  it('thins fine dust rather than cutting a hole in it', () => {
    // A hard hole in the dust straight ahead is itself a visible artefact, and
    // a 1.5 cm mote cannot hide a torso, so fine families only dim.
    const fine = centreVisibility(12, 0, 0, false);
    expect(fine).toBe(PARTICLE_READABILITY.centreFineFloor);
    expect(fine).toBeGreaterThan(0);
    expect(fine).toBeLessThan(1);
  });

  it('has a soft wall, not a step, so particles do not pop as you turn', () => {
    const radius = centreConeRadius(12);
    const inside = centreVisibility(12, radius * 0.5, 0, true);
    const shell = centreVisibility(12, radius * 0.85, 0, true);
    const outside = centreVisibility(12, radius * 1.2, 0, true);
    expect(inside).toBe(0);
    expect(shell).toBeGreaterThan(0);
    expect(shell).toBeLessThan(1);
    expect(outside).toBe(1);
  });

  it('widens when the player aims, because that is when they have committed', () => {
    const hip = centreConeRadius(20, 0);
    const ads = centreConeRadius(20, 1);
    expect(ads).toBeGreaterThan(hip);
    expect(ads / hip).toBeCloseTo(1 + PARTICLE_READABILITY.centreAdsWiden, 5);
    // A puff legal at the hip must be cleared once the player aims at it.
    const perp = hip * 1.1;
    expect(centreVisibility(20, perp, 0, true)).toBe(1);
    expect(centreVisibility(20, perp, 1, true)).toBe(0);
  });

  it('leaves particles behind the eye alone instead of inverting the cone', () => {
    expect(centreVisibility(-5, 0, 0, true)).toBe(1);
  });
});

describe('the near-lens cull', () => {
  it('refuses to draw anything at blindfold range, at any opacity', () => {
    const verdict = combatSafetyVerdict({
      alongM: 0.2, perpM: 0.9, distanceM: 0.2, adsProgress: 0,
      obscuring: true, requestedOpacity: 1, radiusM: 0.4,
    });
    expect(verdict.nearCulled).toBe(true);
    expect(verdict.drawn).toBe(false);
    expect(verdict.opacity).toBe(0);
  });

  it('applies to fine families too - there is no family-level exemption', () => {
    const verdict = combatSafetyVerdict({
      alongM: 0.1, perpM: 0.25, distanceM: 0.27, adsProgress: 0,
      obscuring: false, requestedOpacity: 0.1, radiusM: 0.02,
    });
    expect(verdict.nearCulled).toBe(true);
    expect(verdict.opacity).toBe(0);
  });
});

describe('enemy sightline clearing', () => {
  const eye = [0, 1.7, 0] as const;
  const enemy = [18, 1.7, 6] as const;

  it('clears smoke sitting on the eye-to-enemy line', () => {
    // Halfway along the line, dead on it.
    const visibility = sightlineVisibility(
      9, 1.7, 3,
      eye[0], eye[1], eye[2],
      enemy[0], enemy[1], enemy[2],
    );
    expect(visibility).toBe(0);
  });

  it('leaves smoke well off the line alone', () => {
    const visibility = sightlineVisibility(
      9, 1.7, 9,
      eye[0], eye[1], eye[2],
      enemy[0], enemy[1], enemy[2],
    );
    expect(visibility).toBe(1);
  });

  it('does not clear smoke behind the player or beyond the enemy', () => {
    // Both of these are near the infinite LINE but not on the SEGMENT, and a
    // naive point-to-line distance would wrongly clear them - deleting smoke
    // nowhere near the fight.
    const behind = sightlineVisibility(
      -12, 1.7, -4,
      eye[0], eye[1], eye[2], enemy[0], enemy[1], enemy[2],
    );
    const beyond = sightlineVisibility(
      36, 1.7, 12,
      eye[0], eye[1], eye[2], enemy[0], enemy[1], enemy[2],
    );
    expect(behind).toBe(1);
    expect(beyond).toBe(1);
  });

  it('degrades gracefully when the enemy is standing on the camera', () => {
    expect(sightlineVisibility(1, 1, 1, 0, 0, 0, 0, 0, 0)).toBe(1);
  });
});

describe('the aggregate screen-load budget', () => {
  it('does nothing until particles actually stack up', () => {
    expect(screenLoadScale(0)).toBe(1);
    expect(screenLoadScale(PARTICLE_READABILITY.screenLoadCeiling)).toBe(1);
  });

  it('thins everything proportionally once they do', () => {
    const scale = screenLoadScale(PARTICLE_READABILITY.screenLoadCeiling * 4);
    expect(scale).toBeCloseTo(0.25, 5);
  });

  it('never collapses the effect entirely, however bad the pile-up', () => {
    expect(screenLoadScale(1_000)).toBe(PARTICLE_READABILITY.minLoadScale);
  });

  it('weights close particles far above distant ones', () => {
    const close = particleScreenLoad(0.2, 0.4, 4);
    const distant = particleScreenLoad(0.2, 0.4, 400);
    expect(close).toBeGreaterThan(distant * 50);
  });
});

describe('the ceilings are audited, not trusted', () => {
  it('accepts families authored inside the contract', () => {
    const audit = auditFamilyOpacityCeilings([
      { id: 'puff', obscuring: true, maxOpacity: PARTICLE_READABILITY.obscuringMaxOpacity },
      { id: 'motes', obscuring: false, maxOpacity: PARTICLE_READABILITY.fineMaxOpacity },
    ]);
    expect(audit.pass).toBe(true);
    expect(audit.offenders).toEqual([]);
  });

  it('names any family that tries to raise its own ceiling', () => {
    // The realistic regression: someone bumps a number because the smoke
    // "looks thin" in a screenshot, and no test notices.
    const audit = auditFamilyOpacityCeilings([
      { id: 'puff', obscuring: true, maxOpacity: PARTICLE_READABILITY.obscuringMaxOpacity + 0.01 },
      { id: 'motes', obscuring: false, maxOpacity: 0.05 },
    ]);
    expect(audit.pass).toBe(false);
    expect(audit.offenders).toEqual(['puff']);
  });
});

describe('mechanical helpers', () => {
  it('smoothstep is monotonic and pinned at both ends', () => {
    expect(smoothstep01(-1)).toBe(0);
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(2)).toBe(1);
    expect(smoothstep01(0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep01(0.7)).toBeGreaterThan(smoothstep01(0.3));
  });

  it('gates alpha-tested families on the same clearance number', () => {
    expect(visibilityToScaleGate(0)).toBe(0);
    expect(visibilityToScaleGate(PARTICLE_READABILITY.scaleGateClearance - 0.01)).toBe(0);
    expect(visibilityToScaleGate(1)).toBe(1);
  });

  it('treats NaN as the safe end of every guard', () => {
    expect(centreVisibility(Number.NaN, Number.NaN, 0, true)).toBe(1);
    expect(screenLoadScale(Number.NaN)).toBe(1);
    expect(particleScreenLoad(Number.NaN, 1, 4)).toBe(0);
  });
});
