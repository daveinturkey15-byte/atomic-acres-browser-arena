import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FIRST_PERSON_LAND_DIP_METERS,
  VIEWMODEL_EQUIP_OVERSHOOT,
  VIEWMODEL_EQUIP_RISE_SECONDS,
  VIEWMODEL_EQUIP_SETTLE_CONTRACT,
  VIEWMODEL_EQUIP_SETTLED_SECONDS,
  VIEWMODEL_LAND_DIP_ONSET_SECONDS,
  VIEWMODEL_LAND_DIP_REBOUND,
  VIEWMODEL_LAND_DIP_SETTLE_SECONDS,
  VIEWMODEL_SPRINT_POSE_EASE_CONTRACT,
  viewmodelEquipBlendAt,
  viewmodelLandDipShapeAt,
  viewmodelLandDropMetersAt,
  viewmodelSprintPoseEase,
} from './weapon-presentation-state';
import { WeaponPresentation } from './weapon-presentation';

const REST_POSE = {
  dt: 1 / 60,
  moving: false,
  sprinting: false,
  crouched: false,
  prone: false,
  ads: false,
  phase: 0,
  landingImpulse: 0,
  lateralSpeed: 0,
  reloadProgress: null,
} as const;

const restPresentation = () =>
  new WeaponPresentation(new THREE.PerspectiveCamera(82, 16 / 9, 0.05, 250), false);

/** Peak of the underdamped equip blend: first derivative zero at omega_d * t = pi. */
const EQUIP_PEAK_SECONDS = Math.PI / (15.2 * Math.sqrt(1 - 0.75 * 0.75));
/** Peak rebound age of the landing envelope: onset window plus omega_d * w = pi. */
const LAND_REBOUND_AGE_SECONDS = VIEWMODEL_LAND_DIP_ONSET_SECONDS
  + Math.PI / (22 * Math.sqrt(1 - 0.4557 * 0.4557));

describe('HF-388: the authored equip settle replaces the frame-one-stiff exponential', () => {
  it('declares its contract and rises through soft attack, not maximum velocity', () => {
    expect(VIEWMODEL_EQUIP_SETTLE_CONTRACT).toBe('hf388-underdamped-equip-settle-v1');
    // Zero initial slope: one frame into the equip the blend must still be
    // tiny. The old exponential had already covered 15% of the travel.
    expect(viewmodelEquipBlendAt(1 / 60)).toBeLessThan(0.05);
    expect(viewmodelEquipBlendAt(VIEWMODEL_EQUIP_RISE_SECONDS)).toBeCloseTo(1, 6);
  });

  it('pins the exact trajectory samples', () => {
    expect(viewmodelEquipBlendAt(0)).toBe(0);
    expect(viewmodelEquipBlendAt(0.06)).toBeCloseTo(0.2599, 4);
    expect(viewmodelEquipBlendAt(0.12)).toBeCloseTo(0.6395, 4);
    expect(viewmodelEquipBlendAt(VIEWMODEL_EQUIP_RISE_SECONDS)).toBeCloseTo(1, 6);
    expect(viewmodelEquipBlendAt(EQUIP_PEAK_SECONDS)).toBeCloseTo(1 + VIEWMODEL_EQUIP_OVERSHOOT, 6);
    expect(viewmodelEquipBlendAt(VIEWMODEL_EQUIP_SETTLED_SECONDS)).toBe(1);
    expect(viewmodelEquipBlendAt(10)).toBe(1);
  });

  it('carries exactly one bounded follow-through above rest and never dips below holstered', () => {
    expect(VIEWMODEL_EQUIP_OVERSHOOT).toBeGreaterThan(0.02);
    expect(VIEWMODEL_EQUIP_OVERSHOOT).toBeLessThan(0.04);
    let max = 0;
    for (let t = 0; t <= VIEWMODEL_EQUIP_SETTLED_SECONDS; t += 0.001) {
      const blend = viewmodelEquipBlendAt(t);
      expect(blend).toBeGreaterThanOrEqual(0);
      expect(blend).toBeLessThanOrEqual(1 + 2 * VIEWMODEL_EQUIP_OVERSHOOT);
      if (blend > max) max = blend;
    }
    expect(max).toBeCloseTo(1 + VIEWMODEL_EQUIP_OVERSHOOT, 3);
    // NaN and negative clocks are rest-safe, never NaN themselves.
    expect(viewmodelEquipBlendAt(Number.NaN)).toBe(0);
    expect(viewmodelEquipBlendAt(-1)).toBe(0);
  });
});

describe('HF-388: the landing dip attacks, rebounds and settles instead of snapping', () => {
  it('rises over a finite onset window and is C1-continuous at the handover', () => {
    expect(viewmodelLandDipShapeAt(0)).toBe(0);
    expect(viewmodelLandDipShapeAt(VIEWMODEL_LAND_DIP_ONSET_SECONDS / 2))
      .toBeCloseTo(0.5, 6); // smoothstep midpoint
    expect(viewmodelLandDipShapeAt(VIEWMODEL_LAND_DIP_ONSET_SECONDS - 1e-9)).toBeCloseTo(1, 9);
    expect(viewmodelLandDipShapeAt(VIEWMODEL_LAND_DIP_ONSET_SECONDS + 1e-9)).toBeCloseTo(1, 9);
  });

  it('pins the single rebound at ~20% of the dip above rest, then exact rest', () => {
    expect(viewmodelLandDipShapeAt(LAND_REBOUND_AGE_SECONDS)).toBeCloseTo(-VIEWMODEL_LAND_DIP_REBOUND, 4);
    expect(VIEWMODEL_LAND_DIP_REBOUND).toBeGreaterThan(0.15);
    expect(VIEWMODEL_LAND_DIP_REBOUND).toBeLessThan(0.25);
    expect(viewmodelLandDipShapeAt(VIEWMODEL_LAND_DIP_SETTLE_SECONDS)).toBe(0);
    expect(viewmodelLandDipShapeAt(5)).toBe(0);
    expect(viewmodelLandDipShapeAt(Number.NaN)).toBe(0);
  });

  it('scales signed metres with the clamped impulse', () => {
    expect(viewmodelLandDropMetersAt(VIEWMODEL_LAND_DIP_ONSET_SECONDS, 1))
      .toBeCloseTo(-FIRST_PERSON_LAND_DIP_METERS, 12);
    expect(viewmodelLandDropMetersAt(LAND_REBOUND_AGE_SECONDS, 0.5))
      .toBeCloseTo(FIRST_PERSON_LAND_DIP_METERS * 0.5 * VIEWMODEL_LAND_DIP_REBOUND, 9);
    expect(viewmodelLandDropMetersAt(0.2, 4)).toBeCloseTo(
      viewmodelLandDropMetersAt(0.2, 1), 12,
    ); // impulse clamps to 1
    expect(viewmodelLandDropMetersAt(0.2, Number.NaN)).toBe(0);
  });
});

describe('HF-388: the visual sprint terms ride an S-curve while endpoints stay byte-exact', () => {
  it('declares its contract and pins the smoothstep shape', () => {
    expect(VIEWMODEL_SPRINT_POSE_EASE_CONTRACT).toBe('hf388-smoothstep-sprint-pose-v1');
    expect(viewmodelSprintPoseEase(0)).toBe(0);
    expect(viewmodelSprintPoseEase(1)).toBe(1);
    expect(viewmodelSprintPoseEase(0.5)).toBeCloseTo(0.5, 12);
    expect(viewmodelSprintPoseEase(Number.NaN)).toBe(0);
    expect(viewmodelSprintPoseEase(-0.5)).toBe(0);
    expect(viewmodelSprintPoseEase(1.5)).toBe(1);
  });

  it('softens both ends symmetrically without changing monotonicity', () => {
    expect(viewmodelSprintPoseEase(0.25)).toBeLessThan(0.25);
    expect(viewmodelSprintPoseEase(0.75)).toBeGreaterThan(0.75);
    let previous = 0;
    for (let b = 0; b <= 1.0001; b += 0.01) {
      const eased = viewmodelSprintPoseEase(b);
      expect(eased).toBeGreaterThanOrEqual(previous);
      previous = eased;
    }
  });
});

describe('HF-388: the live update loop plays the authored curves', () => {
  const settledRestY = (() => {
    const presentation = restPresentation();
    presentation.setWeapon('carbine', true);
    for (let frame = 0; frame < 400; frame += 1) presentation.update({ ...REST_POSE });
    return presentation.root.position.y;
  })();

  it('equips from below, stays inside the authored drop bound, and lands on exact rest', () => {
    const presentation = restPresentation();
    presentation.setWeapon('carbine', false);
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let frame = 0; frame < 120; frame += 1) {
      presentation.update({ ...REST_POSE });
      minY = Math.min(minY, presentation.root.position.y);
      maxY = Math.max(maxY, presentation.root.position.y);
    }
    // Still visibly holstered during the first frames (the root chases the
    // deep target), then converges onto the same rest Y as an immediate spawn.
    expect(settledRestY - presentation.root.position.y).toBeLessThan(5e-4);
    expect(minY).toBeLessThan(settledRestY - 0.25);
    // Bezel safety across every fixture pose: the rebound may lift the
    // viewmodel at most the authored 2.8% of the 0.52 m drop past rest, plus
    // chase slack - never anything that could reach the frame centre.
    expect(maxY).toBeLessThan(settledRestY + 0.03);
  });

  it('plays the full landing attack-rebound-settle and returns to exact rest deterministically', () => {
    // Breath rides the accumulated arm-motion clock, so the honest baseline
    // for a landing run is an identical impulse-free run at the same clocks.
    const run = (impulse: number) => {
      const presentation = restPresentation();
      presentation.setWeapon('carbine', true);
      for (let frame = 0; frame < 60; frame += 1) presentation.update({ ...REST_POSE });
      const ys: number[] = [];
      for (let frame = 0; frame < 90; frame += 1) {
        presentation.update({ ...REST_POSE, landingImpulse: frame === 0 ? impulse : 0 });
        ys.push(presentation.root.position.y);
      }
      return ys;
    };
    const baseY = run(0)[89];
    const ys = run(0.8);
    const minDrop = Math.min(...ys) - baseY;
    const maxLift = Math.max(...ys) - baseY;
    // Visible dip: well past half the scaled amplitude survives the chase filter.
    expect(minDrop).toBeLessThan(-FIRST_PERSON_LAND_DIP_METERS * 0.8 * 0.5);
    // Never deeper than the authored bound.
    expect(minDrop).toBeGreaterThan(-FIRST_PERSON_LAND_DIP_METERS * 0.85);
    // No bezel-reaching excursion upward past the authored rebound.
    expect(maxLift).toBeLessThan(FIRST_PERSON_LAND_DIP_METERS * VIEWMODEL_LAND_DIP_REBOUND + 0.005);
    // After the envelope settles the pose is back on the impulse-free baseline.
    expect(ys[ys.length - 1]).toBeCloseTo(baseY, 10);
    // Determinism: identical pose sequences produce identical trajectories.
    expect(run(0.8)).toEqual(ys);
  });

  it('converges sprint entry to the unchanged endpoint rotation', () => {
    const presentation = restPresentation();
    presentation.setWeapon('carbine', true);
    const sprinting = { ...REST_POSE, sprinting: true };
    for (let frame = 0; frame < 400; frame += 1) presentation.update(sprinting);
    // The ease maps 1 -> 1, so the settled sprint roll must equal the legacy
    // endpoint (-0.22 rad) exactly as before this change.
    expect(presentation.root.rotation.z).toBeCloseTo(-0.22, 6);
  });
});
