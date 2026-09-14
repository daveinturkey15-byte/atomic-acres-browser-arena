/**
 * HF-536 — the see-through-asset instrument, and its hit list.
 *
 * night-defects-2 built this audit and ratcheted 38 findings, all of them
 * inferred rather than rendered. night-defects-3a tested the PREMISE those 38
 * rested on and it does not hold: every one of them is a CLOSED BoxGeometry,
 * 12 triangles, an outward face in all six directions
 * (`scripts/qa/audit-nuketown2-plate-closure.ts`, measured at 2320affd). A
 * `side: FrontSide` material on a closed solid is correct and can never be
 * see-through - the face you are looking at always exists and always points at
 * you. Flipping those 38 to DoubleSide would have bought backface shading and
 * shadow cost and fixed nothing.
 *
 * The instrument is now honest in both directions:
 *   - a body whose geometry closes both broad sides is censused, not reported;
 *   - EVERY geometry is censused, not only BoxGeometry, so the class this
 *     audit was invented for - a single-sided PLANE standing in as a wall or a
 *     floor - is finally visible to it. The first cut could not see one.
 *
 * The ratchet therefore moves DOWN to 0, and the red proofs below are real
 * holes rather than closed boxes.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PLATE_CLEARANCE_M,
  PLATE_MAX_THICKNESS_M,
  auditNuketown2SingleSidedPlates,
  broadFacesClosed,
  closedFaces,
} from './nuketown2-single-sided-plate-audit';

/** A genuinely OPEN plate: one plane, one face, air on both sides. */
function openPlate(side: THREE.Side, backing: boolean): THREE.Object3D {
  const root = new THREE.Object3D();
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
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
    wall.position.set(0, 2, -0.51);
    root.add(wall);
  }
  return root;
}

/** A box with its -z face deleted: five faces, a real hole on one side. */
function boxMissingBackFace(): THREE.Object3D {
  const root = new THREE.Object3D();
  const source = new THREE.BoxGeometry(3, 3, 0.05);
  const index = source.getIndex()!;
  const kept: number[] = [];
  const position = source.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < index.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(i));
    const b = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 1));
    const c = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + 2));
    const normal = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize();
    if (normal.z < -0.9) continue; // drop the -z face
    kept.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  const geometry = source.clone();
  geometry.setIndex(kept);
  const panel = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'plate-proof', side: THREE.FrontSide }));
  panel.name = 'plate proof open box';
  panel.position.set(0, 2, 0);
  root.add(panel);
  return root;
}

/** A closed box plate, FrontSide, air on both sides - the 38's actual shape. */
function closedBoxPlate(): THREE.Object3D {
  const root = new THREE.Object3D();
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(3, 3, 0.05),
    new THREE.MeshStandardMaterial({ name: 'plate-proof', side: THREE.FrontSide }),
  );
  panel.name = 'plate proof closed box';
  panel.position.set(0, 2, 0);
  root.add(panel);
  return root;
}

describe('nuketown2 single-sided plate audit', () => {
  it('RED PROOF: a FrontSide PLANE with open air on both sides is a finding', () => {
    const audit = auditNuketown2SingleSidedPlates(openPlate(THREE.FrontSide, false));
    expect(audit.findings.map((finding) => finding.name)).toEqual(['plate proof panel']);
    expect(audit.findings[0]!.thickness).toBeLessThanOrEqual(PLATE_MAX_THICKNESS_M);
  });

  it('RED PROOF: a box with one face deleted is a finding', () => {
    const audit = auditNuketown2SingleSidedPlates(boxMissingBackFace());
    expect(audit.findings.map((finding) => finding.name)).toEqual(['plate proof open box']);
  });

  it('a CLOSED FrontSide box is NOT a finding - the premise of the first 38', () => {
    const root = closedBoxPlate();
    const audit = auditNuketown2SingleSidedPlates(root);
    expect(audit.findings).toEqual([]);
    expect(audit.closedBodies).toBe(1);
    const mesh = root.children[0] as THREE.Mesh;
    expect(closedFaces(mesh).size).toBe(6);
    expect(broadFacesClosed(mesh, 2)).toBe(true);
  });

  it('closure is measured in the body own basis, so a ROTATED closed box stays closed', () => {
    const root = closedBoxPlate();
    const mesh = root.children[0] as THREE.Mesh;
    mesh.rotation.set(0.3, 0.7, -0.4);
    mesh.updateMatrixWorld(true);
    expect(closedFaces(mesh).size).toBe(6);
  });

  it('the same open plate backed by a solid is correct single-sided authoring', () => {
    const audit = auditNuketown2SingleSidedPlates(openPlate(THREE.FrontSide, true));
    expect(audit.findings).toEqual([]);
    expect(audit.oneSided).toBe(1);
  });

  it('a DoubleSide plane is never a finding', () => {
    const audit = auditNuketown2SingleSidedPlates(openPlate(THREE.DoubleSide, false));
    expect(audit.findings).toEqual([]);
    expect(audit.alreadyDoubleSided).toBe(1);
  });

  it('ratchets the arena hit list DOWN to zero', () => {
    const audit = auditNuketown2SingleSidedPlates();
    // MEASURED at 2320affd with the corrected instrument: 233 plates censused
    // (the widened geometry admission adds one the BoxGeometry-only cut could
    // not see), 233 closed by geometry, 0 findings. The previous ratchet stood
    // at 38 and every one of those was a closed box.
    expect(audit.findings.length, audit.findings.map((f) => f.name).join(', ')).toBe(0);
    expect(audit.closedBodies).toBeGreaterThanOrEqual(230);
    expect(audit.plates).toBeGreaterThan(200);
    expect(PLATE_CLEARANCE_M).toBe(0.45);
  });
});
