import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SOMA30_JOINTS,
  SOMA30_PARENTS,
  SMPLX22_JOINTS,
  SOMA30_TO_OPERATOR_JOINT,
  SMPLX22_TO_OPERATOR_JOINT,
  KIMODO_SKELETONS,
  OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE,
  OPERATOR_JOINT_COUNT,
  kimodoSkeletonForJointCount,
  retargetDrivenOperatorJoints,
  KIMODO_CANARY_MEASUREMENTS,
} from './kimodo-operator-retarget';

/**
 * The retarget correspondence is only useful if it is checked against the rig
 * it claims to target. A mapping that names a joint the armature does not have
 * fails silently during retarget - the channel is simply dropped - and the
 * result is a clip that plays with one limb frozen. That is the class of defect
 * a text-to-motion pipeline mass-produces if nobody gates it.
 */
const SPEC = JSON.parse(readFileSync(
  join(import.meta.dirname, '..', '..', 'source-assets', 'blender', 'pass74-operator-skin-specs.json'),
  'utf8',
)) as { canonicalRigContract: { rigId: string; jointCount: number; jointInventory: string[] } };

const RIG = SPEC.canonicalRigContract;
const RIG_JOINTS = new Set(RIG.jointInventory);

describe('Kimodo skeletons to operator rig correspondence', () => {
  it('agrees with the canonical rig contract it targets', () => {
    expect(RIG.jointCount).toBe(OPERATOR_JOINT_COUNT);
    expect(RIG.jointInventory.length).toBe(RIG.jointCount);
  });

  it('carries the SOMA-30 layout the usable checkpoint actually emits', () => {
    // The port's README says Kimodo "gives you SMPL-X". That is true of the
    // SMPL-X checkpoint, which is licence-blocked. soma-rp-v1.1 - the one we
    // can use - emits 30 joints, which is what the first generation returned.
    expect(SOMA30_JOINTS.length).toBe(30);
    expect(SOMA30_PARENTS.length).toBe(30);
    expect(SOMA30_PARENTS[0], 'root parent').toBe(-1);
    // A parent must always precede its child, or a local-rotation compose
    // walks the hierarchy in the wrong order.
    SOMA30_PARENTS.forEach((parent, index) => {
      if (index === 0) return;
      expect(parent, `${SOMA30_JOINTS[index]} parent index`).toBeGreaterThanOrEqual(0);
      expect(parent, `${SOMA30_JOINTS[index]} parent must precede it`).toBeLessThan(index);
    });
  });

  it('resolves the emitting skeleton from joint count alone', () => {
    // The .f32 exports carry no shape metadata; joint count is the only
    // identification available, and getting it wrong shifts every channel.
    expect(kimodoSkeletonForJointCount(30)).toBe(KIMODO_SKELETONS.soma30);
    expect(kimodoSkeletonForJointCount(22)).toBe(KIMODO_SKELETONS.smplx22);
    expect(kimodoSkeletonForJointCount(24), 'unknown layouts must not be guessed').toBeNull();
    expect(kimodoSkeletonForJointCount(0)).toBeNull();
  });

  for (const skeleton of Object.values(KIMODO_SKELETONS)) {
    describe(`${skeleton.id}`, () => {
      it('maps only onto joints that exist on the canonical rig', () => {
        for (const [source, operator] of Object.entries(skeleton.toOperator)) {
          if (operator === null) continue;
          expect(RIG_JOINTS.has(operator), `${source} -> ${operator} is not a canonical joint`).toBe(true);
        }
      });

      it('declares every source joint, with no silent gaps', () => {
        for (const joint of skeleton.joints) {
          expect(
            Object.prototype.hasOwnProperty.call(skeleton.toOperator, joint),
            `${joint} has no declared correspondence (map it, or map it to null deliberately)`,
          ).toBe(true);
        }
        for (const key of Object.keys(skeleton.toOperator)) {
          expect(skeleton.joints as readonly string[], `${key} is not a ${skeleton.id} joint`).toContain(key);
        }
      });

      it('never maps two source joints onto the same operator joint', () => {
        const driven = retargetDrivenOperatorJoints(skeleton);
        // A duplicate means two channels fight over one bone and whichever is
        // applied last wins - drift that only shows up in motion.
        expect(new Set(driven).size, `duplicates in ${JSON.stringify(driven)}`).toBe(driven.length);
      });

      it('keeps the weapon-grip chains and the root pair out of the retarget', () => {
        const driven = new Set(retargetDrivenOperatorJoints(skeleton));
        for (const joint of OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE) {
          expect(RIG_JOINTS.has(joint), `${joint} is not a canonical joint`).toBe(true);
          expect(driven.has(joint), `${joint} must not be driven from ${skeleton.id}`).toBe(false);
        }
        expect(driven.has('Hips'), 'source hips must still drive Hips').toBe(true);
      });

      it('drives the full spine column and both legs down to the toe', () => {
        const driven = new Set(retargetDrivenOperatorJoints(skeleton));
        for (const joint of ['Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head']) {
          expect(driven.has(joint), `${joint} undriven - reads as a stiff back`).toBe(true);
        }
        for (const side of ['L', 'R']) {
          for (const joint of [`UpperLeg.${side}`, `LowerLeg.${side}`, `Foot.${side}`, `PT.${side}`]) {
            // The toe matters specifically: foot-contact solving needs it.
            expect(driven.has(joint), `${joint} undriven - breaks foot contact`).toBe(true);
          }
          for (const joint of [`Shoulder.${side}`, `UpperArm.${side}`, `LowerArm.${side}`, `Wrist.${side}`]) {
            expect(driven.has(joint), `${joint} undriven`).toBe(true);
          }
        }
      });
    });
  }

  it('maps exactly one source neck segment onto the single operator neck', () => {
    // SOMA-30 has Neck1 AND Neck2; the operator rig has one Neck. Driving both
    // onto it double-applies the head tilt.
    const necks = Object.entries(SOMA30_TO_OPERATOR_JOINT).filter(([, op]) => op === 'Neck');
    expect(necks.map(([source]) => source)).toEqual(['Neck1']);
    expect(SOMA30_TO_OPERATOR_JOINT.Neck2).toBeNull();
  });

  it('drives no facial joints, because the operator rig has none', () => {
    for (const joint of ['Jaw', 'LeftEye', 'RightEye']) {
      expect(SOMA30_TO_OPERATOR_JOINT[joint], `${joint} must stay unmapped`).toBeNull();
    }
  });

  it('records the measured source calibration rather than assuming 1:1', () => {
    // Both source and destination are Y-up, but the destination is authored at
    // three different statures, so hip-height ratio is where scale starts.
    expect(KIMODO_CANARY_MEASUREMENTS.upAxis).toBe('y');
    expect(KIMODO_CANARY_MEASUREMENTS.forwardAxis).toBe('z');
    expect(KIMODO_CANARY_MEASUREMENTS.sourceHipHeightM).toBeGreaterThan(0.8);
    expect(KIMODO_CANARY_MEASUREMENTS.sourceHipHeightM).toBeLessThan(1.2);
  });

  it('keeps the SMPL-X mapping intact for the checkpoints that use it', () => {
    expect(SMPLX22_JOINTS.length).toBe(22);
    expect(SMPLX22_TO_OPERATOR_JOINT.left_foot).toBe('PT.L');
    expect(SMPLX22_TO_OPERATOR_JOINT.right_foot).toBe('PT.R');
  });
});
