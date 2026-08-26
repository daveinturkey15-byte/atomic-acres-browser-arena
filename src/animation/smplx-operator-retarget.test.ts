import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SMPLX_BODY_JOINTS,
  SMPLX_TO_OPERATOR_JOINT,
  OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE,
  retargetDrivenOperatorJoints,
} from './smplx-operator-retarget';

/**
 * The retarget correspondence is only useful if it is checked against the rig
 * it claims to target. A mapping that names a joint the armature does not have
 * fails silently during retarget - the channel is simply dropped - and the
 * result is a clip that plays with one limb frozen. That is exactly the class
 * of defect a text-to-motion pipeline mass-produces if nobody gates it, so the
 * correspondence is pinned against the canonical rig contract here.
 */
const SPEC = JSON.parse(readFileSync(
  join(import.meta.dirname, '..', '..', 'source-assets', 'blender', 'pass74-operator-skin-specs.json'),
  'utf8',
)) as { canonicalRigContract: { jointCount: number; jointInventory: string[] } };

const RIG = SPEC.canonicalRigContract;
const RIG_JOINTS = new Set(RIG.jointInventory);

describe('SMPL-X to operator rig correspondence', () => {
  it('targets joints that actually exist on the canonical rig', () => {
    expect(RIG.jointCount, 'canonical joint count').toBe(62);
    expect(RIG.jointInventory.length).toBe(RIG.jointCount);
    for (const [smplx, operator] of Object.entries(SMPLX_TO_OPERATOR_JOINT)) {
      if (operator === null) continue;
      expect(RIG_JOINTS.has(operator), `${smplx} -> ${operator} is not a canonical joint`).toBe(true);
    }
  });

  it('covers the whole SMPL-X body hierarchy with no silent gaps', () => {
    expect(SMPLX_BODY_JOINTS.length, 'SMPL-X body joints').toBe(22);
    for (const joint of SMPLX_BODY_JOINTS) {
      expect(
        Object.prototype.hasOwnProperty.call(SMPLX_TO_OPERATOR_JOINT, joint),
        `${joint} has no declared correspondence (add it, or map it to null deliberately)`,
      ).toBe(true);
    }
    // And nothing invented: every key must be a real SMPL-X body joint.
    for (const key of Object.keys(SMPLX_TO_OPERATOR_JOINT)) {
      expect(SMPLX_BODY_JOINTS as readonly string[], `${key} is not an SMPL-X body joint`).toContain(key);
    }
  });

  it('never maps two SMPL-X joints onto the same operator joint', () => {
    const driven = retargetDrivenOperatorJoints();
    // A duplicate means two source channels fight over one destination, and
    // whichever is applied last wins - a drift that only shows in motion.
    expect(new Set(driven).size, `duplicate destinations in ${JSON.stringify(driven)}`).toBe(driven.length);
  });

  it('keeps the weapon-grip chains out of the retarget entirely', () => {
    const driven = new Set(retargetDrivenOperatorJoints());
    for (const joint of OPERATOR_JOINTS_RETARGET_MUST_NOT_DRIVE) {
      expect(RIG_JOINTS.has(joint), `${joint} is not a canonical joint`).toBe(true);
      // The model emits no hand articulation. If a retarget were allowed to
      // write these, it would zero them and open every operator's fist.
      expect(driven.has(joint), `${joint} must not be driven from SMPL-X`).toBe(false);
    }
    // Root and Body are the rig's own root pair: root motion is assigned
    // explicitly, never inherited from pelvis.
    expect(driven.has('Root')).toBe(false);
    expect(driven.has('Body')).toBe(false);
    expect(driven.has('Hips'), 'pelvis must still drive Hips').toBe(true);
  });

  it('drives the full four-segment spine column', () => {
    // SMPL-X pelvis->spine1->spine2->spine3->neck and the operator
    // Hips->Abdomen->Torso->Chest->Neck are the same column. A partial mapping
    // here reads as a stiff back in every clip.
    expect(SMPLX_TO_OPERATOR_JOINT.pelvis).toBe('Hips');
    expect(SMPLX_TO_OPERATOR_JOINT.spine1).toBe('Abdomen');
    expect(SMPLX_TO_OPERATOR_JOINT.spine2).toBe('Torso');
    expect(SMPLX_TO_OPERATOR_JOINT.spine3).toBe('Chest');
    expect(SMPLX_TO_OPERATOR_JOINT.neck).toBe('Neck');
  });

  it('maps both legs symmetrically down to the toe', () => {
    for (const [left, right] of [
      ['left_hip', 'right_hip'], ['left_knee', 'right_knee'],
      ['left_ankle', 'right_ankle'], ['left_foot', 'right_foot'],
    ] as const) {
      const l = SMPLX_TO_OPERATOR_JOINT[left];
      const r = SMPLX_TO_OPERATOR_JOINT[right];
      expect(l, `${left} unmapped`).toBeTruthy();
      expect(r, `${right} unmapped`).toBeTruthy();
      // Same joint name, opposite side suffix - an asymmetry here is a limp.
      expect(l!.replace(/\.L$/, ''), `${left}/${right} are not mirror joints`).toBe(r!.replace(/\.R$/, ''));
      expect(l!.endsWith('.L')).toBe(true);
      expect(r!.endsWith('.R')).toBe(true);
    }
    // The toe matters specifically: foot-contact solving needs it, and it is
    // the one joint whose SMPL-X name (`*_foot`) does not resemble its
    // operator name (`PT.*`).
    expect(SMPLX_TO_OPERATOR_JOINT.left_foot).toBe('PT.L');
    expect(SMPLX_TO_OPERATOR_JOINT.right_foot).toBe('PT.R');
  });
});
