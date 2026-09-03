import { describe, expect, it } from 'vitest';

import {
  G1_34_JOINTS,
  G1_34_PARENTS,
  G1_34_REST_POSITIONS,
  G1_REST_HIP_HEIGHT_M,
  G1_TO_OPERATOR,
  MOTIONBRICKS_G1_SOURCE,
  MOTIONBRICKS_TRIAL_CLIP_NAME,
  MOTIONBRICKS_TRIAL_SOURCE,
  OPERATOR_JOINTS_G1_CANNOT_DRIVE,
  OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE,
  g1DrivenOperatorJoints,
  g1JointIndex,
  g1RestOffsets,
  g1RootScaleForHipHeight,
} from './motionbricks-g1-retarget';
import { SOMA30_TO_OPERATOR_JOINT } from './kimodo-operator-retarget';

/**
 * The point of this file is that a WRONG joint order still type-checks. Every
 * assertion below exists because guessing here produces a plausible-looking
 * wrong answer rather than a crash.
 */
describe('MotionBricks G1-34 -> operator correspondence', () => {
  it('carries exactly the 34 joints the published metadata names', () => {
    expect(G1_34_JOINTS).toHaveLength(34);
    expect(G1_34_PARENTS).toHaveLength(34);
    expect(G1_34_REST_POSITIONS).toHaveLength(34);
    expect(new Set(G1_34_JOINTS).size).toBe(34);
    expect(G1_34_JOINTS[0]).toBe('pelvis_skel');
    expect(MOTIONBRICKS_G1_SOURCE.skeletonId).toBe('g1skel34');
  });

  it('describes a single rooted tree whose parents always precede their children', () => {
    expect(G1_34_PARENTS[0]).toBe(-1);
    expect(G1_34_PARENTS.filter((parent) => parent < 0)).toHaveLength(1);
    G1_34_PARENTS.forEach((parent, index) => {
      if (index === 0) return;
      expect(parent).toBeGreaterThanOrEqual(0);
      expect(parent).toBeLessThan(index);
    });
  });

  it('has one correspondence row per source joint, in emission order', () => {
    expect(G1_TO_OPERATOR).toHaveLength(34);
    G1_TO_OPERATOR.forEach((row, index) => {
      // The row's position source IS the joint at that index. This is what
      // catches a table that has drifted out of alignment with the name list.
      expect(row.positionFrom).toBe(G1_34_JOINTS[index]);
      expect(g1JointIndex(row.rotationFrom)).toBeGreaterThanOrEqual(0);
      expect(row.reason.length).toBeGreaterThan(20);
    });
  });

  it('takes each composed rotation from the deepest link of its serial chain', () => {
    const rotationSourceFor = (source: string) => {
      const row = G1_TO_OPERATOR[g1JointIndex(source)];
      return row.rotationFrom;
    };
    // A 3-DoF hip is pitch -> roll -> yaw; only the yaw link's global matrix
    // composes all three, so that is the one the thigh may take.
    expect(rotationSourceFor('left_hip_pitch_skel')).toBe('left_hip_yaw_skel');
    expect(rotationSourceFor('right_hip_pitch_skel')).toBe('right_hip_yaw_skel');
    expect(rotationSourceFor('left_shoulder_roll_skel')).toBe('left_shoulder_yaw_skel');
    expect(rotationSourceFor('left_ankle_pitch_skel')).toBe('left_ankle_roll_skel');
    expect(rotationSourceFor('left_wrist_roll_skel')).toBe('left_wrist_yaw_skel');
    // A rotation source is always at or below its position source in the chain.
    G1_TO_OPERATOR.forEach((row, index) => {
      expect(g1JointIndex(row.rotationFrom)).toBeGreaterThanOrEqual(index);
    });
  });

  it('never drives a joint the weapon-grip contract owns', () => {
    const driven = new Set(g1DrivenOperatorJoints());
    for (const barred of OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE) {
      expect(driven.has(barred)).toBe(false);
    }
    // Imported, not restated: the barred list must remain the Kimodo module's.
    expect(OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE).toContain('Root');
    expect(OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE).toContain('Body');
    expect(OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE).toHaveLength(40);
  });

  it('drives each operator joint at most once', () => {
    const driven = g1DrivenOperatorJoints();
    expect(new Set(driven).size).toBe(driven.length);
  });

  it('names the head and neck as deficiencies rather than faking them', () => {
    const driven = new Set(g1DrivenOperatorJoints());
    expect(driven.has('Neck')).toBe(false);
    expect(driven.has('Head')).toBe(false);
    expect(Object.keys(OPERATOR_JOINTS_G1_CANNOT_DRIVE).sort()).toEqual(['Head', 'Neck']);
    for (const reason of Object.values(OPERATOR_JOINTS_G1_CANNOT_DRIVE)) {
      expect(reason.length).toBeGreaterThan(20);
    }
    // Kimodo's SOMA-30 source DOES reach both, so this is a property of the
    // robot skeleton and not of retargeting in general.
    expect(SOMA30_TO_OPERATOR_JOINT.Neck1).toBe('Neck');
    expect(SOMA30_TO_OPERATOR_JOINT.Head).toBe('Head');
  });

  it('does map the toes, which the pre-trial expectation said it could not', () => {
    const driven = new Set(g1DrivenOperatorJoints());
    expect(driven.has('PT.L')).toBe(true);
    expect(driven.has('PT.R')).toBe(true);
    expect(G1_34_JOINTS).toContain('left_toe_base');
    expect(G1_34_JOINTS).toContain('right_toe_base');
  });

  it('drives every operator joint the Kimodo route drives, except head and neck', () => {
    const kimodoDriven = new Set(
      Object.values(SOMA30_TO_OPERATOR_JOINT).filter((joint): joint is string => joint !== null),
    );
    const g1Driven = new Set(g1DrivenOperatorJoints());
    const missing = [...kimodoDriven].filter((joint) => !g1Driven.has(joint)).sort();
    expect(missing).toEqual(['Head', 'Neck']);
  });

  it('derives parent-relative rest offsets that rebuild the published positions', () => {
    const offsets = g1RestOffsets();
    expect(offsets).toHaveLength(34);
    const rebuilt: [number, number, number][] = [];
    offsets.forEach((offset, index) => {
      const parent = G1_34_PARENTS[index];
      const base = parent < 0 ? [0, 0, 0] : rebuilt[parent];
      rebuilt[index] = [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
    });
    rebuilt.forEach((position, index) => {
      for (let axis = 0; axis < 3; axis += 1) {
        expect(position[axis]).toBeCloseTo(G1_34_REST_POSITIONS[index][axis], 9);
      }
    });
  });

  it('takes the rest hip height from the toe base, not from an observed clip', () => {
    const toeIndex = g1JointIndex('left_toe_base');
    expect(G1_REST_HIP_HEIGHT_M).toBeCloseTo(-G1_34_REST_POSITIONS[toeIndex][1], 6);
    // A crouched clip's observed pelvis is far below the rest height: normalising
    // by an observation would divide the crouch out of the crouch.
    expect(MOTIONBRICKS_TRIAL_SOURCE.g1PelvisHeightM).toBeLessThan(G1_REST_HIP_HEIGHT_M);
  });

  it('scales root translation by hip-height ratio only', () => {
    // The three authored operator archetypes, from the appearance catalog.
    expect(g1RootScaleForHipHeight(0.7872)).toBeCloseTo(1, 9);
    // A taller destination needs a larger-than-one scale, and G1's shorter rest
    // hip means a bigger factor than SOMA-30's 0.9887 m would give.
    const somaRestHip = 0.9887;
    const destination = 0.9;
    expect(g1RootScaleForHipHeight(destination)).toBeGreaterThan(destination / somaRestHip);
    expect(g1RootScaleForHipHeight(destination) / (destination / somaRestHip)).toBeCloseTo(somaRestHip / G1_REST_HIP_HEIGHT_M, 6);
  });

  it('pins the provenance of everything transcribed here', () => {
    expect(MOTIONBRICKS_G1_SOURCE.weightsCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(MOTIONBRICKS_G1_SOURCE.supportSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(MOTIONBRICKS_G1_SOURCE.portCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(MOTIONBRICKS_G1_SOURCE.codeLicence).toBe('Apache-2.0');
    expect(MOTIONBRICKS_G1_SOURCE.weightsLicence).toContain('NVIDIA Open Model License');
  });

  it('names the trial clip so a debug corpus can gate it explicitly', () => {
    expect(MOTIONBRICKS_TRIAL_CLIP_NAME).toBe('MB_Walk_Gun_Debug');
    expect(MOTIONBRICKS_TRIAL_SOURCE.frames).toBe(76);
    expect(MOTIONBRICKS_TRIAL_SOURCE.fps).toBe(30);
    expect(MOTIONBRICKS_TRIAL_SOURCE.durationS).toBeCloseTo(76 / 30, 3);
  });
});
