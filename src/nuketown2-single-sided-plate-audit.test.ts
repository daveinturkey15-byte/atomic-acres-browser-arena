/**
 * HF-536 night-defects-2, JOB 3 — pins the see-through-asset instrument and
 * ratchets its hit list. The FIX (DoubleSide, or a closed back) was NOT
 * shipped by this lane: flipping `side` on shared materials changes what every
 * other mesh in the family draws, and this lane could not render-verify that.
 * The ratchet stops the list growing while that fix is owed.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PLATE_CLEARANCE_M,
  PLATE_MAX_THICKNESS_M,
  auditNuketown2SingleSidedPlates,
} from './nuketown2-single-sided-plate-audit';

function plate(side: THREE.Side, backing: boolean): THREE.Object3D {
  const root = new THREE.Object3D();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(3, 3, 0.05),
    new THREE.MeshStandardMaterial({ name: 'plate-proof', side }),
  );
  panel.name = 'plate proof panel';
  panel.position.set(0, 2, 0);
  root.add(panel);
  if (backing) {
    // A solid pressed against the panel's back: that side is unreachable, so
    // single-sided drawing is correct there.
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(3, 3, 1),
      new THREE.MeshStandardMaterial({ name: 'plate-proof-wall' }),
    );
    wall.name = 'plate proof wall';
    wall.position.set(0, 2, -0.53);
    root.add(wall);
  }
  return root;
}

describe('nuketown2 single-sided plate audit', () => {
  it('RED PROOF: a FrontSide plate with open air on both sides is a finding', () => {
    const audit = auditNuketown2SingleSidedPlates(plate(THREE.FrontSide, false));
    expect(audit.findings.map((finding) => finding.name)).toEqual(['plate proof panel']);
    expect(audit.findings[0]!.thickness).toBeLessThanOrEqual(PLATE_MAX_THICKNESS_M);
  });

  it('the same plate backed by a solid is correct single-sided authoring', () => {
    const audit = auditNuketown2SingleSidedPlates(plate(THREE.FrontSide, true));
    expect(audit.findings).toEqual([]);
    expect(audit.oneSided).toBe(1);
  });

  it('a DoubleSide plate is never a finding', () => {
    const audit = auditNuketown2SingleSidedPlates(plate(THREE.DoubleSide, false));
    expect(audit.findings).toEqual([]);
    expect(audit.alreadyDoubleSided).toBe(1);
  });

  it('ratchets the arena hit list at its measured value', () => {
    const audit = auditNuketown2SingleSidedPlates();
    // MEASURED at d16b0b3e: 232 plates, 38 reachable from both sides while
    // drawn FrontSide - the exterior stair stringers and treads, the balcony
    // rails and the interior flight. Each one shows the world behind it when
    // a player stands on its back side. The fix is owed; this stops the debt
    // growing.
    expect(audit.findings.length, audit.findings.map((f) => f.name).join(', ')).toBeLessThanOrEqual(38);
    expect(audit.plates).toBeGreaterThan(200);
    expect(PLATE_CLEARANCE_M).toBe(0.45);
  });
});
